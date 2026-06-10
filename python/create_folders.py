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


def should_create_folder(target_type: str, customer_category: str) -> bool:
    """顧客の区分に基づいてフォルダを作成すべきか判定"""
    if target_type == 'common':
        return True
    if target_type == 'corporate' and '法人' in customer_category:
        return True
    if target_type == 'individual' and '個人' in customer_category:
        return True
    return False


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

    # テンプレートを階層構造に変換
    template = []
    current_parent = None

    for row in template_data:
        level = int(row.get('階層', 1))
        folder_name = clean_folder_name(str(row.get('フォルダ名', '')))
        target_type = parse_target_type(row.get('対象区分', '共通'))

        if not folder_name:
            continue

        if level == 1:
            current_parent = {
                'name': folder_name,
                'target_type': target_type,
                'children': []
            }
            template.append(current_parent)
        elif level == 2 and current_parent:
            current_parent['children'].append({
                'name': folder_name,
                'target_type': target_type,
                'children': []
            })

    print(f'\nテンプレート構造:')
    for folder in template:
        print(f'  📁 {folder["name"]} ({folder["target_type"]})')
        for child in folder['children']:
            print(f'    📁 {child["name"]} ({child["target_type"]})')

    # 各顧客のフォルダを作成
    print(f'\n=== フォルダ作成開始 ===\n')

    for customer in customers_data:
        code = str(customer.get('顧問先コード', ''))
        name = str(customer.get('顧問先名', ''))
        category = str(customer.get('区分', ''))

        if not code or not name:
            continue

        folder_name = f'{code}_{name}'
        print(f'\n【{folder_name}】 ({category})')

        # 顧客フォルダを作成
        customer_folder_id = drive.create_folder(folder_name, PARENT_FOLDER_ID)

        # テンプレートに基づいてサブフォルダを作成
        for folder in template:
            if should_create_folder(folder['target_type'], category):
                subfolder_id = drive.create_folder(folder['name'], customer_folder_id)

                for child in folder['children']:
                    if should_create_folder(child['target_type'], category):
                        drive.create_folder(child['name'], subfolder_id)

    print(f'\n=== 完了 ===')


if __name__ == '__main__':
    main()
