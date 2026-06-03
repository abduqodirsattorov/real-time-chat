import { api } from './client';

export interface Transaction {
  id: string;
  productId: string;
  externalId: string | null;
  userUid: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionListResult {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface TransactionFilters {
  limit?: number;
  offset?: number;
  search?: string;
  userUid?: string;
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
  type?: string;
  debitState?: string;
  creditState?: string;
  strana?: string;
}

export const transactionsApi = {
  list(filters: TransactionFilters = {}): Promise<TransactionListResult> {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
    );
    return api.get('/transactions', { params }).then((r) => r.data);
  },

  getOne(id: string): Promise<Transaction> {
    return api.get(`/transactions/${id}`).then((r) => r.data);
  },

  upsert(data: {
    productId: string;
    externalId: string;
    userUid?: string;
    data: Record<string, unknown>;
  }): Promise<Transaction> {
    return api.post('/transactions/upsert', data).then((r) => r.data);
  },
};
