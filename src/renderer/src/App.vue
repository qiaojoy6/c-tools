<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isPanelShell = computed(() => route.name === 'clipboard')
</script>

<template>
  <div
    :class="
      isPanelShell
        ? 'h-screen overflow-hidden rounded-2xl border border-border/60 bg-background/95 text-foreground shadow-2xl backdrop-blur-xl'
        : 'h-screen overflow-hidden bg-background text-foreground'
    "
  >
    <router-view />
  </div>
</template>
