import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/views/MainLayout.vue'),
      children: [
        {
          path: '',
          redirect: '/chat',
        },
        {
          path: 'chat',
          name: 'chat',
          component: () => import('@/views/ChatView.vue'),
        },
        {
          path: 'chat/:roomId',
          name: 'chat-room',
          component: () => import('@/views/ChatView.vue'),
        },
        {
          path: 'calls',
          name: 'calls',
          component: () => import('@/views/CallHistoryView.vue'),
        },
        {
          path: 'admin',
          redirect: '/admin/users',
          meta: { adminOnly: true },
        },
        {
          path: 'admin/users',
          name: 'admin-users',
          component: () => import('@/views/admin/AdminUsersView.vue'),
          meta: { adminOnly: true },
        },
        {
          path: 'admin/users/:id',
          name: 'admin-user-detail',
          component: () => import('@/views/admin/AdminUserDetailView.vue'),
          meta: { adminOnly: true },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.token) {
    return { name: 'login' };
  }
  if (to.name === 'login' && auth.token) {
    return auth.isAdmin ? { name: 'admin-users' } : { name: 'chat' };
  }
  if (to.meta.adminOnly) {
    if (!auth.user) await auth.loadMe().catch((e) => {
      console.error('[router] loadMe() failed in admin guard:', e?.message ?? e);
    });
    if (!auth.isAdmin) return { name: 'chat' };
  }
});
