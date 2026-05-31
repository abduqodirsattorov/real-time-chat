<template>
  <div class="login-root">

    <!-- Left: marketing panel -->
    <div class="login-left" aria-hidden="true">
      <div class="login-left-inner">
        <div class="brand-logo">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="10" fill="url(#lg)" />
            <path d="M10 13h16M10 18h10M10 23h13" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop stop-color="#5B9BF5"/><stop offset="1" stop-color="#7B6FF4"/>
              </linearGradient>
            </defs>
          </svg>
          <span>Nova Chat</span>
        </div>

        <div class="hero-text">
          <h1>Barcha xabarlar<br /><em>bir joyda</em></h1>
          <p>Mijozlarga professional darajada xizmat ko'rsating</p>
        </div>

        <!-- Decorative chat cards -->
        <div class="preview-cards">
          <div class="card card-1">
            <div class="card-avatar" style="background:#d1e8ff">AB</div>
            <div class="card-body">
              <div class="card-name">Aslbek Jabborov</div>
              <div class="card-msg">Salom, yordam kera…</div>
            </div>
            <div class="card-meta">
              <span class="card-check">✓✓</span>
              <span class="card-time">22:00</span>
            </div>
          </div>
          <div class="card card-2">
            <div class="card-avatar" style="background:#d4f7e8">NM</div>
            <div class="card-body">
              <div class="card-name">Nodira Mirzayeva <span class="online-dot" /></div>
              <div class="card-msg">Rahmat, tushundim!</div>
            </div>
            <div class="card-meta">
              <span class="card-time">21:48</span>
            </div>
          </div>
          <div class="card card-3">
            <div class="card-avatar" style="background:#ede8ff">JS</div>
            <div class="card-body">
              <div class="card-name">Jasur Sobirov</div>
              <div class="card-msg">Buyurtma holati qanday?</div>
            </div>
            <div class="card-meta">
              <span class="unread-dot">2</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: auth form -->
    <div class="login-right">
      <div class="login-form-wrap">

        <div class="lang-switcher">
          <button :class="{ active: locale === 'uz' }" @click="switchLang('uz')">UZ</button>
          <button :class="{ active: locale === 'ru' }" @click="switchLang('ru')">RU</button>
        </div>

        <h2>{{ step === 1 ? t('login.title') : t('login.enterCode') }}</h2>
        <p class="subtitle">{{ step === 1 ? t('login.subtitle') : t('login.codeSent', { phone }) }}</p>

        <!-- Step 1: Phone -->
        <form v-if="step === 1" @submit.prevent="sendOtp" class="form">
          <div class="field">
            <label>{{ t('login.phone') }}</label>
            <input
              v-model="phone"
              type="tel"
              :placeholder="t('login.phonePlaceholder')"
              autocomplete="tel"
              required
            />
          </div>
          <button type="submit" class="btn-primary" :disabled="loading">
            <span v-if="loading" class="spinner" />
            {{ loading ? t('login.sending') : t('login.sendCode') }}
          </button>
          <p v-if="error" class="error">{{ error }}</p>
        </form>

        <!-- Step 2: OTP -->
        <form v-else @submit.prevent="verifyOtp" class="form">
          <div class="field">
            <label>{{ t('login.code') }}</label>
            <input
              v-model="code"
              type="text"
              inputmode="numeric"
              maxlength="6"
              :placeholder="t('login.codePlaceholder')"
              autocomplete="one-time-code"
              required
              class="otp-input"
            />
          </div>
          <button type="submit" class="btn-primary" :disabled="loading">
            <span v-if="loading" class="spinner" />
            {{ loading ? t('login.verifying') : t('login.verify') }}
          </button>
          <button type="button" class="btn-ghost" @click="step = 1; code = ''">
            ← {{ t('login.back') }}
          </button>
          <p v-if="error" class="error">{{ error }}</p>
        </form>

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
    await authApi.sendOtp(phone.value);
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
    const data = await authApi.verifyOtp(phone.value, code.value);
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
.login-root {
  display: flex;
  min-height: 100vh;
  background: var(--c-bg);
}

