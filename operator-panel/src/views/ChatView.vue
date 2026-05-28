<template>
  <div class="chat-view">
    <RoomList />
    <div class="chat-main">
      <template v-if="rooms.activeRoomId">
        <MessageList :room-id="rooms.activeRoomId" />
        <MessageInput :room-id="rooms.activeRoomId" />
      </template>
      <div v-else class="no-room">
        <p>{{ t('chat.noRoom') }}</p>
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
  color: #999;
  font-size: 16px;
}
</style>
