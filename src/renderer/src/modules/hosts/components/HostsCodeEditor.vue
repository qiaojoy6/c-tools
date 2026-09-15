<script setup lang="ts">
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hostsLanguage } from '../codemirror/hostsLanguage'
import { editorThemeExtensions } from '../codemirror/theme'

const props = defineProps<{
  modelValue: string
  /** 切换方案时强制同步编辑器内容 */
  schemeId: string
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: []
}>()

const root = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null
const themeCompartment = new Compartment()
const readOnlyCompartment = new Compartment()
let applyingExternal = false
let themeObserver: MutationObserver | null = null

function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

function applyTheme(): void {
  if (!view) return
  view.dispatch({
    effects: themeCompartment.reconfigure(editorThemeExtensions(isDark()))
  })
}

onMounted(() => {
  if (!root.value) return

  view = new EditorView({
    parent: root.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        hostsLanguage,
        themeCompartment.of(editorThemeExtensions(isDark())),
        readOnlyCompartment.of(EditorState.readOnly.of(props.readOnly === true)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || applyingExternal) return
          emit('update:modelValue', update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          blur: () => {
            emit('blur')
            return false
          }
        })
      ]
    })
  })

  themeObserver = new MutationObserver(() => applyTheme())
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })
})

watch(
  () => props.schemeId,
  () => {
    if (!view) return
    applyingExternal = true
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.modelValue }
    })
    applyingExternal = false
  }
)

watch(
  () => props.modelValue,
  (v) => {
    if (!view) return
    if (view.state.doc.toString() === v) return
    applyingExternal = true
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: v }
    })
    applyingExternal = false
  }
)

watch(
  () => props.readOnly,
  (v) => {
    view?.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(v === true))
    })
  }
)

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
  view?.destroy()
  view = null
})
</script>

<template>
  <div ref="root" class="hosts-editor" role="textbox" aria-label="Hosts 内容编辑器" />
</template>

<style scoped>
.hosts-editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 1px solid var(--border);
  overflow: hidden;
  background: color-mix(in oklab, var(--muted) 35%, var(--background));
}
.hosts-editor:focus-within {
  border-color: color-mix(in oklab, var(--primary) 45%, var(--border));
}
.hosts-editor :deep(.cm-editor) {
  height: 100%;
  outline: none;
}
.hosts-editor :deep(.cm-scroller) {
  overflow: auto;
}
</style>
