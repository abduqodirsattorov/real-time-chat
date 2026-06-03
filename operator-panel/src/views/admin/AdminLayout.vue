<template>
  <div class="admin-shell">
    <!-- Left sub-nav -->
    <nav class="admin-subnav">
      <div class="subnav-title">{{ t('admin.title') }}</div>
      <router-link to="/admin/users" class="subnav-item" :class="{ active: $route.path.startsWith('/admin/users') }">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        {{ t('admin.users') }}
      </router-link>
      <router-link to="/admin/products" class="subnav-item" :class="{ active: $route.path.startsWith('/admin/products') }">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        {{ t('admin.products') }}
      </router-link>
    </nav>

    <!-- Right content -->
    <div class="admin-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<style scoped>
.admin-shell {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.admin-subnav {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--c-border);
  background: var(--c-bg);
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.subnav-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  padding: 0 16px 12px;
}

.subnav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--c-text-2);
  text-decoration: none;
  border-radius: 0;
  transition: background 0.12s, color 0.12s;
  margin: 0 8px;
  border-radius: var(--r-sm);
}

.subnav-item:hover {
  background: var(--c-surface);
  color: var(--c-text);
}

.subnav-item.active {
  background: var(--c-accent-bg);
  color: var(--c-accent);
  font-weight: 600;
}

.admin-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
