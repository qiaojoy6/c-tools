<script setup lang="ts">
/**
 * 项目图标：有 data URL 则显示图；否则用名称首字占位
 */
defineProps<{
  iconUrl?: string | null
  name: string
  size?: number
}>()
</script>

<template>
  <img
    v-if="iconUrl"
    class="project-icon"
    :src="iconUrl"
    alt=""
    draggable="false"
    :style="{ width: `${size ?? 14}px`, height: `${size ?? 14}px` }"
  />
  <span
    v-else
    class="project-icon-fallback"
    aria-hidden="true"
    :style="{ width: `${size ?? 14}px`, height: `${size ?? 14}px`, fontSize: `${Math.max(9, (size ?? 14) - 4)}px` }"
  >
    {{ (name.trim().charAt(0) || '?').toUpperCase() }}
  </span>
</template>

<style scoped>
.project-icon {
  flex-shrink: 0;
  border-radius: 3px;
  object-fit: contain;
}

.project-icon-fallback {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background: color-mix(in oklab, var(--foreground) 12%, transparent);
  color: var(--muted-foreground);
  font-weight: 600;
  line-height: 1;
  user-select: none;
}
</style>
