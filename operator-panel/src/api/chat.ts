import { api } from './client';

export interface Room {
  id: string;
  type: string;
  status: string;
  title: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  operatorId: string | null;
  lastMessageAt: string | null;
  botHandled: boolean;
  createdAt: string;
  closedAt: string | null;
  members: { userId: string; joinedAt: string }[];
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  type: string;
  content: string | null;
  replyToId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type RoomStatus = 'active' | 'pending' | 'closed' | 'archived';

export interface PagedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const chatApi = {
  getRooms(params?: { status?: RoomStatus; cursor?: string; limit?: number }) {
    return api.get<PagedResult<Room>>('/rooms', { params }).then((r) => r.data);
  },

  getRoom(id: string) {
    return api.get<Room>(`/rooms/${id}`).then((r) => r.data);
  },

  getMessages(roomId: string, params?: { cursor?: string; limit?: number }) {
    return api
      .get<PagedResult<Message>>(`/rooms/${roomId}/messages`, { params })
      .then((r) => r.data);
  },

  sendMessage(roomId: string, content: string, type = 'text') {
    return api.post<Message>(`/rooms/${roomId}/messages`, { content, type }).then((r) => r.data);
  },

  sendTyping(roomId: string) {
    return api.post(`/rooms/${roomId}/typing`, { typing: true });
  },

  markRead(roomId: string, messageId: string) {
    return api.post(`/messages/${messageId}/read`);
  },

  closeRoom(roomId: string) {
    return api.post(`/rooms/${roomId}/close`);
  },
};
