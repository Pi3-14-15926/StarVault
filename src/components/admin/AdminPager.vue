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
  <div v-if="totalPages > 1" class="pagination">
    <span class="page-info">共 {{ totalPages }} 页</span>
    <div class="page-btns">
      <button class="page-btn" :disabled="page === 1" @click="jump(page - 1)">‹</button>
      <template v-for="(n, i) in pageNumbers" :key="i">
        <span v-if="i > 0 && n - pageNumbers[i - 1] > 1" class="page-ellipsis">…</span>
        <button :class="['page-btn', { active: n === page }]" @click="jump(n)">{{ n }}</button>
      </template>
      <button class="page-btn" :disabled="page === totalPages" @click="jump(page + 1)">›</button>
    </div>
  </div>
</template>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 20px;
}
.page-info {
  font-size: 0.82rem;
  color: var(--text-tertiary);
  margin-right: 6px;
  font-family: var(--font-mono);
}
.page-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  background: var(--color-card);
  color: var(--text-sec);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.page-btn:hover:not(:disabled) {
  background: var(--color-card-soft);
  color: var(--text-main);
  border-color: var(--border-color);
}
.page-btn.active {
  background: var(--gradient-primary);
  color: white;
  border-color: transparent;
  box-shadow: var(--shadow-primary);
  font-weight: 600;
}
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-ellipsis {
  min-width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 0.9rem;
  cursor: default;
}

@media (max-width: 768px) {
  .pagination { justify-content: flex-start; }
  .page-btns { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
  .page-btn { min-width: 28px; height: 28px; font-size: 0.78rem; padding: 0 6px; }
}
</style>
