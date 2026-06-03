<template>
  <div class="tx-page">

    <!-- ── LEFT: list panel ── -->
    <div class="tx-list-col" :class="{ narrow: !!selectedId }">

      <!-- Header -->
      <div class="tx-header">
        <div class="tx-title-row">
          <h1 class="tx-title">{{ t('transactions.title') }}</h1>
          <!-- Bulk actions bar -->
          <div v-if="selectedIds.size > 0" class="bulk-bar">
            <span class="bulk-count">{{ t('transactions.selected', { n: selectedIds.size }) }}</span>
            <div class="bulk-menu-wrap" ref="bulkMenuRef">
              <button class="btn-bulk" @click="showBulkMenu = !showBulkMenu">
                {{ t('transactions.bulkActions') }}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div v-if="showBulkMenu" class="dropdown-menu">
                <button v-for="act in TX_BULK_ACTIONS" :key="act" class="dropdown-item" @click="onBulkAction(act)">
                  {{ act }}
                </button>
              </div>
            </div>
            <button class="bulk-clear" @click="selectedIds.clear()">×</button>
          </div>
        </div>

        <div class="tx-search-row">
          <div class="tx-search-wrap">
            <svg class="tx-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              v-model="searchVal"
              class="tx-search"
              type="text"
              :placeholder="t('transactions.searchPlaceholder')"
              @keyup.enter="doSearch"
            />
            <button v-if="searchVal" class="tx-search-clear" @click="searchVal = ''; doSearch()">×</button>
          </div>
          <button class="btn-filter" :class="{ active: showFilter || activeFilterCount > 0 }" @click="showFilter = !showFilter">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            {{ t('transactions.filterBtn') }}
            <span v-if="activeFilterCount" class="filter-badge">{{ activeFilterCount }}</span>
          </button>
        </div>

        <!-- Filter panel -->
        <div v-if="showFilter" class="tx-filter-panel">
          <div class="filter-grid">
            <div class="filter-field">
              <label>{{ t('transactions.filterDateFrom') }}</label>
              <input v-model="filters.dateFrom" type="date" class="filter-input" />
            </div>
            <div class="filter-field">
              <label>{{ t('transactions.filterDateTo') }}</label>
              <input v-model="filters.dateTo" type="date" class="filter-input" />
            </div>
            <div class="filter-field">
              <label>{{ t('transactions.filterProvider') }}</label>
              <select v-model="filters.provider" class="filter-input">
                <option value="">{{ t('transactions.filterAll') }}</option>
                <option v-for="p in TX_PROVIDERS" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
            <div class="filter-field">
              <label>{{ t('transactions.filterType') }}</label>
              <select v-model="filters.type" class="filter-input">
                <option value="">{{ t('transactions.filterAll') }}</option>
                <option v-for="tp in TX_TYPES" :key="tp" :value="tp">{{ tp }}</option>
              </select>
            </div>
            <div class="filter-field">
              <label>{{ t('transactions.filterDebitState') }}</label>
              <select v-model="filters.debitState" class="filter-input">
                <option value="">{{ t('transactions.filterAll') }}</option>
                <option v-for="s in TX_DEBIT_STATES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="filter-field">
              <label>{{ t('transactions.filterCreditState') }}</label>
              <select v-model="filters.creditState" class="filter-input">
                <option value="">{{ t('transactions.filterAll') }}</option>
                <option v-for="s in TX_CREDIT_STATES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="filter-field">
              <label>{{ t('transactions.filterStrana') }}</label>
              <select v-model="filters.strana" class="filter-input">
                <option value="">{{ t('transactions.filterAll') }}</option>
                <option v-for="s in TX_STRANAS" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>
          <div class="filter-actions">
            <button class="btn-reset" @click="resetFilters">{{ t('transactions.resetFilters') }}</button>
            <button class="btn-apply" @click="doSearch">{{ t('transactions.applyFilters') }}</button>
          </div>
        </div>

        <!-- Active user filter banner -->
        <div v-if="userUidFilter" class="filter-banner">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          {{ t('transactions.filteredBy') }}: <strong>{{ userUidFilter }}</strong>
          <button class="banner-clear" @click="userUidFilter = ''; doSearch()">×</button>
        </div>
      </div>

      <!-- Table -->
      <div class="tx-table-wrap">
        <div v-if="loading" class="state-row">{{ t('common.loading') }}</div>
        <div v-else-if="error" class="state-row err">{{ error }}</div>
        <div v-else-if="items.length === 0" class="state-row">{{ t('transactions.noData') }}</div>
        <table v-else class="tx-table">
          <thead>
            <tr>
              <th class="col-check">
                <input type="checkbox" :checked="allChecked" :indeterminate="someChecked" @change="toggleAll" />
              </th>
              <th class="col-id">{{ t('transactions.colId') }}</th>
              <th>{{ t('transactions.colUser') }}</th>
              <th class="col-status">{{ t('transactions.colDebitStatus') }}</th>
              <th class="col-status">{{ t('transactions.colCreditStatus') }}</th>
              <th class="col-service">{{ t('transactions.colService') }}</th>
              <th class="col-amount">{{ t('transactions.colDebitAmount') }}</th>
              <th class="col-amount">{{ t('transactions.colCreditAmount') }}</th>
              <th class="col-date">{{ t('transactions.colCreatedAt') }}</th>
              <th class="col-date">{{ t('transactions.colPaidAt') }}</th>
              <th class="col-eye"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="tx in items"
              :key="tx.id"
              class="tx-row"
              :class="{ selected: tx.id === selectedId, checked: selectedIds.has(tx.id) }"
              @click="selectTx(tx.id)"
            >
              <td class="col-check" @click.stop>
                <input type="checkbox" :checked="selectedIds.has(tx.id)"
                  @change="toggleRow(tx.id)" />
              </td>
              <td class="col-id">
                <span class="id-chip">{{ shortId(tx.externalId ?? tx.id) }}</span>
              </td>
              <td>
                <div class="user-cell">
                  <span class="user-uid">{{ tx.userUid ?? '—' }}</span>
                  <span v-if="d(tx, 'phone')" class="user-phone">{{ d(tx, 'phone') }}</span>
                </div>
              </td>
              <td class="col-status">
                <span class="status-badge" :class="stateClass(d(tx, 'debit_state'))">
                  {{ d(tx, 'debit_state') ?? '—' }}
                </span>
              </td>
              <td class="col-status">
                <span class="status-badge" :class="stateClass(d(tx, 'credit_state'))">
                  {{ d(tx, 'credit_state') ?? '—' }}
                </span>
              </td>
              <td class="col-service">{{ d(tx, 'service') ?? d(tx, 'provider') ?? d(tx, 'type') ?? '—' }}</td>
              <td class="col-amount">{{ formatAmount(d(tx, 'debit_amount') ?? d(tx, 'amount')) }}</td>
              <td class="col-amount">{{ formatAmount(d(tx, 'credit_amount')) }}</td>
              <td class="col-date">{{ formatDate(tx.createdAt) }}</td>
              <td class="col-date">{{ formatDate(d(tx, 'paid_at') as string) }}</td>
              <td class="col-eye">
                <button class="btn-eye" @click.stop="selectTx(tx.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pagination">
        <button class="pg-btn" :disabled="page === 1" @click="goPage(page - 1)">‹</button>
        <template v-for="p in pageButtons" :key="p">
          <span v-if="p === '...'" class="pg-ellipsis">…</span>
          <button v-else class="pg-btn" :class="{ active: p === page }" @click="goPage(p as number)">{{ p }}</button>
        </template>
        <button class="pg-btn" :disabled="page === totalPages" @click="goPage(page + 1)">›</button>
        <span class="pg-info">{{ total }} ta</span>
      </div>
    </div>

    <!-- ── RIGHT: detail panel ── -->
    <div v-if="selectedId" class="tx-detail-col">
      <div class="detail-header">
        <button class="btn-back" @click="selectedId = ''">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          {{ t('transactions.backToList') }}
        </button>
        <h2 class="detail-title">{{ t('transactions.detail') }}</h2>
        <!-- Actions "..." button -->
        <div class="detail-actions-wrap" ref="actionsMenuRef">
          <button class="btn-actions-dots" @click="showActionsMenu = !showActionsMenu" title="Amallar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/>
            </svg>
          </button>
          <div v-if="showActionsMenu" class="dropdown-menu dropdown-menu--right">
            <div class="dropdown-section-label">{{ t('transactions.actions') }}</div>
            <button v-for="act in TX_ACTIONS" :key="act" class="dropdown-item" @click="onAction(act)">
              {{ act }}
              <span class="dropdown-stub">{{ t('transactions.actionsStub') }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="loadingDetail" class="state-row">{{ t('common.loading') }}</div>
      <div v-else-if="!selectedTx" class="state-row">{{ t('common.error') }}</div>
      <div v-else class="detail-body">

        <!-- Key fields -->
        <div class="detail-card">
          <div class="detail-row">
            <span class="dr-key">{{ t('transactions.extId') }}</span>
            <span class="dr-val">{{ selectedTx.externalId ?? '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="dr-key">{{ t('transactions.userUid') }}</span>
            <span class="dr-val">{{ selectedTx.userUid ?? '—' }}</span>
          </div>
          <template v-for="key in topFields" :key="key">
            <div v-if="d(selectedTx, key) !== null && d(selectedTx, key) !== undefined" class="detail-row">
              <span class="dr-key">{{ key }}</span>
              <span class="dr-val">
                <span v-if="isStateField(key)" class="status-badge" :class="stateClass(d(selectedTx, key))">
                  {{ d(selectedTx, key) }}
                </span>
                <span v-else>{{ formatFieldValue(d(selectedTx, key)) }}</span>
              </span>
            </div>
          </template>
        </div>

        <!-- All fields (collapsible) -->
        <div class="detail-section">
          <button class="section-toggle" @click="showAllFields = !showAllFields">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              :style="{ transform: showAllFields ? 'rotate(90deg)' : '' }">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            {{ t('transactions.allFields') }} ({{ allFieldKeys.length }})
          </button>
          <div v-if="showAllFields" class="all-fields-card">
            <div v-for="key in allFieldKeys" :key="key" class="detail-row">
              <span class="dr-key">{{ key }}</span>
              <span class="dr-val small">{{ formatFieldValue(d(selectedTx, key)) }}</span>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { transactionsApi, type Transaction } from '@/api/transactions';
import {
  TX_PROVIDERS, TX_TYPES, TX_DEBIT_STATES, TX_CREDIT_STATES, TX_STRANAS,
  TX_ACTIONS, TX_BULK_ACTIONS,
} from '@/config/txFilterOptions';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const LIMIT = 20;

// ── State ─────────────────────────────────────────────────────────────────────
const items = ref<Transaction[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const page = ref(1);

const selectedId = ref('');
const selectedTx = ref<Transaction | null>(null);
const loadingDetail = ref(false);
const showAllFields = ref(false);

const selectedIds = ref(new Set<string>());

const searchVal = ref('');
const showFilter = ref(false);
const userUidFilter = ref('');

const showBulkMenu = ref(false);
const showActionsMenu = ref(false);
const bulkMenuRef = ref<HTMLElement | null>(null);
const actionsMenuRef = ref<HTMLElement | null>(null);

const filters = ref({
  dateFrom: '', dateTo: '',
  provider: '', type: '',
  debitState: '', creditState: '',
  strana: '',
});

// ── Computed ──────────────────────────────────────────────────────────────────
const totalPages = computed(() => Math.ceil(total.value / LIMIT) || 1);

const activeFilterCount = computed(() =>
  Object.values(filters.value).filter(Boolean).length,
);

const allChecked = computed(() =>
  items.value.length > 0 && items.value.every((tx) => selectedIds.value.has(tx.id)),
);
const someChecked = computed(() =>
  !allChecked.value && items.value.some((tx) => selectedIds.value.has(tx.id)),
);

// Pagination buttons: show up to 7, with ellipsis
const pageButtons = computed(() => {
  const total = totalPages.value;
  const cur = page.value;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | string)[] = [];
  if (cur <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total);
  } else if (cur >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '...', cur - 1, cur, cur + 1, '...', total);
  }
  return pages;
});

const topFields = [
  'debit_state', 'credit_state', 'ext_debit_state', 'ext_credit_state',
  'amount', 'debit_amount', 'credit_amount', 'currency',
  'service', 'provider', 'type', 'strana',
  'phone', 'paid_at',
];

const isStateField = (key: string) => key.includes('state') || key.includes('status');

const allFieldKeys = computed(() => {
  if (!selectedTx.value) return [];
  return Object.keys(selectedTx.value.data as Record<string, unknown>);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const d = (tx: Transaction, key: string) =>
  (tx.data as Record<string, unknown>)[key] ?? null;

const shortId = (id: string | null) => {
  if (!id) return '—';
  return id.length > 14 ? id.slice(0, 14) + '…' : id;
};

const stateClass = (state: unknown) => {
  if (!state || typeof state !== 'string') return '';
  const s = state.toUpperCase();
  if (['OK', 'DONE', 'SUCCESS', 'COMPLETED'].includes(s)) return 'ok';
  if (['WAIT', 'PENDING', 'IN_PROGRESS'].includes(s)) return 'wait';
  if (['ERROR', 'FAILED', 'FAIL', 'ERR', 'CANCEL', 'CANCELED'].includes(s)) return 'err';
  return 'neutral';
};

const formatAmount = (val: unknown) => {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return (num / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 });
};

const formatDate = (iso: unknown) => {
  if (!iso || typeof iso !== 'string') return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatFieldValue = (val: unknown) => {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await transactionsApi.list({
      limit: LIMIT,
      offset: (page.value - 1) * LIMIT,
      search: searchVal.value || undefined,
      userUid: userUidFilter.value || undefined,
      dateFrom: filters.value.dateFrom || undefined,
      dateTo: filters.value.dateTo || undefined,
      provider: filters.value.provider || undefined,
      type: filters.value.type || undefined,
      debitState: filters.value.debitState || undefined,
      creditState: filters.value.creditState || undefined,
      strana: filters.value.strana || undefined,
    });
    items.value = res.items;
    total.value = res.total;
    selectedIds.value.clear();
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? t('common.error');
  } finally {
    loading.value = false;
  }
}

async function loadDetail(id: string) {
  loadingDetail.value = true;
  showAllFields.value = false;
  selectedTx.value = null;
  showActionsMenu.value = false;
  try {
    selectedTx.value = await transactionsApi.getOne(id);
  } catch {
    selectedTx.value = null;
  } finally {
    loadingDetail.value = false;
  }
}

function doSearch() {
  showFilter.value = false;
  page.value = 1;
  load();
}

function resetFilters() {
  filters.value = { dateFrom: '', dateTo: '', provider: '', type: '', debitState: '', creditState: '', strana: '' };
  searchVal.value = '';
  userUidFilter.value = '';
  page.value = 1;
  load();
}

function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return;
  page.value = p;
  load();
}

function selectTx(id: string) {
  if (selectedId.value === id) { selectedId.value = ''; return; }
  selectedId.value = id;
  loadDetail(id);
}

// ── Checkboxes ────────────────────────────────────────────────────────────────
function toggleRow(id: string) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id);
  else selectedIds.value.add(id);
  selectedIds.value = new Set(selectedIds.value); // trigger reactivity
}

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) items.value.forEach((tx) => selectedIds.value.add(tx.id));
  else selectedIds.value.clear();
  selectedIds.value = new Set(selectedIds.value);
}

