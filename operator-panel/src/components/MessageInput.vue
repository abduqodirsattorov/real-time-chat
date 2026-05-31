<template>
  <div class="message-input-wrapper" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
    <div v-if="dragging" class="drag-overlay">Faylni shu yerga tashlang</div>

    <!-- Upload progress -->
    <div v-if="uploading" class="upload-bar">
      <div class="upload-info">
        <span>{{ uploadingName }}</span>
        <span>{{ uploadPct }}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: uploadPct + '%' }" />
      </div>
    </div>

    <!-- File preview (selected, not yet sent) -->
    <div v-if="selectedFile && !uploading" class="file-preview">
      <img v-if="previewUrl" :src="previewUrl" class="preview-thumb" />
      <span v-else class="file-icon">{{ fileIcon }}</span>
      <div class="file-preview-info">
        <span class="file-name">{{ selectedFile.name }}</span>
        <span class="file-size">{{ formatBytes(selectedFile.size) }}</span>
      </div>
      <button class="remove-btn" @click="clearFile">✕</button>
    </div>

    <!-- Quick reply chips -->
    <div v-if="!text && !selectedFile" class="chips-row">
      <button v-for="chip in quickReplies" :key="chip" class="chip" @click="text = chip">
        {{ chip }}
      </button>
    </div>

    <div class="input-row">
      <!-- File button -->
      <button class="attach-btn" title="Fayl yuborish" @click="fileInput?.click()">
        📎
      </button>
      <input
        ref="fileInput"
        type="file"
        :accept="acceptTypes"
        style="display:none"
        @change="onFileSelected"
      />

      <textarea
        v-model="text"
        :placeholder="t('chat.typeMessage')"
        rows="1"
        :disabled="uploading"
        @keydown.enter.exact.prevent="send"
        @input="onInput"
      />

      <button
        :disabled="(!text.trim() && !selectedFile) || sending || uploading"
        @click="send"
        :title="t('chat.send')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>

    <p v-if="error" class="upload-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomsStore } from '@/stores/rooms';
import { mediaApi, validateFile, msgTypeFromMime, formatBytes, ALLOWED_TYPES } from '@/api/media';
import { chatApi } from '@/api/chat';

const props = defineProps<{ roomId: string }>();

const quickReplies = [
  'Assalomu alaykum!',
  'Muammongizni tez orada hal qilamiz',
  'Rahmat, kuningiz xayrli o\'tsin!',
  'Iltimos, biroz kuting...',
];

const { t } = useI18n();
const rooms = useRoomsStore();

const text = ref('');
const sending = ref(false);
const error = ref('');

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const uploading = ref(false);
const uploadPct = ref(0);
const uploadingName = ref('');
const dragging = ref(false);

const acceptTypes = Object.keys(ALLOWED_TYPES).join(',');

const fileIcon = computed(() => {
  const t = selectedFile.value?.type ?? '';
  if (t.startsWith('video/')) return '🎬';
  if (t.startsWith('audio/')) return '🎵';
  if (t.includes('pdf')) return '📄';
  return '📎';
});

let typingTimer: ReturnType<typeof setTimeout> | null = null;

function onFileSelected(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) selectFile(f);
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) selectFile(f);
}

function selectFile(file: File) {
  error.value = '';
  const err = validateFile(file);
  if (err) { error.value = err; return; }
  selectedFile.value = file;
  previewUrl.value = null;
  if (file.type.startsWith('image/')) {
    previewUrl.value = URL.createObjectURL(file);
  }
}

function clearFile() {
  selectedFile.value = null;
  previewUrl.value = null;
  error.value = '';
  if (fileInput.value) fileInput.value.value = '';
}

async function send() {
  if (sending.value || uploading.value) return;
  error.value = '';

  if (selectedFile.value) {
    await sendFile(selectedFile.value);
    return;
  }

  const content = text.value.trim();
  if (!content) return;
  sending.value = true;
  text.value = '';
  try {
    await rooms.sendMessage(props.roomId, content);
  } finally {
    sending.value = false;
  }
}

