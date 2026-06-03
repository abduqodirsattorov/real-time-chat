<template>
  <div class="tx-page">

    <!-- ── LEFT: list panel ── -->
    <div class="tx-list-col" :class="{ narrow: !!selectedId }">

      <!-- Header -->
      <div class="tx-header">
        <h1 class="tx-title">{{ t('transactions.title') }}</h1>
        <div class="tx-search-row">
          <div class="tx-search-wrap">
            <svg class="tx-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              v-model="searchPhone"
              class="tx-search"
              type="text"
              :placeholder="t('transactions.searchPlaceholder')"
              @keyup.enter="doSearch"
            />
            <button v-if="searchPhone" class="tx-search-clear" @click="searchPhone = ''; doSearch()">×</button>
          </div>
          <button class="btn-filter" :class="{ active: showFilter }" @click="showFilter = !showFilter">
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
              <input v-model="filters.provider" type="text" class="filter-input" placeholder="uzcard, humo..." />
            </div>
            <div class="filter-field">
              <label>{{ t('transactions.filterType') }}</label>
              <input v-model="filters.type" type="text" class="filter-input" placeholder="p2p, payment..." />
            </div>
            <div class="filter-field">
              <label>{{ t('transactions.filterDebitState') }}</label>
              <input v-model="filters.debitState" type="text" class="filter-input" placeholder="WAIT, OK, ERROR..." />
            </div>
            <div class="filter-field">
              <label>{{ t('transactions.filterCreditState') }}</label>
              <input v-model="filters.creditState" type="text" class="filter-input" placeholder="WAIT, OK, ERROR..." />
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
              <th class="col-id">{{ t('transactions.colId') }}</th>
              <th>{{ t('transactions.colUser') }}</th>
              <th class="col-status">{{ t('transactions.colDebitStatus') }}</th>
              <th class="col-status">{{ t('transactions.colCreditStatus') }}</th>
              <th class="col-service">{{ t('transactions.colService') }}</th>
              <th class="col-amount">{{ t('transactions.colDebitAmount') }}</th>
              <th class="col-amount">{{ t('transactions.colCreditAmount') }}</th>
              <th class="col-date">{{ t('transactions.colDate') }}</th>
              <th class="col-eye"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="tx in items"
              :key="tx.id"
              class="tx-row"
              :class="{ selected: tx.id === selectedId }"
              @click="selectTx(tx.id)"
            >
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
              <td class="col-service">{{ d(tx, 'service') ?? d(tx, 'provider') ?? '—' }}</td>
              <td class="col-amount">{{ formatAmount(d(tx, 'debit_amount') ?? d(tx, 'amount')) }}</td>
              <td class="col-amount">{{ formatAmount(d(tx, 'credit_amount')) }}</td>
              <td class="col-date">{{ formatDate(tx.createdAt) }}</td>
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

      <!-- Load more -->
      <div v-if="hasMore" class="load-more-wrap">
        <button class="btn-load-more" :disabled="loadingMore" @click="loadMore">
          <span v-if="loadingMore" class="spinner" />
          {{ t('transactions.loadMore') }}
        </button>
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
      </div>

      <div v-if="loadingDetail" class="state-row">{{ t('common.loading') }}</div>
      <div v-else-if="!selectedTx" class="state-row">{{ t('common.error') }}</div>
      <div v-else class="detail-body">

        <!-- Key fields (top) -->
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
                <span v-if="isStateField(key)" class="status-badge" :class="stateClass(String(d(selectedTx, key)))">
                  {{ d(selectedTx, key) }}
                </span>
                <span v-else>{{ formatFieldValue(d(selectedTx, key)) }}</span>
              </span>
            </div>
          </template>
        </div>

        <!-- Actions stub -->
        <div class="detail-section">
          <div class="section-title">{{ t('transactions.actions') }}</div>
          <div class="actions-stub">
            <button class="btn-action" disabled>{{ t('transactions.actionStub') }} — Recredit</button>
            <button class="btn-action" disabled>{{ t('transactions.actionStub') }} — Refund</button>
            <button class="btn-action" disabled>{{ t('transactions.actionStub') }} — Resend</button>
          </div>
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
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { transactionsApi, type Transaction } from '@/api/transactions';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const LIMIT = 30;

