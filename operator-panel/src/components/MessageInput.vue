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
      >
        {{ t('chat.send') }}
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
  border-top: 1px solid #e2e8f0;
  background: #fff;
  position: relative;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(45, 106, 159, 0.15);
  border: 2px dashed #2d6a9f;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #2d6a9f;
  z-index: 10;
  border-radius: 4px;
}

.upload-bar {
  padding: 8px 16px 0;
}

.upload-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.progress-track {
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #2d6a9f;
  transition: width 0.1s;
}

.file-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: #f7fafc;
  border-bottom: 1px solid #e2e8f0;
}

.preview-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.file-icon { font-size: 32px; }

.file-preview-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 11px;
  color: #888;
}

.remove-btn {
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 16px;
}

.input-row {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  align-items: flex-end;
}

.attach-btn {
  padding: 8px;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
  line-height: 1;
}

.attach-btn:hover { background: #f0f4f8; }

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

textarea:focus { border-color: #2d6a9f; }

button[type=undefined]:not(.attach-btn):not(.remove-btn) {
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

.input-row > button:last-child {
  padding: 10px 20px;
  background: #2d6a9f;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.input-row > button:last-child:hover:not(:disabled) { background: #1e3a5f; }
.input-row > button:last-child:disabled { opacity: 0.5; cursor: not-allowed; }

.upload-error {
  font-size: 12px;
  color: #e53e3e;
  padding: 0 16px 8px;
}
</style>
