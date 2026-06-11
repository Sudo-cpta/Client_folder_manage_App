"""
Googleスプレッドシートから顧客フォルダをGoogleドライブに一括作成するスクリプト

使い方:
1. Google Cloud Consoleで認証情報を作成し、credentials.jsonをこのフォルダに配置
2. pip install -r requirements.txt
3. python create_folders.py

旧フォルダの整理（テンプレートにないフォルダをアーカイブ）:
  python create_folders.py --cleanup --dry-run   # 確認のみ（何も変更しない）
  python create_folders.py --cleanup             # 実行

整理のルール:
- テンプレートシートに載っている名前のフォルダは保護される
  - タイプ違い（法人顧客内の個人用フォルダ等）は、中にファイルが1つもない場合のみ削除
- テンプレートにないフォルダ（旧フォルダ）:
  - ファイルが直接入っているフォルダは、フォルダごと「_アーカイブ」に移動
  - ファイルを直接含まない中間フォルダは、空になったら削除
- ファイル自体は絶対に削除しない（移動のみ）
"""

import argparse
import os
import re
import unicodedata
from typing import Callable, Optional
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

# 旧フォルダ整理で使うアーカイブフォルダ名（顧客フォルダ直下に作成）
ARCHIVE_FOLDER_NAME = '_アーカイブ'

FOLDER_MIME = 'application/vnd.google-apps.folder'


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


def normalize_name(name: str) -> str:
    """名前比較用の正規化（全角/半角・前後空白の表記ゆれを吸収）

    フォルダ名そのものは変更しない。比較にのみ使用する。
    """
    return unicodedata.normalize('NFKC', str(name)).strip()


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
        query = f"name='{name}' and '{parent_id}' in parents and mimeType='{FOLDER_MIME}' and trashed=false"
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
            'mimeType': FOLDER_MIME,
            'parents': [parent_id]
        }
        folder = self.service.files().create(
            body=metadata,
            fields='id',
            supportsAllDrives=True
        ).execute()
        print(f'  [作成] {name}')
        return folder['id']

    def list_children(self, folder_id: str) -> list:
        """フォルダ直下の全アイテム（ファイル・フォルダ）を取得"""
        items = []
        page_token = None
        while True:
            results = self.service.files().list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields='nextPageToken, files(id, name, mimeType)',
                pageSize=1000,
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()
            items.extend(results.get('files', []))
            page_token = results.get('nextPageToken')
            if not page_token:
                break
        return items

    def move_item(self, item_id: str, new_parent_id: str, old_parent_id: str):
        """ファイルまたはフォルダを別のフォルダに移動"""
        self.service.files().update(
            fileId=item_id,
            addParents=new_parent_id,
            removeParents=old_parent_id,
            fields='id',
            supportsAllDrives=True
        ).execute()

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


def load_spreadsheet_data(creds):
    """スプレッドシートから顧客一覧とテンプレート（セクション構造）を読み込む"""
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

    return customers_data, sections


def expected_structure(sections: list, is_corp: bool) -> dict:
    """顧客タイプに応じたテンプレート構造を返す

    戻り値: { 正規化済み親名: set(正規化済み子名) }

    顧客タイプに合う親 + 共通タイプの親を全て含める（セクション内の1つだけではなく）
    """
    expected = {}
    for section in sections:
        # 顧客タイプに合う子フォルダ名（共通も含む）
        children = {
            normalize_name(child['name'])
            for child in section['children']
            if should_create_folder(child['target_type'], is_corp)
        }
        # 顧客タイプに合う親 + 共通タイプの親を全て追加
        for parent in section['parents']:
            if should_create_folder(parent['target_type'], is_corp):
                expected[normalize_name(parent['name'])] = children
    return expected


def build_protected_names(sections: list) -> set:
    """テンプレート内の全フォルダ名（階層・タイプ問わず）の正規化済みセットを返す"""
    names = set()
    for section in sections:
        for parent in section['parents']:
            names.add(normalize_name(parent['name']))
        for child in section['children']:
            names.add(normalize_name(child['name']))
    return names


