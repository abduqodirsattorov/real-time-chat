<template>
  <div class="room-list">

    <!-- ── Header ── -->
    <div class="rl-header">
      <div class="rl-title-row">
        <h2 class="rl-title">Inbox</h2>
        <span v-if="rooms.totalUnread > 0" class="rl-total-badge">{{ rooms.totalUnread }}</span>
        <button class="rl-filter-btn" title="Filter">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        </button>
      </div>
      <div class="rl-search-wrap">
        <svg class="rl-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input v-model="search" type="text" :placeholder="t('chat.searchRooms')" class="rl-search" />
      </div>
    </div>

    <!-- ── Call cards (always on top) ── -->

    <!-- INCOMING CALL CARD -->
    <div v-if="calls.incomingCall" class="call-card">
      <div class="cc-top">
        <div class="cc-av" :style="callerAvatarStyle">{{ callerInitials }}</div>
        <div class="cc-info">
          <div class="cc-name">{{ callerLabel }} <span class="cc-arrow">›</span></div>
          <div class="cc-sub">Is calling...</div>
        </div>
        <button class="cc-i-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        </button>
      </div>
      <div class="cc-actions">
        <button class="cc-btn answer" @click="answerCall">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
          </svg>
        </button>
        <button class="cc-btn reject" @click="calls.dismissIncoming()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="transform:rotate(135deg)">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- ACTIVE CALL CARD -->
    <div v-else-if="calls.activeCall" class="call-card active">
      <div class="cc-top">
        <div class="cc-av" :style="activeAvatarStyle">{{ activeInitials }}</div>
        <div class="cc-info">
          <div class="cc-name">{{ activeLabel }} <span class="cc-arrow">›</span></div>
          <div class="cc-timer">{{ callDuration }}</div>
        </div>
        <button class="cc-i-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        </button>
      </div>
      <div class="cc-actions cc-actions--active">
        <button :class="['cc-mute-btn', { muted: calls.isMuted }]" @click="calls.toggleMute()">
          <svg v-if="!calls.isMuted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .386-.037.763-.107 1.128M12 19v4M8 23h8"/>
          </svg>
        </button>
        <button class="cc-btn reject" style="flex:1" @click="calls.hangup()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="transform:rotate(135deg)">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- ── Room list ── -->
    <div class="rl-rooms">
      <div
        v-for="room in filteredRooms"
        :key="room.id"
        :class="['room-item', { active: rooms.activeRoomId === room.id }]"
        @click="selectRoom(room.id)"
      >
        <div class="room-av" :style="avatarStyle(room)">
          {{ initials(roomLabel(room)) }}
        </div>
        <div class="room-info">
          <div class="room-row1">
            <span class="room-name" :class="{ bold: unreadCount(room.id) > 0 }">{{ roomLabel(room) }}</span>
            <div class="room-meta-right">
              <span v-if="unreadCount(room.id) === 0" class="room-check">✓✓</span>
              <span class="room-time">{{ formatTime(room.lastMessageAt ?? room.createdAt) }}</span>
            </div>
          </div>
          <div class="room-row2">
            <span class="room-preview">
              <span v-if="rooms.typingRooms.has(room.id)" class="typing-text">{{ t('chat.typing') }}</span>
              <span v-else>{{ lastPreview(room.id, room.status) }}</span>
            </span>
            <span v-if="unreadCount(room.id) > 0" class="unread-badge">
              {{ unreadCount(room.id) > 99 ? '99+' : unreadCount(room.id) }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="filteredRooms.length === 0" class="rl-empty">{{ t('chat.noRooms') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useRoomsStore } from '@/stores/rooms';
import { useCallsStore } from '@/stores/calls';
import { useAuthStore } from '@/stores/auth';
import type { Room } from '@/api/chat';

const { t } = useI18n();
const router = useRouter();
const rooms = useRoomsStore();
const calls = useCallsStore();
const auth = useAuthStore();
const search = ref('');

// ── Call timer ──────────────────────────────────────────────────────────────

const callDuration = ref('0:00');
let callTimer: ReturnType<typeof setInterval> | null = null;
let callStart = Date.now();

function startTimer() {
  callStart = Date.now();
  callTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - callStart) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    callDuration.value = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopTimer() {
  if (callTimer) { clearInterval(callTimer); callTimer = null; }
}

// Watch active call changes (start/stop timer)
import { watch } from 'vue';
watch(() => calls.activeCall, (val) => {
  if (val) startTimer();
  else { stopTimer(); callDuration.value = '0:00'; }
}, { immediate: true });

onUnmounted(stopTimer);

// ── Caller info ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#D1E8FF','#D4F7E8','#EDE8FF','#FFE8D6','#FFE8F0','#E8F7FF','#FFF3D6','#E8FFE8'];

function colorFor(id: string) {
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
}

const callerLabel = computed(() => {
  const id = calls.incomingCall?.callerId ?? '';
  return id ? `Mijoz #${id.slice(0, 6)}` : 'Noma\'lum';
});
const callerInitials = computed(() => callerLabel.value.replace('Mijoz #', '').slice(0, 2).toUpperCase() || 'MJ');
const callerAvatarStyle = computed(() => ({ background: colorFor(calls.incomingCall?.callerId ?? 'x') }));

const activeLabel = computed(() => {
  const call = calls.activeCall as any;
  const id = call?.callerId ?? '';
  return id ? `Mijoz #${id.slice(0, 6)}` : 'Noma\'lum';
});
const activeInitials = computed(() => activeLabel.value.replace('Mijoz #', '').slice(0, 2).toUpperCase() || 'MJ');
const activeAvatarStyle = computed(() => ({ background: colorFor((calls.activeCall as any)?.callerId ?? 'x') }));

async function answerCall() {
  if (!calls.incomingCall) return;
  await calls.answerCall(calls.incomingCall.id);
}

// ── Room helpers ─────────────────────────────────────────────────────────────

function roomLabel(room: Room): string {
  if (room.customerName) return room.customerName;
  if (room.customerPhone) return room.customerPhone;
  if (room.title) return room.title;
  if (room.customerId) return `Mijoz #${room.customerId.slice(0, 6)}`;
  return `Room ${room.id.slice(0, 6)}`;
}

function avatarStyle(room: Room) {
  return { background: AVATAR_COLORS[room.id.charCodeAt(0) % AVATAR_COLORS.length] };
}

function unreadCount(roomId: string) { return rooms.unreadCounts[roomId] ?? 0; }

function lastPreview(roomId: string, status: string): string {
  const p = rooms.lastMessages[roomId];
  if (p) return p;
  if (status === 'pending') return 'Kutilmoqda...';
  if (status === 'bot_handling') return 'Bot javob bermoqda';
  return '';
}

const filteredRooms = computed(() => {
  const q = search.value.toLowerCase();
  return rooms.rooms.filter((r) => roomLabel(r).toLowerCase().includes(q));
});

async function selectRoom(roomId: string) {
  await rooms.selectRoom(roomId);
  router.push(`/chat/${roomId}`);
}

function initials(label: string) {
  return label.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function formatTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}
</script>

<style scoped>
.room-list {
  width: var(--inbox-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--c-border);
  background: var(--c-bg);
  overflow: hidden;
}

/* ── Header ── */
.rl-header {
  padding: 18px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--c-border);
}

.rl-title-row { display: flex; align-items: center; gap: 8px; }
.rl-title { font-size: 18px; font-weight: 700; color: var(--c-text); flex: 1; }

.rl-total-badge {
  background: var(--c-red); color: #fff;
  font-size: 11px; font-weight: 700;
  padding: 2px 7px; border-radius: var(--r-full);
}

.rl-filter-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--c-border); border-radius: var(--r-sm);
  background: transparent; color: var(--c-text-2);
  transition: background 0.12s;
}
.rl-filter-btn:hover { background: var(--c-surface); }

