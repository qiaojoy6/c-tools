<script setup lang="ts">
/** 浮层列表底栏快捷键提示 */
export interface ListFooterHint {
  kbd: string
  label: string
}

withDefaults(
  defineProps<{
    /** 左侧条数 */
    count: number
    /** 已选条数（>0 时追加「已选 N」） */
    selectedCount?: number
    /** 单位文案，默认「条」 */
    countUnit?: string
    /** 右侧快捷键说明 */
    hints: ListFooterHint[]
  }>(),
  {
    selectedCount: 0,
    countUnit: '条'
  }
)
</script>

<template>
  <footer class="footer">
    <span class="count">
      {{ count }} {{ countUnit }}
      <template v-if="selectedCount > 0">
        · <span class="count-selected">已选 {{ selectedCount }}</span>
      </template>
    </span>
    <div class="hints">
      <span v-for="(h, i) in hints" :key="i" class="hint">
        <kbd class="kbd">{{ h.kbd }}</kbd> {{ h.label }}
      </span>
    </div>
    <div v-if="$slots.actions" class="footer-actions app-no-drag">
      <slot name="actions" />
    </div>
  </footer>
</template>

<style scoped>
.footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
  border-top: 1px solid color-mix(in oklab, var(--border) 40%, transparent);
  padding: 10px 16px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.count {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.count-selected {
  color: var(--primary);
}

.hints {
  margin-left: auto;
  display: none;
  align-items: center;
  gap: 8px;
  opacity: 0.6;
}

@media (min-width: 500px) {
  .hints {
    display: flex;
  }
}

.hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.kbd {
  display: inline-flex;
  height: 20px;
  min-width: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  background: color-mix(in oklab, var(--muted) 50%, transparent);
  padding: 0 4px;
  font-family: inherit;
  font-size: 10px;
  color: var(--muted-foreground);
}

.footer-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}
</style>
