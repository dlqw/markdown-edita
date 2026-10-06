import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const dark =
  document.body.classList.contains('vscode-dark') ||
  document.body.classList.contains('vscode-high-contrast');

export const markdownEditaHighlight = HighlightStyle.define([
  { tag: tags.strong, color: 'var(--markdown-edita-strong)', fontWeight: '700' },
  { tag: tags.emphasis, color: 'var(--markdown-edita-em)', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: 'var(--markdown-edita-strike)', textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--markdown-edita-link)' },
  { tag: tags.url, color: 'var(--markdown-edita-url)' },
  { tag: tags.monospace, color: 'var(--markdown-edita-code)' },
  { tag: tags.processingInstruction, color: 'var(--markdown-edita-dim)' },
  { tag: tags.labelName, color: 'var(--markdown-edita-dim)' },
  { tag: tags.contentSeparator, color: 'var(--markdown-edita-frame)' },
  { tag: tags.keyword, color: 'var(--markdown-edita-h6)' },
  { tag: tags.string, color: 'var(--markdown-edita-code)' },
  { tag: tags.comment, color: 'var(--markdown-edita-dim)', fontStyle: 'italic' },
  { tag: tags.number, color: 'var(--markdown-edita-h2)' },
  { tag: tags.bool, color: 'var(--markdown-edita-h2)' },
  { tag: tags.function(tags.variableName), color: 'var(--markdown-edita-h3)' },
  { tag: tags.typeName, color: 'var(--markdown-edita-h4)' },
  { tag: tags.operator, color: 'var(--markdown-edita-dim)' },
  { tag: tags.punctuation, color: 'var(--markdown-edita-dim)' },
]);

export const markdownEditaTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--markdown-edita-bg, var(--vscode-editor-background))',
      color: 'var(--markdown-edita-text, var(--vscode-editor-foreground))',
    },
    '.cm-scroller': {
      fontFamily: 'var(--vscode-editor-font-family, monospace)',
      fontSize: 'var(--vscode-editor-font-size, 13px)',
      lineHeight: '1.3',
    },
    '.cm-content': {
      caretColor: 'var(--markdown-edita-text, var(--vscode-editor-foreground))',
      padding: '2px 0 40vh',
      minWidth: '0',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--markdown-edita-bg, var(--vscode-editor-background))',
      color: 'var(--markdown-edita-dim)',
      border: 'none',
      borderRight: '1px solid var(--markdown-edita-border)',
      paddingRight: '0.4ch',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 1ch 0 0',
      minWidth: '3ch',
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: 'var(--markdown-edita-dim)',
      padding: '0 0.4ch',
      cursor: 'pointer',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--vscode-editor-lineHighlightBackground, rgba(128, 128, 128, 0.14))',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--markdown-edita-accent)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--markdown-edita-accent)',
    },
    '.cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--vscode-editor-selectionBackground, #264f78)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--markdown-edita-bg, var(--vscode-editorHoverWidget-background))',
      border: '1px solid var(--markdown-edita-border)',
      borderRadius: '0',
      color: 'var(--markdown-edita-text)',
      fontFamily: 'var(--vscode-editor-font-family, monospace)',
      fontSize: 'var(--vscode-editor-font-size, 13px)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--markdown-edita-accent)',
      color: 'var(--markdown-edita-bg)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--markdown-edita-bg)',
      color: 'var(--markdown-edita-text)',
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: '1px solid var(--markdown-edita-border)',
    },
    '.cm-vim-panel input': {
      backgroundColor: 'transparent',
      color: 'inherit',
      border: 'none',
      outline: 'none',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      width: '100%',
    },
  },
  { dark },
);