async function sendFile(file: File) {
  uploading.value = true;
  uploadPct.value = 0;
  uploadingName.value = file.name;

  try {
    // 1. Presign
    const { uploadId, uploadUrl } = await mediaApi.presign(file.name, file.type, file.size);

    // 2. Upload to MinIO
    await mediaApi.uploadToMinio(uploadUrl, file, (pct) => { uploadPct.value = pct; });

    // 3. Confirm
    let extras: { width?: number; height?: number } = {};
    if (file.type.startsWith('image/') && previewUrl.value) {
      const img = new Image();
      img.src = previewUrl.value;
      await new Promise((r) => { img.onload = r; });
      extras = { width: img.naturalWidth, height: img.naturalHeight };
    }
    const attachment = await mediaApi.confirm(uploadId, extras);

    // 4. Send message with attachment ID as content
    const msgType = msgTypeFromMime(file.type);
    await chatApi.sendMessage(props.roomId, attachment.id, msgType);

    clearFile();
  } catch (e: unknown) {
    error.value = (e as Error).message ?? 'Yuklashda xato';
  } finally {
    uploading.value = false;
    uploadPct.value = 0;
  }
}

function onInput() {
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => rooms.sendTyping(props.roomId), 400);
}
</script>

<style scoped>
.message-input-wrapper {
  border-top: 1px solid var(--c-border);
  background: var(--c-bg);
  position: relative;
}

/* Drag overlay */
.drag-overlay {
  position: absolute; inset: 0;
  background: rgba(91,155,245,0.1);
  border: 2px dashed var(--c-accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 600; color: var(--c-accent);
  z-index: 10; border-radius: var(--r-sm);
}

/* Upload progress */
.upload-bar { padding: 8px 16px 0; }

.upload-info {
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--c-text-2); margin-bottom: 4px;
}

.progress-track {
  height: 3px; background: var(--c-border); border-radius: var(--r-full); overflow: hidden;
}

.progress-fill {
  height: 100%; background: var(--c-accent); transition: width 0.1s;
}

/* File preview */
.file-preview {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px;
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
}

.preview-thumb {
  width: 44px; height: 44px;
  object-fit: cover; border-radius: var(--r-sm); flex-shrink: 0;
}

.file-icon { font-size: 28px; }
.file-preview-info { flex: 1; min-width: 0; }

.file-name {
  display: block; font-size: 13px; font-weight: 600;
  color: var(--c-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.file-size { font-size: 11px; color: var(--c-text-2); }

.remove-btn {
  padding: 4px 8px; background: transparent; border: none;
  color: var(--c-text-3); font-size: 16px;
}

.remove-btn:hover { color: var(--c-red); }

/* Quick reply chips */
.chips-row {
  display: flex;
  gap: 6px;
  padding: 8px 16px 0;
  overflow-x: auto;
  flex-wrap: nowrap;
}

.chip {
  padding: 6px 14px;
  background: var(--c-chip);
  color: var(--c-chip-text);
  border: none;
  border-radius: var(--r-full);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.chip:hover { opacity: 0.8; }

/* Input row */
.input-row {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  align-items: flex-end;
}

.attach-btn {
  width: 36px; height: 36px;
  background: transparent;
  border: 1.5px solid var(--c-border);
  border-radius: 50%;
  font-size: 16px;
  color: var(--c-text-2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s;
}

.attach-btn:hover { background: var(--c-surface); border-color: var(--c-accent); color: var(--c-accent); }

textarea {
  flex: 1;
  padding: 9px 14px;
  background: var(--c-surface);
  border: 1.5px solid transparent;
  border-radius: var(--r-xl);
  font-size: 14px;
  color: var(--c-text);
  resize: none;
  outline: none;
  line-height: 1.5;
  max-height: 120px;
  overflow-y: auto;
  transition: border-color 0.15s;
}

textarea:focus { border-color: var(--c-accent); background: #fff; }
textarea::placeholder { color: var(--c-text-3); }

/* Send button */
.input-row > button:last-child {
  width: 36px; height: 36px;
  background: var(--gradient-btn);
  color: #fff;
  border: none;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(91,155,245,0.4);
  transition: opacity 0.15s, transform 0.1s;
}

.input-row > button:last-child:hover:not(:disabled) { opacity: 0.9; transform: scale(1.05); }
.input-row > button:last-child:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }

.upload-error {
  font-size: 12px; color: var(--c-red);
  padding: 0 16px 6px;
}
</style>
