<template>
  <div class="chat-view">
    <RoomList />
    <div class="chat-main">
      <template v-if="rooms.activeRoomId">
        <MessageList :room-id="rooms.activeRoomId" />
        <MessageInput :room-id="rooms.activeRoomId" />
      </template>
      <!-- Empty state -->
      <div v-else class="no-room">
        <div class="empty-state">
          <div class="empty-icon">📫</div>
          <p class="empty-label">Select a chat to start messaging</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useRoomsStore } from '@/stores/rooms';
import RoomList from '@/components/RoomList.vue';
import MessageList from '@/components/MessageList.vue';
import MessageInput from '@/components/MessageInput.vue';

const { t } = useI18n();
const route = useRoute();
const rooms = useRoomsStore();

onMounted(async () => {
  await rooms.loadRooms();
  if (route.params.roomId) {
    await rooms.selectRoom(route.params.roomId as string);
  }
});
</script>

<style scoped>
.chat-view {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

.no-room {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-bg);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  line-height: 1;
}

.empty-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--c-text-2);
  background: var(--c-accent-bg);
  padding: 8px 20px;
  border-radius: var(--r-full);
}
</style>
