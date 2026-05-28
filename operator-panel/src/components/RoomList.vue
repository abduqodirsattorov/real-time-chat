<template>
  <div class="room-list">
    <div class="room-list-header">
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
        :class="['room-item', { active: rooms.activeRoomId === room.id }]"
        @click="selectRoom(room.id)"
      >
        <div class="room-avatar">{{ initials(room.customer?.fullName) }}</div>
        <div class="room-info">
          <div class="room-name">{{ room.customer?.fullName ?? room.customer?.phone }}</div>
          <div class="room-meta">
            <span :class="['status-badge', room.status]">{{ room.status }}</span>
            <span v-if="rooms.typingRooms.has(room.id)" class="typing-indicator">
              {{ t('chat.typing') }}
            </span>
          </div>
        </div>
        <div class="room-time">{{ formatTime(room.lastMessageAt ?? room.createdAt) }}</div>
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

const { t } = useI18n();
const router = useRouter();
const rooms = useRoomsStore();
const search = ref('');

const filteredRooms = computed(() => {
  const q = search.value.toLowerCase();
  return rooms.rooms.filter((r) => {
    const name = (r.customer?.fullName ?? r.customer?.phone ?? '').toLowerCase();
    return name.includes(q);
  });
});

async function selectRoom(roomId: string) {
  await rooms.selectRoom(roomId);
  router.push(`/chat/${roomId}`);
}

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
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
  width: 280px;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  background: #fafafa;
  flex-shrink: 0;
}

.room-list-header {
  padding: 12px;
  border-bottom: 1px solid #e2e8f0;
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
  padding: 12px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.15s;
}

.room-item:hover {
  background: #f0f4f8;
}

.room-item.active {
  background: #e8f0fe;
}

.room-avatar {
  width: 40px;
  height: 40px;
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
}

.room-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 2px;
}

.status-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.status-badge.open { background: #c6f6d5; color: #276749; }
.status-badge.closed { background: #e2e8f0; color: #4a5568; }
.status-badge.bot_handling { background: #bee3f8; color: #2b6cb0; }
.status-badge.pending { background: #fefcbf; color: #744210; }

.typing-indicator {
  font-size: 11px;
  color: #2d6a9f;
  font-style: italic;
}

.room-time {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
}

.empty {
  padding: 40px 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
