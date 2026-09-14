<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Settings2 } from 'lucide-vue-next'
import { PANEL_MODULES } from '@renderer/modules/panel/tabs'
import WindowTitleBar from '@renderer/modules/panel/components/WindowTitleBar.vue'
import ClipboardPage from '@renderer/pages/ClipboardPage.vue'
import QuickFoldersPage from '@renderer/pages/QuickFoldersPage.vue'
import ProjectsPage from '@renderer/pages/ProjectsPage.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
} from '@renderer/components/ui/sidebar'

/** 面板内宽达到该值时自动展开侧栏（默认 880 仍为图标模式） */
const SIDEBAR_EXPAND_BREAKPOINT = 980

/** 功能面板：通栏表头 + shadcn Sidebar + 内容区 */
const activeModule = ref(PANEL_MODULES[0]!.id)
/** 首次进入后再挂载，之后用 v-show 保留 webview */
const projectsMounted = ref(false)

/** 窗口宽度自动推导；null 表示跟随自动，非 null 为手动覆盖 */
const manualOpen = ref<boolean | null>(null)
const autoOpen = ref(false)

const sidebarOpen = computed(() =>
  manualOpen.value !== null ? manualOpen.value : autoOpen.value
)

const showClipboard = computed(() => activeModule.value === 'clipboard')
const showQuickFolders = computed(() => activeModule.value === 'quickFolders')
const showProjects = computed(() => activeModule.value === 'projects')

watch(activeModule, (id) => {
  if (id === 'projects') projectsMounted.value = true
})

let offPanelShown: (() => void) | null = null

/** 按当前窗宽更新自动展开；穿越断点时清掉手动覆盖 */
function syncAutoSidebar(): void {
  const next = window.innerWidth >= SIDEBAR_EXPAND_BREAKPOINT
  if (next !== autoOpen.value) {
    autoOpen.value = next
    manualOpen.value = null
  } else {
    autoOpen.value = next
  }
}

function onWindowResize(): void {
  syncAutoSidebar()
}

/** SidebarProvider 的受控更新（含 SidebarTrigger / ⌘B） */
function onSidebarOpenChange(open: boolean): void {
  manualOpen.value = open
}

onMounted(() => {
  document.title = '功能面板'
  syncAutoSidebar()
  window.addEventListener('resize', onWindowResize)
  // 唤醒/show 后去掉自动聚焦，避免第一个按钮残留「选中」外观
  offPanelShown = window.api.onPanelShown(() => {
    requestAnimationFrame(() => {
      const el = document.activeElement
      if (el instanceof HTMLElement && el !== document.body) el.blur()
    })
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  offPanelShown?.()
  offPanelShown = null
})

function openSettings(): void {
  window.api.openSettings()
}
</script>

<template>
  <div class="panel">
    <WindowTitleBar />

    <SidebarProvider
      :open="sidebarOpen"
      class="panel-main"
      @update:open="onSidebarOpenChange"
    >
      <Sidebar collapsible="icon" class="border-sidebar-border">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem v-for="mod in PANEL_MODULES" :key="mod.id">
                  <SidebarMenuButton
                    :is-active="activeModule === mod.id"
                    :tooltip="mod.label"
                    :aria-label="mod.label"
                    @click="activeModule = mod.id"
                  >
                    <component :is="mod.icon" />
                    <span>{{ mod.label }}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarTrigger class="size-8" />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="设置" aria-label="打开设置" @click="openSettings">
                <Settings2 />
                <span>设置</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset class="panel-body min-h-0 overflow-hidden bg-transparent">
        <ClipboardPage v-if="showClipboard" />
        <QuickFoldersPage v-else-if="showQuickFolders" />
        <ProjectsPage v-if="projectsMounted" v-show="showProjects" />
      </SidebarInset>
    </SidebarProvider>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  height: 100vh;
  flex-direction: column;
  overflow: hidden;
}

.panel-main {
  min-height: 0;
  flex: 1;
}

.panel-body {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.panel-body > * {
  position: absolute;
  inset: 0;
  min-height: 0;
}
</style>
