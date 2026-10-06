import { Compartment, EditorState, Transaction, type Extension, type StateEffect } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  scrollPastEnd,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { foldGutter, foldKeymap, syntaxHighlighting } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import {
  diagnosticCount,
  forceLinting,
  lintGutter,
  linter,
  type Diagnostic as CmDiagnostic,
} from '@codemirror/lint';
import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { GFM } from '@lezer/markdown';
import { getCM, vim, Vim, type MotionFn } from '@replit/codemirror-vim';
import type {
  HostMessage,
  LinkTarget,
  MarkdownEditaDiagnostic,
  MarkdownEditaSettings,
  TextChange,
} from '../src/editor/protocol';
import { THEMES } from '../src/shared/themes';
import { bridge } from './bridge';
import { preloadCodeLanguages, setCodePalette, setHostTheme } from './code';
import { activeGlyphName, applyGlyphs, glyphsFor } from './glyphs';
import { createContextMenu } from './menu';
import { codeLanguages } from './languages';
import {
  DEFAULT_SETTINGS,
  livePreview,
  refreshPreview,
  setDiagnostics,
  setModalMode,
  setSettings,
} from './livepreview';
import { createStatusLine } from './status';
import { PALETTES, applyPalette } from './palette';
import { markdownEditaHighlight, markdownEditaTheme } from './theme';

interface RemoteCompletionItem {
  label: string;
  kind?: number;
  insertText?: string;
  textEdit?: { newText: string };
}

const COMPLETION_KINDS: Record<number, string> = {
  2: 'method',
  3: 'function',
  4: 'function',
  5: 'property',
  6: 'variable',
  7: 'class',
  8: 'interface',
  9: 'namespace',
  10: 'property',
  13: 'enum',
  14: 'keyword',
  15: 'string',
  17: 'file',
  18: 'folder',
  20: 'keyword',
  21: 'constant',
  22: 'struct',
  25: 'type',
};

const STATUS_DELAY_MS = 120;

let settings: MarkdownEditaSettings = { ...DEFAULT_SETTINGS };
let sequence = 0;
let linkTargets: LinkTarget[] = [];
let modalMode = 'normal';
let statusTimer = 0;
let applyingSync = false;
let externalDiagnostics: CmDiagnostic[] = [];

const lintSource = (): CmDiagnostic[] => externalDiagnostics;

const status = createStatusLine();
const gutterCompartment = new Compartment();
const modalCompartment = new Compartment();
applyPalette(settings.theme);
setCodePalette(settings.theme);
applyGlyphs(settings.glyphs);
status.setGlyphs(activeGlyphName());

function lineNumberExtension(value: MarkdownEditaSettings): Extension {
  if (!value.lineNumbers) {
    return [];
  }
  if (!value.relativeLineNumbers) {
    return lineNumbers();
  }
  return lineNumbers({
    formatNumber: (line, state) => {
      const current = state.doc.lineAt(state.selection.main.head).number;
      return line === current ? String(line) : String(Math.abs(line - current));
    },
  });
}

function gutterExtension(value: MarkdownEditaSettings): Extension {
  const glyphs = glyphsFor(value.glyphs);
  return [
    lineNumberExtension(value),
    foldGutter({ openText: glyphs.foldOpen, closedText: glyphs.foldClosed }),
  ];
}

const stepCursorLine =
  (direction: number): MotionFn =>
  (cm, head, motionArgs) => {
    const repeat = Math.max((motionArgs as { repeat?: number }).repeat ?? 1, 1);
    const target = Math.min(Math.max(head.line + direction * repeat, 0), cm.lineCount() - 1);
    const text = cm.getLine(target);
    return { line: target, ch: Math.min(head.ch, text.length) };
  };

function installLineMotions(): void {
  Vim.defineMotion('markdownEditaStepDown', stepCursorLine(1));
  Vim.defineMotion('markdownEditaStepUp', stepCursorLine(-1));
  const bindings: [string, string][] = [
    ['j', 'Down'],
    ['<Down>', 'Down'],
    ['k', 'Up'],
    ['<Up>', 'Up'],
  ];
  for (const context of ['normal', 'visual', 'operatorPending']) {
    for (const [key, name] of bindings) {
      Vim.mapCommand(key, 'motion', `markdownEditaStep${name}`, {}, { context });
    }
  }
}

