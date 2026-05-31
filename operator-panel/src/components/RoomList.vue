<template>
  <div class="room-list">
    <!-- Header -->
    <div class="rl-header">
      <div class="rl-title-row">
        <h2 class="rl-title">Inbox</h2>
        <span v-if="rooms.totalUnread > 0" class="rl-total-badge">{{ rooms.totalUnread }}</span>
        <button class="rl-filter-btn" title="Filter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        </button>
      </div>
      <div class="rl-search-wrap">
        <svg class="rl-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="search"
          type="text"
          :placeholder="t('chat.searchRooms')"
          class="rl-search"
        />
      </div>
    </div>

    <!-- Room list -->
    <div class="rl-rooms">
      <div
        v-for="room in filteredRooms"
        :key="room.id"
        :class="['room-item', { active: rooms.activeRoomId === room.id }]"
        @click="selectRoom(room.id)"
      >
        <!-- Avatar -->
        <div class="room-av" :style="avatarStyle(room)">
          {{ initials(roomLabel(room)) }}
        </div>

        <!-- Info -->
        <div class="room-info">
          <div class="room-row1">
            <span class="room-name" :class="{ bold: unreadCount(room.id) > 0 }">
              {{ roomLabel(room) }}
            </span>
            <div class="room-meta-right">
              <span v-if="unreadCount(room.id) === 0" class="room-check">✓✓</span>
              <span class="room-time">{{ formatTime(room.lastMessageAt ?? room.createdAt) }}</span>
            </div>
          </div>
          <div class="room-row2">
            <span class="room-preview">
              <span v-if="rooms.typingRooms.has(room.id)" class="typing-text">
                {{ t('chat.typing') }}
              </span>
              <span v-else>{{ lastPreview(room.id, room.status) }}</span>
            </span>
            <div class="room-right-badges">
              <span v-if="unreadCount(room.id) > 0" class="unread-badge">
                {{ unreadCount(room.id) > 99 ? '99+' : unreadCount(room.id) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="filteredRooms.length === 0" class="rl-empty">
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

const AVATAR_COLORS = [
  '#D1E8FF', '#D4F7E8', '#EDE8FF', '#FFE8D6',
  '#FFE8F0', '#E8F7FF', '#FFF3D6', '#E8FFE8',
];

function roomLabel(room: Room): string {
  if (room.title) return room.title;
  if (room.customerId) return `Mijoz #${room.customerId.slice(0, 6)}`;
  return `Room ${room.id.slice(0, 6)}`;
}

function avatarStyle(room: Room) {
  const idx = room.id.charCodeAt(0) % AVATAR_COLORS.length;
  return { background: AVATAR_COLORS[idx] };
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
  if (!iso) return '';
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
  width: var(--inbox-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--c-border);
  background: var(--c-bg);
  overflow: hidden;
}

/* Header */
.rl-header {
  padding: 18px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--c-border);
}

.rl-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rl-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--c-text);
  flex: 1;
}

.rl-total-badge {
  background: var(--c-red);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: var(--r-full);
}

.rl-filter-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--c-text-2);
  transition: background 0.12s, color 0.12s;
}

.rl-filter-btn:hover { background: var(--c-surface); color: var(--c-text); }

/* Search */
.rl-search-wrap {
  position: relative;
}

.rl-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--c-text-3);
  pointer-events: none;
}

.rl-search {
  width: 100%;
  padding: 9px 12px 9px 36px;
  background: var(--c-surface);
  border: 1.5px solid transparent;
  border-radius: var(--r-sm);
  font-size: 13px;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.15s;
}

.rl-search:focus { border-color: var(--c-accent); background: #fff; }
.rl-search::placeholder { color: var(--c-text-3); }

/* Rooms */
.rl-rooms {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.room-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  border-radius: 0;
  transition: background 0.12s;
  position: relative;
}

.room-item:hover { background: var(--c-surface); }
.room-item.active { background: var(--c-accent-bg); }

/* Avatar */
.room-av {
  width: 44px; height: 44px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #444;
  flex-shrink: 0;
}

/* Info */
.room-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.room-row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.room-name {
  font-size: 14px;
  color: var(--c-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.room-name.bold { font-weight: 700; }

.room-meta-right {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.room-check { font-size: 11px; color: var(--c-accent); }

.room-time {
  font-size: 11px;
  color: var(--c-text-3);
}

.room-row2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.room-preview {
  font-size: 12px;
  color: var(--c-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.typing-text { color: var(--c-accent); font-style: italic; }

.room-right-badges { flex-shrink: 0; }

.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--c-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: var(--r-full);
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
}

.rl-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--c-text-3);
  font-size: 13px;
}
</style>
