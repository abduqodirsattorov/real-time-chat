<template>
  <div class="admin-page">

    <!-- Header -->
    <div class="admin-header">
      <h1 class="admin-title">{{ t('admin.productsList') }}</h1>
      <button class="btn-add" @click="openAddModal">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {{ t('admin.addProduct') }}
      </button>
    </div>

    <!-- Table -->
    <div class="admin-card">
      <div v-if="loading" class="loading-row">{{ t('common.loading') }}</div>
      <div v-else-if="error" class="error-row">{{ error }}</div>
      <table v-else class="users-table">
        <thead>
          <tr>
            <th class="col-num">№</th>
            <th>{{ t('admin.productCol.name') }}</th>
            <th class="col-slug">{{ t('admin.productCol.slug') }}</th>
            <th class="col-color">{{ t('admin.productCol.color') }}</th>
            <th class="col-status">{{ t('admin.productCol.status') }}</th>
            <th class="col-actions">{{ t('admin.productCol.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(product, idx) in products"
            :key="product.id"
            class="user-row"
            @click="openEdit(product)"
          >
            <td class="col-num">{{ idx + 1 }}</td>
            <td>
              <div class="product-name-cell">
                <span class="color-swatch" :style="{ background: product.branding?.primary_color ?? '#3B6FF5' }" />
                <span>{{ product.branding?.display_name ?? product.name }}</span>
              </div>
            </td>
            <td class="col-slug"><code class="slug-code">{{ product.slug }}</code></td>
            <td class="col-color">
              <div class="color-preview" :style="{ background: product.branding?.primary_color ?? '#3B6FF5' }">
                {{ product.branding?.primary_color ?? '#3B6FF5' }}
              </div>
            </td>
            <td class="col-status">
              <span class="status-badge" :class="product.isActive ? 'active' : 'inactive'">
                {{ product.isActive ? t('admin.productActive') : t('admin.productInactive') }}
              </span>
            </td>
            <td class="col-actions" @click.stop>
              <button class="btn-delete" @click="confirmDelete(product)" :title="t('common.delete')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </td>
          </tr>
          <tr v-if="products.length === 0">
            <td colspan="6" class="empty-row">{{ t('admin.noProducts') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Delete confirm modal -->
    <Teleport to="body">
      <div v-if="deleteTarget" class="modal-backdrop" @mousedown.self="deleteTarget = null">
        <div class="modal-box modal-confirm" @click.stop>
          <div class="confirm-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </div>
          <h3>{{ t('admin.deleteProductTitle') }}</h3>
          <p>{{ t('admin.deleteProductConfirm', { name: deleteTarget.branding?.display_name ?? deleteTarget.name }) }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="deleteTarget = null">{{ t('common.cancel') }}</button>
            <button class="btn-danger" :disabled="deleting" @click="doDelete">
              <span v-if="deleting" class="spinner" />
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add / Edit modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-backdrop" @mousedown.self="closeModal">
        <div class="modal-box modal-wide" @click.stop>
          <h3>{{ editingId ? t('admin.editProductTitle') : t('admin.addProductTitle') }}</h3>

          <form @submit.prevent="submitSave" class="modal-form" autocomplete="off">
            <div class="modal-row">
              <div class="modal-field">
                <label>{{ t('admin.productName') }} *</label>
                <input v-model="form.name" :placeholder="t('admin.productName')" required />
              </div>
              <div class="modal-field" v-if="!editingId">
                <label>{{ t('admin.productSlug') }} *</label>
                <input v-model="form.slug" :placeholder="'my-product'" required pattern="[a-z0-9\-]+" />
                <span class="field-hint">{{ t('admin.slugHint') }}</span>
              </div>
              <div class="modal-field" v-else>
                <label>{{ t('admin.productSlug') }}</label>
                <input :value="form.slug" disabled class="input-disabled" />
              </div>
            </div>

            <div class="modal-row">
              <div class="modal-field">
                <label>{{ t('admin.productDisplayName') }}</label>
                <input v-model="form.displayName" :placeholder="t('admin.productDisplayName')" />
              </div>
              <div class="modal-field">
                <label>{{ t('admin.productColor') }}</label>
                <div class="color-input-wrap">
                  <input
                    v-model="form.primaryColor"
                    type="color"
                    class="color-picker-native"
                  />
                  <input
                    v-model="form.primaryColor"
                    :placeholder="'#3B6FF5'"
                    class="color-text-input"
                  />
                </div>
              </div>
            </div>

            <div class="modal-field">
              <label>{{ t('admin.productLogoUrl') }}</label>
              <input v-model="form.logoUrl" :placeholder="'https://...'" type="url" />
            </div>

            <p v-if="saveError" class="form-error">{{ saveError }}</p>

            <div class="modal-actions">
              <button type="button" class="btn-cancel" @click="closeModal">{{ t('common.cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving" class="spinner" />
                {{ t('common.save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { productsApi, type Product } from '@/api/products';

const { t } = useI18n();

const products = ref<Product[]>([]);
const loading = ref(false);
const error = ref('');

const showModal = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const saveError = ref('');
const form = ref({
  name: '',
  slug: '',
  displayName: '',
  primaryColor: '#3B6FF5',
  logoUrl: '',
});

const deleteTarget = ref<Product | null>(null);
const deleting = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await productsApi.listAll();
    products.value = res.products;
  } catch {
    error.value = t('common.error');
  } finally {
    loading.value = false;
  }
}

function openAddModal() {
  editingId.value = null;
  form.value = { name: '', slug: '', displayName: '', primaryColor: '#3B6FF5', logoUrl: '' };
  saveError.value = '';
  showModal.value = true;
}

function openEdit(product: Product) {
  editingId.value = product.id;
  form.value = {
    name: product.name,
    slug: product.slug,
    displayName: (product.branding as any)?.display_name ?? '',
    primaryColor: (product.branding as any)?.primary_color ?? '#3B6FF5',
    logoUrl: (product.branding as any)?.logo_url ?? '',
  };
  saveError.value = '';
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
}

async function submitSave() {
  saveError.value = '';
  saving.value = true;
  const branding = {
    display_name: form.value.displayName || form.value.name,
    primary_color: form.value.primaryColor,
    logo_url: form.value.logoUrl || null,
  };

  try {
    if (editingId.value) {
      const updated = await productsApi.update(editingId.value, { name: form.value.name, branding });
      const idx = products.value.findIndex((p) => p.id === editingId.value);
      if (idx !== -1) products.value[idx] = updated;
    } else {
      const created = await productsApi.create({ name: form.value.name, slug: form.value.slug, branding });
      products.value.push(created);
    }
    showModal.value = false;
  } catch (e: unknown) {
    saveError.value =
      (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message?.toString()
      ?? t('common.error');
  } finally {
    saving.value = false;
  }
}

function confirmDelete(product: Product) {
  deleteTarget.value = product;
}

async function doDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await productsApi.remove(deleteTarget.value.id);
    const target = deleteTarget.value;
    products.value = products.value.map((p) =>
      p.id === target.id ? { ...p, isActive: false } : p,
    );
    deleteTarget.value = null;
  } catch (e: unknown) {
    alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error'));
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.admin-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--c-bg);
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 40px 16px;
  flex-shrink: 0;
}

.admin-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--c-text);
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: var(--c-accent);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-add:hover { opacity: 0.88; }

.admin-card {
  flex: 1;
  min-height: 0;
  margin: 0 40px 32px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  overflow-y: auto;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
}

.users-table th {
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

.col-num  { width: 50px; }
.col-slug { width: 140px; }
.col-color { width: 140px; }
.col-status { width: 100px; text-align: right; }
.col-actions { width: 52px; text-align: center; }

.user-row {
  cursor: pointer;
  transition: background 0.12s;
}
.user-row:hover { background: var(--c-surface); }
.user-row + .user-row { border-top: 1px solid var(--c-border); }
.user-row td {
  padding: 14px 20px;
  font-size: 14px;
  color: var(--c-text);
}

.product-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-swatch {
  width: 12px; height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(0,0,0,0.1);
}

.slug-code {
  font-family: monospace;
  font-size: 12px;
  background: var(--c-surface);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--c-text-2);
}

.color-preview {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  font-family: monospace;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

.status-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--r-full);
  font-size: 12px;
  font-weight: 600;
}
.status-badge.active { background: #e6fbf0; color: #1a7f4b; border: 1px solid #a3e6c3; }
.status-badge.inactive { background: #f5f5f5; color: #999; border: 1px solid #e0e0e0; }

.btn-delete {
  opacity: 0;
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--r-sm);
  color: var(--c-text-3);
  cursor: pointer;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}
.user-row:hover .btn-delete { opacity: 1; }
.btn-delete:hover { background: #fff1f0; color: var(--c-red); }

.empty-row, .loading-row, .error-row {
  padding: 32px;
  text-align: center;
  color: var(--c-text-2);
  font-size: 14px;
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(4px);
  z-index: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-box {
  background: var(--c-bg);
  border-radius: var(--r-xl);
  padding: 28px 32px;
  width: 440px;
  max-width: 95vw;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
}

.modal-wide { width: 520px; }

.modal-box h3 {
  font-size: 17px;
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: 20px;
}

.modal-form { display: flex; flex-direction: column; gap: 14px; }

.modal-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal-field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--c-text-2);
}

.modal-field input {
  padding: 10px 14px;
  background: var(--c-surface);
  border: 1.5px solid transparent;
  border-radius: var(--r-sm);
  font-size: 14px;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.modal-field input:focus {
  border-color: var(--c-accent);
  background: #fff;
}
.input-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.field-hint {
  font-size: 11px;
  color: var(--c-text-3);
  line-height: 1.4;
}

.color-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.color-picker-native {
  width: 40px !important;
  height: 36px !important;
  padding: 2px !important;
  border-radius: var(--r-sm) !important;
  cursor: pointer;
  flex-shrink: 0;
}
.color-text-input {
  flex: 1;
}

.form-error {
  font-size: 13px;
  color: var(--c-red);
  padding: 8px 12px;
  background: #fff1f0;
  border-radius: var(--r-xs);
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

.btn-cancel {
  padding: 10px 20px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--c-text-2);
  cursor: pointer;
  transition: border-color 0.15s;
}
.btn-cancel:hover { border-color: var(--c-text-2); }

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: var(--c-accent);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-primary:hover:not(:disabled) { opacity: 0.88; }
.btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

.modal-confirm {
  text-align: center;
  max-width: 360px;
  padding: 32px;
}

.confirm-icon {
  width: 52px; height: 52px;
  border-radius: 50%;
  background: #fff1f0;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 16px;
  color: var(--c-red);
}

.modal-confirm h3 {
  font-size: 17px;
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: 8px;
}

.modal-confirm p {
  font-size: 14px;
  color: var(--c-text-2);
  line-height: 1.5;
  margin-bottom: 24px;
}

.btn-danger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: var(--c-red);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-danger:hover:not(:disabled) { opacity: 0.88; }
.btn-danger:disabled { opacity: 0.55; cursor: not-allowed; }

.spinner {
  display: inline-block;
  width: 13px; height: 13px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
