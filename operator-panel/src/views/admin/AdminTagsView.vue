<template>
  <div class="tags-page">
    <div class="tags-header">
      <h2 class="tags-title">{{ t('tags.adminTitle') }}</h2>
      <button class="add-btn" @click="openCreate">+ {{ t('tags.create') }}</button>
    </div>

    <div v-if="loading" class="loading-text">{{ t('common.loading') }}</div>

    <div v-else-if="tags.length === 0" class="empty-state">{{ t('tags.noTags') }}</div>

    <div v-else class="tags-list">
      <div v-for="tag in tags" :key="tag.id" class="tag-row">
        <span class="tag-preview" :style="{ background: tag.color + '22', color: tag.color, borderColor: tag.color + '55' }">
          {{ tag.name }}
        </span>
        <span class="tag-color-code">{{ tag.color }}</span>
        <div class="tag-row-actions">
          <button class="row-btn" @click="openEdit(tag)">{{ t('common.edit') }}</button>
          <button class="row-btn danger" @click="confirmDelete(tag)">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>

    <!-- Create/Edit modal -->
    <div v-if="modal.open" class="modal-overlay" @click.self="modal.open = false">
      <div class="modal-card">
        <h3 class="modal-title">{{ modal.isEdit ? t('tags.editTitle') : t('tags.createTitle') }}</h3>
        <div class="form-field">
          <label>{{ t('tags.name') }}</label>
          <input v-model="modal.name" type="text" class="form-input" :placeholder="t('tags.namePlaceholder')" maxlength="64" />
        </div>
        <div class="form-field">
          <label>{{ t('tags.color') }}</label>
          <div class="color-row">
            <input v-model="modal.color" type="color" class="color-picker" />
            <input v-model="modal.color" type="text" class="form-input color-input" placeholder="#EF4444" maxlength="7" />
          </div>
          <div class="color-presets">
            <button
              v-for="c in PRESET_COLORS"
              :key="c"
              class="color-preset"
              :style="{ background: c }"
              :class="{ active: modal.color === c }"
              @click="modal.color = c"
            />
          </div>
        </div>
        <div v-if="modal.error" class="modal-error">{{ modal.error }}</div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="modal.open = false">{{ t('common.cancel') }}</button>
          <button class="btn-primary" :disabled="!modal.name.trim()" @click="submitModal">
            {{ modal.isEdit ? t('common.save') : t('tags.create') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
      <div class="modal-card">
        <h3 class="modal-title">{{ t('tags.deleteTitle') }}</h3>
        <p class="modal-body">{{ t('tags.deleteConfirm', { name: deleteTarget.name }) }}</p>
        <div class="modal-actions">
          <button class="btn-secondary" @click="deleteTarget = null">{{ t('common.cancel') }}</button>
          <button class="btn-danger" @click="doDelete">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { tagsApi, type Tag } from '@/api/tags';
import { useTagsStore } from '@/stores/tags';

const { t } = useI18n();
const tagsStore = useTagsStore();

const tags = ref<Tag[]>([]);
const loading = ref(false);
const deleteTarget = ref<Tag | null>(null);

const PRESET_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280',
];

const modal = reactive({
  open: false,
  isEdit: false,
  editId: '',
  name: '',
  color: '#6B7280',
  error: '',
});

async function load() {
  loading.value = true;
  try {
    tags.value = await tagsApi.list();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  modal.open = true;
  modal.isEdit = false;
  modal.editId = '';
  modal.name = '';
  modal.color = '#6B7280';
  modal.error = '';
}

function openEdit(tag: Tag) {
  modal.open = true;
  modal.isEdit = true;
  modal.editId = tag.id;
  modal.name = tag.name;
  modal.color = tag.color;
  modal.error = '';
}

async function submitModal() {
  modal.error = '';
  if (!modal.name.trim()) return;
  try {
    if (modal.isEdit) {
      await tagsApi.update(modal.editId, { name: modal.name.trim(), color: modal.color });
    } else {
      await tagsApi.create({ name: modal.name.trim(), color: modal.color });
    }
    modal.open = false;
    await load();
    await tagsStore.loadTags(); // Refresh global store
  } catch (e: any) {
    modal.error = e?.response?.data?.message ?? t('common.error');
  }
}

function confirmDelete(tag: Tag) {
  deleteTarget.value = tag;
}

async function doDelete() {
  if (!deleteTarget.value) return;
  try {
    await tagsApi.remove(deleteTarget.value.id);
    deleteTarget.value = null;
    await load();
    await tagsStore.loadTags();
  } catch (e: any) {
    console.error('[AdminTags] delete failed:', e);
  }
}

onMounted(load);
</script>

<style scoped>
.tags-page {
  padding: 24px 28px;
  max-width: 640px;
}

.tags-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.tags-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--c-text);
}

.add-btn {
  padding: 8px 16px;
  background: var(--c-accent);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.add-btn:hover { opacity: 0.85; }

.loading-text, .empty-state {
  color: var(--c-text-3);
  font-size: 13px;
  padding: 20px 0;
}

.tags-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--c-surface);
  border-radius: var(--r-sm);
  border: 1px solid var(--c-border);
}

.tag-preview {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: var(--r-full);
  border: 1px solid transparent;
  min-width: 80px;
  justify-content: center;
}

.tag-color-code {
  font-size: 12px;
  color: var(--c-text-3);
  font-family: monospace;
  flex: 1;
}

.tag-row-actions {
  display: flex;
  gap: 6px;
}

.row-btn {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  background: var(--c-bg);
  color: var(--c-text-2);
  cursor: pointer;
  transition: all 0.12s;
}
.row-btn:hover { border-color: var(--c-accent); color: var(--c-accent); }
.row-btn.danger:hover { border-color: var(--c-red); color: var(--c-red); }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center;
  z-index: 500;
}

.modal-card {
  background: var(--c-bg);
  border-radius: var(--r-lg);
  padding: 24px 28px;
  width: 360px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: 16px;
}

.modal-body {
  font-size: 14px;
  color: var(--c-text-2);
  margin-bottom: 20px;
}

.form-field {
  margin-bottom: 14px;
}
.form-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-2);
  margin-bottom: 5px;
}

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  font-size: 13px;
  color: var(--c-text);
  background: var(--c-surface);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--c-accent); background: #fff; }

.color-row { display: flex; gap: 8px; align-items: center; }
.color-picker {
  width: 42px; height: 38px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  padding: 2px; cursor: pointer;
  background: var(--c-surface);
}
.color-input { flex: 1; }
.color-presets { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.color-preset {
  width: 24px; height: 24px; border-radius: 50%; border: 2.5px solid transparent;
  cursor: pointer; transition: transform 0.1s;
}
.color-preset:hover { transform: scale(1.15); }
.color-preset.active { border-color: var(--c-text); }

.modal-error {
  font-size: 12px;
  color: var(--c-red);
  margin-bottom: 10px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-secondary {
  padding: 9px 18px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--c-text-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  padding: 9px 18px;
  background: var(--c-accent);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-danger {
  padding: 9px 18px;
  background: var(--c-red);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
</style>
