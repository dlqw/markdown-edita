import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef, Tree } from '@lezer/common';
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Text,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { nameToEmoji } from 'gemoji';
import type { MarkdownEditaDiagnostic, MarkdownEditaSettings } from '../../src/editor/protocol';
import { autolinkTarget } from '../../src/shared/mdscan';
import { renderFramedFence, renderFramedTable, tableHasMath } from '../ascii';
import { activeGlyphs, type GlyphSet } from '../glyphs';
import { highlightCode, highlightFenceLines, onCodeAssets, plainCodeLines } from '../code';
import { INLINE_MATH, renderMath } from '../math';
import { renderInline, renderMarkdown } from '../md';
import {
  GlyphWidget,
  HorizontalRuleWidget,
  HtmlWidget,
  ImageWidget,
  MathBlockWidget,
  MermaidWidget,
  RenderedBlockWidget,
  TaskWidget,
} from './widgets';

export const DEFAULT_SETTINGS: MarkdownEditaSettings = {
  inline: true,
  blocks: true,
  images: true,
  previewMode: false,
  modalKeys: true,
  lineNumbers: true,
  relativeLineNumbers: false,
  lint: true,
  theme: 'tokyo',
  glyphs: 'nerd',
};

const WIDGET_BLOCK_NAMES = new Set([
  'FencedCode',
  'Table',
  'HTMLBlock',
  'HorizontalRule',
]);
const SKIP_SUBTREE_NAMES = new Set(['FencedCode', 'CodeBlock', 'Table', 'HTMLBlock', 'LinkReference']);
const INLINE_DECORATED_NAMES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'InlineCode',
  'StrongEmphasis',
  'Emphasis',
  'Strikethrough',
  'Link',
  'Image',
  'Autolink',
  'QuoteMark',
  'ListMark',
  'TaskMarker',
  'URL',
  'Emoji',
]);

const DISPLAY_MATH_LINE = /^\s*\$\$(.+?)\$\$\s*$/;
const FOOTNOTE_DEFINITION = /^( {0,3})\[\^([^\]\s]+)\]:/;
const FOOTNOTE_REFERENCE = /^\[\^([^\]\s]+)\]$/;
const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\]/i;
const ALERT_QUOTE_PREFIX = /^(?:[ \t]*>[ \t]?)+/;

const LINE_CLASS_BY_NODE: Record<string, string> = {
  ATXHeading1: 'markdown-edita-h1',
  ATXHeading2: 'markdown-edita-h2',
  ATXHeading3: 'markdown-edita-h3',
  ATXHeading4: 'markdown-edita-h4',
  ATXHeading5: 'markdown-edita-h5',
  ATXHeading6: 'markdown-edita-h6',
  SetextHeading1: 'markdown-edita-h1',
  SetextHeading2: 'markdown-edita-h2',
};

const MARK: Record<string, Decoration> = {
  strong: Decoration.mark({ class: 'markdown-edita-strong' }),
  emphasis: Decoration.mark({ class: 'markdown-edita-em' }),
  strikethrough: Decoration.mark({ class: 'markdown-edita-strike' }),
  link: Decoration.mark({ class: 'markdown-edita-link' }),
  inlineCode: Decoration.mark({ class: 'markdown-edita-code' }),
};

const HIDDEN = Decoration.replace({});

const FRAME_BORDER_CLASS = 'markdown-edita-frame-row cm-line';

export const setSettings = StateEffect.define<MarkdownEditaSettings>();
export const refreshPreview = StateEffect.define<null>();
export const setDiagnostics = StateEffect.define<MarkdownEditaDiagnostic[]>();

class DiagnosticWidget extends WidgetType {
  constructor(readonly items: MarkdownEditaDiagnostic[]) {
    super();
  }

  override eq(other: DiagnosticWidget): boolean {
    return (
      other.items.length === this.items.length &&
      other.items.every(
        (item, index) =>
          item.message === this.items[index].message &&
          item.severity === this.items[index].severity &&
          item.from === this.items[index].from,
      )
    );
  }

