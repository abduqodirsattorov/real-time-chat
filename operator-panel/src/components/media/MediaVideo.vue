<template>
  <div class="media-video">
    <video v-if="url" :src="url" controls class="video" preload="metadata" />
    <div v-else-if="loadFailed" class="err">Video yuklanmadi</div>
    <div v-else class="skeleton" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { mediaApi } from '@/api/media';

const props = defineProps<{ attachmentId: string }>();
const url = ref<string | null>(null);
const loadFailed = ref(false);

onMounted(async () => {
  try {
    const att = await mediaApi.getUrl(props.attachmentId);
    url.value = att.url;
  } catch { loadFailed.value = true; }
});
</script>

<style scoped>
.media-video { max-width: 300px; }
.video { width: 100%; border-radius: 10px; display: block; }
.skeleton { width: 260px; height: 150px; background: #eee; border-radius: 10px; }
.err { font-size: 12px; color: #999; }
</style>
