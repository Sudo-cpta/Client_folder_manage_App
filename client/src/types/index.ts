export interface FolderTemplate {
  id: string;
  name: string;
  children: FolderTemplate[];
}

export interface CustomerFolder {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface SyncResult {
  customerId: string;
  customerName: string;
  status: 'success' | 'error' | 'skipped';
  message?: string;
  created: string[];
  deleted: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthState {
  accessToken: string | null;
  parentFolderId: string | null;
}
