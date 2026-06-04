import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

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
    path: '/admin',
    name: 'AdminLogin',
    component: () => import('../views/admin/Login.vue'),
  },
  {
    path: '/admin/dashboard',
    name: 'AdminDashboard',
    component: () => import('../views/admin/Dashboard.vue'),
  },
  {
    path: '/admin/projects',
    name: 'AdminProjects',
    component: () => import('../views/admin/ProjectList.vue'),
  },
  {
    path: '/admin/projects/new',
    name: 'AdminProjectNew',
    component: () => import('../views/admin/ProjectForm.vue'),
  },
  {
    path: '/admin/projects/:id/edit',
    name: 'AdminProjectEdit',
    component: () => import('../views/admin/ProjectForm.vue'),
  },
  {
    path: '/admin/projects/:id/versions',
    name: 'AdminVersions',
    component: () => import('../views/admin/VersionList.vue'),
  },
  {
    path: '/admin/categories',
    name: 'AdminCategories',
    component: () => import('../views/admin/CategoryList.vue'),
  },
  {
    path: '/admin/categories/:id/projects',
    name: 'AdminCategoryProjects',
    component: () => import('../views/admin/ProjectList.vue'),
  },
  {
    path: '/admin/backup',
    name: 'AdminBackup',
    component: () => import('../views/admin/BackupManager.vue'),
  },
  {
    path: '/admin/backup-data',
    name: 'AdminImportExport',
    component: () => import('../views/admin/ImportExport.vue'),
  },
  {
    path: '/admin/settings',
    name: 'AdminSettings',
    component: () => import('../views/admin/SettingsForm.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 } },
})

export default router
