import { api } from './client';

export interface AdminUser {
  id: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
}

export interface AdminUsersRes {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export const adminApi = {
  listUsers(params?: { role?: string; page?: number; limit?: number }): Promise<AdminUsersRes> {
    return api.get('/admin/users', { params }).then((r) => r.data);
  },

  createUser(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role?: string;
  }): Promise<AdminUser> {
    return api.post('/admin/users', data).then((r) => r.data);
  },

  getUser(id: string): Promise<AdminUser> {
    return api.get(`/admin/users/${id}`).then((r) => r.data);
  },

  updateUser(id: string, data: { firstName?: string; lastName?: string }): Promise<AdminUser> {
    return api.patch(`/admin/users/${id}`, data).then((r) => r.data);
  },

  updatePassword(id: string, password: string): Promise<{ message: string }> {
    return api.patch(`/admin/users/${id}/password`, { password }).then((r) => r.data);
  },

  deleteUser(id: string): Promise<{ message: string }> {
    return api.delete(`/admin/users/${id}`).then((r) => r.data);
  },
};
