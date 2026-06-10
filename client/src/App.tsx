import { useState, useEffect, useCallback } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { useApi } from './hooks/useApi';
import { CustomerList } from './components/CustomerList';
import { FolderTree } from './components/FolderTree';
import { TemplateEditor } from './components/TemplateEditor';
import { SyncResults } from './components/SyncResults';
import { NewCustomerForm } from './components/NewCustomerForm';
import { ExcelImport } from './components/ExcelImport';
import type { CustomerFolder, FolderTemplate, SyncResult, ImportedCustomer } from './types';
import './styles/App.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function AppContent() {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem('accessToken')
  );
  const [parentFolderId, setParentFolderId] = useState<string>(
    localStorage.getItem('parentFolderId') || ''
  );
  const [customers, setCustomers] = useState<CustomerFolder[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerFolder | null>(null);
  const [customerStructure, setCustomerStructure] = useState<FolderTemplate | null>(null);
  const [template, setTemplate] = useState<FolderTemplate[]>(() => {
    const saved = localStorage.getItem('folderTemplate');
    return saved ? JSON.parse(saved) : [];
  });
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [structureLoading, setStructureLoading] = useState(false);
  const [importedCustomers, setImportedCustomers] = useState<ImportedCustomer[]>([]);

  const api = useApi(accessToken, parentFolderId);

  // Google ログイン
  const login = useGoogleLogin({
    onSuccess: (response) => {
      setAccessToken(response.access_token);
      localStorage.setItem('accessToken', response.access_token);
    },
    scope: 'https://www.googleapis.com/auth/drive',
  });

  const logout = () => {
    setAccessToken(null);
    localStorage.removeItem('accessToken');
    setCustomers([]);
    setSelectedCustomer(null);
    setCustomerStructure(null);
  };

  // 親フォルダID の保存
  const handleParentFolderIdChange = (id: string) => {
    setParentFolderId(id);
    localStorage.setItem('parentFolderId', id);
  };

  // テンプレートの保存
  const handleTemplateChange = (newTemplate: FolderTemplate[]) => {
    setTemplate(newTemplate);
    localStorage.setItem('folderTemplate', JSON.stringify(newTemplate));
  };

  // 顧客一覧の読み込み
  const loadCustomers = useCallback(async () => {
    if (!accessToken || !parentFolderId) return;

    setCustomersLoading(true);
    const result = await api.getCustomers();
    setCustomers(result);
    setCustomersLoading(false);
  }, [accessToken, parentFolderId, api]);

  // 顧客フォルダ構造の読み込み
  const loadCustomerStructure = useCallback(async (customerId: string) => {
    setStructureLoading(true);
    const structure = await api.getCustomerStructure(customerId);
    setCustomerStructure(structure);
    setStructureLoading(false);
  }, [api]);

  // 顧客選択時
  const handleCustomerSelect = (customer: CustomerFolder) => {
    setSelectedCustomer(customer);
    loadCustomerStructure(customer.id);
  };

  // テンプレート適用
  const handleApplyTemplate = async () => {
    const results = await api.applyTemplate(template);
    setSyncResults(results);
    loadCustomers();
  };

  // 新規顧客作成
  const handleCreateCustomer = async (name: string) => {
    await api.createCustomer(name, template);
    loadCustomers();
  };

  // Excelインポート
  const handleExcelImport = (customers: ImportedCustomer[], importedTemplate: FolderTemplate[]) => {
    setImportedCustomers(customers);
    if (importedTemplate.length > 0) {
      handleTemplateChange(importedTemplate);
    }
  };

  // インポートした顧客を一括作成
  const handleCreateAllImportedCustomers = async () => {
    if (importedCustomers.length === 0) return;

    const results = await api.createAllCustomers(importedCustomers, template);
    setSyncResults(results);
    setImportedCustomers([]);
    loadCustomers();
  };

  // サンプルテンプレートを設定
  const loadSampleTemplate = () => {
    const sampleTemplate: FolderTemplate[] = [
      {
        id: 'sample-1',
        name: '01_契約書類',
        children: [
          { id: 'sample-1-1', name: '契約書', children: [] },
          { id: 'sample-1-2', name: '見積書', children: [] },
        ],
      },
      {
        id: 'sample-2',
        name: '02_打ち合わせ資料',
        children: [
          { id: 'sample-2-1', name: '議事録', children: [] },
          { id: 'sample-2-2', name: 'プレゼン資料', children: [] },
        ],
      },
      {
        id: 'sample-3',
        name: '03_納品物',
        children: [],
      },
      {
        id: 'sample-4',
        name: '04_請求関連',
        children: [
          { id: 'sample-4-1', name: '請求書', children: [] },
          { id: 'sample-4-2', name: '領収書', children: [] },
        ],
      },
    ];
    handleTemplateChange(sampleTemplate);
  };

  // 親フォルダID変更時に顧客一覧を読み込み
  useEffect(() => {
    if (accessToken && parentFolderId) {
      loadCustomers();
    }
  }, [accessToken, parentFolderId, loadCustomers]);

  // 未ログイン時
  if (!accessToken) {
    return (
      <div className="app">
        <header className="header">
          <h1>顧客フォルダ管理アプリ</h1>
        </header>
        <div className="login-section">
          <h2>Google ドライブに接続してください</h2>
          <p className="help-text" style={{ marginBottom: '20px' }}>
            このアプリは Google ドライブ上の顧客フォルダを管理するために、
            Googleアカウントへのアクセスが必要です。
          </p>
          <button className="btn btn-primary" onClick={() => login()}>
            Google でログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>顧客フォルダ管理アプリ</h1>
        <button className="btn btn-secondary" onClick={logout}>
          ログアウト
        </button>
      </header>

      <div className="config-section">
        <label htmlFor="parentFolderId">
          親フォルダID（顧客フォルダを格納するフォルダ）
        </label>
        <input
          id="parentFolderId"
          type="text"
          value={parentFolderId}
          onChange={(e) => handleParentFolderIdChange(e.target.value)}
          placeholder="Google ドライブのフォルダIDを入力..."
        />
        <p className="help-text">
          Google ドライブでフォルダを開き、URLの「/folders/」以降の文字列がフォルダIDです。
          <br />例: https://drive.google.com/drive/folders/<strong>1ABC123xyz...</strong>
        </p>
      </div>

      {api.error && <div className="error">{api.error}</div>}

      <div className="main-content">
        {/* 左サイドバー: 顧客一覧 */}
        <div className="panel">
          <div className="panel-header">
            顧客一覧 ({customers.length})
          </div>
          <div className="panel-content">
            <NewCustomerForm
              onSubmit={handleCreateCustomer}
              loading={api.loading}
            />
            <CustomerList
              customers={customers}
              selectedId={selectedCustomer?.id}
              onSelect={handleCustomerSelect}
              loading={customersLoading}
            />
          </div>
        </div>

        {/* メインコンテンツ */}
        <div>
          {/* Excelインポートパネル */}
          <div className="panel" style={{ marginBottom: '20px' }}>
            <div className="panel-header">
              Excelからインポート
            </div>
            <div className="panel-content">
              <ExcelImport
                onImport={handleExcelImport}
                loading={api.loading}
              />
              {importedCustomers.length > 0 && (
                <div style={{ marginTop: '15px', padding: '15px', background: '#e8f0fe', borderRadius: '8px' }}>
                  <strong>インポート済み: {importedCustomers.length} 件の顧客</strong>
                  <div style={{ marginTop: '10px', maxHeight: '150px', overflowY: 'auto' }}>
                    {importedCustomers.slice(0, 10).map((c, i) => (
                      <div key={i} style={{ fontSize: '13px', padding: '2px 0' }}>
                        {c.folderName} ({c.category || '区分なし'})
                      </div>
                    ))}
                    {importedCustomers.length > 10 && (
                      <div style={{ fontSize: '13px', color: '#5f6368' }}>
                        ... 他 {importedCustomers.length - 10} 件
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: '10px' }}
                    onClick={handleCreateAllImportedCustomers}
                    disabled={api.loading}
                  >
                    {api.loading ? '作成中...' : `${importedCustomers.length} 件の顧客フォルダを一括作成`}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* テンプレート編集パネル */}
          <div className="panel" style={{ marginBottom: '20px' }}>
            <div className="panel-header">
              フォルダ構成テンプレート
              <button
                className="btn btn-small btn-secondary"
                style={{ marginLeft: '10px' }}
                onClick={loadSampleTemplate}
              >
                サンプルを読み込む
              </button>
            </div>
            <div className="panel-content">
              <TemplateEditor
                template={template}
                onChange={handleTemplateChange}
                onApply={handleApplyTemplate}
                loading={api.loading}
              />
            </div>
          </div>

          {/* 選択した顧客のフォルダ構造 */}
          {selectedCustomer && (
            <div className="panel">
              <div className="panel-header">
                {selectedCustomer.name} のフォルダ構造
              </div>
              <div className="panel-content">
                {structureLoading ? (
                  <div className="loading">読み込み中...</div>
                ) : customerStructure ? (
                  <FolderTree folders={customerStructure.children} />
                ) : (
                  <p className="help-text">フォルダ構造を取得できませんでした。</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 同期結果モーダル */}
      {syncResults && (
        <SyncResults
          results={syncResults}
          onClose={() => setSyncResults(null)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppContent />
    </GoogleOAuthProvider>
  );
}

export default App;