installLineMotions();

let documentUri = '';

const view = new EditorView({
  state: EditorState.create({
    doc: '',
    extensions: [
      modalCompartment.of(vim()),
      history(),
      drawSelection(),
      dropCursor(),
      highlightSpecialChars(),
      EditorState.allowMultipleSelections.of(true),
      EditorView.lineWrapping,
      scrollPastEnd(),
      gutterCompartment.of(gutterExtension(settings)),
      lintGutter(),
      linter(lintSource, { tooltipFilter: () => [] }),
      syntaxHighlighting(markdownEditaHighlight),
      markdown({ base: markdownLanguage, codeLanguages, extensions: [GFM] }),
      highlightActiveLine(),
      highlightSelectionMatches(),
      autocompletion({ activateOnTyping: true, icons: false, override: [completeFromServer] }),
      livePreview(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
      markdownEditaTheme,
      EditorView.updateListener.of(onUpdate),
    ],
  }),
  parent: document.getElementById('markdown-edita-editor') as HTMLElement,
});

function readVimMode(): string {
  const adapter = getCM(view);
  const mode = adapter?.state?.vim?.mode;
  return typeof mode === 'string' && mode.length > 0 ? mode.split(' ')[0] : 'normal';
}

function applyMode(mode: string): void {
  if (mode === modalMode) {
    return;
  }
  modalMode = mode;
  setModalMode(mode);
  status.setMode(mode.toUpperCase(), !settings.modalKeys);
  queueMicrotask(() => {
    view.dispatch({ effects: refreshPreview.of(null) });
  });
}

function wireVim(): void {
  const adapter = getCM(view);
  if (!adapter) {
    return;
  }
  adapter.state.statusbar = status.vimContainer;
  adapter.on('vim-mode-change', (event: { mode?: string }) => {
    applyMode(event.mode ?? readVimMode());
  });
  adapter.state.vimPlugin?.updateStatus?.();
}

function updatePosition(): void {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  status.setPosition(line.number, selection.head - line.from + 1, selection.to - selection.from, view.state.doc.lines);
}

function postStatus(): void {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  bridge.send({
    t: 'status',
    mode: modalMode,
    line: line.number,
    column: selection.head - line.from + 1,
    length: selection.to - selection.from,
    total: view.state.doc.lines,
    diagnostics: diagnosticCount(view.state),
  });
}

function scheduleStatus(): void {
  if (statusTimer !== 0) {
    return;
  }
  statusTimer = window.setTimeout(() => {
    statusTimer = 0;
    postStatus();
  }, STATUS_DELAY_MS);
}

const COMPLETION_TRIGGERS = new Set(['(', '[', '/', '#', '`', '<']);
const DESTINATION_BOUNDARIES = ['(', '[', '`', '<', ' ', '\t'];

function completionStart(state: EditorState, position: number): number {
  const before = state.sliceDoc(0, position);
  let start = -1;
  for (const boundary of DESTINATION_BOUNDARIES) {
    const index = before.lastIndexOf(boundary);
    if (index > start) {
      start = index;
    }
  }
  return start + 1;
}

async function completeFromServer(context: CompletionContext): Promise<CompletionResult | null> {
  if (documentUri.length === 0) {
    return null;
  }
  const line = context.state.doc.lineAt(context.pos);
  const result = (await bridge.request('textDocument/completion', {
    textDocument: { uri: documentUri },
    position: { line: line.number - 1, character: context.pos - line.from },
  })) as RemoteCompletionItem[] | { items: RemoteCompletionItem[] } | null;
  const items = Array.isArray(result) ? result : (result?.items ?? []);
  if (items.length === 0) {
    return null;
  }
  const options: Completion[] = items.map((item) => ({
    label: item.label,
    type: item.kind === undefined ? 'text' : COMPLETION_KINDS[item.kind],
    apply: item.textEdit?.newText ?? item.insertText ?? item.label,
  }));
  return { from: completionStart(context.state, context.pos), options, filter: false };
}

function typedTrigger(update: ViewUpdate): boolean {
  let found = false;
  update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    const text = inserted.toString();
    if (text.length === 1 && COMPLETION_TRIGGERS.has(text)) {
      found = true;
    }
  });
  return found;
}

