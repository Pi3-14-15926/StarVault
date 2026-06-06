<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  page: number
  totalPages: number
  total: number
  itemName?: string
}>()
const emit = defineEmits<{
  (e: 'update:page', p: number): void
}>()

const pageNumbers = computed(() => {
  const total = props.totalPages
  const cur = props.page
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>([1, total, cur, cur - 1, cur + 1])
  return [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
})

function jump(p: number) {
  if (p < 1 || p > props.totalPages) return
  emit('update:page', p)
}
</script>

<template>
  <nav v-if="totalPages > 1" class="admin-pager">
    <button class="pg-btn" :disabled="page === 1" @click="jump(page - 1)">‹</button>
    <template v-for="(n, i) in pageNumbers" :key="i">
      <span v-if="i > 0 && n - pageNumbers[i - 1] > 1" class="pg-ellipsis">…</span>
      <button :class="['pg-btn', { active: n === page }]" @click="jump(n)">{{ n }}</button>
    </template>
    <button class="pg-btn" :disabled="page === totalPages" @click="jump(page + 1)">›</button>
    <span class="pg-info">第 {{ page }} / {{ totalPages }} 页 · 共 {{ total }} {{ itemName || '' }}</span>
  </nav>
</template>

<style scoped>
.admin-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0 4px;
  flex-shrink: 0;
}
.pg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  background: var(--admin-card);
  color: var(--text-sec);
  border: 1px solid var(--admin-border);
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, transform 0.18s, border-color 0.18s;
  font-variant-numeric: tabular-nums;
}
.pg-btn:hover:not(:disabled) {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-color: var(--color-primary-soft);
  transform: scale(1.05);
}
.pg-btn.active {
  background: var(--admin-gradient);
  color: #FFFFFF;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(79, 140, 255, 0.28);
}
.pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pg-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 36px;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}
.pg-info {
  margin-left: 12px;
  font-size: 0.78rem;
  color: var(--text-tertiary);
}

@media (max-width: 768px) {
  .admin-pager { gap: 4px; }
  .pg-info { width: 100%; text-align: center; margin-left: 0; margin-top: 4px; }
}
</style>
