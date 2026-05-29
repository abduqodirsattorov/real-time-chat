<template>
  <div class="media-image">
    <img
      v-if="url"
      :src="url"
      class="img"
      loading="lazy"
      @click="openFull"
      @error="loadFailed = true"
    />
    <div v-else-if="loadFailed" class="err">Rasm yuklanmadi</div>
    <div v-else class="skeleton" />

    <Teleport v-if="fullscreen" to="body">
      <div class="lightbox" @click="fullscreen = false">
        <img :src="url!" class="lightbox-img" @click.stop />
        <button class="close-lbox" @click="fullscreen = false">✕</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { mediaApi } from '@/api/media';

const props = defineProps<{ attachmentId: string }>();
const url = ref<string | null>(null);
const loadFailed = ref(false);
const fullscreen = ref(false);

onMounted(async () => {
  try {
    const att = await mediaApi.getUrl(props.attachmentId);
    url.value = att.url;
  } catch { loadFailed.value = true; }
});

function openFull() { fullscreen.value = true; }
</script>

<style scoped>
.media-image { max-width: 260px; }

.img {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  border-radius: 10px;
  cursor: zoom-in;
  display: block;
}

.skeleton {
  width: 200px;
  height: 140px;
  background: linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  border-radius: 10px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.err { font-size: 12px; color: #999; padding: 8px 0; }

.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  cursor: zoom-out;
}

.lightbox-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
  cursor: default;
}

.close-lbox {
  position: absolute;
  top: 20px;
  right: 24px;
  background: rgba(255,255,255,0.15);
  border: none;
  color: #fff;
  font-size: 20px;
  padding: 6px 12px;
  border-radius: 50%;
  cursor: pointer;
}
</style>