// ── Actions (stub) ────────────────────────────────────────────────────────────
function onAction(act: string) {
  showActionsMenu.value = false;
  alert(`[STUB] ${act}\nTranzaksiya: ${selectedTx.value?.externalId ?? selectedId.value}\n\nNova API integratsiyasida bajariladi.`);
}

function onBulkAction(act: string) {
  showBulkMenu.value = false;
  alert(`[STUB] Bulk: ${act}\nTanlangan: ${selectedIds.value.size} ta\n\nNova API integratsiyasida bajariladi.`);
}

// ── Click outside menus ───────────────────────────────────────────────────────
function handleClickOutside(e: MouseEvent) {
  if (showBulkMenu.value && bulkMenuRef.value && !bulkMenuRef.value.contains(e.target as Node)) {
    showBulkMenu.value = false;
  }
  if (showActionsMenu.value && actionsMenuRef.value && !actionsMenuRef.value.contains(e.target as Node)) {
    showActionsMenu.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  const uid = route.query.userUid as string;
  const search = route.query.search as string;
  if (uid) userUidFilter.value = uid;
  if (search) searchVal.value = search;
  if (uid || search) router.replace({ path: '/transactions' });
  load();
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.tx-page {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--c-bg);
}

/* ── List col ── */
.tx-list-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.tx-list-col.narrow { flex: 0 0 62%; }

/* Header */
.tx-header {
  padding: 14px 16px 0;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.tx-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.tx-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--c-text);
  flex: 1;
}

