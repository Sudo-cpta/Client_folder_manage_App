// フォルダテンプレートの型定義
export interface FolderTemplate {
  id: string;
  name: string;
  children: FolderTemplate[];
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
