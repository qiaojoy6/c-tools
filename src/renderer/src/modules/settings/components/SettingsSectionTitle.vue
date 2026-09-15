<script setup lang="ts">
/**
 * 设置页分组标题：左侧强调条 + 清晰字重，替代原先过灰的 uppercase 小标签。
 */
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="settings-section-title">
    <div class="flex items-center gap-2.5">
      <span class="section-accent" aria-hidden="true" />
      <h3 class="text-[13px] font-semibold leading-none tracking-tight text-foreground">
        {{ title }}
      </h3>
    </div>
    <p
      v-if="description || $slots.default"
      class="mt-1.5 pl-[14px] text-xs leading-relaxed text-muted-foreground"
    >
      <slot>{{ description }}</slot>
    </p>
  </div>
</template>

<style scoped>
.section-accent {
  width: 3px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary) 78%, var(--foreground));
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--primary) 18%, transparent);
}
</style>