function onUpdate(update: ViewUpdate): void {
  if (update.docChanged) {
    const changes: TextChange[] = [];
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      changes.push({ from: fromA, to: toA, insert: inserted.toString() });
    });
    if (changes.length > 0 && !applyingSync) {
      bridge.send({ t: 'edit', seq: sequence, changes });
      sequence += 1;
    }
  }
  if (update.docChanged && typedTrigger(update)) {
    const target = update.view;
    queueMicrotask(() => {
      if (target.hasFocus) {
        startCompletion(target);
      }
    });
  }
  if (update.docChanged || update.selectionSet) {
    updatePosition();
    scheduleStatus();
  }
  const mode = readVimMode();
  if (mode !== modalMode) {
    applyMode(mode);
  }
}

function fenceLanguages(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/^ {0,3}(?:```+|~~~+)\s*([^\s`~]*)/gm)) {
    const name = match[1]?.trim().toLowerCase() ?? '';
    if (name.length > 0) {
      names.add(name);
    }
  }
  return names;
}

function syncText(text: string): void {
  if (text === view.state.doc.toString()) {
    return;
  }
  preloadCodeLanguages(fenceLanguages(text));
  const anchorLine = view.state.doc.lineAt(view.visibleRanges.length > 0 ? view.visibleRanges[0].from : 0).number;
  applyingSync = true;
  try {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      annotations: Transaction.addToHistory.of(false),
    });
  } finally {
    applyingSync = false;
  }
  if (anchorLine > 1) {
    const target = view.state.doc.line(Math.min(anchorLine, view.state.doc.lines)).from;
    view.dispatch({ effects: EditorView.scrollIntoView(target, { y: 'start' }) });
  }
  updatePosition();
  postStatus();
}

function applySettings(next: MarkdownEditaSettings): void {
  const numbersChanged =
    next.lineNumbers !== settings.lineNumbers ||
    next.relativeLineNumbers !== settings.relativeLineNumbers ||
    next.glyphs !== settings.glyphs;
  const modalChanged = next.modalKeys !== settings.modalKeys;
  settings = next;
  applyPalette(next.theme);
  setCodePalette(next.theme);
  applyGlyphs(next.glyphs);
  status.setGlyphs(activeGlyphName());
  const effects: StateEffect<unknown>[] = [setSettings.of(next)];
  if (numbersChanged) {
    effects.push(gutterCompartment.reconfigure(gutterExtension(next)));
  }
  if (modalChanged) {
    effects.push(modalCompartment.reconfigure(next.modalKeys ? vim() : []));
  }
  view.dispatch({ effects });
  if (modalChanged) {
    wireVim();
  }
  status.setMode(next.modalKeys ? modalMode.toUpperCase() : 'EDIT', !next.modalKeys);
}

function applyDiagnostics(items: MarkdownEditaDiagnostic[]): void {
  const max = view.state.doc.length;
  const bounded = items.map((item) => ({
    ...item,
    from: Math.min(Math.max(item.from, 0), max),
    to: Math.min(Math.max(item.to, 0), max),
  }));
  externalDiagnostics = bounded.map((item) => ({
    from: item.from,
    to: Math.max(item.to, item.from),
    severity: item.severity,
    message: item.message,
    source: item.code,
  }));
  view.dispatch({ effects: setDiagnostics.of(bounded) });
  forceLinting(view);
  status.setDiagnostics(externalDiagnostics.length);
}

function gotoLine(line: number): void {
  const target = view.state.doc.line(Math.min(Math.max(line + 1, 1), view.state.doc.lines));
  view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true });
  view.focus();
}

bridge.on((message: HostMessage) => {
  switch (message.t) {
    case 'sync':
      sequence = 0;
      documentUri = message.uri;
      syncText(message.text);
      status.setFile(message.name);
      break;
    case 'settings':
      applySettings(message.settings);
      break;
    case 'codetheme':
      setHostTheme(message.theme);
      break;
    case 'diagnostics':
      applyDiagnostics(message.items);
      break;
    case 'links':
      linkTargets = message.items;
      break;
    case 'dirty':
      status.setDirty(message.value);
      break;
    case 'goto':
      gotoLine(message.line);
      break;
    case 'notice':
      status.notice(message.level, message.text);
      break;
    case 'lspResult':
    case 'lspError':
    case 'uris':
      break;
  }
});