/* Bulk bar */
.bulk-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bulk-count {
  font-size: 12px;
  color: var(--c-accent);
  font-weight: 600;
}

.bulk-menu-wrap { position: relative; }

.btn-bulk {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  border-radius: var(--r-sm);
  background: var(--c-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.bulk-clear {
  background: none; border: none;
  font-size: 14px; color: var(--c-text-2);
  cursor: pointer; padding: 2px 4px;
}

/* Search row */
.tx-search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.tx-search-wrap {
  position: relative;
  flex: 1;
}

.tx-search-icon {
  position: absolute;
  left: 9px; top: 50%;
  transform: translateY(-50%);
  color: var(--c-text-2);
  pointer-events: none;
}

.tx-search {
  width: 100%;
  padding: 6px 28px 6px 28px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  font-size: 13px;
  color: var(--c-text);
  background: var(--c-bg);
  box-sizing: border-box;
  outline: none;
}

.tx-search:focus { border-color: var(--c-accent); }

.tx-search-clear {
  position: absolute;
  right: 7px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  color: var(--c-text-2); font-size: 15px;
  cursor: pointer; line-height: 1;
}

.btn-filter {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 11px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--c-text-2);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}

.btn-filter:hover, .btn-filter.active { border-color: var(--c-accent); color: var(--c-accent); }

.filter-badge {
  background: var(--c-accent);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 99px;
  padding: 1px 5px;
}

/* Filter panel */
.tx-filter-panel {
  padding: 10px 12px;
  background: var(--c-surface);
  border-radius: var(--r-md);
  margin-bottom: 10px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px 10px;
}

.filter-field label {
  display: block;
  font-size: 10px;
  color: var(--c-text-2);
  margin-bottom: 3px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.filter-input {
  width: 100%;
  padding: 5px 7px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  font-size: 11px;
  color: var(--c-text);
  background: var(--c-bg);
  box-sizing: border-box;
  outline: none;
  appearance: auto;
}

.filter-input:focus { border-color: var(--c-accent); }

.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.btn-reset {
  padding: 5px 12px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 12px;
  color: var(--c-text-2);
  cursor: pointer;
}

.btn-apply {
  padding: 5px 12px;
  border: none;
  border-radius: var(--r-sm);
  background: var(--c-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* Filter banner */
.filter-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--c-accent);
  background: var(--c-accent-bg);
  border-radius: var(--r-sm);
  padding: 5px 10px;
  margin-bottom: 8px;
}

.banner-clear {
  background: none; border: none;
  cursor: pointer; color: var(--c-text-2);
  font-size: 14px; line-height: 1;
  margin-left: auto;
}

/* Table */
.tx-table-wrap {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
}

.state-row {
  padding: 32px;
  text-align: center;
  color: var(--c-text-2);
  font-size: 13px;
}
.state-row.err { color: var(--c-red); }

.tx-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 800px;
}

.tx-table thead th {
  position: sticky;
  top: 0;
  background: var(--c-bg);
  padding: 7px 8px;
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  color: var(--c-text-2);
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--c-border);
  white-space: nowrap;
}

