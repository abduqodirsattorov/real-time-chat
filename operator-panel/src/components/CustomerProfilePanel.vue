<template>
  <div class="profile-panel" :class="{ collapsed: isCollapsed }">

    <!-- ── Toggle header ── -->
    <div class="pp-header" @click="isCollapsed = !isCollapsed">
      <div class="pp-header-left">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>{{ t('profile.title') }}</span>
      </div>
      <svg class="pp-chevron" :class="{ open: !isCollapsed }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>

    <!-- ── Content ── -->
    <div v-if="!isCollapsed" class="pp-body">

      <!-- Loading -->
      <div v-if="loading" class="pp-loading">{{ t('common.loading') }}</div>

      <!-- Unknown customer -->
      <template v-else-if="!customer">
        <div class="pp-unknown">
          <div class="pp-avatar pp-avatar--unknown">?</div>
          <p class="pp-unknown-label">{{ t('profile.unknown') }}</p>
        </div>
      </template>

      <!-- Known customer -->
      <template v-else>
        <!-- Avatar + name -->
        <div class="pp-identity">
          <div class="pp-avatar" :style="{ background: avatarColor }">
            {{ initials }}
          </div>
          <div class="pp-identity-info">
            <div class="pp-name">{{ displayName }}</div>
            <div class="pp-phone" v-if="customer.user?.phone">{{ customer.user.phone }}</div>
          </div>
        </div>

        <!-- Profile fields -->
        <div class="pp-fields">
          <div v-for="field in profileFields" :key="field.key" class="pp-field">
            <span class="pp-field-label">{{ field.label }}</span>
            <span class="pp-field-value" :class="field.cls">{{ field.value }}</span>
          </div>
        </div>

        <!-- Tags -->
        <div class="pp-section">
          <div class="pp-section-title">{{ t('profile.tags') }}</div>
          <div class="pp-tags">
            <span v-for="tag in customer.tags" :key="tag" class="pp-tag">
              {{ tag }}
              <button class="pp-tag-remove" @click="removeTag(tag)">×</button>
            </span>
            <input
              v-if="addingTag"
              ref="tagInputRef"
              v-model="newTag"
              class="pp-tag-input"
              :placeholder="t('profile.tagPlaceholder')"
              @keydown.enter.prevent="confirmTag"
              @keydown.escape="addingTag = false"
              @blur="confirmTag"
            />
            <button v-else class="pp-tag-add" @click="startAddTag">+ {{ t('profile.addTag') }}</button>
          </div>
        </div>

        <!-- Notes -->
        <div class="pp-section">
          <div class="pp-section-title">{{ t('profile.notes') }}</div>
          <textarea
            v-if="editingNotes"
            v-model="notesValue"
            class="pp-notes-input"
            :placeholder="t('profile.notesPlaceholder')"
            rows="3"
            @blur="saveNotes"
          />
          <div
            v-else
            class="pp-notes-view"
            :class="{ empty: !customer.notes }"
            @click="startEditNotes"
          >
            {{ customer.notes || t('profile.noNotes') }}
          </div>
        </div>

        <!-- Chat history -->
        <div class="pp-section">
          <div class="pp-section-header" @click="historyOpen = !historyOpen">
            <div class="pp-section-title">{{ t('profile.chatHistory') }}</div>
            <svg class="pp-chevron-sm" :class="{ open: historyOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          <template v-if="historyOpen">
            <div v-if="historyLoading" class="pp-history-empty">{{ t('common.loading') }}</div>
            <div v-else-if="historyItems.length === 0" class="pp-history-empty">{{ t('profile.noHistory') }}</div>
            <div v-else class="pp-history-list">
              <div
                v-for="room in historyItems"
                :key="room.id"
                class="pp-history-item"
                @click="openHistoryRoom(room.id)"
              >
                <div class="pp-history-top">
                  <span class="pp-history-badge" :class="`pp-hbadge-${room.status}`">{{ historyStatusLabel(room.status) }}</span>
                  <span class="pp-history-date">{{ formatHistoryDate(room.createdAt) }}</span>
                </div>
                <div v-if="room.lastMessage" class="pp-history-msg">{{ formatLastMsg(room.lastMessage) }}</div>
              </div>
            </div>
            <button v-if="historyHasMore && !historyLoading" class="pp-history-more" @click.stop="loadMoreHistory">
              {{ t('profile.historyLoadMore') }}
            </button>
          </template>
        </div>

        <!-- Transactions button -->
        <button class="pp-txn-btn" @click="goToTransactions">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/>
            <line x1="9" y1="9" x2="9" y2="21"/>
          </svg>
          {{ t('profile.transactions') }}
        </button>
      </template>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { customersApi, type CustomerProfile, type HistoryRoom } from '@/api/customers';
