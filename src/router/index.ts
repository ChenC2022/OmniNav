import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'Home', component: () => import('@/views/Home.vue'), meta: { title: '首页', requiresAuth: true } },
  { path: '/settings', name: 'Settings', component: () => import('@/views/Settings.vue'), meta: { title: '设置', requiresAuth: true } },
  { path: '/login', name: 'Login', component: () => import('@/views/Login.vue'), meta: { title: '登录' } },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to, _from, next) => {
  if (to.meta.requiresAuth) {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (res.status === 401) {
        const redirect = to.path || '/'
        next({ path: '/login', query: { redirect } })
        return
      }
    } catch {
      next({ path: '/login', query: { redirect: to.path || '/' } })
      return
    }
  }
  next()
})

export default router
