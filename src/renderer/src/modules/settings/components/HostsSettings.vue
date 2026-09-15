<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@renderer/components/ui/button'
import SettingsSectionTitle from './SettingsSectionTitle.vue'

/** 设置「Hosts」：从系统移除全部 c-tools 段 */
const busy = ref(false)
const message = ref('')

async function removeAll(): Promise<void> {
  if (busy.value) return
  if (!confirm('从系统 hosts 移除全部 c-tools 标记段，并将所有方案开关关闭？需要管理员授权。')) {
    return
  }
  busy.value = true
  message.value = ''
  try {
    const res = await window.api.hosts.removeAllFromSystem()
    message.value = res.ok ? '已从系统移除全部 c-tools 段' : res.error
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3">
      <SettingsSectionTitle title="系统清理" />
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">从系统移除全部 c-tools 段</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            不删除本地方案；仅清掉系统 hosts 里的标记块，并关闭所有方案开关
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          class="shrink-0"
          :disabled="busy"
          @click="removeAll"
        >
          移除全部
        </Button>
      </div>
    </section>

    <p v-if="message" class="text-xs text-muted-foreground">{{ message }}</p>
  </div>
</template>