// ── State ─────────────────────────────────────────────────────────────────────
const items = ref<Transaction[]>([]);
const total = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const offset = ref(0);

const selectedId = ref('');
const selectedTx = ref<Transaction | null>(null);
const loadingDetail = ref(false);
const showAllFields = ref(false);

const searchPhone = ref('');
const showFilter = ref(false);
const userUidFilter = ref('');

const filters = ref({
  dateFrom: '',
  dateTo: '',
  provider: '',
  type: '',
  debitState: '',
  creditState: '',
});

// ── Computed ──────────────────────────────────────────────────────────────────
const hasMore = computed(() => offset.value + LIMIT < total.value);

const activeFilterCount = computed(() =>
  Object.values(filters.value).filter(Boolean).length,
);

const topFields = [
  'debit_state', 'credit_state', 'ext_debit_state', 'ext_credit_state',
  'amount', 'debit_amount', 'credit_amount', 'currency',
  'service', 'provider', 'type',
  'phone', 'created_at', 'updated_at',
];

const isStateField = (key: string) =>
  key.includes('state') || key.includes('status');

const allFieldKeys = computed(() => {
  if (!selectedTx.value) return [];
  return Object.keys(selectedTx.value.data as Record<string, unknown>);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const d = (tx: Transaction, key: string) =>
  (tx.data as Record<string, unknown>)[key] ?? null;

const shortId = (id: string | null) => {
  if (!id) return '—';
  return id.length > 12 ? id.slice(0, 12) + '…' : id;
};

const stateClass = (state: unknown) => {
  if (!state || typeof state !== 'string') return '';
  const s = state.toUpperCase();
  if (s === 'OK' || s === 'DONE' || s === 'SUCCESS' || s === 'COMPLETED') return 'ok';
  if (s === 'WAIT' || s === 'PENDING' || s === 'IN_PROGRESS') return 'wait';
  if (s === 'ERROR' || s === 'FAILED' || s === 'CANCEL' || s === 'CANCELED') return 'err';
  return 'neutral';
};

const formatAmount = (val: unknown) => {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return (num / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 });
};

const formatDate = (iso: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
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
async function load(reset = true) {
  if (reset) {
    offset.value = 0;
    items.value = [];
  }
  loading.value = reset;
  loadingMore.value = !reset;
  error.value = '';
  try {
    const res = await transactionsApi.list({
      limit: LIMIT,
      offset: offset.value,
      phone: searchPhone.value || undefined,
      userUid: userUidFilter.value || undefined,
      dateFrom: filters.value.dateFrom || undefined,
      dateTo: filters.value.dateTo || undefined,
      provider: filters.value.provider || undefined,
      type: filters.value.type || undefined,
      debitState: filters.value.debitState || undefined,
      creditState: filters.value.creditState || undefined,
    });
    if (reset) {
      items.value = res.items;
    } else {
      items.value.push(...res.items);
    }
    total.value = res.total;
    offset.value += res.items.length;
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? t('common.error');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadDetail(id: string) {
  loadingDetail.value = true;
  showAllFields.value = false;
  selectedTx.value = null;
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
  load(true);
}

function resetFilters() {
  filters.value = { dateFrom: '', dateTo: '', provider: '', type: '', debitState: '', creditState: '' };
  searchPhone.value = '';
  userUidFilter.value = '';
  load(true);
}

function loadMore() {
  load(false);
}

function selectTx(id: string) {
  if (selectedId.value === id) {
    selectedId.value = '';
    return;
  }
  selectedId.value = id;
  loadDetail(id);
}

// ── Init: check route query (from customer profile) ───────────────────────────
onMounted(() => {
  const uid = route.query.userUid as string;
  if (uid) {
    userUidFilter.value = uid;
    // remove from URL without reload
    router.replace({ path: '/transactions' });
  }
  load(true);
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
  transition: flex 0.2s;
}

.tx-list-col.narrow {
  flex: 0 0 60%;
}

/* Header */
.tx-header {
  padding: 16px 20px 0;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.tx-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: 12px;
}

.tx-search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.tx-search-wrap {
  position: relative;
  flex: 1;
}

.tx-search-icon {
  position: absolute;
  left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--c-text-2);
  pointer-events: none;
}

.tx-search {
  width: 100%;
  padding: 7px 30px 7px 30px;
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
  right: 8px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  color: var(--c-text-2); font-size: 16px;
  cursor: pointer; line-height: 1;
}

.btn-filter {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--c-text-2);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
  position: relative;
}

.btn-filter:hover,
.btn-filter.active { border-color: var(--c-accent); color: var(--c-accent); }

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
  padding: 12px;
  background: var(--c-surface);
  border-radius: var(--r-md);
  margin-bottom: 12px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 12px;
}

.filter-field label {
  display: block;
  font-size: 11px;
  color: var(--c-text-2);
  margin-bottom: 3px;
}

.filter-input {
  width: 100%;
  padding: 5px 8px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  font-size: 12px;
  color: var(--c-text);
  background: var(--c-bg);
  box-sizing: border-box;
  outline: none;
}

.filter-input:focus { border-color: var(--c-accent); }

.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.btn-reset {
  padding: 6px 14px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 12px;
  color: var(--c-text-2);
  cursor: pointer;
}

.btn-apply {
  padding: 6px 14px;
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
  padding: 0 0 12px;
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
}

.tx-table thead th {
  position: sticky;
  top: 0;
  background: var(--c-bg);
  padding: 8px 10px;
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

.tx-row td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--c-border);
  color: var(--c-text);
  vertical-align: middle;
}

.col-id { width: 100px; }
.col-status { width: 80px; }
.col-service { width: 80px; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-amount { width: 90px; text-align: right; font-variant-numeric: tabular-nums; }
.col-date { width: 110px; white-space: nowrap; }
.col-eye { width: 32px; }

.id-chip {
  font-family: monospace;
  font-size: 11px;
  background: var(--c-surface);
  padding: 2px 6px;
  border-radius: var(--r-sm);
  color: var(--c-text-2);
}

.user-cell { display: flex; flex-direction: column; gap: 1px; }
.user-uid { font-size: 12px; color: var(--c-text); }
.user-phone { font-size: 11px; color: var(--c-text-2); }

.status-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.status-badge.ok { background: #e6f7f0; color: #0a7c4d; }
.status-badge.wait { background: #fff8e1; color: #b07c00; }
.status-badge.err { background: #fef0f0; color: #c0392b; }
.status-badge.neutral { background: var(--c-surface); color: var(--c-text-2); }

.btn-eye {
  background: none; border: none;
  cursor: pointer; color: var(--c-text-2);
  display: flex; align-items: center; justify-content: center;
  padding: 4px;
  border-radius: var(--r-sm);
}

.btn-eye:hover { color: var(--c-accent); background: var(--c-accent-bg); }

.load-more-wrap {
  padding: 12px;
  display: flex;
  justify-content: center;
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
  font-weight: 500;
  color: var(--c-text);
  cursor: pointer;
}

.btn-load-more:disabled { opacity: 0.5; }

/* ── Detail col ── */
.tx-detail-col {
  flex: 0 0 40%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--c-border);
  overflow-y: auto;
  background: var(--c-bg);
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none; border: none;
  font-size: 12px; color: var(--c-text-2);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--r-sm);
}

.btn-back:hover { color: var(--c-accent); background: var(--c-accent-bg); }

.detail-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text);
}

.detail-body {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-card {
  background: var(--c-surface);
  border-radius: var(--r-md);
  padding: 10px 12px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--c-border);
  font-size: 12px;
}

.detail-row:last-child { border-bottom: none; }

.dr-key {
  flex: 0 0 130px;
  color: var(--c-text-2);
  font-size: 11px;
  font-weight: 500;
  word-break: break-all;
  padding-top: 2px;
}

.dr-val {
  flex: 1;
  color: var(--c-text);
  word-break: break-all;
}

.dr-val.small { font-size: 11px; }

.detail-section {}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-text-2);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.actions-stub {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.btn-action {
  padding: 6px 12px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 12px;
  color: var(--c-text-2);
  cursor: not-allowed;
  opacity: 0.6;
}

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

.section-toggle svg {
  transition: transform 0.15s;
  color: var(--c-text-2);
}

.all-fields-card {
  background: var(--c-surface);
  border-radius: var(--r-md);
  padding: 8px 12px;
  margin-top: 6px;
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
