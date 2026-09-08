<script setup lang="ts">
import type { DrawerTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { DrawerTitle } from 'reka-ui'
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'

const props = defineProps<DrawerTitleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <DrawerTitle
    data-slot="drawer-title"
    v-bind="delegatedProps"
    :class="cn('text-lg leading-none font-semibold tracking-tight text-foreground', props.class)"
  >
    <slot />
  </DrawerTitle>
</template>
