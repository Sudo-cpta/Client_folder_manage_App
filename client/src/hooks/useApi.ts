import { useState, useCallback } from 'react';
import type { ApiResponse, CustomerFolder, FolderTemplate, SyncResult } from '../types';

export function useApi(accessToken: string | null, parentFolderId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    'x-access-token': accessToken || '',
    'x-parent-folder-id': parentFolderId || '',
  };

  const fetchApi = useCallback(async <T>(
    url: string,
    options?: RequestInit
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options?.headers },
      });

      const data: ApiResponse<T> = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      return data.data || null;
    } catch (err) {
      setError(`${err}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken, parentFolderId]);

  const getCustomers = useCallback(async (): Promise<CustomerFolder[]> => {
    const result = await fetchApi<CustomerFolder[]>('/api/customers');
    return result || [];
  }, [fetchApi]);

  const getCustomerStructure = useCallback(async (
    customerId: string
  ): Promise<FolderTemplate | null> => {
    return fetchApi<FolderTemplate>(`/api/customers/${customerId}/structure`);
  }, [fetchApi]);

  const applyTemplate = useCallback(async (
    template: FolderTemplate[]
  ): Promise<SyncResult[]> => {
    const result = await fetchApi<SyncResult[]>('/api/apply-template', {
      method: 'POST',
      body: JSON.stringify({ template }),
    });
    return result || [];
  }, [fetchApi]);

  const createCustomer = useCallback(async (
    customerName: string,
    template: FolderTemplate[]
  ): Promise<{ customerId: string; created: string[] } | null> => {
    return fetchApi<{ customerId: string; created: string[] }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ customerName, template }),
    });
  }, [fetchApi]);

  const renameSubfolder = useCallback(async (
    oldName: string,
    newName: string,
    parentPath: string[] = []
  ): Promise<SyncResult[]> => {
    const result = await fetchApi<SyncResult[]>('/api/rename-subfolder', {
      method: 'POST',
      body: JSON.stringify({ oldName, newName, parentPath }),
    });
    return result || [];
  }, [fetchApi]);

  return {
    loading,
    error,
    getCustomers,
    getCustomerStructure,
    applyTemplate,
    createCustomer,
    renameSubfolder,
  };
}
