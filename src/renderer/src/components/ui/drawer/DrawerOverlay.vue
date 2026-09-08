<script setup lang="ts">
import type { DrawerOverlayProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { DrawerOverlay } from 'reka-ui'
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'

const props = defineProps<DrawerOverlayProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <DrawerOverlay
    data-slot="drawer-overlay"
    v-bind="delegatedProps"
    :class="
      cn(
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        props.class
      )
    "
  />
</template>
