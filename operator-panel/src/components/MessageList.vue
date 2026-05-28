<template>
  <div class="message-list-wrapper">
    <div class="message-list-header">
      <div v-if="room" class="room-title">{{ roomLabel }}</div>
      <div class="header-actions">
        <button
          v-if="room && room.status !== 'closed'"
          class="close-btn"
          @click="closeRoom"
        >
          {{ t('chat.close') }}
        </button>
      </div>
    </div>

    <div ref="scrollEl" class="messages" @scroll="onScroll">
      <div
        v-for="msg in roomMessages"
        :key="msg.id"
        :class="['message', getMessageClass(msg)]"
      >
        <div class="bubble">
          <div v-if="!isOwn(msg) && msg.type !== 'system'" class="sender-name">
            {{ senderLabel(msg.senderId) }}
          </div>
          <p v-if="msg.type === 'system'" class="text system-text">
            {{ parseSystemContent(msg.content) }}
          </p>
          <p v-else class="text">{{ msg.content }}</p>
          <span class="time">{{ formatTime(msg.createdAt) }}</span>
        </div>
      </div>

      <div v-if="rooms.loadingMessages" class="loading">{{ t('common.loading') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomsStore } from '@/stores/rooms';
import { useAuthStore } from '@/stores/auth';
import { chatApi } from '@/api/chat';
import type { Message } from '@/api/chat';

const props = defineProps<{ roomId: string }>();
const { t, locale } = useI18n();
const rooms = useRoomsStore();
const auth = useAuthStore();
const scrollEl = ref<HTMLDivElement | null>(null);

const room = computed(() => rooms.rooms.find((r) => r.id === props.roomId));
const roomMessages = computed(() => rooms.messages[props.roomId] ?? []);

const roomLabel = computed(() => {
  if (!room.value) return '';
  if (room.value.title) return room.value.title;
  if (room.value.customerId) return `Mijoz #${room.value.customerId.slice(0, 6)}`;
  return `Room ${props.roomId.slice(0, 6)}`;
});

watch(
  () => roomMessages.value.length,
  () => nextTick(scrollToBottom),
);

onMounted(() => nextTick(scrollToBottom));

function scrollToBottom() {
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

function onScroll() {
  // TODO: load older messages on scroll to top
}

function isOwn(msg: Message) {
  return msg.senderId === auth.user?.id;
}

function getMessageClass(msg: Message) {
  if (msg.type === 'system') return 'system';
  return isOwn(msg) ? 'own' : 'other';
}

function senderLabel(senderId: string) {
  if (senderId === auth.user?.id) return auth.user?.fullName ?? 'Siz';
  const member = room.value?.members.find((m) => m.userId === senderId);
  if (member) return `Mijoz #${senderId.slice(0, 6)}`;
  return `#${senderId.slice(0, 6)}`;
}

function parseSystemContent(content: string | null): string {
  if (!content) return '';
  try {
    const parsed = JSON.parse(content);
    return parsed[locale.value] ?? parsed.uz ?? parsed.ru ?? content;
  } catch {
    return content;
  }
}

async function closeRoom() {
  if (!props.roomId) return;
  await chatApi.closeRoom(props.roomId);
  await rooms.loadRooms();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.message-list-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.message-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}

.room-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.close-btn {
  padding: 6px 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: #666;
}

.close-btn:hover { background: #f7fafc; }

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f8f9fa;
}

.message {
  display: flex;
}

.message.own { justify-content: flex-end; }
.message.system { justify-content: center; }

.message.system .bubble {
  background: transparent;
  box-shadow: none;
  padding: 4px 12px;
}

.bubble {
  max-width: 65%;
  padding: 10px 14px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.message.own .bubble {
  background: #2d6a9f;
  color: #fff;
}

.sender-name {
  font-size: 11px;
  font-weight: 600;
  color: #2d6a9f;
  margin-bottom: 4px;
}

.text {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.system-text {
  color: #888;
  font-style: italic;
  font-size: 12px;
  text-align: center;
}

.message.own .text { color: #fff; }

.time {
  display: block;
  font-size: 10px;
  color: #aaa;
  margin-top: 4px;
  text-align: right;
}

.message.own .time { color: rgba(255, 255, 255, 0.7); }

.loading {
  text-align: center;
  color: #999;
  font-size: 13px;
  padding: 20px;
}
</style>