.tx-row {
  cursor: pointer;
  transition: background 0.1s;
}

.tx-row:hover { background: var(--c-surface); }
.tx-row.selected { background: var(--c-accent-bg); }
.tx-row.checked { background: #f0f4ff; }
.tx-row.checked.selected { background: var(--c-accent-bg); }

.tx-row td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--c-border);
  color: var(--c-text);
  vertical-align: middle;
}

.col-check { width: 28px; }
.col-check input[type="checkbox"] { cursor: pointer; }
.col-id { width: 110px; }
.col-status { width: 70px; }
.col-service { width: 75px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-amount { width: 85px; text-align: right; font-variant-numeric: tabular-nums; }
.col-date { width: 100px; white-space: nowrap; font-size: 11px; color: var(--c-text-2); }
.col-eye { width: 28px; }

.id-chip {
  font-family: monospace;
  font-size: 11px;
  background: var(--c-surface);
  padding: 2px 5px;
  border-radius: var(--r-sm);
  color: var(--c-text-2);
}

.user-cell { display: flex; flex-direction: column; gap: 1px; }
.user-uid { font-size: 11px; color: var(--c-text); }
.user-phone { font-size: 10px; color: var(--c-text-2); }

.status-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
}

.status-badge.ok { background: #e6f7f0; color: #0a7c4d; }
.status-badge.wait { background: #fff8e1; color: #b07c00; }
.status-badge.err { background: #fef0f0; color: #c0392b; }
.status-badge.neutral { background: var(--c-surface); color: var(--c-text-2); }

.btn-eye {
  background: none; border: none;
  cursor: pointer; color: var(--c-text-2);
  display: flex; align-items: center; justify-content: center;
  padding: 3px;
  border-radius: var(--r-sm);
}
.btn-eye:hover { color: var(--c-accent); background: var(--c-accent-bg); }

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 10px 16px;
  border-top: 1px solid var(--c-border);
  flex-shrink: 0;
}

.pg-btn {
  min-width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 12px;
  color: var(--c-text);
  cursor: pointer;
  padding: 0 6px;
  transition: background 0.1s, border-color 0.1s;
}

.pg-btn:hover:not(:disabled) { border-color: var(--c-accent); color: var(--c-accent); }
.pg-btn.active { background: var(--c-accent); border-color: var(--c-accent); color: #fff; }
.pg-btn:disabled { opacity: 0.4; cursor: default; }

.pg-ellipsis {
  font-size: 12px;
  color: var(--c-text-2);
  padding: 0 4px;
}

.pg-info {
  font-size: 11px;
  color: var(--c-text-2);
  margin-left: auto;
}

/* Dropdown */
.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 500;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
  min-width: 200px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
}

.dropdown-menu--right {
  left: auto;
  right: 0;
  min-width: 260px;
}

.dropdown-section-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--c-text-2);
  letter-spacing: 0.5px;
  padding: 4px 8px 2px;
  text-transform: uppercase;
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--c-text);
  text-align: left;
  cursor: pointer;
  border-radius: var(--r-sm);
  gap: 6px;
}