import { useRoomsStore } from '@/stores/rooms';
import { useFieldConfigsStore } from '@/stores/fieldConfigs';

const { t } = useI18n();

const props = defineProps<{ roomId: string | null }>();
const rooms = useRoomsStore();
const fieldCfg = useFieldConfigsStore();

const customer = ref<CustomerProfile | null>(null);
const loading = ref(false);
const isCollapsed = ref(false);

// Chat history
const historyOpen = ref(false);
const historyLoading = ref(false);
const historyItems = ref<HistoryRoom[]>([]);
const historyHasMore = ref(false);
const historyCursor = ref<string | null>(null);

// Notes editing
const editingNotes = ref(false);
const notesValue = ref('');
const saving = ref(false);

// Tags
const addingTag = ref(false);
const newTag = ref('');
const tagInputRef = ref<HTMLInputElement | null>(null);

// ── Avatar ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#D1E8FF', '#D4F7E8', '#EDE8FF', '#FFE8D6', '#FFE8F0'];
const avatarColor = computed(() => {
  const id = customer.value?.userId ?? customer.value?.id ?? 'x';
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
});

const displayName = computed(() => {
  const p = customer.value?.profileData as any;
  if (p?.full_name) return p.full_name;
  if (p?.first_name || p?.last_name) return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return customer.value?.user?.fullName ?? t('profile.unknownCustomer');
});

const initials = computed(() => {
  const parts = displayName.value.split(' ');
  return parts.slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || 'MJ';
});

// ── Profile fields — config-driven ─────────────────────────────────────────
const profileFields = computed(() => {
  const p = (customer.value?.profileData ?? {}) as Record<string, unknown>;
  const u = customer.value?.user;
  const configs = fieldCfg.visible('profile');

  // Config bo'lmasa — fallback: standart maydonlar
  const fallbackKeys = ['phone', 'full_name', 'passport', 'nationality', 'birthdate', 'language', 'uid', 'citizenship', 'identified', 'created'];
  const keys = configs.length > 0 ? configs : fallbackKeys.map((k, i) => ({ fieldKey: k, label: k, visible: true, sortOrder: i, displayType: 'text' as const }));

  return keys
    .map((cfg) => {
      const key = typeof cfg === 'string' ? cfg : cfg.fieldKey;
      const label = typeof cfg === 'string' ? t(`profile.${key}`) : cfg.label;
      const displayType = typeof cfg === 'string' ? 'text' : cfg.displayType;
      const { value, cls } = resolveProfileField(key, p, u);
      return { key, label, value, cls, displayType };
    })
    .filter((f) => f.value != null && f.value !== '');
});