let handledIcon: HTMLElement | null = null;

function followClick(event: MouseEvent): boolean {
  return event.button === 0 && (event.ctrlKey || event.metaKey);
}

function linkRects(link: LinkTarget): DOMRect[] {
  const start = view.domAtPos(link.from, 1);
  const end = view.domAtPos(link.to, -1);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return Array.from(range.getClientRects());
}

function linkHit(link: LinkTarget, x: number, y: number): boolean {
  const slack = view.defaultLineHeight / 2;
  return linkRects(link).some(
    (rect) => x >= rect.left && x <= rect.right && y >= rect.top - slack && y <= rect.bottom + slack,
  );
}

view.dom.addEventListener(
  'mousedown',
  (event) => {
    const element = event.target as HTMLElement | null;
    const task = element?.closest?.('.markdown-edita-task');
    if (event.button === 0 && task instanceof HTMLElement) {
      const from = Number(task.dataset.from);
      const to = Number(task.dataset.to);
      if (Number.isInteger(from) && Number.isInteger(to) && to > from && to <= view.state.doc.length) {
        const marker = view.state.doc.sliceString(from, to);
        if (/^\[[ xX]\]$/.test(marker)) {
          event.preventDefault();
          event.stopPropagation();
          view.dispatch({ changes: { from, to, insert: /x/i.test(marker) ? '[ ]' : '[x]' } });
          return;
        }
      }
    }
    if (!followClick(event)) {
      return;
    }
    const icon = element?.closest?.('.markdown-edita-link-icon, .markdown-edita-footnote-ref');
    if (icon instanceof HTMLElement && icon.dataset.href) {
      handledIcon = icon;
      event.preventDefault();
      event.stopPropagation();
      bridge.send({ t: 'open', href: icon.dataset.href });
      return;
    }
    if (element?.closest?.('a[href]')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position === null) {
      return;
    }
    const target = linkTargets.find(
      (link) => position >= link.from && position < link.to && linkHit(link, event.clientX, event.clientY),
    );
    if (!target) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    bridge.send({ t: 'open', href: target.target });
  },
  { capture: true },
);

view.dom.addEventListener('click', (event) => {
  if (!followClick(event)) {
    return;
  }
  const element = event.target as HTMLElement | null;
  const anchor = element?.closest?.('a[href]');
  if (anchor) {
    event.preventDefault();
    bridge.send({ t: 'open', href: anchor.getAttribute('href') ?? '' });
    return;
  }
  const icon = element?.closest?.('.markdown-edita-link-icon, .markdown-edita-footnote-ref');
  const href = icon instanceof HTMLElement ? icon.dataset.href : undefined;
  if (href !== undefined && href.length > 0) {
    const already = handledIcon === icon;
    handledIcon = null;
    if (!already) {
      event.preventDefault();
      bridge.send({ t: 'open', href });
    }
  }
});

const contextMenu = createContextMenu(document.body, () => view.focus());

const themeOptions = THEMES.map((theme) => ({
  value: theme.id,
  label: theme.label,
  description: theme.description,
  swatch: PALETTES[theme.id]?.accent,
}));

view.dom.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  event.stopPropagation();
  contextMenu.open('Theme', themeOptions, settings.theme, event.clientX, event.clientY, (value) => {
    bridge.send({ t: 'command', id: 'markdown-edita.setTheme', args: [value] });
  });
});

wireVim();
Vim.defineEx('write', 'w', () => {
  bridge.send({ t: 'save' });
});
Vim.defineEx('preview', '', () => {
  bridge.send({ t: 'command', id: 'markdown-edita.togglePreview' });
});
status.glyphsContainer.title = 'Toggle ASCII and Nerd glyph style';
status.glyphsContainer.addEventListener('click', () => {
  bridge.send({ t: 'command', id: 'markdown-edita.toggleGlyphs' });
});
status.setMode(settings.modalKeys ? 'NORMAL' : 'EDIT', !settings.modalKeys);
updatePosition();
bridge.send({ t: 'ready' });
view.focus();
