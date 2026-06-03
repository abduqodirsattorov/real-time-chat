<template>
  <div class="picker-shell">
    <div class="picker-card">
      <!-- Logo -->
      <div class="picker-logo">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <rect width="36" height="36" rx="10" fill="url(#plg)" />
          <path d="M10 13h16M10 18h10M10 23h13" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
          <defs>
            <linearGradient id="plg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
              <stop stop-color="#5B9BF5"/><stop offset="1" stop-color="#7B6FF4"/>
            </linearGradient>
          </defs>
        </svg>
        <span class="picker-logo-name">Nova Support</span>
      </div>

      <h2 class="picker-title">Productni tanlang</h2>
      <p class="picker-subtitle">Siz qaysi ilova uchun ishlamoqchisiz?</p>

      <!-- Loading -->
      <div v-if="loading" class="picker-loading">
        <div class="spinner" />
        Yuklanmoqda...
      </div>

      <!-- Product list -->
      <div v-else-if="products.length" class="picker-list">
        <button
          v-for="product in products"
          :key="product.id"
          class="picker-item"
          :class="{ selected: selectedId === product.id }"
          @click="selectedId = product.id"
        >
          <div
            class="picker-color-dot"
            :style="{ background: product.branding?.primary_color ?? '#3B6FF5' }"
          />
          <div class="picker-item-text">
            <span class="picker-item-name">{{ product.branding?.display_name ?? product.name }}</span>
            <span class="picker-item-slug">{{ product.slug }}</span>
          </div>
          <svg v-if="selectedId === product.id" class="picker-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B6FF5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>

      <div v-else class="picker-empty">Hech qanday product topilmadi</div>

      <button
        class="picker-btn"
        :disabled="!selectedId || confirming"
        @click="confirm"
      >
        <span v-if="confirming" class="spinner-sm" />
        {{ confirming ? 'Kirilmoqda...' : 'Davom etish' }}
      </button>

      <button class="picker-logout" @click="logout">Chiqish</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useProductStore } from '@/stores/product';
import { useAuthStore } from '@/stores/auth';
import { usePresenceStore } from '@/stores/presence';

const router = useRouter();
const productStore = useProductStore();
const auth = useAuthStore();
const presence = usePresenceStore();

const products = ref(productStore.products);
const loading = ref(false);
const confirming = ref(false);
const selectedId = ref<string | null>(productStore.selectedProductId);

onMounted(async () => {
  loading.value = true;
  await productStore.loadProducts();
  // Show only active products in picker
  products.value = productStore.products.filter((p) => p.isActive);

  // Auto-select if only one product
  if (products.value.length === 1 && !selectedId.value) {
    selectedId.value = products.value[0].id;
  }
  loading.value = false;
});

async function confirm() {
  if (!selectedId.value) return;
  confirming.value = true;
  try {
    await productStore.selectProduct(selectedId.value);
    // Now set status available (delayed until product is picked)
    await presence.setStatus('available').catch((e) => {
      console.error('[product-picker] setStatus failed:', e?.response?.data ?? e?.message ?? e);
    });
    router.push('/chat');
  } finally {
    confirming.value = false;
  }
}

async function logout() {
  await auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.picker-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-bg);
  padding: 20px;
}

.picker-card {
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: 20px;
  padding: 36px 32px;
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.picker-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
}

.picker-logo-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--c-text);
}

.picker-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--c-text);
  margin: 0 0 6px;
}

.picker-subtitle {
  font-size: 14px;
  color: var(--c-text-2);
  margin: 0 0 24px;
}

.picker-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--c-text-2);
  font-size: 14px;
  padding: 16px 0;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1.5px solid var(--c-border);
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
  width: 100%;
}

.picker-item:hover {
  border-color: var(--c-accent);
  background: var(--c-accent-bg);
}

.picker-item.selected {
  border-color: var(--c-accent);
  background: var(--c-accent-bg);
}

.picker-color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.picker-item-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.picker-item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
}

.picker-item-slug {
  font-size: 11px;
  color: var(--c-text-2);
}

.picker-check { flex-shrink: 0; }

.picker-empty {
  font-size: 14px;
  color: var(--c-text-2);
  text-align: center;
  padding: 24px;
  margin-bottom: 16px;
}

.picker-btn {
  width: 100%;
  padding: 13px;
  background: var(--c-accent);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}

.picker-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.picker-btn:not(:disabled):hover { opacity: 0.9; }

.picker-logout {
  background: transparent;
  border: none;
  color: var(--c-text-2);
  font-size: 13px;
  cursor: pointer;
  text-align: center;
  width: 100%;
  padding: 4px;
  transition: color 0.15s;
}

.picker-logout:hover { color: var(--c-red); }

.spinner {
  width: 16px; height: 16px;
  border: 2px solid var(--c-border);
  border-top-color: var(--c-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.spinner-sm {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>
