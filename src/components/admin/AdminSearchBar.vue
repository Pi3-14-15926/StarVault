<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    height?: number
    showClear?: boolean
    width?: string
  }>(),
  { height: 48, showClear: true, width: 'auto' },
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()
</script>

<template>
  <div class="admin-search-bar" :style="{ height: `${height}px`, width }">
    <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z" />
    </svg>
    <input
      :value="modelValue"
      :placeholder="placeholder"
      class="search-input"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button v-if="showClear && modelValue" class="search-clear" @click="emit('update:modelValue', '')" aria-label="清空">×</button>
  </div>
</template>

<style scoped>
.admin-search-bar {
  position: relative;
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--radius-full);
  box-shadow: var(--admin-shadow-card);
  display: flex;
  align-items: center;
  padding: 0 18px;
  gap: 10px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.admin-search-bar:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4px var(--color-primary-soft);
}
.search-icon { color: var(--text-tertiary); flex-shrink: 0; }
.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.92rem;
  color: var(--text-main);
  height: 100%;
  min-width: 0;
}
.search-input::placeholder { color: var(--text-tertiary); }
.search-clear {
  width: 22px; height: 22px;
  border: none;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.search-clear:hover { background: var(--color-primary-soft); color: var(--color-primary); }
</style>
