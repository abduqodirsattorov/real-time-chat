import { api } from './client';

export interface Room {
  id: string;
  status: string;
  createdAt: string;
  lastMessageAt: string | null;
  customer: { id: string; fullName: string; phone: string };
  assignedOperator: { id: string; fullName: string } | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  sender: { id: string; fullName: string; role: string };
}

export const chatApi = {
  getRooms(params?: { status?: string; page?: number; limit?: number }) {
    return api.get<{ rooms: Room[]; total: number }>('/rooms', { params }).then((r) => r.data);
  },

  getRoom(id: string) {
    return api.get<Room>(`/rooms/${id}`).then((r) => r.data);
  },

  getMessages(roomId: string, params?: { before?: string; limit?: number }) {
    return api
      .get<{ messages: Message[]; hasMore: boolean }>(`/rooms/${roomId}/messages`, { params })
      .then((r) => r.data);
  },

  sendMessage(roomId: string, content: string, type = 'text') {
    return api.post<Message>(`/rooms/${roomId}/messages`, { content, type }).then((r) => r.data);
  },

  sendTyping(roomId: string) {
    return api.post(`/rooms/${roomId}/typing`);
  },

  markRead(roomId: string, lastMessageId: string) {
    return api.post(`/rooms/${roomId}/read`, { lastMessageId });
  },

  closeRoom(roomId: string) {
    return api.patch(`/rooms/${roomId}`, { status: 'closed' });
  },
};
