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
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f0f2f5;
  color: #1a1a1a;
}

#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>