function resolveProfileField(
  key: string,
  p: Record<string, unknown>,
  u: CustomerProfile['user'],
): { value: string | null; cls?: string } {
  switch (key) {
    case 'phone':      return { value: String(p.phone ?? u?.phone ?? '') || null };
    case 'full_name':  return { value: p.full_name ? String(p.full_name) : (p.first_name ? `${p.first_name} ${p.last_name ?? ''}`.trim() : u?.fullName ?? null) };
    case 'passport':   return { value: p.passport_serial ? `${p.passport_serial} ${p.passport_number ?? ''}`.trim() : null };
    case 'nationality':return { value: p.nationality != null ? String(p.nationality) : null };
    case 'birthdate':  return { value: p.birthdate != null ? String(p.birthdate) : null };
    case 'language':   return { value: p.language != null ? String(p.language) : null };
    case 'uid':        return { value: p.uid != null ? String(p.uid) : (customer.value?.externalUid ?? null) };
    case 'citizenship':return { value: p.citizenship_id != null ? String(p.citizenship_id) : null };
    case 'identified': {
      const ok = p.identified_at != null;
      return { value: ok ? `✓ ${p.identified_at ?? ''}` : '✗', cls: ok ? 'pp-ok' : 'pp-no' };
    }
    case 'is_blocked': return { value: p.is_blocked === true ? t('profile.yes') : null, cls: 'pp-warn' };
    case 'created':    return { value: u?.createdAt ? new Date(u.createdAt).toLocaleDateString() : null };
    default:           return { value: p[key] != null ? String(p[key]) : null };
  }
}

// Profile config yuklash (bir marta)
fieldCfg.load('profile');

// ── Load on roomId change ───────────────────────────────────────────────────
watch(() => props.roomId, async (id) => {
  if (!id) { customer.value = null; return; }
  loading.value = true;
  customer.value = null;
  historyItems.value = [];
  historyHasMore.value = false;
  historyCursor.value = null;
  try {
    customer.value = await customersApi.getByRoom(id);
    notesValue.value = customer.value?.notes ?? '';
    // Tarix panel ochiq bo'lsa — darhol yuklash
    if (historyOpen.value && customer.value) await fetchHistory();
  } finally {
    loading.value = false;
  }
}, { immediate: true });

// Tarix panel ochilganda yuklash
watch(historyOpen, async (open) => {
  if (open && customer.value && historyItems.value.length === 0) {
    await fetchHistory();
  }
});

async function fetchHistory(append = false) {
  if (!customer.value) return;
  historyLoading.value = true;
  try {
    const res = await customersApi.getHistory(customer.value.id, {
      limit: 10,
      cursor: append ? (historyCursor.value ?? undefined) : undefined,
    });
    if (append) {
      historyItems.value = [...historyItems.value, ...res.items];
    } else {
      historyItems.value = res.items;
    }
    historyHasMore.value = res.hasMore;
    historyCursor.value = res.nextCursor;
  } catch {
    // network error — tarix bo'sh ko'rinadi
  } finally {
    historyLoading.value = false;
  }
}

async function loadMoreHistory() {
  await fetchHistory(true);
}

async function openHistoryRoom(roomId: string) {
  await rooms.selectRoom(roomId);
}

