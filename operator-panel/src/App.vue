<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useCentrifugeStore } from '@/stores/centrifuge';

const auth = useAuthStore();
const centrifuge = useCentrifugeStore();

onMounted(async () => {
  if (auth.token) {
    await centrifuge.connect();
  }
});
</script>

<style>
/* ─── Design Tokens ─────────────────────────────────────────────────── */
:root {
  /* Colors */
  --c-bg:            #FFFFFF;
  --c-surface:       #F7F8FA;
  --c-border:        #EAEDF0;
  --c-accent:        #5B9BF5;
  --c-accent-end:    #6BA4F4;
  --c-accent-bg:     #EAF2FE;
  --c-bubble-op:     #E8F0FD;
  --c-bubble-cu:     #F0F1F3;
  --c-text:          #1A1A1A;
  --c-text-2:        #8E939B;
  --c-text-3:        #B0B6BF;
  --c-online:        #34C759;
  --c-busy:          #FF9500;
  --c-away:          #FFCC00;
  --c-offline:       #8E939B;
  --c-green:         #34C759;
  --c-red:           #FF3B30;
  --c-chip:          #F3EEFB;
  --c-chip-text:     #7C4DFF;

  /* Gradient */
  --gradient-btn:    linear-gradient(135deg, #5B9BF5 0%, #6BA4F4 100%);
  --gradient-login:  linear-gradient(160deg, #EFF5FF 0%, #E9EEFF 55%, #EDE8FF 100%);

  /* Shadows */
  --shadow-sm:       0 1px 3px rgba(0,0,0,0.06);
  --shadow-md:       0 4px 16px rgba(0,0,0,0.08);
  --shadow-lg:       0 8px 32px rgba(0,0,0,0.12);

  /* Radius */
  --r-xs: 6px;
  --r-sm: 8px;
  --r-md: 12px;
  --r-lg: 16px;
  --r-xl: 20px;
  --r-full: 9999px;

  /* Typography */
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Spacing */
  --nav-w: 68px;
  --inbox-w: 360px;
}

/* ─── Reset ─────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font);
  background: var(--c-bg);
  color: var(--c-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app { height: 100vh; display: flex; flex-direction: column; }

button { font-family: var(--font); cursor: pointer; }
input, textarea { font-family: var(--font); }

/* ─── Scrollbar ─────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: var(--r-full); }
::-webkit-scrollbar-thumb:hover { background: var(--c-text-3); }
</style>
