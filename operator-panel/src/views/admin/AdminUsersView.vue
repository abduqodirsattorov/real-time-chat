<template>
  <div class="admin-page">

    <!-- Header -->
    <div class="admin-header">
      <h1 class="admin-title">{{ t('admin.title') }}</h1>
      <button class="btn-add" @click="openAddModal">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {{ t('admin.addUser') }}
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
            <th>{{ t('admin.fullName') }}</th>
            <th class="col-role">{{ t('admin.role') }}</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(user, idx) in users"
            :key="user.id"
            class="user-row"
            :class="{ selected: selectedId === user.id }"
            @click="openDetail(user)"
          >
            <td class="col-num">{{ idx + 1 }}</td>
            <td>{{ user.fullName ?? user.email ?? '—' }}</td>
            <td class="col-role">
              <span class="role-badge" :class="user.role">{{ t(`admin.roles.${user.role}`) }}</span>
            </td>
            <td class="col-actions" @click.stop>
              <button class="btn-delete" @click="confirmDelete(user)" :title="t('common.delete')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="4" class="empty-row">{{ t('admin.noUsers') }}</td>
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
          <h3>{{ t('admin.deleteTitle') }}</h3>
          <p>{{ t('admin.deleteConfirm', { name: deleteTarget.fullName ?? deleteTarget.email }) }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="deleteTarget = null">{{ t('common.cancel') }}</button>
            <button class="btn-danger" :disabled="deleting" @click="doDelete">
              <span v-if="deleting" class="spinner spinner-dark" />
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add user modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-backdrop" @mousedown.self="showModal = false">
        <div class="modal-box" @click.stop>
          <h3>{{ t('admin.addUserTitle') }}</h3>

          <!-- hidden dummy fields to fool browser password manager -->
          <input type="text" name="username" style="display:none" autocomplete="username" tabindex="-1" />
          <input type="password" name="password" style="display:none" autocomplete="new-password" tabindex="-1" />

          <form @submit.prevent="submitCreate" class="modal-form" autocomplete="off">
            <div class="modal-row">
              <div class="modal-field">
                <label>{{ t('admin.firstName') }}</label>
                <input v-model="form.firstName" :placeholder="t('admin.firstName')" required autocomplete="off" />
              </div>
              <div class="modal-field">
                <label>{{ t('admin.lastName') }}</label>
                <input v-model="form.lastName" :placeholder="t('admin.lastName')" required autocomplete="off" />
              </div>
            </div>
            <div class="modal-field">
              <label>{{ t('admin.loginEmail') }}</label>
              <input v-model="form.email" type="text" inputmode="email" :placeholder="t('admin.loginEmail')" required autocomplete="off" />
            </div>
            <div class="modal-field">
              <label>{{ t('login.password') }}</label>
              <div class="pw-wrap">
                <input
                  v-model="form.password"
                  :type="showPw ? 'text' : 'password'"
                  :placeholder="t('login.password')"
                  required
                  minlength="6"
                  autocomplete="new-password"
                />
                <button type="button" class="pw-toggle" @click="showPw = !showPw" tabindex="-1">
                  <svg v-if="showPw" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </div>
            </div>
            <p v-if="createError" class="form-error">{{ createError }}</p>
            <div class="modal-actions">
              <button type="button" class="btn-cancel" @click="showModal = false">{{ t('common.cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="creating">
                <span v-if="creating" class="spinner" />
                {{ t('admin.addUserSubmit') }}
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
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { adminApi, type AdminUser } from '@/api/admin';

const { t } = useI18n();
const router = useRouter();

const users = ref<AdminUser[]>([]);
const loading = ref(false);
const error = ref('');
const selectedId = ref<string | null>(null);

const showModal = ref(false);
const showPw = ref(false);
const creating = ref(false);
const createError = ref('');
const form = ref({ firstName: '', lastName: '', email: '', password: '' });

const deleteTarget = ref<AdminUser | null>(null);
const deleting = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await adminApi.listUsers();
    users.value = res.items;
  } catch {
    error.value = t('common.error');
  } finally {
    loading.value = false;
  }
}

function openAddModal() {
  form.value = { firstName: '', lastName: '', email: '', password: '' };
  createError.value = '';
  showPw.value = false;
  showModal.value = true;
}

async function submitCreate() {
  createError.value = '';
  creating.value = true;
  try {
    const created = await adminApi.createUser(form.value);
    users.value.push(created);
    showModal.value = false;
  } catch (e: unknown) {
    createError.value =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error');
  } finally {
    creating.value = false;
  }
}

function openDetail(user: AdminUser) {
  selectedId.value = user.id;
  router.push({ name: 'admin-user-detail', params: { id: user.id } });
}

function confirmDelete(user: AdminUser) {
  deleteTarget.value = user;
}

async function doDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await adminApi.deleteUser(deleteTarget.value.id);
    users.value = users.value.filter((u) => u.id !== deleteTarget.value!.id);
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

.col-num { width: 60px; }
.col-role { width: 140px; text-align: right; }
.col-actions { width: 52px; text-align: center; }

.user-row {
  cursor: pointer;
  transition: background 0.12s;
}
.user-row:hover { background: var(--c-surface); }
.user-row.selected { background: var(--c-accent-bg); }
.user-row + .user-row { border-top: 1px solid var(--c-border); }

.user-row td {
  padding: 14px 20px;
  font-size: 14px;
  color: var(--c-text);
}

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

.role-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--r-full);
  font-size: 12px;
  font-weight: 600;
  background: #fff3e8;
  color: #c05600;
  border: 1px solid #ffd6a8;
}
.role-badge.admin { background: #eef3ff; color: #3b5bdb; border-color: #bac8ff; }
.role-badge.supervisor { background: #f3f0ff; color: #7048e8; border-color: #d0bfff; }

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

.pw-wrap { position: relative; }
.pw-wrap input { padding-right: 40px; }
.pw-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--c-text-2);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
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
.spinner-dark {
  border-color: rgba(255,255,255,0.4);
  border-top-color: #fff;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