function historyStatusLabel(status: string): string {
  const map: Record<string, string> = {
    open: t('profile.historyOpen'),
    pending: t('profile.historyPending'),
    bot_handling: t('profile.historyBot'),
    closed: t('profile.historyClosed'),
  };
  return map[status] ?? status;
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatLastMsg(msg: { content: string; type: string }): string {
  const typeIcons: Record<string, string> = {
    image: '📷',
    video: '🎬',
    audio: '🎤',
    voice: '🎤',
    file: '📎',
    call_log: '📞',
    system: '⚙️',
    bot_card: '🤖',
  };
  if (typeIcons[msg.type]) return `${typeIcons[msg.type]} ${msg.content ?? ''}`.trim();
  return msg.content?.slice(0, 60) ?? '';
}

// ── Notes ───────────────────────────────────────────────────────────────────
function startEditNotes() {
  notesValue.value = customer.value?.notes ?? '';
  editingNotes.value = true;
}

async function saveNotes() {
  editingNotes.value = false;
  if (!customer.value) return;
  const trimmed = notesValue.value.trim();
  if (trimmed === (customer.value.notes ?? '')) return;
  try {
    const updated = await customersApi.update(customer.value.id, { notes: trimmed });
    customer.value = { ...customer.value, notes: updated.notes };
  } catch {}
}

// ── Tags ────────────────────────────────────────────────────────────────────
async function startAddTag() {
  addingTag.value = true;
  newTag.value = '';
  await nextTick();
  tagInputRef.value?.focus();
}

async function confirmTag() {
  const tag = newTag.value.trim();
  addingTag.value = false;
  newTag.value = '';
  if (!tag || !customer.value) return;
  if (customer.value.tags.includes(tag)) return;
  const tags = [...customer.value.tags, tag];
  try {
    const updated = await customersApi.update(customer.value.id, { tags });
    customer.value = { ...customer.value, tags: updated.tags };
  } catch {}
}

async function removeTag(tag: string) {
  if (!customer.value) return;
  const tags = customer.value.tags.filter((t) => t !== tag);
  try {
    const updated = await customersApi.update(customer.value.id, { tags });
    customer.value = { ...customer.value, tags: updated.tags };
  } catch {}
}

// ── Transactions nav ─────────────────────────────────────────────────────────
const router = useRouter();

function goToTransactions() {
  const phone = customer.value?.user?.phone ?? (customer.value?.profileData as any)?.phone;
  const uid = customer.value?.externalUid ?? (customer.value?.profileData as any)?.uid;
  if (uid) {
    router.push({ path: '/transactions', query: { userUid: uid, customerPhone: phone ?? uid } });
    return;
  }
  if (phone) {
    router.push({ path: '/transactions', query: { search: phone } });
    return;
  }
  router.push('/transactions');
}
</script>

<style scoped>
.profile-panel {
  width: 260px;
  flex-shrink: 0;
  border-left: 1px solid var(--c-border);
  background: var(--c-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s;
}

.profile-panel.collapsed { width: 44px; }

/* Header */
.pp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--c-border);
  cursor: pointer;
  flex-shrink: 0;
  gap: 8px;
  user-select: none;
}
.pp-header:hover { background: var(--c-surface); }

.pp-header-left {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  white-space: nowrap;
  overflow: hidden;
}

.profile-panel.collapsed .pp-header-left span { display: none; }
.profile-panel.collapsed .pp-chevron { display: none; }

.pp-chevron {
  transition: transform 0.2s;
  flex-shrink: 0;
  color: var(--c-text-3);
}
.pp-chevron.open { transform: rotate(180deg); }

/* Body */
.pp-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pp-loading {
  font-size: 13px;
  color: var(--c-text-2);
  text-align: center;
  padding: 24px 0;
}

/* Unknown */
.pp-unknown {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 0;
}
.pp-unknown-label {
  font-size: 13px;
  color: var(--c-text-2);
}

/* Avatar */
.pp-avatar {
  width: 48px; height: 48px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700; color: #444;
  flex-shrink: 0;
}
.pp-avatar--unknown { background: var(--c-surface); color: var(--c-text-3); font-size: 20px; }

/* Identity */
.pp-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pp-identity-info {
  min-width: 0;
}
.pp-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pp-phone {
  font-size: 12px;
  color: var(--c-text-2);
  margin-top: 1px;
}