.dropdown-item:hover { background: var(--c-surface); }

.dropdown-stub {
  font-size: 10px;
  color: var(--c-text-2);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Detail col ── */
.tx-detail-col {
  flex: 0 0 38%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--c-border);
  overflow-y: auto;
  background: var(--c-bg);
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 3px;
  background: none; border: none;
  font-size: 11px; color: var(--c-text-2);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--r-sm);
  flex-shrink: 0;
}

.btn-back:hover { color: var(--c-accent); background: var(--c-accent-bg); }

.detail-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text);
  flex: 1;
}

.detail-actions-wrap {
  position: relative;
  flex-shrink: 0;
}

.btn-actions-dots {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--c-accent-bg);
  color: var(--c-accent);
  cursor: pointer;
  transition: background 0.15s;
}

.btn-actions-dots:hover { background: var(--c-accent); color: #fff; }

.detail-body {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-card {
  background: var(--c-surface);
  border-radius: var(--r-md);
  padding: 8px 10px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--c-border);
  font-size: 12px;
}

.detail-row:last-child { border-bottom: none; }

.dr-key {
  flex: 0 0 120px;
  color: var(--c-text-2);
  font-size: 11px;
  font-weight: 500;
  word-break: break-all;
  padding-top: 2px;
}

.dr-val { flex: 1; color: var(--c-text); word-break: break-all; }
.dr-val.small { font-size: 11px; }

.detail-section {}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none; border: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text);
  cursor: pointer;
  padding: 4px 0;
}

.section-toggle svg { transition: transform 0.15s; color: var(--c-text-2); }

.all-fields-card {
  background: var(--c-surface);
  border-radius: var(--r-md);
  padding: 6px 10px;
  margin-top: 5px;
}

.spinner {
  width: 12px; height: 12px;
  border: 2px solid var(--c-border);
  border-top-color: var(--c-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>
