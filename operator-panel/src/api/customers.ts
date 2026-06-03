import { api } from './client';

export interface CustomerProfile {
  id: string;
  productId: string;
  userId: string | null;
  externalUid: string | null;
  profileData: Record<string, unknown>;
  notes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    fullName: string | null;
    phone: string | null;
    locale: string;
    createdAt: string;
  } | null;
}

export const customersApi = {
  getByRoom(roomId: string): Promise<CustomerProfile | null> {
    return api.get(`/customers/by-room/${roomId}`).then((r) => r.data).catch(() => null);
  },

  upsert(data: {
    productId: string;
    userId?: string;
    externalUid?: string;
    profileData?: Record<string, unknown>;
  }): Promise<CustomerProfile> {
    return api.post('/customers/upsert', data).then((r) => r.data);
  },

  update(id: string, data: {
    notes?: string;
    tags?: string[];
    profileData?: Record<string, unknown>;
  }): Promise<CustomerProfile> {
    return api.patch(`/customers/${id}`, data).then((r) => r.data);
  },
};
