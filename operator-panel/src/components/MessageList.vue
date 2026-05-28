<template>
  <div class="message-list-wrapper">
    <div class="message-list-header">
      <div v-if="room" class="room-title">
        {{ room.customer?.fullName ?? room.customer?.phone }}
      </div>
      <div class="header-actions">
        <button
          v-if="room?.status === 'open'"
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
        :class="['message', msg.senderId === auth.user?.id ? 'own' : 'other']"
      >
        <div class="bubble">
          <div v-if="msg.senderId !== auth.user?.id" class="sender-name">
            {{ msg.sender?.fullName ?? 'Unknown' }}
          </div>
          <template v-if="msg.type === 'text'">
            <p class="text">{{ msg.content }}</p>
          </template>
          <template v-else-if="msg.type === 'image' && msg.mediaUrl">
            <img :src="msg.mediaUrl" class="media-img" @load="scrollToBottom" />
          </template>
          <template v-else>
            <p class="text system-text">{{ msg.content }}</p>
          </template>
          <span class="time">{{ formatTime(msg.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomsStore } from '@/stores/rooms';
import { useAuthStore } from '@/stores/auth';
import { chatApi } from '@/api/chat';

const props = defineProps<{ roomId: string }>();
const { t } = useI18n();
const rooms = useRoomsStore();
const auth = useAuthStore();
const scrollEl = ref<HTMLDivElement | null>(null);

const room = computed(() => rooms.rooms.find((r) => r.id === props.roomId));
const roomMessages = computed(() => rooms.messages[props.roomId] ?? []);

watch(
  () => roomMessages.value.length,
  () => nextTick(scrollToBottom),
);

onMounted(() => nextTick(scrollToBottom));

function scrollToBottom() {
  if (scrollEl.value) {
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
  }
}

async function onScroll() {
  if (!scrollEl.value) return;
  if (scrollEl.value.scrollTop < 40) {
    // TODO: load older messages
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

.close-btn:hover {
  background: #f7fafc;
}

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

.message.own {
  justify-content: flex-end;
}

.bubble {
  max-width: 65%;
  padding: 10px 14px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  position: relative;
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
  color: #999;
  font-style: italic;
  font-size: 13px;
}

.message.own .text {
  color: #fff;
}

.media-img {
  max-width: 240px;
  border-radius: 8px;
}

.time {
  display: block;
  font-size: 10px;
  color: #aaa;
  margin-top: 4px;
  text-align: right;
}

.message.own .time {
  color: rgba(255, 255, 255, 0.7);
}
</style>
