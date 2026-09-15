import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { oneDark } from '@codemirror/theme-one-dark'

/** 浅色主题（贴合应用 --background / --foreground） */
const lightTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '13px',
      backgroundColor: 'transparent',
      color: 'var(--foreground)'
    },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      lineHeight: '20px'
    },
    '.cm-content': {
      padding: '10px 0',
      caretColor: 'var(--foreground)'
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--muted-foreground)',
      border: 'none'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in oklab, var(--muted) 55%, transparent)'
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in oklab, var(--muted) 45%, transparent)'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'color-mix(in oklab, var(--primary) 22%, transparent) !important'
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--foreground)'
    }
  },
  { dark: false }
)

const lightHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
    { tag: t.number, color: '#0b6bcb' },
    { tag: t.string, color: '#0f7b6c' }
  ])
)

const darkHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.comment, color: '#7d8590', fontStyle: 'italic' },
    { tag: t.number, color: '#79c0ff' },
    { tag: t.string, color: '#7ee787' }
  ])
)

const darkChrome = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '13px' },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      lineHeight: '20px'
    },
    '.cm-content': { padding: '10px 0' },
    '.cm-gutters': { border: 'none' }
  },
  { dark: true }
)

export function editorThemeExtensions(dark: boolean) {
  return dark
    ? [oneDark, darkChrome, darkHighlight]
    : [lightTheme, lightHighlight]
}