.rl-search-wrap { position: relative; }
.rl-search-icon {
  position: absolute; left: 12px; top: 50%;
  transform: translateY(-50%); color: var(--c-text-3); pointer-events: none;
}
.rl-search {
  width: 100%; padding: 9px 12px 9px 34px;
  background: var(--c-surface); border: 1.5px solid transparent;
  border-radius: var(--r-sm); font-size: 13px; color: var(--c-text);
  outline: none; transition: border-color 0.15s;
}
.rl-search:focus { border-color: var(--c-accent); background: #fff; }
.rl-search::placeholder { color: var(--c-text-3); }

/* ── Call card ── */
.call-card {
  margin: 10px 10px 2px;
  background: var(--c-accent-bg);
  border: 1.5px solid rgba(91,155,245,0.22);
  border-radius: var(--r-lg);
  padding: 12px 12px 10px;
  flex-shrink: 0;
}

.call-card.active {
  animation: none;
}

.cc-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.cc-av {
  width: 40px; height: 40px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #444;
  flex-shrink: 0;
  border: 2px solid rgba(255,255,255,0.8);
}

.cc-info { flex: 1; min-width: 0; }
.cc-name {
  font-size: 14px; font-weight: 700; color: var(--c-text);
  display: flex; align-items: center; gap: 2px;
}
.cc-arrow { color: var(--c-text-2); font-size: 16px; line-height: 1; }
.cc-sub { font-size: 12px; color: var(--c-text-2); margin-top: 1px; }
.cc-timer {
  font-size: 17px; font-weight: 700;
  color: var(--c-text); font-variant-numeric: tabular-nums;
  margin-top: 1px;
}

.cc-i-btn {
  width: 28px; height: 28px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  background: var(--c-bg);
  color: var(--c-text-2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

/* Action buttons */
.cc-actions {
  display: flex;
  gap: 8px;
}

.cc-btn {
  flex: 1;
  height: 42px;
  border: none;
  border-radius: var(--r-xl);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  font-weight: 600;
  gap: 8px;
  transition: opacity 0.15s, transform 0.1s;
}
.cc-btn:hover { opacity: 0.88; transform: scale(1.02); }
.cc-btn:active { transform: scale(0.97); }

.cc-btn.answer { background: var(--c-green); }
.cc-btn.reject { background: var(--c-red); }

/* Active call: mute (small round) + hangup (wide) */
.cc-actions--active { align-items: center; }

.cc-mute-btn {
  width: 42px; height: 42px;
  border-radius: 50%;
  border: none;
  background: var(--c-accent);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s;
}
.cc-mute-btn.muted { background: var(--c-text-2); }
.cc-mute-btn:hover { opacity: 0.88; }

/* ── Room items ── */
.rl-rooms { flex: 1; overflow-y: auto; padding: 6px 0; }

.room-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.12s;
}
.room-item:hover { background: var(--c-surface); }
.room-item.active { background: var(--c-accent-bg); }

.room-av {
  width: 44px; height: 44px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #444;
  flex-shrink: 0;
}

.room-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 3px;
}

.room-row1 { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.room-name { font-size: 14px; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.room-name.bold { font-weight: 700; }

.room-meta-right { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
.room-check { font-size: 11px; color: var(--c-accent); }
.room-time { font-size: 11px; color: var(--c-text-3); }

.room-row2 { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.room-preview { font-size: 12px; color: var(--c-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.typing-text { color: var(--c-accent); font-style: italic; }

.unread-badge {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--c-accent); color: #fff;
  font-size: 11px; font-weight: 700;
  border-radius: var(--r-full);
  min-width: 20px; height: 20px; padding: 0 6px;
}

.rl-empty { padding: 40px 20px; text-align: center; color: var(--c-text-3); font-size: 13px; }
</style>