def has_any_file_recursive(drive: DriveManager, folder_id: str) -> bool:
    """フォルダ内に再帰的に1つでもファイルがあればTrue"""
    children = drive.list_children(folder_id)
    for item in children:
        if item['mimeType'] != FOLDER_MIME:
            return True
        if has_any_file_recursive(drive, item['id']):
            return True
    return False


def create_all_folders(drive: DriveManager, customers_data: list, sections: list):
    """各顧客のフォルダを作成"""
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


def archive_orphan(drive: DriveManager, folder: dict, parent_id: str,
                   get_archive_id: Callable[[], str], dry_run: bool, path: str = ''):
    """旧フォルダを整理する（再帰）

    ルール:
    - ファイルが直接入っているフォルダ → フォルダごとアーカイブに移動
    - サブフォルダしかない中間フォルダ → 中を整理してから空なら削除
    - 完全に空のフォルダ → 削除
    """
    folder_path = f'{path}/{folder["name"]}' if path else folder['name']
    children = drive.list_children(folder['id'])
    files = [c for c in children if c['mimeType'] != FOLDER_MIME]
    subfolders = [c for c in children if c['mimeType'] == FOLDER_MIME]

    if files:
        # ファイルが直接入っている → フォルダごとアーカイブへ移動
        # （サブフォルダも中身ごと一緒に移動されるのでファイルは失われない）
        if dry_run:
            print(f'  [移動予定] {folder_path}（ファイル{len(files)}件）→ {ARCHIVE_FOLDER_NAME}')
        else:
            drive.move_item(folder['id'], get_archive_id(), parent_id)
            print(f'  [移動] {folder_path}（ファイル{len(files)}件）→ {ARCHIVE_FOLDER_NAME}')
        return

    # ファイルなし → サブフォルダを先に整理
    for sub in subfolders:
        archive_orphan(drive, sub, folder['id'], get_archive_id, dry_run, folder_path)

    # 中身がすべて移動・削除されていれば、この中間フォルダを削除
    if dry_run:
        print(f'  [削除予定] {folder_path}（ファイルなし）')
    else:
        drive.delete_folder_if_empty(folder['id'], folder_path)


def delete_if_empty_recursive(drive: DriveManager, folder: dict, parent_id: str,
                               dry_run: bool, path: str = '') -> bool:
    """フォルダを再帰的に削除（完全に空の場合のみ）。削除したらTrue"""
    folder_path = f'{path}/{folder["name"]}' if path else folder['name']
    children = drive.list_children(folder['id'])
    files = [c for c in children if c['mimeType'] != FOLDER_MIME]
    subfolders = [c for c in children if c['mimeType'] == FOLDER_MIME]

    if files:
        return False

    # 全サブフォルダを再帰的に削除試行
    for sub in subfolders:
        if not delete_if_empty_recursive(drive, sub, folder['id'], dry_run, folder_path):
            return False

    if dry_run:
        print(f'  [削除予定] {folder_path}（タイプ違いテンプレートフォルダ・空）')
    else:
        drive.delete_folder_if_empty(folder['id'], folder_path)
    return True


