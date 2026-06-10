// フォルダテンプレートの型定義
export interface FolderTemplate {
  id: string;
  name: string;
  children: FolderTemplate[];
  targetType?: 'common' | 'corporate' | 'individual';
}

// Excelから読み込んだ顧問先データ
export interface ImportedCustomer {
  code: string;
  name: string;
  category: string;
  folderName: string;
}

// Excelから読み込んだフォルダテンプレート行
export interface ImportedTemplateRow {
  level: number;
  folderName: string;
  description: string;
  targetType: 'common' | 'corporate' | 'individual';
}

// Excelインポート結果
export interface ExcelImportResult {
  customers: ImportedCustomer[];
  template: FolderTemplate[];
}

// 顧客フォルダの型定義
export interface CustomerFolder {
  id: string;
  name: string;
  webViewLink?: string;
}

// フォルダ同期結果の型定義
export interface SyncResult {
  customerId: string;
  customerName: string;
  status: 'success' | 'error' | 'skipped';
  message?: string;
  created: string[];
  deleted: string[];
}

// 削除チェック結果の型定義
export interface DeleteCheckResult {
  folderId: string;
  folderName: string;
  isEmpty: boolean;
  canDelete: boolean;
}

// API レスポンスの型定義
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
