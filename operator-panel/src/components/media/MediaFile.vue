<template>
  <div class="media-file">
    <template v-if="att">
      <a :href="att.url" target="_blank" download class="file-link">
        <span class="file-icon">{{ icon }}</span>
        <div class="file-info">
          <span class="file-name">{{ att.fileName }}</span>
          <span class="file-size">{{ formatBytes(att.sizeBytes) }}</span>
        </div>
        <span class="dl-icon">⬇</span>
      </a>
    </template>
    <div v-else-if="loadFailed" class="err">Fayl yuklanmadi</div>
    <div v-else class="skeleton" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { mediaApi, formatBytes, type Attachment } from '@/api/media';

const props = defineProps<{ attachmentId: string }>();
const att = ref<Attachment | null>(null);
const loadFailed = ref(false);

onMounted(async () => {
  try {
    att.value = await mediaApi.getUrl(props.attachmentId);
  } catch { loadFailed.value = true; }
});

const icon = computed(() => {
  const m = att.value?.mimeType ?? '';
  if (m.includes('pdf')) return '📄';
  if (m.includes('word')) return '📝';
  return '📎';
});
</script>

<style scoped>
.media-file { max-width: 280px; }

.file-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(0,0,0,0.06);
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s;
}

.file-link:hover { background: rgba(0,0,0,0.1); }

.file-icon { font-size: 28px; flex-shrink: 0; }

.file-info { flex: 1; min-width: 0; }

.file-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size { font-size: 11px; opacity: 0.7; }
.dl-icon { font-size: 16px; flex-shrink: 0; }
.skeleton { width: 240px; height: 52px; background: #eee; border-radius: 10px; }
.err { font-size: 12px; color: #999; }
</style>