def cleanup_customer(drive: DriveManager, customer_folder_id: str,
                     expected: dict, protected: set, dry_run: bool) -> int:
    """1顧客の旧フォルダを整理。整理対象の数を返す

    判定ルール:
    - 顧客タイプに合うテンプレート名 (expected) → 保護、中の2階層目をチェック
    - テンプレートには載っているがタイプ違い (protected) → 再帰的に空なら削除、あれば保持
    - テンプレートにない → 旧フォルダとして整理（ファイル入りはアーカイブ移動、空は削除）
    """
    archive_id_holder = {'id': None}

    def get_archive_id() -> str:
        if archive_id_holder['id'] is None:
            archive_id_holder['id'] = drive.create_folder(
                ARCHIVE_FOLDER_NAME, customer_folder_id)
        return archive_id_holder['id']

    orphan_count = 0
    top_items = drive.list_children(customer_folder_id)
    top_folders = [c for c in top_items if c['mimeType'] == FOLDER_MIME]

    for folder in top_folders:
        if folder['name'] == ARCHIVE_FOLDER_NAME:
            continue

        norm_name = normalize_name(folder['name'])

        if norm_name in expected:
            # 顧客タイプに合う親フォルダ → 中の2階層目をチェック
            expected_children = expected[norm_name]
            sub_items = drive.list_children(folder['id'])
            sub_folders = [c for c in sub_items if c['mimeType'] == FOLDER_MIME]
            for sub in sub_folders:
                sub_norm = normalize_name(sub['name'])
                if sub_norm in expected_children:
                    continue
                elif sub_norm in protected:
                    # タイプ違いテンプレート子 → 空なら削除、ファイルあれば保持
                    if not has_any_file_recursive(drive, sub['id']):
                        orphan_count += 1
                        delete_if_empty_recursive(drive, sub, folder['id'],
                                                  dry_run, folder['name'])
                    else:
                        print(f'  [保持] {folder["name"]}/{sub["name"]}（テンプレート名・ファイルあり）')
                else:
                    # テンプレートにない子 → 旧フォルダとして整理
                    orphan_count += 1
                    archive_orphan(drive, sub, folder['id'],
                                   get_archive_id, dry_run, folder['name'])

        elif norm_name in protected:
            # タイプ違いテンプレート親 → 空なら削除、ファイルあれば保持
            if not has_any_file_recursive(drive, folder['id']):
                orphan_count += 1
                delete_if_empty_recursive(drive, folder, customer_folder_id, dry_run)
            else:
                print(f'  [保持] {folder["name"]}（テンプレート名・ファイルあり）')

        else:
            # テンプレートにない親フォルダ → 旧フォルダとして整理
            orphan_count += 1
            archive_orphan(drive, folder, customer_folder_id,
                           get_archive_id, dry_run)

    return orphan_count


def cleanup_all_customers(drive: DriveManager, customers_data: list,
                          sections: list, dry_run: bool):
    """全顧客の旧フォルダを整理"""
    mode_label = 'ドライラン（確認のみ・変更なし）' if dry_run else '実行'
    print(f'\n=== 旧フォルダ整理開始 [{mode_label}] ===')
    print(f'ルール:')
    print(f'  - テンプレートにない旧フォルダ → ファイル入りは {ARCHIVE_FOLDER_NAME} へ移動、空は削除')
    print(f'  - タイプ違いテンプレートフォルダ → 空なら削除、ファイルあれば保持\n')

    # テンプレート内の全フォルダ名（タイプ問わず）を保護リストに
    protected = build_protected_names(sections)

    total_orphans = 0
    for customer in customers_data:
        code = str(customer.get('顧問先コード', ''))
        name = str(customer.get('顧問先名', ''))

        if not code or not name:
            continue

        is_corp = is_corporate(customer)
        folder_name = f'{code}_{name}'

        customer_folder_id = drive.folder_exists(folder_name, PARENT_FOLDER_ID)
        if not customer_folder_id:
            continue

        print(f'\n【{folder_name}】 ({"法人" if is_corp else "個人"})')

        expected = expected_structure(sections, is_corp)
        count = cleanup_customer(drive, customer_folder_id, expected, protected, dry_run)

        if count == 0:
            print('  整理対象なし')
        total_orphans += count

    print(f'\n=== 完了: 整理対象 {total_orphans} 件 ===')
    if dry_run and total_orphans > 0:
        print('実行するには: python create_folders.py --cleanup')


def main():
    parser = argparse.ArgumentParser(description='顧客フォルダ作成・整理スクリプト')
    parser.add_argument('--cleanup', action='store_true',
                        help='テンプレートにない旧フォルダを整理（ファイルはアーカイブへ移動）')
    parser.add_argument('--dry-run', action='store_true',
                        help='確認のみ（何も変更しない）。--cleanup と併用')
    args = parser.parse_args()

    if not PARENT_FOLDER_ID:
        print('エラー: PARENT_FOLDER_ID を設定してください')
        print('スクリプト内の PARENT_FOLDER_ID に、顧客フォルダを作成するGoogleドライブのフォルダIDを設定してください')
        exit(1)

    print('認証中...')
    creds = get_credentials()
    drive = DriveManager(creds)

    customers_data, sections = load_spreadsheet_data(creds)

    if args.cleanup:
        cleanup_all_customers(drive, customers_data, sections, args.dry_run)
    else:
        create_all_folders(drive, customers_data, sections)


if __name__ == '__main__':
    main()
