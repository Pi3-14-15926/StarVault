<script setup lang="ts">
import { useSettingStore } from '../store/settings'
const settings = useSettingStore()
</script>

<template>
  <footer class="site-footer">
    <div class="footer-inner">
      <p class="footer-text">{{ settings.settings.footer || 'Powered by Software Hub' }}</p>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  text-align: center;
  padding: 32px 20px;
  color: var(--text-sec);
  font-size: 0.85rem;
  position: relative;
  z-index: 1;
}
.footer-inner { max-width: 1180px; margin: 0 auto; }
.footer-text { margin: 0 0 4px; font-weight: 500; color: var(--text-sec); }
.footer-note { font-size: 0.78rem; opacity: 0.7; margin: 4px 0; }
.footer-copy { font-size: 0.78rem; color: var(--text-tertiary); margin: 8px 0 0; }
</style>
