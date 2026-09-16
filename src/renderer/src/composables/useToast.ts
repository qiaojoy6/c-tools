import { onUnmounted, ref, type Ref } from 'vue'

/**
 * 顶部轻提示：show 后自动消失；卸载时清定时器。
 */
export function useToast(durationMs = 1800): {
  message: Ref<string>
  showToast: (text: string) => void
} {
  const message = ref('')
  let timer: ReturnType<typeof setTimeout> | null = null

  function showToast(text: string): void {
    message.value = text
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      message.value = ''
      timer = null
    }, durationMs)
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
  })

  return { message, showToast }
}
