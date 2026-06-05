import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { isAuthenticated } from '../utils/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
  },
  {
    path: '/software/:slug',
    name: 'ProjectDetail',
    component: () => import('../views/ProjectDetail.vue'),
  },
  {
    path: '/category/:slug',
    name: 'Category',
    component: () => import('../views/Category.vue'),
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('../views/Search.vue'),
  },
  {
    path: '/ranking',
    name: 'Ranking',
    component: () => import('../views/Ranking.vue'),
  },
  {
    path: '/admin',
    name: 'AdminLogin',
    component: () => import('../views/admin/Login.vue'),
  },
  {
    path: '/admin/dashboard',
    name: 'AdminDashboard',
    component: () => import('../views/admin/Dashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/projects',
    name: 'AdminProjects',
    component: () => import('../views/admin/ProjectList.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/projects/new',
    name: 'AdminProjectNew',
    component: () => import('../views/admin/ProjectForm.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/projects/:id/edit',
    name: 'AdminProjectEdit',
    component: () => import('../views/admin/ProjectForm.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/projects/:id/versions',
    name: 'AdminVersions',
    component: () => import('../views/admin/VersionList.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/categories',
    name: 'AdminCategories',
    component: () => import('../views/admin/CategoryList.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/categories/:id/projects',
    name: 'AdminCategoryProjects',
    component: () => import('../views/admin/ProjectList.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/backup',
    name: 'AdminBackup',
    component: () => import('../views/admin/BackupManager.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/backup-data',
    name: 'AdminImportExport',
    component: () => import('../views/admin/ImportExport.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/settings',
    name: 'AdminSettings',
    component: () => import('../views/admin/SettingsForm.vue'),
    meta: { requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior() { return { top: 0 } },
})

/* 路由守卫：保护后台路由 */
router.beforeEach((to, _from, next) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    next({ name: 'AdminLogin' })
  } else {
    next()
  }
})

export default router
