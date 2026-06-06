<script setup lang="ts">
import { computed } from 'vue'

export interface SortOption {
  key: string
  label: string
  icon?: string
  defaultOrder?: 'asc' | 'desc'
}

const props = withDefaults(
  defineProps<{
    sortKey: string
    sortOrder: 'asc' | 'desc'
    options: SortOption[]
    height?: number
  }>(),
  { height: 48 },
)
const emit = defineEmits<{
  (e: 'update', payload: { key: string; order: 'asc' | 'desc' }): void
}>()

function setSort(key: string) {
  const opt = props.options.find((o) => o.key === key)
  const defaultOrder = opt?.defaultOrder || 'asc'
  if (props.sortKey === key) {
    emit('update', { key, order: props.sortOrder === 'asc' ? 'desc' : 'asc' })
  } else {
    emit('update', { key, order: defaultOrder })
  }
}

function arrowFor(key: string): string {
  if (props.sortKey === key) return props.sortOrder === 'desc' ? '↓' : '↑'
  const opt = props.options.find((o) => o.key === key)
  return (opt?.defaultOrder || 'asc') === 'asc' ? '↑' : '↓'
}
</script>

<template>
  <div class="admin-sort-group">
    <button
      v-for="opt in options"
      :key="opt.key"
      :class="['sort-btn', { active: sortKey === opt.key }]"
      :style="{ height: `${height}px` }"
      :title="`按${opt.label}排序`"
      type="button"
      @click="setSort(opt.key)"
    >
      <span v-if="opt.icon" class="sort-icon" v-html="opt.icon" />
      <span>{{ opt.label }}</span>
      <span class="sort-arrow">{{ arrowFor(opt.key) }}</span>
    </button>
  </div>
</template>

<style scoped>
.admin-sort-group { display: flex; gap: 6px; }
.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background: var(--admin-card);
  color: var(--text-sec);
  border: 1px solid var(--admin-border);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  box-shadow: var(--admin-shadow-card);
}
.sort-btn:hover { background: var(--color-primary-soft); color: var(--color-primary); border-color: var(--color-primary-soft); }
.sort-btn.active { background: var(--color-primary-soft); color: var(--color-primary); border-color: var(--color-primary); }
.sort-icon { display: inline-flex; align-items: center; font-size: 0.95rem; line-height: 1; }
.sort-icon :deep(svg) { display: block; }
.sort-arrow { font-size: 0.95rem; line-height: 1; opacity: 0.55; font-weight: 700; }
.sort-btn.active .sort-arrow { opacity: 1; }

@media (max-width: 768px) {
  .admin-sort-group { width: 100%; }
  .sort-btn { flex: 1; justify-content: center; height: 40px; }
}
</style>
