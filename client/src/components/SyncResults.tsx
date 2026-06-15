import type { SyncResult } from '../types';

interface SyncResultsProps {
  results: SyncResult[];
  onClose: () => void;
}

export function SyncResults({ results, onClose }: SyncResultsProps) {
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>同期結果</h3>
        <div style={{ marginBottom: '15px' }}>
          <span style={{ marginRight: '15px' }}>✅ 成功: {successCount}</span>
          <span style={{ marginRight: '15px' }}>❌ エラー: {errorCount}</span>
          <span>⏭️ スキップ: {skippedCount}</span>
        </div>
        <div className="results" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {results.map((result, index) => (
            <div key={index} className="result-item">
              <span className={`result-status ${result.status}`}>
                {result.status === 'success' ? '成功' :
                 result.status === 'error' ? 'エラー' : 'スキップ'}
              </span>
              <div style={{ flex: 1 }}>
                <strong>{result.customerName}</strong>
                {result.created.length > 0 && (
                  <div className="result-details">
                    作成: {result.created.join(', ')}
                  </div>
                )}
                {result.deleted.length > 0 && (
                  <div className="result-details">
                    削除: {result.deleted.join(', ')}
                  </div>
                )}
                {result.message && (
                  <div className="result-details" style={{ color: '#ea4335' }}>
                    {result.message}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