/* Fields */
.pp-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--c-surface);
  border-radius: var(--r-sm);
  padding: 10px 12px;
}
.pp-field {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}
.pp-field-label { color: var(--c-text-2); flex-shrink: 0; }
.pp-field-value { color: var(--c-text); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
.pp-ok { color: #1a7f4b; font-weight: 600; }
.pp-no { color: var(--c-text-3); }
.pp-warn { color: var(--c-red); font-weight: 600; }

/* Sections */
.pp-section { display: flex; flex-direction: column; gap: 6px; }
.pp-section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

/* Tags */
.pp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}
.pp-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--c-accent-bg);
  color: var(--c-accent);
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: 600;
}
.pp-tag-remove {
  background: none; border: none;
  color: var(--c-accent); cursor: pointer;
  font-size: 14px; line-height: 1; padding: 0;
  opacity: 0.6;
}
.pp-tag-remove:hover { opacity: 1; }
.pp-tag-add {
  background: none; border: 1px dashed var(--c-border);
  color: var(--c-text-2); cursor: pointer;
  font-size: 11px; border-radius: var(--r-full);
  padding: 3px 8px;
  transition: all 0.12s;
}
.pp-tag-add:hover { border-color: var(--c-accent); color: var(--c-accent); }
.pp-tag-input {
  width: 80px;
  padding: 2px 6px;
  font-size: 11px;
  border: 1px solid var(--c-accent);
  border-radius: var(--r-full);
  background: var(--c-accent-bg);
  color: var(--c-text);
  outline: none;
}

/* Notes */
.pp-notes-view {
  font-size: 12px;
  color: var(--c-text);
  cursor: pointer;
  padding: 8px 10px;
  background: var(--c-surface);
  border-radius: var(--r-sm);
  min-height: 52px;
  line-height: 1.5;
  transition: background 0.12s;
  border: 1px solid transparent;
}
.pp-notes-view:hover { border-color: var(--c-accent); }
.pp-notes-view.empty { color: var(--c-text-3); font-style: italic; }
.pp-notes-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  font-size: 12px;
  color: var(--c-text);
  border: 1.5px solid var(--c-accent);
  border-radius: var(--r-sm);
  padding: 8px 10px;
  background: #fff;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
}

/* Section header with toggle */
.pp-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}
.pp-section-header:hover .pp-section-title { color: var(--c-accent); }
.pp-chevron-sm {
  transition: transform 0.2s;
  color: var(--c-text-3);
  flex-shrink: 0;
}
.pp-chevron-sm.open { transform: rotate(180deg); }

/* History list */
.pp-history-empty {
  font-size: 12px;
  color: var(--c-text-3);
  font-style: italic;
  padding: 4px 0;
}

.pp-history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pp-history-item {
  padding: 8px 10px;
  background: var(--c-surface);
  border-radius: var(--r-sm);
  cursor: pointer;
  border: 1px solid transparent;
  transition: border-color 0.12s, background 0.12s;
}
.pp-history-item:hover { border-color: var(--c-accent); background: var(--c-accent-bg); }

.pp-history-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
}

.pp-history-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--r-full);
  flex-shrink: 0;
}
.pp-hbadge-open    { background: #dbeafe; color: #1e40af; }
.pp-hbadge-pending { background: #fef3c7; color: #92400e; }
.pp-hbadge-bot_handling { background: #ede9fe; color: #5b21b6; }
.pp-hbadge-closed  { background: var(--c-surface); color: var(--c-text-3); border: 1px solid var(--c-border); }

.pp-history-date {
  font-size: 11px;
  color: var(--c-text-3);
  white-space: nowrap;
}

.pp-history-msg {
  font-size: 11px;
  color: var(--c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pp-history-more {
  width: 100%;
  background: none;
  border: 1px dashed var(--c-border);
  color: var(--c-text-2);
  font-size: 11px;
  padding: 5px;
  border-radius: var(--r-sm);
  cursor: pointer;
  margin-top: 4px;
  transition: border-color 0.12s, color 0.12s;
}
.pp-history-more:hover { border-color: var(--c-accent); color: var(--c-accent); }

/* Transactions button */
.pp-txn-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px;
  border: 1.5px solid var(--c-accent);
  border-radius: var(--r-sm);
  background: var(--c-accent-bg);
  color: var(--c-accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.pp-txn-btn:hover { opacity: 0.85; }
</style>
