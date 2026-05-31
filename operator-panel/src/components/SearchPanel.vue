<template>
  <div class="search-panel">
    <div class="search-header">
      <h3>Xabar qidirish</h3>
      <button class="close-btn" @click="$emit('close')">✕</button>
    </div>

    <div class="search-input-row">
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        placeholder="Xabar matnini kiriting..."
        class="search-input"
        @keydown.enter="search"
      />
      <button class="search-btn" :disabled="!query.trim() || loading" @click="search">
        {{ loading ? '...' : '🔍' }}
      </button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div v-if="results.length" class="results">
      <div
        v-for="hit in results"
        :key="hit.id"
        class="result-item"
        @click="openRoom(hit.roomId)"
      >
        <div class="result-content">{{ hit.content }}</div>
        <div class="result-meta">
          <span class="result-room">Room #{{ hit.roomId.slice(0, 6) }}</span>
          <span class="result-time">{{ formatTs(hit.createdAt) }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="searched && !loading" class="empty">
      Natija topilmadi
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';

interface SearchHit {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: number;
}

defineEmits<{ close: [] }>();

const router = useRouter();
const query = ref('');
const results = ref<SearchHit[]>([]);
const loading = ref(false);
const error = ref('');
const searched = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

onMounted(() => inputEl.value?.focus());

async function search() {
  const q = query.value.trim();
  if (!q) return;
  loading.value = true;
  error.value = '';
  searched.value = false;
  try {
    const res = await api.get<{ hits: SearchHit[]; total: number }>('/search', {
      params: { q, limit: 30 },
    });
    results.value = res.data.hits ?? [];
    searched.value = true;
  } catch {
    error.value = 'Qidirishda xato yuz berdi';
  } finally {
    loading.value = false;
  }
}

function openRoom(roomId: string) {
  router.push(`/chat/${roomId}`);
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleDateString('uz-UZ', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
</script>

<style scoped>
.search-panel {
  position: fixed;
  top: 60px;
  right: 20px;
  width: 400px;
  max-height: 70vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  z-index: 500;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
}
.search-header h3 { margin: 0; font-size: 15px; font-weight: 700; color: #1a1a1a; }
.close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: #999; }
.search-input-row { display: flex; gap: 8px; padding: 12px 16px; }
.search-input {
  flex: 1; padding: 9px 12px; border: 1px solid #e2e8f0;
  border-radius: 8px; font-size: 14px; outline: none;
}
.search-input:focus { border-color: #2d6a9f; }
.search-btn {
  padding: 9px 14px; background: #2d6a9f; color: #fff; border: none;
  border-radius: 8px; cursor: pointer; font-size: 16px;
}
.search-btn:disabled { opacity: 0.5; cursor: default; }
.results { overflow-y: auto; flex: 1; }
.result-item {
  padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0;
  transition: background 0.15s;
}
.result-item:hover { background: #f7fafc; }
.result-content { font-size: 14px; color: #1a1a1a; margin-bottom: 4px; word-break: break-word; }
.result-meta { display: flex; gap: 8px; font-size: 11px; color: #999; }
.error-msg { padding: 12px 16px; color: #e53e3e; font-size: 13px; }
.empty { padding: 20px 16px; color: #999; text-align: center; font-size: 13px; }
</style>
