<template>
  <div class="detail-page">

    <!-- Breadcrumb -->
    <div class="breadcrumb">
      <router-link to="/admin/users" class="bc-link">{{ t('admin.title') }}</router-link>
      <span class="bc-sep">›</span>
      <span class="bc-current">{{ user?.fullName ?? user?.email ?? '...' }}</span>
    </div>

    <div v-if="loading" class="state-msg">{{ t('common.loading') }}</div>
    <div v-else-if="loadError" class="state-msg error">{{ loadError }}</div>

    <template v-else-if="user">
      <!-- Title + back -->
      <div class="detail-header">
        <button class="btn-back" @click="$router.back()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1>{{ user.fullName ?? user.email }}</h1>
      </div>

      <!-- Tabs -->
      <div class="detail-tabs">
        <button :class="{ active: tab === 'name' }" @click="tab = 'name'">
          {{ t('admin.tabName') }}
        </button>
        <button :class="{ active: tab === 'password' }" @click="tab = 'password'">
          {{ t('admin.tabPassword') }}
        </button>
      </div>

      <!-- Name tab -->
      <div v-if="tab === 'name'" class="detail-card">
        <form @submit.prevent="saveName" class="detail-form">
          <div class="form-row">
            <div class="form-field">
              <label>{{ t('admin.firstName') }}</label>
              <input v-model="nameForm.firstName" :placeholder="t('admin.firstName')" required />
            </div>
            <div class="form-field">
              <label>{{ t('admin.lastName') }}</label>
              <input v-model="nameForm.lastName" :placeholder="t('admin.lastName')" />
            </div>
          </div>
          <p v-if="nameError" class="form-error">{{ nameError }}</p>
          <p v-if="nameSuccess" class="form-success">{{ nameSuccess }}</p>
          <button type="submit" class="btn-save" :disabled="nameSaving">
            <span v-if="nameSaving" class="spinner" />
            {{ t('common.save') }}
          </button>
        </form>
      </div>

      <!-- Password tab -->
      <div v-else-if="tab === 'password'" class="detail-card">
        <form @submit.prevent="savePassword" class="detail-form">
          <div class="form-row">
            <div class="form-field">
              <label>{{ t('admin.loginEmail') }}</label>
              <input :value="user.email ?? ''" disabled />
            </div>
            <div class="form-field">
              <label>{{ t('login.password') }}</label>
              <div class="pw-wrap">
                <input
                  v-model="pwForm.password"
                  :type="showPw ? 'text' : 'password'"
                  :placeholder="t('login.password')"
                  required
                  minlength="6"
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
          </div>
          <p v-if="pwError" class="form-error">{{ pwError }}</p>
          <p v-if="pwSuccess" class="form-success">{{ pwSuccess }}</p>
          <button type="submit" class="btn-save" :disabled="pwSaving">
            <span v-if="pwSaving" class="spinner" />
            {{ t('common.save') }}
          </button>
        </form>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { adminApi, type AdminUser } from '@/api/admin';

const { t } = useI18n();
const route = useRoute();
const id = route.params.id as string;

const user = ref<AdminUser | null>(null);
const loading = ref(false);
const loadError = ref('');
const tab = ref<'name' | 'password'>('name');

const nameForm = ref({ firstName: '', lastName: '' });
const nameSaving = ref(false);
const nameError = ref('');
const nameSuccess = ref('');

const pwForm = ref({ password: '' });
const showPw = ref(false);
const pwSaving = ref(false);
const pwError = ref('');
const pwSuccess = ref('');

function splitName(fullName: string | null) {
  const parts = (fullName ?? '').split(' ');
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    user.value = await adminApi.getUser(id);
    const split = splitName(user.value.fullName);
    nameForm.value = split;
  } catch {
    loadError.value = t('common.error');
  } finally {
    loading.value = false;
  }
}

async function saveName() {
  nameError.value = '';
  nameSuccess.value = '';
  nameSaving.value = true;
  try {
    const updated = await adminApi.updateUser(id, nameForm.value);
    user.value = { ...user.value!, ...updated };
    nameSuccess.value = t('admin.savedOk');
  } catch (e: unknown) {
    nameError.value =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error');
  } finally {
    nameSaving.value = false;
  }
}

async function savePassword() {
  pwError.value = '';
  pwSuccess.value = '';
  pwSaving.value = true;
  try {
    await adminApi.updatePassword(id, pwForm.value.password);
    pwForm.value.password = '';
    pwSuccess.value = t('admin.savedOk');
  } catch (e: unknown) {
    pwError.value =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error');
  } finally {
    pwSaving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.detail-page {
  flex: 1;
  padding: 28px 40px;
  overflow-y: auto;
  background: var(--c-bg);
  align-self: stretch;
}

/* Breadcrumb */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--c-text-2);
  margin-bottom: 16px;
}
.bc-link {
  color: var(--c-text-2);
  text-decoration: none;
  transition: color 0.12s;
}
.bc-link:hover { color: var(--c-accent); }
.bc-sep { color: var(--c-text-3); }
.bc-current { color: var(--c-text); font-weight: 500; }

/* Header */
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.btn-back {
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--c-text-2);
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.12s, color 0.12s;
}
.btn-back:hover { border-color: var(--c-text-2); color: var(--c-text); }

.detail-header h1 {
  font-size: 20px;
  font-weight: 700;
  color: var(--c-text);
}

/* Tabs */
.detail-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
}

.detail-tabs button {
  padding: 8px 16px;
  border: none;
  background: transparent;
  border-radius: var(--r-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--c-text-2);
  cursor: pointer;
  transition: all 0.15s;
  border: 1.5px solid transparent;
}
.detail-tabs button.active {
  color: var(--c-accent);
  border-color: var(--c-accent);
  background: var(--c-accent-bg);
  font-weight: 600;
}

/* Card */
.detail-card {
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  padding: 24px;
  max-width: 680px;
}

.detail-form { display: flex; flex-direction: column; gap: 16px; }

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--c-text-2);
}

.form-field input {
  padding: 10px 14px;
  background: var(--c-surface);
  border: 1.5px solid transparent;
  border-radius: var(--r-sm);
  font-size: 14px;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.form-field input:focus { border-color: var(--c-accent); background: #fff; }
.form-field input:disabled { opacity: 0.6; cursor: not-allowed; }

.pw-wrap { position: relative; }
.pw-wrap input { padding-right: 40px; width: 100%; }
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

.form-success {
  font-size: 13px;
  color: #087f5b;
  padding: 8px 12px;
  background: #d3f9d8;
  border-radius: var(--r-xs);
}

.btn-save {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  background: var(--c-accent);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-save:hover:not(:disabled) { opacity: 0.88; }
.btn-save:disabled { opacity: 0.55; cursor: not-allowed; }

.state-msg {
  padding: 32px;
  text-align: center;
  color: var(--c-text-2);
  font-size: 14px;
}
.state-msg.error { color: var(--c-red); }

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
