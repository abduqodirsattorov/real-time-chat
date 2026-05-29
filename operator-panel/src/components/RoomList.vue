<template>
  <div class="room-list">
    <div class="room-list-header">
      <div class="header-top">
        <span class="header-title">Suhbatlar</span>
        <span v-if="rooms.totalUnread > 0" class="total-badge">{{ rooms.totalUnread }}</span>
      </div>
      <input
        v-model="search"
        type="text"
        :placeholder="t('chat.searchRooms')"
        class="search-input"
      />
    </div>

    <div class="rooms">
      <div
        v-for="room in filteredRooms"
        :key="room.id"
        :class="['room-item', { active: rooms.activeRoomId === room.id, unread: unreadCount(room.id) > 0 }]"
        @click="selectRoom(room.id)"
      >
        <div class="room-avatar">{{ initials(roomLabel(room)) }}</div>

        <div class="room-info">
          <div class="room-name-row">
            <span :class="['room-name', { bold: unreadCount(room.id) > 0 }]">
              {{ roomLabel(room) }}
            </span>
            <span class="room-time">{{ formatTime(room.lastMessageAt ?? room.createdAt) }}</span>
          </div>
          <div class="room-bottom-row">
            <span class="room-preview">
              <span v-if="rooms.typingRooms.has(room.id)" class="typing">
                {{ t('chat.typing') }}
              </span>
              <span v-else>{{ lastPreview(room.id, room.status) }}</span>
            </span>
            <span :class="['status-badge', room.status]">{{ room.status }}</span>
            <span v-if="unreadCount(room.id) > 0" class="unread-badge">
              {{ unreadCount(room.id) > 99 ? '99+' : unreadCount(room.id) }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="filteredRooms.length === 0" class="empty">
        {{ t('chat.noRooms') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useRoomsStore } from '@/stores/rooms';
import type { Room } from '@/api/chat';

const { t } = useI18n();
const router = useRouter();
const rooms = useRoomsStore();
const search = ref('');

function roomLabel(room: Room): string {
  if (room.title) return room.title;
  if (room.customerId) return `Mijoz #${room.customerId.slice(0, 6)}`;
  return `Room ${room.id.slice(0, 6)}`;
}

function unreadCount(roomId: string): number {
  return rooms.unreadCounts[roomId] ?? 0;
}

function lastPreview(roomId: string, status: string): string {
  const preview = rooms.lastMessages[roomId];
  if (preview) return preview;
  if (status === 'pending') return 'Kutilmoqda...';
  if (status === 'bot_handling') return 'Bot javob bermoqda';
  return '';
}

const filteredRooms = computed(() => {
  const q = search.value.toLowerCase();
  return rooms.rooms.filter((r) => roomLabel(r).toLowerCase().includes(q));
});

async function selectRoom(roomId: string) {
  await rooms.selectRoom(roomId);
  router.push(`/chat/${roomId}`);
}

function initials(label: string) {
  return label.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}
</script>

<style scoped>
.room-list {
  width: 290px;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  background: #fafafa;
  flex-shrink: 0;
}

.room-list-header {
  padding: 12px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.total-badge {
  background: #e53e3e;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: #fff;
}

.rooms {
  flex: 1;
  overflow-y: auto;
}

.room-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.15s;
}

.room-item:hover { background: #f0f4f8; }
.room-item.active { background: #e8f0fe; }
.room-item.unread { background: #fffbf0; }
.room-item.unread:hover { background: #fef3c7; }

.room-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #2d6a9f;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.room-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.room-name-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.room-name {
  font-size: 14px;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.room-name.bold { font-weight: 700; }

.room-time {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
  margin-left: 4px;
}

.room-bottom-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.room-preview {
  font-size: 12px;
  color: #888;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.typing {
  color: #2d6a9f;
  font-style: italic;
}

.status-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  font-weight: 500;
  flex-shrink: 0;
}

.status-badge.active    { background: #c6f6d5; color: #276749; }
.status-badge.pending   { background: #fefcbf; color: #744210; }
.status-badge.closed    { background: #e2e8f0; color: #4a5568; }
.status-badge.archived  { background: #e2e8f0; color: #4a5568; }
.status-badge.bot_handling { background: #bee3f8; color: #2b6cb0; }
.status-badge.open      { background: #c6f6d5; color: #276749; }

.unread-badge {
  background: #e53e3e;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
  flex-shrink: 0;
  animation: pulse 1.5s ease infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.empty {
  padding: 40px 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
