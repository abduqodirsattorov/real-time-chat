<template>
  <div class="message-input">
    <textarea
      v-model="text"
      :placeholder="t('chat.typeMessage')"
      rows="1"
      @keydown.enter.exact.prevent="send"
      @input="onInput"
    />
    <button :disabled="!text.trim() || sending" @click="send">
      {{ t('chat.send') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomsStore } from '@/stores/rooms';

const props = defineProps<{ roomId: string }>();
const { t } = useI18n();
const rooms = useRoomsStore();

const text = ref('');
const sending = ref(false);
let typingTimer: ReturnType<typeof setTimeout> | null = null;

async function send() {
  const content = text.value.trim();
  if (!content || sending.value) return;
  sending.value = true;
  text.value = '';
  try {
    await rooms.sendMessage(props.roomId, content);
  } finally {
    sending.value = false;
  }
}

function onInput() {
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    rooms.sendTyping(props.roomId);
  }, 400);
}
</script>

<style scoped>
.message-input {
  display: flex;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  font-size: 14px;
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
  max-height: 120px;
  overflow-y: auto;
}

textarea:focus {
  border-color: #2d6a9f;
}

button {
  padding: 10px 20px;
  background: #2d6a9f;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}

button:hover:not(:disabled) {
  background: #1e3a5f;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