  override toDOM(): HTMLElement {
    const host = document.createElement('span');
    host.className = 'markdown-edita-diagnostic';
    for (const item of this.items) {
      const label = document.createElement('span');
      label.className = `markdown-edita-diagnostic-item markdown-edita-diagnostic-${item.severity}`;
      label.textContent = item.message;
      host.append(label);
    }
    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function diagnosticDecorations(state: EditorState, items: MarkdownEditaDiagnostic[]): DecorationSet {
  const doc = state.doc;
  const byLine = new Map<number, MarkdownEditaDiagnostic[]>();
  for (const item of items) {
    const offset = Math.min(Math.max(item.from, 0), doc.length);
    const line = doc.lineAt(offset).number;
    const list = byLine.get(line);
    if (list) {
      list.push(item);
    } else {
      byLine.set(line, [item]);
    }
  }
  const ranges: Range<Decoration>[] = [];
  for (const [lineNumber, list] of byLine) {
    const line = doc.line(Math.min(lineNumber, doc.lines));
    ranges.push(Decoration.widget({ widget: new DiagnosticWidget(list), side: 1 }).range(line.to));
  }
  return Decoration.set(ranges, true);
}

export const diagnosticField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setDiagnostics)) {
        return diagnosticDecorations(transaction.state, effect.value);
      }
    }
    return value.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const settingsField = StateField.define<MarkdownEditaSettings>({
  create: () => DEFAULT_SETTINGS,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setSettings)) {
        return effect.value;
      }
    }
    return value;
  },
});

let modalMode = 'normal';

export function setModalMode(mode: string): void {
  modalMode = mode;
}

function fenceLanguage(node: SyntaxNodeRef, doc: Text): string {
  const info = node.node.getChild('CodeInfo');
  return info ? doc.sliceString(info.from, info.to).trim().split(/\s+/)[0] : '';
}

function fenceCode(node: SyntaxNodeRef, doc: Text): string {
  let code = '';
  for (let child = node.node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'CodeText') {
      code += doc.sliceString(child.from, child.to);
    }
  }
  return code;
}

function fenceRows(node: SyntaxNodeRef, doc: Text, glyphs: GlyphSet, depth: number): string[] {
  const language = fenceLanguage(node, doc);
  const code = fenceCode(node, doc);
  const lines = (language.length > 0 ? highlightFenceLines(code, language) : undefined) ?? plainCodeLines(code);
  const framed = renderFramedFence(lines, language, glyphs, depth);
  return [framed.head, ...framed.rows, framed.foot];
}

function pushCodeMarks(
  ranges: Range<Decoration>[],
  doc: Text,
  node: SyntaxNodeRef,
  revealed: (line: number) => boolean,
): void {
  const language = fenceLanguage(node, doc);
  if (language.length === 0) {
    return;
  }
  const highlighted = highlightCode(fenceCode(node, doc), language);
  if (!highlighted) {
    return;
  }
  const span = lineSpan(doc, node);
  for (let index = 0; index < highlighted.length; index += 1) {
    const number = span.first + 1 + index;
    const target = highlighted[index];
    if (number > span.last || !target || target.text.length === 0 || target.runs.length === 0) {
      continue;
    }
    if (!revealed(number)) {
      continue;
    }
    const line = doc.line(number);
    if (!line.text.endsWith(target.text)) {
      continue;
    }
    const start = line.from + (line.text.length - target.text.length);
    for (const run of target.runs) {
      ranges.push(Decoration.mark({ class: run.className }).range(start + run.from, start + run.to));
    }
  }
}

function pushFramedRows(
  ranges: Range<Decoration>[],
  doc: Text,
  span: { first: number; last: number },
  rows: (string | null)[],
): number[] {
  const rendered: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const html = rows[index];
    if (html === null || html.length === 0) {
      continue;
    }
    const line = doc.line(span.first + index);
    const widget = new HtmlWidget(html, 'markdown-edita-frame-row', 'div');
    if (line.from < line.to) {
      ranges.push(Decoration.replace({ widget }).range(line.from, line.to));
    } else {
      ranges.push(Decoration.widget({ widget, side: 1 }).range(line.from));
    }
    rendered.push(line.number);
  }
  return rendered;
}

function pushHide(ranges: Range<Decoration>[], from: number, to: number): void {
  if (to > from) {
    ranges.push(HIDDEN.range(from, to));
  }
}

