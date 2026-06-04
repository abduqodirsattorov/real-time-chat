import { api } from './client';

export interface Tag {
  id: string;
  productId: string;
  name: string;
  color: string;
  createdAt: string;
}

export const tagsApi = {
  list() {
    return api.get<Tag[]>('/tags').then(r => r.data);
  },

  create(data: { name: string; color: string }) {
    return api.post<Tag>('/tags', data).then(r => r.data);
  },

  update(id: string, data: { name?: string; color?: string }) {
    return api.patch<Tag>(`/tags/${id}`, data).then(r => r.data);
  },

  remove(id: string) {
    return api.delete(`/tags/${id}`).then(r => r.data);
  },

  setRoomTags(roomId: string, tagIds: string[]) {
    return api.patch(`/rooms/${roomId}/tags`, { tagIds }).then(r => r.data);
  },
};
