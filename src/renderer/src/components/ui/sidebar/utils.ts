import type { ComputedRef, Ref } from "vue"
import { createContext } from "reka-ui"

export const SIDEBAR_COOKIE_NAME = "sidebar_state"
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
/** 功能面板展开轨宽度（约 148px） */
export const SIDEBAR_WIDTH = "9.25rem"
export const SIDEBAR_WIDTH_MOBILE = "18rem"
/** 功能面板收起为图标轨宽度（约 55px） */
export const SIDEBAR_WIDTH_ICON = "3.4375rem"
export const SIDEBAR_KEYBOARD_SHORTCUT = "b"

export const [useSidebar, provideSidebarContext] = createContext<{
  state: ComputedRef<"expanded" | "collapsed">
  open: Ref<boolean>
  setOpen: (value: boolean) => void
  isMobile: Ref<boolean>
  openMobile: Ref<boolean>
  setOpenMobile: (value: boolean) => void
  toggleSidebar: () => void
}>("Sidebar")
