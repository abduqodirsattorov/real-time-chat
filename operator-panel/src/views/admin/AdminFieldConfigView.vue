<template>
  <div class="afc-wrap">
    <div class="afc-header">
      <h2 class="afc-title">{{ t('fieldConfig.title') }}</h2>
      <p class="afc-desc">{{ t('fieldConfig.desc') }}</p>
    </div>

    <!-- Context tabs -->
    <div class="afc-tabs">
      <button
        v-for="ctx in CONTEXTS"
        :key="ctx.key"
        class="afc-tab"
        :class="{ active: activeCtx === ctx.key }"
        @click="switchContext(ctx.key)"
      >
        {{ ctx.label }}
      </button>
    </div>

    <!-- Config list -->
    <div v-if="loading" class="afc-state">{{ t('common.loading') }}</div>
    <div v-else-if="!rows.length" class="afc-state">{{ t('fieldConfig.noFields') }}</div>
    <div v-else class="afc-card">
      <div class="afc-list-header">
        <span>{{ t('fieldConfig.colVisible') }}</span>
        <span>{{ t('fieldConfig.colOrder') }}</span>
        <span class="afc-flex">{{ t('fieldConfig.colKey') }}</span>
        <span class="afc-flex">{{ t('fieldConfig.colLabel') }}</span>
        <span>{{ t('fieldConfig.colType') }}</span>
      </div>

      <div
        v-for="(row, idx) in rows"
        :key="row.fieldKey"
        class="afc-row"
        :class="{ hidden: !row.visible }"
      >
        <!-- Toggle visible -->
        <label class="afc-toggle">
          <input type="checkbox" v-model="row.visible" />
          <span class="afc-toggle-track" />
        </label>

        <!-- Sort order: move up/down -->
        <div class="afc-order">
          <button class="afc-arrow" :disabled="idx === 0" @click="moveUp(idx)">▲</button>
          <span class="afc-order-num">{{ idx + 1 }}</span>
          <button class="afc-arrow" :disabled="idx === rows.length - 1" @click="moveDown(idx)">▼</button>
        </div>

        <!-- Key (read-only) -->
        <span class="afc-flex afc-key">{{ row.fieldKey }}</span>

        <!-- Label (editable) -->
        <input
          class="afc-flex afc-label-input"
          v-model="row.label"
          :placeholder="row.fieldKey"
        />

        <!-- Display type -->
        <select class="afc-type-select" v-model="row.displayType">
          <option v-for="dt in DISPLAY_TYPES" :key="dt.key" :value="dt.key">{{ dt.label }}</option>
        </select>
      </div>
    </div>

    <!-- Save -->
    <div class="afc-footer">
      <button class="afc-save" :disabled="saving" @click="save">
        {{ saving ? t('common.loading') : t('fieldConfig.save') }}
      </button>
      <span v-if="savedOk" class="afc-ok">✓ {{ t('admin.savedOk') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFieldConfigsStore } from '@/stores/fieldConfigs';
import type { FieldConfig } from '@/api/fieldConfigs';

const { t } = useI18n();
const fieldCfg = useFieldConfigsStore();

const CONTEXTS = [
  { key: 'tx_table',  label: 'Tranzaksiya jadval' },
  { key: 'tx_detail', label: 'Tranzaksiya detal'  },
  { key: 'profile',   label: 'Mijoz profil'       },
];

const DISPLAY_TYPES = [
  { key: 'text',   label: 'Matn'   },
  { key: 'badge',  label: 'Badge'  },
  { key: 'amount', label: 'Summa'  },
  { key: 'date',   label: 'Sana'   },
];

const activeCtx = ref('tx_table');
const rows = ref<FieldConfig[]>([]);
const loading = ref(false);
const saving = ref(false);
const savedOk = ref(false);

async function switchContext(ctx: string) {
  activeCtx.value = ctx;
  await loadRows();
}

async function loadRows() {
  loading.value = true;
  savedOk.value = false;
  try {
    fieldCfg.invalidate(activeCtx.value);
    await fieldCfg.load(activeCtx.value);
    // Deep clone for local editing
    rows.value = fieldCfg.get(activeCtx.value).map((c) => ({ ...c }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } finally {
    loading.value = false;
  }
}

function moveUp(idx: number) {
  if (idx === 0) return;
  [rows.value[idx - 1], rows.value[idx]] = [rows.value[idx], rows.value[idx - 1]];
  resortOrder();
}

function moveDown(idx: number) {
  if (idx >= rows.value.length - 1) return;
  [rows.value[idx], rows.value[idx + 1]] = [rows.value[idx + 1], rows.value[idx]];
  resortOrder();
}

function resortOrder() {
  rows.value.forEach((r, i) => { r.sortOrder = i; });
}

async function save() {
  saving.value = true;
  savedOk.value = false;
  try {
    resortOrder();
    await fieldCfg.update(activeCtx.value, rows.value);
    savedOk.value = true;
    setTimeout(() => { savedOk.value = false; }, 3000);
  } catch {
    // error silent — backend 403 for non-admin
  } finally {
    saving.value = false;
  }
}

// Initial load
loadRows();
</script>

<style scoped>
.afc-wrap {
  padding: 24px 28px;
  max-width: 820px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.afc-header { display: flex; flex-direction: column; gap: 4px; }
.afc-title { font-size: 18px; font-weight: 700; color: var(--c-text); margin: 0; }
.afc-desc  { font-size: 13px; color: var(--c-text-2); margin: 0; }

/* Tabs */
.afc-tabs {
  display: flex;
  gap: 4px;
  background: var(--c-surface);
  border-radius: var(--r-md);
  padding: 4px;
  width: fit-content;
}
.afc-tab {
  padding: 7px 16px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--c-text-2);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.afc-tab:hover { background: var(--c-bg); color: var(--c-text); }
.afc-tab.active { background: var(--c-bg); color: var(--c-accent); font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

.afc-state { font-size: 13px; color: var(--c-text-2); padding: 16px 0; }

/* Card */
.afc-card {
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--c-bg);
}

.afc-list-header {
  display: grid;
  grid-template-columns: 52px 90px 1fr 1fr 90px;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--c-text-2);
}

.afc-row {
  display: grid;
  grid-template-columns: 52px 90px 1fr 1fr 90px;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--c-border);
  transition: background 0.1s;
}
.afc-row:last-child { border-bottom: none; }
.afc-row:hover { background: var(--c-surface); }
.afc-row.hidden { opacity: 0.45; }

/* Toggle switch */
.afc-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  width: 36px;
}
.afc-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.afc-toggle-track {
  width: 36px; height: 20px;
  background: var(--c-border);
  border-radius: var(--r-full);
  transition: background 0.2s;
  position: relative;
}
.afc-toggle-track::after {
  content: '';
  position: absolute;
  top: 2px; left: 2px;
  width: 16px; height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.afc-toggle input:checked + .afc-toggle-track { background: var(--c-accent); }
.afc-toggle input:checked + .afc-toggle-track::after { transform: translateX(16px); }

/* Order controls */
.afc-order {
  display: flex;
  align-items: center;
  gap: 4px;
}
.afc-arrow {
  background: none;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  width: 22px; height: 22px;
  font-size: 9px;
  cursor: pointer;
  color: var(--c-text-2);
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.12s, color 0.12s;
}
.afc-arrow:hover:not(:disabled) { border-color: var(--c-accent); color: var(--c-accent); }
.afc-arrow:disabled { opacity: 0.3; cursor: not-allowed; }
.afc-order-num { font-size: 12px; color: var(--c-text-2); min-width: 20px; text-align: center; }

.afc-flex { min-width: 0; }
.afc-key {
  font-size: 12px;
  font-family: monospace;
  color: var(--c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.afc-label-input {
  width: 100%;
  font-size: 13px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  padding: 5px 8px;
  background: var(--c-bg);
  color: var(--c-text);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.12s;
}
.afc-label-input:focus { border-color: var(--c-accent); }

.afc-type-select {
  width: 100%;
  font-size: 12px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  padding: 5px 6px;
  background: var(--c-bg);
  color: var(--c-text);
  outline: none;
  cursor: pointer;
  transition: border-color 0.12s;
}
.afc-type-select:focus { border-color: var(--c-accent); }

/* Footer */
.afc-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}
.afc-save {
  padding: 9px 24px;
  background: var(--c-accent);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.afc-save:hover:not(:disabled) { opacity: 0.88; }
.afc-save:disabled { opacity: 0.5; cursor: not-allowed; }
.afc-ok { font-size: 13px; color: #1a7f4b; font-weight: 600; }
</style>