function blockRange(doc: Text, node: { from: number; to: number }): { from: number; to: number } {
  return {
    from: doc.lineAt(node.from).from,
    to: doc.lineAt(node.to > node.from ? node.to - 1 : node.to).to,
  };
}

function lineSpan(doc: Text, node: { from: number; to: number }): { first: number; last: number } {
  return {
    first: doc.lineAt(node.from).number,
    last: doc.lineAt(node.to > node.from ? node.to - 1 : node.to).number,
  };
}

function quoteDepth(node: SyntaxNodeRef): number {
  let depth = 0;
  for (let parent = node.node.parent; parent; parent = parent.parent) {
    if (parent.name === 'Blockquote') {
      depth += 1;
    }
  }
  return depth;
}

function blockSource(raw: string, depth: number): string {
  if (depth === 0) {
    return raw;
  }
  return raw
    .split('\n')
    .map((line) => {
      let rest = line;
      for (let level = 0; level < depth; level += 1) {
        const match = /^[ \t]*>[ \t]?/.exec(rest);
        if (!match) {
          break;
        }
        rest = rest.slice(match[0].length);
      }
      return rest;
    })
    .join('\n');
}

function findMathBlocks(doc: Text): { first: number; last: number; tex: string }[] {
  const blocks: { first: number; last: number; tex: string }[] = [];
  let line = 1;
  while (line <= doc.lines) {
    const text = doc.line(line).text;
    if (DISPLAY_MATH_LINE.test(text)) {
      line += 1;
      continue;
    }
    if (text.trim() === '$$') {
      let end = -1;
      for (let next = line + 1; next <= doc.lines; next += 1) {
        if (doc.line(next).text.trim().endsWith('$$')) {
          end = next;
          break;
        }
      }
      if (end > line) {
        const parts: string[] = [];
        for (let index = line + 1; index < end; index += 1) {
          parts.push(doc.line(index).text);
        }
        blocks.push({ first: line, last: end, tex: parts.join('\n') });
        line = end + 1;
        continue;
      }
    }
    line += 1;
  }
  return blocks;
}

function decorateLink(node: SyntaxNodeRef, doc: Text, ranges: Range<Decoration>[]): void {
  const source = doc.sliceString(node.from, node.to);
  const marks = node.node.getChildren('LinkMark');
  if (source.startsWith('<') && marks.length > 0) {
    for (const mark of marks) {
      pushHide(ranges, mark.from, mark.to);
    }
    const url = node.node.getChild('URL');
    if (url) {
      ranges.push(MARK.link.range(url.from, url.to));
    }
    return;
  }
  const first = marks[0];
  const second = marks[1];
  if (first && second && second.from > first.to) {
    const destination = node.node.getChild('URL');
    const href = destination ? doc.sliceString(destination.from, destination.to).trim().replace(/^</, '').replace(/>$/, '') : '';
    ranges.push(MARK.link.range(first.to, second.from));
    ranges.push(
      Decoration.widget({
        widget: new GlyphWidget(activeGlyphs().link, 'markdown-edita-link-icon', href),
        side: -1,
      }).range(first.to),
    );
  }
  for (const mark of marks) {
    pushHide(ranges, mark.from, mark.to);
  }
  for (const child of ['LinkLabel', 'URL', 'LinkTitle']) {
    const found = node.node.getChild(child);
    if (found) {
      pushHide(ranges, found.from, found.to);
    }
  }
}

interface GfmContext {
  footnotes: Map<string, number>;
  alertMarkers: Set<number>;
}

function collectFootnoteDefinitions(doc: Text, tree: Tree): Map<string, number> {
  const definitions = new Map<string, number>();
  const skipped = new Set<number>();
  tree.iterate({
    enter: (node) => {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'HTMLBlock') {
        const span = lineSpan(doc, node);
        for (let line = span.first; line <= span.last; line += 1) {
          skipped.add(line);
        }
        return false;
      }
      return undefined;
    },
  });
  for (let number = 1; number <= doc.lines; number += 1) {
    if (skipped.has(number)) {
      continue;
    }
    const match = FOOTNOTE_DEFINITION.exec(doc.line(number).text);
    if (match) {
      definitions.set(match[2], number);
    }
  }
  return definitions;
}

