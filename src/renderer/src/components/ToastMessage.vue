<script setup lang="ts">
defineProps<{
  /** 空字符串时不展示 */
  message: string
}>()
</script>

<template>
  <Transition name="toast">
    <div v-if="message" class="toast-wrap" role="status">
      <div class="toast">{{ message }}</div>
    </div>
  </Transition>
</template>

<style scoped>
.toast-wrap {
  pointer-events: none;
  position: fixed;
  inset-inline: 0;
  top: 16px;
  z-index: 50;
  display: flex;
  justify-content: center;
}

.toast {
  border-radius: 999px;
  background: var(--primary);
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-foreground);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 20%);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
