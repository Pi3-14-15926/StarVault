<script setup lang="ts">
/* 背景装饰浮动光球 — HyperOS 风格柔和渐变 */
</script>

<template>
  <div class="ambient" aria-hidden="true">
    <span class="orb orb-1"></span>
    <span class="orb orb-2"></span>
    <span class="orb orb-3"></span>
  </div>
</template>

<style scoped>
.ambient {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.55;
  animation: float 18s ease-in-out infinite;
  will-change: transform;
}
.orb-1 {
  width: 480px;
  height: 480px;
  top: -120px;
  left: -100px;
  background: radial-gradient(circle, rgba(52, 120, 246, 0.35) 0%, transparent 70%);
}
.orb-2 {
  width: 520px;
  height: 520px;
  top: 20%;
  right: -180px;
  background: radial-gradient(circle, rgba(140, 108, 255, 0.35) 0%, transparent 70%);
  animation-delay: 2s;
}
.orb-3 {
  width: 460px;
  height: 460px;
  bottom: -200px;
  left: 25%;
  background: radial-gradient(circle, rgba(79, 193, 255, 0.3) 0%, transparent 70%);
  animation-delay: 4s;
}
@keyframes float {
  0%, 100% { transform: translateY(0) translateX(0) scale(1); }
  50%      { transform: translateY(40px) translateX(-30px) scale(1.08); }
}
</style>
