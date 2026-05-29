import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { chatApi, type Room, type Message } from '@/api/chat';
import { useCentrifugeStore } from './centrifuge';
import { useAuthStore } from './auth';

export const useRoomsStore = defineStore('rooms', () => {
  const rooms = ref<Room[]>([]);
  const activeRoomId = ref<string | null>(null);
  const messages = ref<Record<string, Message[]>>({});
  const typingRooms = ref<Set<string>>(new Set());
  const loadingMessages = ref(false);
  const unreadCounts = ref<Record<string, number>>({});
  const lastMessages = ref<Record<string, string>>({});

  const centrifuge = useCentrifugeStore();
  const auth = useAuthStore();

  const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  const totalUnread = computed(() =>
    Object.values(unreadCounts.value).reduce((sum, n) => sum + n, 0),
  );

  async function loadRooms() {
    const data = await chatApi.getRooms({ limit: 50 });
    rooms.value = data.items;
    // Subscribe to all room channels for real-time updates
    for (const room of data.items) {
      if (!messages.value[room.id]) {
        await subscribeRoom(room.id);
      }
    }
  }

  async function selectRoom(roomId: string) {
    activeRoomId.value = roomId;
    unreadCounts.value[roomId] = 0;
    updateTabTitle();

    if (!messages.value[roomId]) {
      loadingMessages.value = true;
      try {
        const data = await chatApi.getMessages(roomId, { limit: 50 });
        messages.value[roomId] = data.items;
      } finally {
        loadingMessages.value = false;
      }
      await subscribeRoom(roomId);
    }

    // Mark last message as read
    const msgs = messages.value[roomId];
    if (msgs?.length) {
      const lastMsg = msgs[msgs.length - 1];
      chatApi.markRead(roomId, lastMsg.id).catch(() => {});
    }
  }

  async function subscribeRoom(roomId: string) {
    await centrifuge.subscribe(`chat:room#${roomId}`, (raw) => {
      const payload = raw as { event: string; message?: Message; userId?: string };

      if (payload.event === 'message.created' && payload.message) {
        const msg = payload.message;
        appendMessage(roomId, msg);
        updateRoomLastMessage(roomId, msg.content ?? '');

        // Unread badge: only if room is not currently open
        if (activeRoomId.value !== roomId) {
          // Only count messages from others (not own)
          if (msg.senderId !== auth.user?.id) {
            unreadCounts.value[roomId] = (unreadCounts.value[roomId] ?? 0) + 1;
            updateTabTitle();
            playNotificationSound();
          }
        }
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

  function updateRoomLastMessage(roomId: string, content: string) {
    const idx = rooms.value.findIndex((r) => r.id === roomId);
    if (idx >= 0) {
      rooms.value[idx] = { ...rooms.value[idx], lastMessageAt: new Date().toISOString() };
    }
    lastMessages.value[roomId] = content.slice(0, 40);
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

  function updateTabTitle() {
    const total = Object.values(unreadCounts.value).reduce((s, n) => s + n, 0);
    document.title = total > 0 ? `(${total}) Nova Chat — Operator` : 'Nova Chat — Operator';
  }

  let audioCtx: AudioContext | null = null;
  function playNotificationSound() {
    try {
      if (!audioCtx) audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch { /* silent */ }
  }

  async function sendMessage(roomId: string, content: string) {
    const msg = await chatApi.sendMessage(roomId, content);
    appendMessage(roomId, msg);
    updateRoomLastMessage(roomId, content);
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
      unreadCounts.value[room.id] = 1;
      updateTabTitle();
    }
  }

  return {
    rooms,
    activeRoomId,
    messages,
    typingRooms,
    loadingMessages,
    unreadCounts,
    lastMessages,
    totalUnread,
    loadRooms,
    selectRoom,
    sendMessage,
    sendTyping,
    appendMessage,
    handleIncomingRoom,
  };
});
