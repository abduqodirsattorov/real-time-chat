<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h1>{{ t('login.title') }}</h1>
        <p>{{ t('login.subtitle') }}</p>
      </div>

      <form v-if="step === 1" @submit.prevent="sendOtp">
        <label>{{ t('login.phone') }}</label>
        <input
          v-model="phone"
          type="tel"
          :placeholder="t('login.phonePlaceholder')"
          autocomplete="tel"
          required
        />
        <button type="submit" :disabled="loading">
          {{ loading ? t('login.sending') : t('login.sendCode') }}
        </button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>

      <form v-else @submit.prevent="verifyOtp">
        <label>{{ t('login.code') }}</label>
        <input
          v-model="code"
          type="text"
          inputmode="numeric"
          maxlength="6"
          :placeholder="t('login.codePlaceholder')"
          autocomplete="one-time-code"
          required
        />
        <button type="submit" :disabled="loading">
          {{ loading ? t('login.verifying') : t('login.verify') }}
        </button>
        <button type="button" class="secondary" @click="step = 1; code = ''">
          {{ t('login.back') }}
        </button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>

      <div class="lang-switcher">
        <button :class="{ active: locale === 'uz' }" @click="switchLang('uz')">UZ</button>
        <button :class="{ active: locale === 'ru' }" @click="switchLang('ru')">RU</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();

const step = ref(1);
const phone = ref('');
const code = ref('');
const sessionId = ref('');
const loading = ref(false);
const error = ref('');

function switchLang(lang: string) {
  locale.value = lang;
  localStorage.setItem('lang', lang);
}

async function sendOtp() {
  error.value = '';
  loading.value = true;
  try {
    const res = await authApi.sendOtp(phone.value);
    sessionId.value = res.sessionId;
    step.value = 2;
  } catch (e: unknown) {
    error.value = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error');
  } finally {
    loading.value = false;
  }
}

async function verifyOtp() {
  error.value = '';
  loading.value = true;
  try {
    const data = await authApi.verifyOtp(sessionId.value, code.value);
    await auth.afterLogin(data);
    router.push('/chat');
  } catch (e: unknown) {
    error.value = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%);
}

.login-card {
  background: #fff;
  border-radius: 16px;
  padding: 40px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1e3a5f;
}

.login-header p {
  color: #666;
  margin-top: 4px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

label {
  font-size: 13px;
  font-weight: 600;
  color: #444;
}

input {
  padding: 12px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s;
}

input:focus {
  border-color: #2d6a9f;
}

button[type='submit'] {
  padding: 12px;
  background: #2d6a9f;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 4px;
}

button[type='submit']:hover:not(:disabled) {
  background: #1e3a5f;
}

button[type='submit']:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

button.secondary {
  padding: 10px;
  background: transparent;
  color: #666;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.error {
  color: #e53e3e;
  font-size: 13px;
  text-align: center;
}

.lang-switcher {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 24px;
}

.lang-switcher button {
  padding: 6px 16px;
  border: 1px solid #ddd;
  border-radius: 20px;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  color: #666;
}

.lang-switcher button.active {
  background: #2d6a9f;
  color: #fff;
  border-color: #2d6a9f;
}
</style>
