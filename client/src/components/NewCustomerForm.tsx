import { useState } from 'react';

interface NewCustomerFormProps {
  onSubmit: (name: string) => Promise<void>;
  loading: boolean;
}

export function NewCustomerForm({ onSubmit, loading }: NewCustomerFormProps) {
  const [name, setName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await onSubmit(name.trim());
    setName('');
  };

  return (
    <form className="new-customer-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="新しい顧客名を入力..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={loading}
      />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={loading || !name.trim()}
      >
        {loading ? '作成中...' : '追加'}
      </button>
    </form>
  );
}
