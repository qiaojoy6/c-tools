<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
  SelectViewport
} from 'reka-ui'
import { Check, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

export interface SelectOption {
  label: string
  value: string | number
}

const props = withDefaults(
  defineProps<{
    options: SelectOption[]
    placeholder?: string
    triggerClass?: HTMLAttributes['class']
    contentClass?: HTMLAttributes['class']
  }>(),
  {
    placeholder: '请选择'
  }
)

const model = defineModel<string | number>()
</script>

<template>
  <SelectRoot v-model="model">
    <SelectTrigger
      :class="
        cn(
          'flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1',
          props.triggerClass
        )
      "
    >
      <SelectValue :placeholder="placeholder" />
      <ChevronDown class="size-4 shrink-0 opacity-50" />
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        :class="
          cn(
            'relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            props.contentClass
          )
        "
      >
        <SelectScrollUpButton class="flex h-6 items-center justify-center">
          <ChevronUp class="size-4" />
        </SelectScrollUpButton>

        <SelectViewport class="p-1">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="relative flex w-full cursor-pointer items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:font-medium"
          >
            <span class="absolute right-2 flex size-3.5 items-center justify-center">
              <SelectItemIndicator>
                <Check class="size-4 text-primary" />
              </SelectItemIndicator>
            </span>
            <SelectItemText>{{ option.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>

        <SelectScrollDownButton class="flex h-6 items-center justify-center">
          <ChevronDown class="size-4" />
        </SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
