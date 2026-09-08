<script setup lang="ts">
import type { ClearPreviewCacheOptions } from '@shared/types'
import { ref } from 'vue'
import { Button } from '@renderer/components/ui/button'
import ClearPreviewDataDialog from '@renderer/modules/projects/components/ClearPreviewDataDialog.vue'

/** 设置「项目」：整分区清除预览浏览数据（不按地址） */
const clearOpen = ref(false)
const clearing = ref(false)

function openClear(): void {
  if (clearing.value) return
  clearOpen.value = true
}

async function confirmClear(options: ClearPreviewCacheOptions): Promise<void> {
  if (clearing.value) return
  clearOpen.value = false
  clearing.value = true
  try {
    await window.api.clearPreviewCache({ ...options, all: true })
  } catch {
    // ignore
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        预览浏览数据
      </h3>
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">清除全部预览缓存</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            清空项目预览分区中所有网站的缓存、Cookie、本地存储等（不按地址过滤）
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          class="shrink-0"
          :disabled="clearing"
          @click="openClear"
        >
          {{ clearing ? '清除中…' : '清除全部' }}
        </Button>
      </div>
    </section>

    <ClearPreviewDataDialog
      mode="all"
      :open="clearOpen"
      :busy="clearing"
      @update:open="(v) => (clearOpen = v)"
      @confirm="confirmClear"
    />
  </div>
</template>
