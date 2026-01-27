import type { CustomerFolder } from '../types';

interface CustomerListProps {
  customers: CustomerFolder[];
  selectedId?: string;
  onSelect: (customer: CustomerFolder) => void;
  loading: boolean;
}

export function CustomerList({ customers, selectedId, onSelect, loading }: CustomerListProps) {
  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  if (customers.length === 0) {
    return (
      <div className="help-text" style={{ padding: '20px' }}>
        顧客フォルダがありません。新しい顧客を追加してください。
      </div>
    );
  }

  return (
    <ul className="customer-list">
      {customers.map(customer => (
        <li
          key={customer.id}
          className={`customer-item ${selectedId === customer.id ? 'selected' : ''}`}
          onClick={() => onSelect(customer)}
        >
          <span className="customer-name">📁 {customer.name}</span>
          {customer.webViewLink && (
            <a
              href={customer.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="customer-link"
              onClick={(e) => e.stopPropagation()}
            >
              開く ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
