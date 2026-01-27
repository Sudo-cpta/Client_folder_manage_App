import { useState } from 'react';
import type { FolderTemplate } from '../types';

interface TemplateEditorProps {
  template: FolderTemplate[];
  onChange: (template: FolderTemplate[]) => void;
  onApply: () => void;
  loading: boolean;
}

export function TemplateEditor({ template, onChange, onApply, loading }: TemplateEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const generateId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addFolder = (parentPath: number[] = []) => {
    const newFolder: FolderTemplate = {
      id: generateId(),
      name: '新しいフォルダ',
      children: [],
    };

    const newTemplate = [...template];
    if (parentPath.length === 0) {
      newTemplate.push(newFolder);
    } else {
      let current: FolderTemplate[] = newTemplate;
      for (let i = 0; i < parentPath.length - 1; i++) {
        current = current[parentPath[i]].children;
      }
      current[parentPath[parentPath.length - 1]].children.push(newFolder);
    }
    onChange(newTemplate);
    setEditingId(newFolder.id);
  };

  const updateFolderName = (path: number[], newName: string) => {
    const newTemplate = [...template];
    let current: FolderTemplate[] = newTemplate;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]].children;
    }
    current[path[path.length - 1]] = {
      ...current[path[path.length - 1]],
      name: newName,
    };
    onChange(newTemplate);
  };

  const deleteFolder = (path: number[]) => {
    const newTemplate = [...template];
    let current: FolderTemplate[] = newTemplate;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]].children;
    }
    current.splice(path[path.length - 1], 1);
    onChange(newTemplate);
  };

  const renderFolder = (folder: FolderTemplate, path: number[]) => {
    const isEditing = editingId === folder.id;

    return (
      <div key={folder.id}>
        <div className="template-folder">
          <span>📁</span>
          {isEditing ? (
            <input
              type="text"
              value={folder.name}
              onChange={(e) => updateFolderName(path, e.target.value)}
              onBlur={() => setEditingId(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditingId(null);
              }}
              autoFocus
            />
          ) : (
            <span
              style={{ flex: 1, cursor: 'pointer' }}
              onClick={() => setEditingId(folder.id)}
            >
              {folder.name}
            </span>
          )}
          <button
            className="icon-btn"
            onClick={() => addFolder(path)}
            title="サブフォルダを追加"
          >
            ➕
          </button>
          <button
            className="icon-btn delete"
            onClick={() => deleteFolder(path)}
            title="削除"
          >
            🗑️
          </button>
        </div>
        {folder.children.length > 0 && (
          <div className="template-folder-children">
            {folder.children.map((child, index) =>
              renderFolder(child, [...path, index])
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="template-editor">
      <div className="template-tree">
        {template.length === 0 ? (
          <p className="help-text">
            フォルダテンプレートが空です。「フォルダを追加」ボタンでテンプレートを作成してください。
          </p>
        ) : (
          template.map((folder, index) => renderFolder(folder, [index]))
        )}
      </div>
      <div className="template-actions">
        <button className="btn btn-secondary" onClick={() => addFolder()}>
          + フォルダを追加
        </button>
        <button
          className="btn btn-primary"
          onClick={onApply}
          disabled={loading || template.length === 0}
        >
          {loading ? '適用中...' : '全顧客に適用'}
        </button>
      </div>
      <p className="warning-text">
        ⚠️ テンプレートを適用すると、全顧客フォルダに対して以下の処理が行われます：
        <br />・テンプレートに存在するフォルダが作成されます
        <br />・テンプレートから削除されたフォルダは、中身が空の場合のみ削除されます
      </p>
    </div>
  );
}
