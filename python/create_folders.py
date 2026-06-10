"""
Googleスプレッドシートから顧客フォルダをGoogleドライブに一括作成するスクリプト

使い方:
1. Google Cloud Consoleで認証情報を作成し、credentials.jsonをこのフォルダに配置
2. pip install -r requirements.txt
3. python create_folders.py
"""

import os
import re
from typing import Optional
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import gspread

# スコープ設定
SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
]

# === 設定 ===
SPREADSHEET_ID = '12HwwJpYPv9YKaSvf4n2dsy8-RxvKxv3swzy1x3-CM3A'  # スプレッドシートID
PARENT_FOLDER_ID = ''  # 親フォルダID（顧客フォルダを作成する場所）


def get_credentials():
    """認証情報を取得"""
    creds = None
    token_path = 'token.json'
    creds_path = 'credentials.json'

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(creds_path):
                print('エラー: credentials.json が見つかりません')
                print('Google Cloud Console から OAuth 2.0 クライアント ID をダウンロードしてください')
                exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(token_path, 'w') as token:
            token.write(creds.to_json())

    return creds


def clean_folder_name(name: str) -> str:
    """フォルダ名からプレフィックス記号を除去"""
    return re.sub(r'^[├└│─┬┤┼\s\-|]+', '', name).strip()


def parse_target_type(target: str) -> str:
    """対象区分を解析"""
    target = str(target).lower()
    if '法人' in target:
        return 'corporate'
    if '個人' in target:
        return 'individual'
    return 'common'


# 法人を示すキーワード（顧問先名に含まれていれば法人と判定）
CORPORATE_KEYWORDS = [
    '株式会社', '有限会社', '合同会社', '合名会社', '合資会社',
    '法人', '宗教法人', '医療法人', '社会福祉法人', '学校法人',
    '社団', '財団', '協会', '組合', '農協', '生協', '連合会',
    '株）', '有）', '(株)', '(有)', '㈱', '㈲',
]


def is_corporate(customer: dict) -> bool:
    """顧問先名・区分から法人かどうかを自動判定"""
    text = (
        str(customer.get('顧問先名', '')) +
        str(customer.get('区分', ''))
    )
    return any(keyword in text for keyword in CORPORATE_KEYWORDS)


def should_create_folder(target_type: str, is_corp: bool) -> bool:
    """顧客の区分に基づいてフォルダを作成すべきか判定

    target_type: 'common'（共通）, 'corporate'（法人）, 'individual'（個人）
    is_corp: 顧客が法人ならTrue、個人ならFalse
    """
    if target_type == 'common':
        return True
    if target_type == 'corporate' and is_corp:
        return True
    if target_type == 'individual' and not is_corp:
        return True
    return False


def pick_parent(parents: list, is_corp: bool) -> Optional[dict]:
    """セクションの親候補から、顧客タイプに合う親を1つ選ぶ

    優先順位: 顧客タイプ一致（法人/個人）> 共通 > なし
    """
    wanted = 'corporate' if is_corp else 'individual'

    # 1. 顧客タイプに一致する親
    for parent in parents:
        if parent['target_type'] == wanted:
            return parent
    # 2. 共通の親
    for parent in parents:
        if parent['target_type'] == 'common':
            return parent
    # 3. 該当なし（このセクションは作成しない）
    return None


