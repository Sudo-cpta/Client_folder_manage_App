import { useState, useRef } from 'react';
import type { ImportedCustomer, FolderTemplate } from '../types';

interface ExcelImportProps {
  onImport: (customers: ImportedCustomer[], template: FolderTemplate[]) => void;
  loading: boolean;
}

export function ExcelImport({ onImport, loading }: ExcelImportProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Excelファイル（.xlsx, .xls）を選択してください');
      return;
    }

    setFileName(file.name);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/import/excel', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }

      onImport(result.data.customers, result.data.template);
    } catch (err) {
      setError(`インポートエラー: ${err}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="excel-import">
      <div
        className={`drop-zone ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleChange}
          style={{ display: 'none' }}
          disabled={loading}
        />
        <div className="drop-zone-content">
          <span className="drop-zone-icon">📊</span>
          {fileName ? (
            <p><strong>{fileName}</strong> を読み込みました</p>
          ) : (
            <>
              <p>Excelファイルをドラッグ＆ドロップ</p>
              <p className="drop-zone-hint">または クリックして選択</p>
            </>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="help-text" style={{ marginTop: '10px' }}>
        <strong>対応フォーマット:</strong>
        <br />・シート「顧問先マスタ」: 顧問先コード, 顧問先名, 区分
        <br />・シート「フォルダテンプレート」: 階層, フォルダ名, 対象区分
      </div>

      <style>{`
        .excel-import {
          margin-bottom: 20px;
        }
        .drop-zone {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 30px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: #fafafa;
        }
        .drop-zone:hover {
          border-color: #1a73e8;
          background: #f0f7ff;
        }
        .drop-zone.active {
          border-color: #1a73e8;
          background: #e8f0fe;
        }
        .drop-zone-icon {
          font-size: 48px;
          display: block;
          margin-bottom: 10px;
        }
        .drop-zone-hint {
          font-size: 13px;
          color: #5f6368;
          margin-top: 5px;
        }
      `}</style>
    </div>
  );
}
