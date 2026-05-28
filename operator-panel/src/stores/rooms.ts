import { defineStore } from 'pinia';
import { ref } from 'vue';
import { chatApi, type Room, type Message } from '@/api/chat';
import { useCentrifugeStore } from './centrifuge';
import { useAuthStore } from './auth';

export const useRoomsStore = defineStore('rooms', () => {
  const rooms = ref<Room[]>([]);
  const activeRoomId = ref<string | null>(null);
  const messages = ref<Record<string, Message[]>>({});
  const typingRooms = ref<Set<string>>(new Set());
  const loadingMessages = ref(false);

  const centrifuge = useCentrifugeStore();
  const auth = useAuthStore();

  let typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  async function loadRooms() {
    const data = await chatApi.getRooms({ status: 'open' });
    rooms.value = data.rooms;
  }

  async function selectRoom(roomId: string) {
    activeRoomId.value = roomId;
    if (!messages.value[roomId]) {
      loadingMessages.value = true;
      const data = await chatApi.getMessages(roomId, { limit: 50 });
      messages.value[roomId] = data.messages;
      loadingMessages.value = false;
    }
    await subscribeRoom(roomId);
  }

  async function subscribeRoom(roomId: string) {
    await centrifuge.subscribe(`chat:room#${roomId}`, (raw) => {
      const payload = raw as { event: string; message?: Message; userId?: string };
      if (payload.event === 'message.created' && payload.message) {
        appendMessage(roomId, payload.message);
        updateRoomLastMessage(roomId);
      }
      if (payload.event === 'user.typing' && payload.userId !== auth.user?.id) {
        showTyping(roomId);
      }
    });
  }

  function appendMessage(roomId: string, msg: Message) {
    if (!messages.value[roomId]) messages.value[roomId] = [];
    const exists = messages.value[roomId].find((m) => m.id === msg.id);
    if (!exists) messages.value[roomId].push(msg);
  }

  function updateRoomLastMessage(roomId: string) {
    const room = rooms.value.find((r) => r.id === roomId);
    if (room) room.lastMessageAt = new Date().toISOString();
    rooms.value = [...rooms.value].sort((a, b) => {
      const ta = a.lastMessageAt ?? a.createdAt;
      const tb = b.lastMessageAt ?? b.createdAt;
      return tb.localeCompare(ta);
    });
  }

  function showTyping(roomId: string) {
    typingRooms.value.add(roomId);
    clearTimeout(typingTimers[roomId]);
    typingTimers[roomId] = setTimeout(() => {
      typingRooms.value.delete(roomId);
    }, 3000);
  }

  async function sendMessage(roomId: string, content: string) {
    const msg = await chatApi.sendMessage(roomId, content);
    appendMessage(roomId, msg);
    updateRoomLastMessage(roomId);
  }

  async function sendTyping(roomId: string) {
    await chatApi.sendTyping(roomId);
  }

  function handleIncomingRoom(room: Room) {
    const idx = rooms.value.findIndex((r) => r.id === room.id);
    if (idx >= 0) {
      rooms.value[idx] = room;
    } else {
      rooms.value.unshift(room);
    }
  }

  return {
    rooms,
    activeRoomId,
    messages,
    typingRooms,
    loadingMessages,
    loadRooms,
    selectRoom,
    sendMessage,
    sendTyping,
    appendMessage,
    handleIncomingRoom,
  };
});
