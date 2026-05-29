<template>
  <div class="media-audio">
    <audio v-if="url" :src="url" controls class="audio" preload="metadata" />
    <div v-else-if="loadFailed" class="err">Audio yuklanmadi</div>
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
.media-audio { max-width: 280px; }
.audio { width: 100%; }
.skeleton { width: 240px; height: 40px; background: #eee; border-radius: 20px; }
.err { font-size: 12px; color: #999; }
</style>
