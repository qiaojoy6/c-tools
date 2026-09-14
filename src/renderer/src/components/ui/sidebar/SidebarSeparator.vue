<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@renderer/lib/utils"
import { Separator } from "@renderer/components/ui/separator"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <Separator
    data-sidebar="separator"
    :class="cn('mx-2 w-auto bg-sidebar-border', props.class)"
  >
    <slot />
  </Separator>
</template>