class DriveManager:
    def __init__(self, creds):
        self.service = build('drive', 'v3', credentials=creds)

    def folder_exists(self, name: str, parent_id: str) -> Optional[str]:
        """フォルダが存在するか確認し、存在すればIDを返す"""
        query = f"name='{name}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = self.service.files().list(
            q=query,
            fields='files(id, name)',
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        files = results.get('files', [])
        return files[0]['id'] if files else None

    def create_folder(self, name: str, parent_id: str) -> str:
        """フォルダを作成"""
        existing_id = self.folder_exists(name, parent_id)
        if existing_id:
            print(f'  [スキップ] 既存: {name}')
            return existing_id

        metadata = {
            'name': name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_id]
        }
        folder = self.service.files().create(
            body=metadata,
            fields='id',
            supportsAllDrives=True
        ).execute()
        print(f'  [作成] {name}')
        return folder['id']

    def is_folder_empty(self, folder_id: str) -> bool:
        """フォルダが空か確認"""
        query = f"'{folder_id}' in parents and trashed=false"
        results = self.service.files().list(
            q=query,
            fields='files(id)',
            pageSize=1,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        return len(results.get('files', [])) == 0

    def delete_folder_if_empty(self, folder_id: str, folder_name: str) -> bool:
        """空のフォルダのみ削除"""
        if self.is_folder_empty(folder_id):
            self.service.files().delete(fileId=folder_id, supportsAllDrives=True).execute()
            print(f'  [削除] {folder_name}')
            return True
        else:
            print(f'  [スキップ] 削除不可（ファイルあり）: {folder_name}')
            return False


def main():
    if not PARENT_FOLDER_ID:
        print('エラー: PARENT_FOLDER_ID を設定してください')
        print('スクリプト内の PARENT_FOLDER_ID に、顧客フォルダを作成するGoogleドライブのフォルダIDを設定してください')
        exit(1)

    print('認証中...')
    creds = get_credentials()
    drive = DriveManager(creds)

    print('スプレッドシートを読み込み中...')
    gc = gspread.authorize(creds)
    spreadsheet = gc.open_by_key(SPREADSHEET_ID)

    # 顧問先マスタを読み込み
    customer_sheet = None
    for sheet in spreadsheet.worksheets():
        if '顧問先' in sheet.title or 'マスタ' in sheet.title:
            customer_sheet = sheet
            break

    if not customer_sheet:
        print('エラー: 顧問先マスタシートが見つかりません')
        exit(1)

    customers_data = customer_sheet.get_all_records()
    print(f'顧客数: {len(customers_data)}')

    # フォルダテンプレートを読み込み
    template_sheet = None
    for sheet in spreadsheet.worksheets():
        if 'テンプレート' in sheet.title or 'フォルダ' in sheet.title:
            template_sheet = sheet
            break

    if not template_sheet:
        print('エラー: フォルダテンプレートシートが見つかりません')
        exit(1)

    template_data = template_sheet.get_all_records()
    print(f'テンプレート行数: {len(template_data)}')

    # テンプレートをセクション単位に変換
    # 1セクション = 連続する階層1（親候補）＋それに続く階層2（子）
    sections = []
    current_section = None
    last_was_child = False

    for row in template_data:
        raw_level = str(row.get('階層', '')).strip()
        folder_name = clean_folder_name(str(row.get('フォルダ名', '')))
        target_type = parse_target_type(row.get('対象区分', '共通'))

        if not folder_name or not raw_level:
            continue

        try:
            level = int(float(raw_level))
        except ValueError:
            continue

        if level == 1:
            # 直前が子フォルダだった場合は新しいセクションを開始
            if current_section is None or last_was_child:
                current_section = {'parents': [], 'children': []}
                sections.append(current_section)
            current_section['parents'].append({
                'name': folder_name,
                'target_type': target_type,
            })
            last_was_child = False
        elif level == 2 and current_section is not None:
            current_section['children'].append({
                'name': folder_name,
                'target_type': target_type,
            })
            last_was_child = True

    print(f'\nテンプレート構造（セクション単位）:')
    for section in sections:
        parents = ' / '.join(f'{p["name"]}({p["target_type"]})' for p in section['parents'])
        print(f'  📁 {parents}')
        for child in section['children']:
            print(f'    📁 {child["name"]} ({child["target_type"]})')

    # 各顧客のフォルダを作成
    print(f'\n=== フォルダ作成開始 ===\n')

    for customer in customers_data:
        code = str(customer.get('顧問先コード', ''))
        name = str(customer.get('顧問先名', ''))

        if not code or not name:
            continue

        is_corp = is_corporate(customer)
        category_label = '法人' if is_corp else '個人'

        folder_name = f'{code}_{name}'
        print(f'\n【{folder_name}】 ({category_label})')

        # 顧客フォルダを作成
        customer_folder_id = drive.create_folder(folder_name, PARENT_FOLDER_ID)

        # セクションごとに、顧客タイプに合う親を1つ選んでフォルダを作成
        for section in sections:
            parent = pick_parent(section['parents'], is_corp)
            if parent is None:
                continue

            subfolder_id = drive.create_folder(parent['name'], customer_folder_id)

            # 顧客タイプに合う子フォルダ（その区分＋共通）を作成
            for child in section['children']:
                if should_create_folder(child['target_type'], is_corp):
                    drive.create_folder(child['name'], subfolder_id)

    print(f'\n=== 完了 ===')


if __name__ == '__main__':
    main()
