import { api } from './client';

export interface Product {
  id: string;
  name: string;
  slug: string;
  branding: {
    display_name?: string;
    primary_color?: string;
    logo_url?: string | null;
  };
  settings?: Record<string, unknown>;
  isActive: boolean;
  createdAt?: string;
}

export interface CreateProductPayload {
  name: string;
  slug: string;
  branding?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface UpdateProductPayload {
  name?: string;
  branding?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  isActive?: boolean;
}

export const productsApi = {
  /** Active products only — for product picker */
  list(): Promise<{ products: Product[] }> {
    return api.get('/products').then((r) => r.data);
  },

  /** All products (active + inactive) — for admin panel */
  listAll(): Promise<{ products: Product[] }> {
    return api.get('/products').then((r) => r.data);
  },

  create(payload: CreateProductPayload): Promise<Product> {
    return api.post('/products', payload).then((r) => r.data);
  },

  update(id: string, payload: UpdateProductPayload): Promise<Product> {
    return api.patch(`/products/${id}`, payload).then((r) => r.data);
  },

  remove(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete(`/products/${id}`).then((r) => r.data);
  },

  selectProduct(productId: string): Promise<{ userId: string; productId: string }> {
    return api.patch('/operator/product', { productId }).then((r) => r.data);
  },
};
