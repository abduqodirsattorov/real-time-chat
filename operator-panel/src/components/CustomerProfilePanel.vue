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
import { customersApi, type CustomerProfile } from '@/api/customers';

const { t } = useI18n();

const props = defineProps<{ roomId: string | null }>();

const customer = ref<CustomerProfile | null>(null);
const loading = ref(false);
const isCollapsed = ref(false);

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

// ── Profile fields ──────────────────────────────────────────────────────────
const profileFields = computed(() => {
  const p = (customer.value?.profileData ?? {}) as Record<string, unknown>;
  const u = customer.value?.user;
  const fields: { key: string; label: string; value: string; cls?: string }[] = [];

  const add = (key: string, label: string, val: unknown, cls?: string) => {
    if (val != null && val !== '') {
      fields.push({ key, label, value: String(val), cls });
    }
  };

  add('phone', t('profile.phone'), p.phone ?? u?.phone);
  add('full_name', t('profile.fullName'), p.full_name ?? (p.first_name ? `${p.first_name} ${p.last_name ?? ''}`.trim() : null));
  add('passport', t('profile.passport'), p.passport_serial ? `${p.passport_serial} ${p.passport_number ?? ''}`.trim() : null);
  add('nationality', t('profile.nationality'), p.nationality);
  add('birthdate', t('profile.birthdate'), p.birthdate);
  add('language', t('profile.language'), p.language);
  add('uid', t('profile.uid'), p.uid ?? customer.value?.externalUid);
  add('citizenship', t('profile.citizenship'), p.citizenship_id);

  // Identifikatsiya holati
  const identified = p.identified_at != null;
  fields.push({
    key: 'identified',
    label: t('profile.identified'),
    value: identified ? `✓ ${p.identified_at ?? ''}` : '✗',
    cls: identified ? 'pp-ok' : 'pp-no',
  });

  add('is_blocked', t('profile.blocked'), p.is_blocked === true ? t('profile.yes') : null, 'pp-warn');
  add('created', t('profile.registered'), u?.createdAt ? new Date(u.createdAt).toLocaleDateString() : null);

  return fields;
});

// ── Load on roomId change ───────────────────────────────────────────────────
watch(() => props.roomId, async (id) => {
  if (!id) { customer.value = null; return; }
  loading.value = true;
  customer.value = null;
  try {
    customer.value = await customersApi.getByRoom(id);
    notesValue.value = customer.value?.notes ?? '';
  } finally {
    loading.value = false;
  }
}, { immediate: true });

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
  const uid = customer.value?.externalUid ?? (customer.value?.profileData as any)?.uid;
  if (uid) {
    router.push({ path: '/transactions', query: { userUid: uid } });
  } else {
    router.push('/transactions');
  }
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
