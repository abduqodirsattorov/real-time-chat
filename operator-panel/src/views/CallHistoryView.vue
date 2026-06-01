<template>
  <div class="calls-page">
    <div class="calls-header">
      <h1 class="calls-title">{{ t('calls.history') }}</h1>
    </div>

    <div class="calls-card">
      <div v-if="loading" class="state-row">{{ t('common.loading') }}</div>
      <div v-else-if="error" class="state-row err">{{ error }}</div>
      <div v-else-if="calls.length === 0" class="state-row">{{ t('calls.noHistory') }}</div>
      <table v-else class="calls-table">
        <thead>
          <tr>
            <th>{{ t('calls.counterpart') }}</th>
            <th class="col-dir">{{ t('calls.direction') }}</th>
            <th class="col-status">{{ t('calls.status') }}</th>
            <th class="col-dur">{{ t('calls.duration') }}</th>
            <th class="col-time">{{ t('calls.time') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="call in calls" :key="call.id" class="call-row">
            <td>
              <div class="counterpart">
                <div class="cp-avatar" :style="{ background: avatarColor(counterpartId(call)) }">
                  {{ initials(counterpartName(call)) }}
                </div>
                <span>{{ counterpartName(call) }}</span>
              </div>
            </td>
            <td class="col-dir">
              <span class="dir-badge" :class="call.direction">
                <svg v-if="call.direction === 'inbound'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                </svg>
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="1 18 10.5 8.5 15.5 13.5 23 5"/><polyline points="17 5 23 5 23 11"/>
                </svg>
                {{ t(`calls.dir.${call.direction}`) }}
              </span>
            </td>
            <td class="col-status">
              <span class="status-badge" :class="call.status">
                {{ t(`calls.st.${call.status}`) }}
              </span>
            </td>
            <td class="col-dur">{{ formatDuration(call.talkDurationMs) }}</td>
            <td class="col-time">{{ formatTime(call.initiatedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Load more -->
    <div v-if="hasMore" class="load-more-wrap">
      <button class="btn-load-more" :disabled="loadingMore" @click="loadMore">
        <span v-if="loadingMore" class="spinner" />
        {{ t('calls.loadMore') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { callsApi, type CallHistoryItem } from '@/api/calls';

const { t } = useI18n();
const auth = useAuthStore();

const calls = ref<CallHistoryItem[]>([]);
const total = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const offset = ref(0);
const LIMIT = 30;

const hasMore = computed(() => calls.value.length < total.value);

import { computed } from 'vue';

async function load(append = false) {
  if (append) loadingMore.value = true;
  else { loading.value = true; error.value = ''; }
  try {
    const res = await callsApi.getHistory({ limit: LIMIT, offset: offset.value });
    if (append) calls.value.push(...res.calls);
    else calls.value = res.calls;
    total.value = res.total;
  } catch {
    error.value = t('common.error');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadMore() {
  offset.value += LIMIT;
  await load(true);
}

function counterpartId(call: CallHistoryItem): string {
  const myId = auth.user?.id ?? '';
  return call.callerId === myId ? (call.calleeId ?? '') : (call.callerId ?? '');
}

function counterpartName(call: CallHistoryItem): string {
  const myId = auth.user?.id ?? '';
  if (call.callerId === myId) return call.calleeName ?? `#${(call.calleeId ?? '').slice(0, 6)}`;
  return call.callerName ?? `#${(call.callerId ?? '').slice(0, 6)}`;
}

const COLORS = ['#D1E8FF','#D4F7E8','#EDE8FF','#FFE8D6','#FFE8F0','#E8F7FF'];
function avatarColor(id: string) {
  return COLORS[(id.charCodeAt(0) ?? 0) % COLORS.length];
}

function initials(name: string): string {
  if (!name || name.startsWith('#')) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
}

function formatDuration(ms: number | null): string {
  if (!ms || ms < 1000) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

onMounted(load);
</script>

<style scoped>
.calls-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--c-bg);
}

.calls-header {
  display: flex;
  align-items: center;
  padding: 28px 40px 16px;
  flex-shrink: 0;
}

.calls-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--c-text);
}

.calls-card {
  flex: 1;
  min-height: 0;
  margin: 0 40px 0;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  overflow-y: auto;
}

.calls-table {
  width: 100%;
  border-collapse: collapse;
}

.calls-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 12px 20px;
  font-size: 11px;
  font-weight: 700;
  color: var(--c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  text-align: left;
}

.col-dir { width: 120px; }
.col-status { width: 130px; }
.col-dur { width: 90px; }
.col-time { width: 110px; text-align: right; padding-right: 24px; }

.call-row { border-top: 1px solid var(--c-border); transition: background 0.1s; }
.call-row:hover { background: var(--c-surface); }
.call-row:first-child { border-top: none; }

.call-row td {
  padding: 12px 20px;
  font-size: 14px;
  color: var(--c-text);
}

.counterpart {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cp-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #444;
  flex-shrink: 0;
}

.dir-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: var(--r-full);
}
.dir-badge.inbound { background: #e6f7ef; color: #087f5b; }
.dir-badge.outbound { background: #eef3ff; color: #3b5bdb; }
.dir-badge.internal { background: #f3f0ff; color: #7048e8; }

.status-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: var(--r-full);
  background: var(--c-surface);
  color: var(--c-text-2);
}
.status-badge.completed { background: #e6f7ef; color: #087f5b; }
.status-badge.no_answer { background: #fff3bf; color: #e67700; }
.status-badge.canceled { background: #fff1f0; color: var(--c-red); }
.status-badge.failed { background: #fff1f0; color: var(--c-red); }
.status-badge.connected { background: #e6f7ef; color: #087f5b; }

.state-row {
  padding: 40px;
  text-align: center;
  font-size: 14px;
  color: var(--c-text-2);
}
.state-row.err { color: var(--c-red); }

.load-more-wrap {
  display: flex;
  justify-content: center;
  padding: 16px;
  flex-shrink: 0;
}

.btn-load-more {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 13px;
  color: var(--c-text-2);
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}
.btn-load-more:hover:not(:disabled) { border-color: var(--c-accent); color: var(--c-accent); }
.btn-load-more:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner {
  display: inline-block;
  width: 12px; height: 12px;
  border: 2px solid rgba(0,0,0,0.1);
  border-top-color: var(--c-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
