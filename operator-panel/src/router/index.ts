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
      path: '/product-picker',
      name: 'product-picker',
      component: () => import('@/views/ProductPickerView.vue'),
      meta: { requiresAuth: true },
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
          component: () => import('@/views/admin/AdminLayout.vue'),
          meta: { adminOnly: true },
          children: [
            { path: '', redirect: '/admin/users' },
            {
              path: 'users',
              name: 'admin-users',
              component: () => import('@/views/admin/AdminUsersView.vue'),
            },
            {
              path: 'users/:id',
              name: 'admin-user-detail',
              component: () => import('@/views/admin/AdminUserDetailView.vue'),
            },
            {
              path: 'products',
              name: 'admin-products',
              component: () => import('@/views/admin/AdminProductsView.vue'),
            },
          ],
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

  // Unauthenticated → login
  if (!to.meta.public && !auth.token) {
    return { name: 'login' };
  }

  // Already logged in → don't go back to login
  if (to.name === 'login' && auth.token) {
    const hasProduct = !!localStorage.getItem('selected_product_id');
    if (!hasProduct) return { name: 'product-picker' };
    return auth.isAdmin ? { name: 'admin-users' } : { name: 'chat' };
  }

  // Authenticated but no product selected → product picker
  // (skip for login, product-picker itself)
  if (auth.token && to.name !== 'product-picker' && !to.meta.public) {
    const hasProduct = !!localStorage.getItem('selected_product_id');
    if (!hasProduct) return { name: 'product-picker' };
  }

  if (to.meta.adminOnly) {
    if (!auth.user) await auth.loadMe().catch((e) => {
      console.error('[router] loadMe() failed in admin guard:', e?.message ?? e);
    });
    if (!auth.isAdmin) return { name: 'chat' };
  }
});
