<template>
  <div class="message-list-wrapper">
    <div class="message-list-header">
      <div class="header-left">
        <div v-if="room" class="room-title">{{ roomLabel }}</div>
        <RoomTags :room-id="props.roomId" />
      </div>
      <div class="header-actions">
        <button
          v-if="room && room.status !== 'closed'"
          class="icon-btn call-btn"
          title="Qo'ng'iroq"
          @click="startOutboundCall"
        >
          📞
        </button>
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
      <div v-if="loadingOlder" class="load-more">{{ t('common.loading') }}</div>

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
          <template v-else-if="msg.type === 'image'">
            <MediaImage :attachment-id="msg.content!" />
          </template>
          <template v-else-if="msg.type === 'video'">
            <MediaVideo :attachment-id="msg.content!" />
          </template>
          <template v-else-if="msg.type === 'audio'">
            <MediaAudio :attachment-id="msg.content!" />
          </template>
          <template v-else-if="msg.type === 'file'">
            <MediaFile :attachment-id="msg.content!" />
          </template>
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
import MediaImage from './media/MediaImage.vue';
import MediaVideo from './media/MediaVideo.vue';
import MediaAudio from './media/MediaAudio.vue';
import MediaFile from './media/MediaFile.vue';
import RoomTags from './RoomTags.vue';
import { useI18n } from 'vue-i18n';
import { useRoomsStore } from '@/stores/rooms';
import { useAuthStore } from '@/stores/auth';
import { useCallsStore } from '@/stores/calls';
import { chatApi } from '@/api/chat';
import { callsApi } from '@/api/calls';
import type { Message } from '@/api/chat';

const props = defineProps<{ roomId: string }>();
const { t, locale } = useI18n();
const rooms = useRoomsStore();
const auth = useAuthStore();
const calls = useCallsStore();
const scrollEl = ref<HTMLDivElement | null>(null);
const loadingOlder = ref(false);
const oldestCursor = ref<string | null>(null);

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
  (newLen, oldLen) => {
    if (newLen > (oldLen ?? 0)) nextTick(scrollToBottom);
  },
);

onMounted(() => nextTick(scrollToBottom));

function scrollToBottom() {
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

async function onScroll() {
  if (!scrollEl.value || loadingOlder.value) return;
  if (scrollEl.value.scrollTop < 60 && oldestCursor.value !== 'end') {
    await loadOlderMessages();
  }
}

async function loadOlderMessages() {
  if (loadingOlder.value) return;
  const msgs = rooms.messages[props.roomId];
  if (!msgs?.length) return;

  loadingOlder.value = true;
  const prevScrollHeight = scrollEl.value?.scrollHeight ?? 0;
  try {
    const oldest = msgs[0];
    const data = await chatApi.getMessages(props.roomId, {
      cursor: btoa(oldest.createdAt),
      limit: 30,
    });
    if (data.items.length === 0) {
      oldestCursor.value = 'end';
      return;
    }
    rooms.messages[props.roomId] = [...data.items, ...msgs];
    // Maintain scroll position
    await nextTick();
    if (scrollEl.value) {
      scrollEl.value.scrollTop = scrollEl.value.scrollHeight - prevScrollHeight;
    }
  } finally {
    loadingOlder.value = false;
  }
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
  return `Mijoz #${senderId.slice(0, 6)}`;
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

async function startOutboundCall() {
  if (!room.value?.customerId) return;
  try {
    await calls.startOutbound(room.value.customerId);
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
    alert(msg ?? 'Qo\'ng\'iroqni boshlash imkoni yo\'q');
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
  background: var(--c-bg);
}

/* ── Header ── */
.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.message-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg);
  min-height: 60px;
}

.room-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
}

.header-actions { display: flex; gap: 6px; align-items: center; }

.icon-btn {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: transparent;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  font-size: 16px;
  color: var(--c-text-2);
  transition: background 0.12s, color 0.12s;
}

.icon-btn:hover { background: var(--c-surface); color: var(--c-text); }

.close-btn {
  padding: 7px 14px;
  background: transparent;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: var(--c-text-2);
  transition: all 0.12s;
}

.close-btn:hover { border-color: var(--c-accent); color: var(--c-accent); }

/* ── Messages area ── */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--c-bg);
}

.load-more {
  text-align: center;
  color: var(--c-text-3);
  font-size: 12px;
  padding: 8px;
}

.message { display: flex; }
.message.own { justify-content: flex-end; }
.message.system { justify-content: center; }

/* System bubble */
.message.system .bubble {
  background: transparent;
  box-shadow: none;
  padding: 4px 16px;
  max-width: none;
}

.system-text {
  font-size: 12px;
  color: var(--c-text-3);
  font-style: italic;
  text-align: center;
  background: var(--c-surface);
  padding: 4px 14px;
  border-radius: var(--r-full);
  display: inline-block;
}

/* ── Bubble ── */
.bubble {
  max-width: 60%;
  padding: 10px 14px;
  border-radius: var(--r-lg);
  background: var(--c-bubble-cu);
  box-shadow: var(--shadow-sm);
}

/* Other → left, own → right */
.message.own .bubble {
  background: var(--c-bubble-op);
  border-bottom-right-radius: var(--r-xs);
}

.message:not(.own):not(.system) .bubble {
  border-bottom-left-radius: var(--r-xs);
}

.sender-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-accent);
  margin-bottom: 4px;
}

.text {
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--c-text);
}

.time {
  display: block;
  font-size: 10px;
  color: var(--c-text-3);
  margin-top: 5px;
  text-align: right;
}

.loading {
  text-align: center;
  color: var(--c-text-3);
  font-size: 13px;
  padding: 20px;
}
</style>
