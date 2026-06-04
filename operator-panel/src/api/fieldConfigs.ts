import { api } from './client';

export interface FieldConfig {
  id: string;
  productId: string;
  context: string;
  fieldKey: string;
  label: string;
  visible: boolean;
  sortOrder: number;
  displayType: 'text' | 'date' | 'badge' | 'amount';
}

export const fieldConfigsApi = {
  list(context: string): Promise<FieldConfig[]> {
    return api.get('/field-configs', { params: { context } }).then((r) => r.data);
  },

  bulkUpdate(context: string, items: Omit<FieldConfig, 'id' | 'productId' | 'context'>[]): Promise<FieldConfig[]> {
    return api.patch('/field-configs', { context, items }).then((r) => r.data);
  },
};