/* ── Left panel ── */
.login-left {
  flex: 1;
  background: var(--gradient-login);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  position: relative;
  overflow: hidden;
}

.login-left::before {
  content: '';
  position: absolute;
  width: 400px; height: 400px;
  border-radius: 50%;
  background: rgba(91,155,245,0.08);
  top: -100px; right: -100px;
}

.login-left-inner {
  max-width: 420px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 36px;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: var(--c-text);
}

.hero-text h1 {
  font-size: 40px;
  font-weight: 700;
  line-height: 1.18;
  color: var(--c-text);
  letter-spacing: -0.5px;
}

.hero-text h1 em {
  font-style: normal;
  background: var(--gradient-btn);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-text p {
  margin-top: 12px;
  font-size: 15px;
  color: var(--c-text-2);
  line-height: 1.5;
}

/* Decorative cards */
.preview-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255,255,255,0.82);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.9);
  border-radius: var(--r-lg);
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s;
}

.card-2 { transform: translateX(16px); opacity: 0.85; }
.card-3 { transform: translateX(32px); opacity: 0.6; }

.card-avatar {
  width: 38px; height: 38px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #555;
  flex-shrink: 0;
}

.card-body { flex: 1; min-width: 0; }
.card-name {
  font-size: 13px; font-weight: 600; color: var(--c-text);
  display: flex; align-items: center; gap: 5px;
}
.card-msg {
  font-size: 12px; color: var(--c-text-2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 2px;
}

.card-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.card-check { font-size: 11px; color: var(--c-accent); }
.card-time { font-size: 11px; color: var(--c-text-3); }
.online-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--c-online); }
.unread-dot {
  background: var(--c-accent); color: #fff;
  font-size: 11px; font-weight: 700;
  border-radius: var(--r-full); padding: 1px 6px;
  min-width: 18px; text-align: center;
}

/* ── Right panel ── */
.login-right {
  width: 480px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 40px;
  background: var(--c-bg);
}

.login-form-wrap {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.lang-switcher {
  position: absolute;
  top: -36px;
  right: 0;
  display: flex;
  gap: 6px;
}

.lang-switcher button {
  padding: 4px 12px;
  border-radius: var(--r-full);
  border: 1px solid var(--c-border);
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-2);
  transition: all 0.15s;
}

.lang-switcher button.active {
  background: var(--c-accent);
  border-color: var(--c-accent);
  color: #fff;
}

h2 {
  font-size: 26px;
  font-weight: 700;
  color: var(--c-text);
  margin-top: 12px;
}

.subtitle {
  font-size: 14px;
  color: var(--c-text-2);
  margin-bottom: 24px;
  line-height: 1.5;
}

.form { display: flex; flex-direction: column; gap: 16px; }

.field { display: flex; flex-direction: column; gap: 6px; }

label { font-size: 13px; font-weight: 500; color: var(--c-text); }

input {
  padding: 13px 16px;
  background: var(--c-surface);
  border: 1.5px solid transparent;
  border-radius: var(--r-sm);
  font-size: 15px;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}

input:focus {
  border-color: var(--c-accent);
  background: #fff;
}

input::placeholder { color: var(--c-text-3); }

.otp-input {
  letter-spacing: 6px;
  font-size: 20px;
  font-weight: 600;
  text-align: center;
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px 20px;
  background: var(--gradient-btn);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-size: 15px;
  font-weight: 600;
  transition: opacity 0.15s, transform 0.1s;
  box-shadow: 0 4px 12px rgba(91,155,245,0.35);
}

.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:active:not(:disabled) { transform: translateY(0); }
.btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

.btn-ghost {
  padding: 11px 20px;
  background: transparent;
  color: var(--c-text-2);
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  font-size: 14px;
  font-weight: 500;
  transition: border-color 0.15s, color 0.15s;
}

.btn-ghost:hover { border-color: var(--c-accent); color: var(--c-accent); }

.error {
  font-size: 13px;
  color: var(--c-red);
  text-align: center;
  padding: 8px 12px;
  background: #fff1f0;
  border-radius: var(--r-xs);
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .login-left { display: none; }
  .login-right { width: 100%; padding: 32px 24px; }
}
</style>