function alertBlock(
  node: SyntaxNodeRef,
  doc: Text,
  gfm: GfmContext,
): { kind: string; first: number; last: number } | undefined {
  const line = doc.lineAt(node.from);
  const head = line.text.slice(node.from - line.from);
  const prefix = ALERT_QUOTE_PREFIX.exec(head);
  if (!prefix) {
    return undefined;
  }
  const marker = ALERT_MARKER.exec(head.slice(prefix[0].length));
  if (!marker) {
    return undefined;
  }
  gfm.alertMarkers.add(node.from + prefix[0].length);
  return {
    kind: marker[1].toLowerCase(),
    first: line.number,
    last: doc.lineAt(Math.max(node.to - 1, node.from)).number,
  };
}

function decorateInline(
  node: SyntaxNodeRef,
  doc: Text,
  ranges: Range<Decoration>[],
  settings: MarkdownEditaSettings,
  protectedRanges: { from: number; to: number }[],
  gfm: GfmContext,
): boolean | void {
  const name = node.name;
  const line = doc.lineAt(node.from);
  if (SKIP_SUBTREE_NAMES.has(name)) {
    return false;
  }
  if (protectedRanges.some((span) => node.from < span.to && node.to > span.from)) {
    return false;
  }
  const lineClass = LINE_CLASS_BY_NODE[name];
  if (lineClass) {
    if (node.from >= line.from && node.from <= line.to) {
      ranges.push(Decoration.line({ class: lineClass }).range(line.from));
      const level = Number(name.slice(-1));
      const text = doc.sliceString(node.from, node.to);
      if (text.trim().length > 0) {
        ranges.push(
          Decoration.widget({
            widget: new GlyphWidget(activeGlyphs().heading.repeat(level), `markdown-edita-heading-mark ${lineClass}-mark`),
            side: -1,
          }).range(node.from),
        );
      }
    }
    return true;
  }
  switch (name) {
    case 'HeaderMark': {
      const next = doc.sliceString(node.to, Math.min(node.to + 1, doc.length));
      pushHide(ranges, node.from, next === ' ' || next === '\t' ? node.to + 1 : node.to);
      return false;
    }
    case 'EmphasisMark':
    case 'StrikethroughMark':
      pushHide(ranges, node.from, node.to);
      return false;
    case 'CodeMark':
      if (node.node.parent?.name === 'InlineCode') {
        pushHide(ranges, node.from, node.to);
      }
      return false;
    case 'InlineCode':
      ranges.push(MARK.inlineCode.range(node.from, node.to));
      return true;
    case 'StrongEmphasis':
      ranges.push(MARK.strong.range(node.from, node.to));
      return true;
    case 'Emphasis':
      ranges.push(MARK.emphasis.range(node.from, node.to));
      return true;
    case 'Strikethrough':
      ranges.push(MARK.strikethrough.range(node.from, node.to));
      return true;
    case 'Link':
    case 'Autolink': {
      const source = doc.sliceString(node.from, node.to);
      const reference = FOOTNOTE_REFERENCE.exec(source);
      if (reference) {
        const label = reference[1];
        const line = doc.lineAt(node.from);
        const isDefinition =
          doc.sliceString(node.to, Math.min(node.to + 1, doc.length)) === ':' &&
          doc.sliceString(line.from, node.from).trim().length === 0;
        if (isDefinition) {
          ranges.push(Decoration.line({ class: 'markdown-edita-footnote-def' }).range(line.from));
          ranges.push(
            Decoration.replace({ widget: new GlyphWidget(label, 'markdown-edita-footnote-mark') }).range(node.from, node.to + 1),
          );
          return false;
        }
        if (gfm.footnotes.has(label)) {
          ranges.push(
            Decoration.replace({
              widget: new GlyphWidget(label, 'markdown-edita-footnote-ref', `#fn-${label}`),
            }).range(node.from, node.to),
          );
        }
        return false;
      }
      if (gfm.alertMarkers.has(node.from)) {
        const kind = ALERT_MARKER.exec(source)?.[1].toLowerCase() ?? 'note';
        ranges.push(
          Decoration.replace({
            widget: new GlyphWidget(kind.toUpperCase(), `markdown-edita-alert-marker markdown-edita-alert-marker-${kind}`),
          }).range(node.from, node.to),
        );
        return false;
      }
      decorateLink(node, doc, ranges);
      return node.node.getChild('Image') !== null;
    }
    case 'URL': {
      const raw = doc.sliceString(node.from, node.to);
      ranges.push(MARK.link.range(node.from, node.to));
      ranges.push(
        Decoration.widget({
          widget: new GlyphWidget(activeGlyphs().link, 'markdown-edita-link-icon', autolinkTarget(raw)),
          side: -1,
        }).range(node.from),
      );
      return false;
    }
    case 'Emoji': {
      const emoji = nameToEmoji[doc.sliceString(node.from + 1, node.to - 1)];
      if (emoji) {
        ranges.push(Decoration.replace({ widget: new GlyphWidget(emoji, 'markdown-edita-emoji') }).range(node.from, node.to));
      }
      return false;
    }
    case 'QuoteMark': {
      const glyph = activeGlyphs().quote;
      ranges.push(
        Decoration.replace({ widget: new GlyphWidget(glyph, 'markdown-edita-quote-mark') }).range(node.from, node.to),
      );
      if (node.from >= line.from && node.from <= line.to) {
        ranges.push(Decoration.line({ class: 'markdown-edita-quote' }).range(line.from));
      }
      return false;
    }
    case 'ListMark': {
      if (node.node.parent?.parent?.name === 'BulletList') {
        ranges.push(
          Decoration.replace({
            widget: new GlyphWidget(activeGlyphs().bullet, 'markdown-edita-bullet'),
          }).range(node.from, node.to),
        );
      }
      return false;
    }
    case 'TaskMarker': {
      const text = doc.sliceString(node.from, node.to);
      ranges.push(
        Decoration.replace({
          widget: new TaskWidget(
            activeGlyphs().taskOpen,
            activeGlyphs().taskDone,
            text.includes('x') || text.includes('X'),
            node.from,
            node.to,
          ),
        }).range(node.from, node.to),
      );
      return false;
    }
    case 'Image': {
      if (!settings.images) {
        decorateLink(node, doc, ranges);
        return false;
      }
      const marks = node.node.getChildren('LinkMark');
      const url = node.node.getChild('URL');
      const title = node.node.getChild('LinkTitle');
      ranges.push(
        Decoration.replace({
          widget: new ImageWidget(
            url ? doc.sliceString(url.from, url.to) : '',
            marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : '',
            title ? doc.sliceString(title.from, title.to).replace(/^["'(]|["')]$/g, '') : '',
          ),
        }).range(node.from, node.to),
      );
      return false;
    }
    default:
      return undefined;
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const settings = state.field(settingsField);
  const doc = state.doc;
  const tree = syntaxTree(state);
  const ranges: Range<Decoration>[] = [];
  const gfm: GfmContext = { footnotes: collectFootnoteDefinitions(doc, tree), alertMarkers: new Set() };
  const alertLines = new Set<number>();
  const cursorLines = new Set<number>();
  const reveal = settings.modalKeys ? !settings.previewMode || modalMode !== 'normal' : true;
  if (reveal) {
    for (const selection of state.selection.ranges) {
      const span = lineSpan(doc, selection);
      for (let line = span.first; line <= span.last; line += 1) {
        cursorLines.add(line);
      }
    }
  }
  const replacedLines = new Set<number>();
  const markLines = (span: { first: number; last: number }): void => {
    for (let line = span.first; line <= span.last; line += 1) {
      replacedLines.add(line);
    }
  };
  const retract = (from: number, to: number): void => {
    for (let index = ranges.length - 1; index >= 0; index -= 1) {
      const existing = ranges[index];
      if (existing.from >= from && existing.to <= to) {
        ranges.splice(index, 1);
      }
    }
  };
  const clearLine = (line: number): void => {
    const source = doc.line(line);
    retract(source.from, source.to);
  };
  const placeFrameRows = (span: { first: number; last: number }, rows: (string | null)[]): void => {
    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index] === null || rows[index] === '') {
        continue;
      }
      clearLine(span.first + index);
    }
    for (const line of pushFramedRows(ranges, doc, span, rows)) {
      replacedLines.add(line);
    }
  };
  let preparedLine = -1;
  let protectedRanges: { from: number; to: number }[] = [];

  const prepareLine = (number: number): void => {
    preparedLine = number;
    protectedRanges = [];
    if (!settings.inline || cursorLines.has(number) || replacedLines.has(number)) {
      return;
    }
    const line = doc.line(number);
    if (!line.text.includes('$')) {
      return;
    }
    const codeSpans: { from: number; to: number }[] = [];
    tree.iterate({
      from: line.from,
      to: line.to,
      enter: (node) => {
        if (node.name === 'InlineCode') {
          codeSpans.push({ from: node.from, to: node.to });
          return false;
        }
        return undefined;
      },
    });
    const display = DISPLAY_MATH_LINE.exec(line.text);
    if (display) {
      const html = renderMath(display[1], false);
      if (html) {
        protectedRanges.push({ from: line.from, to: line.to });
        ranges.push(
          Decoration.replace({
            widget: new HtmlWidget(html, 'markdown-edita-math markdown-edita-math-inline markdown-edita-math-line', 'span'),
          }).range(line.from, line.to),
        );
      }
      return;
    }
    INLINE_MATH.lastIndex = 0;
    let match = INLINE_MATH.exec(line.text);
    while (match) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      const span = { from, to };
      if (!codeSpans.some((code) => span.from < code.to && span.to > code.from)) {
        const html = renderMath(match[1], false);
        if (html) {
          protectedRanges.push(span);
          ranges.push(
            Decoration.replace({
              widget: new HtmlWidget(html, 'markdown-edita-math markdown-edita-math-inline', 'span'),
            }).range(from, to),
          );
        }
      }
      match = INLINE_MATH.exec(line.text);
    }
  };

  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      const name = node.name;
      if (WIDGET_BLOCK_NAMES.has(name)) {
        const range = blockRange(doc, node);
        const span = lineSpan(doc, range);
        if (!settings.blocks && name !== 'HorizontalRule') {
          if (name === 'FencedCode') {
            pushCodeMarks(ranges, doc, node, () => true);
          }
          return false;
        }
        const glyphs = activeGlyphs();
        if (name === 'HorizontalRule') {
          if (cursorLines.has(span.first)) {
            return false;
          }
          replacedLines.add(span.first);
          ranges.push(
            Decoration.replace({ widget: new HorizontalRuleWidget(glyphs.rule), block: true }).range(
              range.from,
              range.to,
            ),
          );
          return false;
        }
        const depth = quoteDepth(node);
        const source = blockSource(doc.sliceString(node.from, node.to), depth);
        if (name === 'FencedCode') {
          if (fenceLanguage(node, doc).toLowerCase() === 'mermaid') {
            const code = fenceCode(node, doc);
            let revealed = false;
            for (let line = span.first; line <= span.last; line += 1) {
              if (cursorLines.has(line)) {
                revealed = true;
              }
            }
            if (!revealed && code.trim().length > 0) {
              markLines(span);
              ranges.push(
                Decoration.replace({
                  widget: new MermaidWidget(code, settings.theme),
                  block: true,
                }).range(range.from, range.to),
              );
              return false;
            }
          }
          const framed = fenceRows(node, doc, glyphs, depth);
          placeFrameRows(
            span,
            framed.map((html, index) => (cursorLines.has(span.first + index) ? null : html)),
          );
          pushCodeMarks(ranges, doc, node, (line) => cursorLines.has(line));
          return false;
        }
        if (name === 'Table') {
          const framed = tableHasMath(source) ? undefined : renderFramedTable(source, glyphs, depth);
          if (framed) {
            placeFrameRows(
              span,
              framed.rows.map((html, index) => (cursorLines.has(span.first + index) ? null : html)),
            );
            ranges.push(
              Decoration.widget({
                widget: new HtmlWidget(framed.head, FRAME_BORDER_CLASS, 'div'),
                block: true,
                side: -1,
              }).range(doc.line(span.first).from),
            );
            ranges.push(
              Decoration.widget({
                widget: new HtmlWidget(framed.foot, FRAME_BORDER_CLASS, 'div'),
                block: true,
                side: 1,
              }).range(doc.line(span.last).to),
            );
            return false;
          }
        }
        for (let line = span.first; line <= span.last; line += 1) {
          if (cursorLines.has(line)) {
            return false;
          }
        }
        markLines(span);
        ranges.push(
          Decoration.replace({
            widget: new RenderedBlockWidget(renderMarkdown(source), name.toLowerCase()),
            block: true,
          }).range(range.from, range.to),
        );
        return false;
      }
      if (SKIP_SUBTREE_NAMES.has(name)) {
        return false;
      }
      if (!settings.inline) {
        return undefined;
      }
      if (name === 'Blockquote') {
        const alert = alertBlock(node, doc, gfm);
        if (alert) {
          for (let number = alert.first; number <= alert.last; number += 1) {
            if (alertLines.has(number)) {
              continue;
            }
            alertLines.add(number);
            ranges.push(
              Decoration.line({ class: `markdown-edita-alert markdown-edita-alert-${alert.kind}` }).range(doc.line(number).from),
            );
          }
        }
        return undefined;
      }
      const line = doc.lineAt(node.from);
      const inline = INLINE_DECORATED_NAMES.has(name);
      if (inline || name === 'HTMLTag') {
        const span = lineSpan(doc, node);
        for (let index = span.first; index <= span.last; index += 1) {
          if (cursorLines.has(index) || replacedLines.has(index)) {
            const lineClass = LINE_CLASS_BY_NODE[name];
            if (lineClass) {
              ranges.push(Decoration.line({ class: lineClass }).range(doc.line(index).from));
            }
            return false;
          }
        }
      }
      if (name === 'HTMLTag') {
        if (!replacedLines.has(line.number)) {
          retract(line.from, line.to);
          replacedLines.add(line.number);
          preparedLine = line.number;
          protectedRanges = [];
          ranges.push(
            Decoration.replace({
              widget: new HtmlWidget(renderInline(line.text), 'markdown-edita-html', 'span'),
            }).range(line.from, line.to),
          );
        }
        return false;
      }
      if (line.number !== preparedLine) {
        prepareLine(line.number);
      }
      if (!inline) {
        return undefined;
      }
      return decorateInline(node, doc, ranges, settings, protectedRanges, gfm);
    },
  });

  if (settings.blocks) {
    for (const block of findMathBlocks(doc)) {
      const span = { first: block.first, last: block.last };
      let skip = false;
      for (let line = span.first; line <= span.last; line += 1) {
        if (cursorLines.has(line) || replacedLines.has(line)) {
          skip = true;
        }
      }
      if (skip) {
        continue;
      }
      const html = renderMath(block.tex, true);
      if (!html) {
        continue;
      }
      markLines(span);
      const from = doc.line(span.first).from;
      const to = doc.line(span.last).to;
      retract(from, to);
      ranges.push(
        Decoration.replace({
          widget: new MathBlockWidget(html, span.last - span.first + 1),
          block: true,
        }).range(from, to),
      );
    }
  }

  return Decoration.set(ranges, true);
}

interface PreviewState {
  decorations: DecorationSet;
  tree: Tree;
}

export const decorationField = StateField.define<PreviewState>({
  create: (state) => ({
    decorations: buildDecorations(state),
    tree: syntaxTree(state),
  }),
  update: (value, transaction) => {
    const forced = transaction.effects.some((effect) => effect.is(refreshPreview));
    const settingsChanged = transaction.startState.field(settingsField) !== transaction.state.field(settingsField);
    const tree = syntaxTree(transaction.state);
    if (transaction.docChanged || transaction.selection || forced || settingsChanged || tree !== value.tree) {
      return { decorations: buildDecorations(transaction.state), tree };
    }
    return {
      decorations: value.decorations.map(transaction.changes),
      tree: value.tree,
    };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

class CodeAssetsWatcher {
  private readonly stop: () => void;

  constructor(private readonly view: EditorView) {
    this.stop = onCodeAssets(() => {
      this.view.dispatch({ effects: refreshPreview.of(null) });
    });
  }

  destroy(): void {
    this.stop();
  }
}

const codeAssetsWatcher = ViewPlugin.fromClass(CodeAssetsWatcher);

export function livePreview(): Extension {
  return [settingsField, decorationField, diagnosticField, codeAssetsWatcher];
}
