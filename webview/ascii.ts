import { plainInline } from '../src/shared/mdscan';
import type { GlyphSet } from './glyphs';
import { escapeHtml } from './code';
import { renderInline } from './md';

const WIDE_RANGES: [number, number][] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x2fffd],
];

const ZERO_RANGES: [number, number][] = [
  [0x0300, 0x036f],
  [0x200b, 0x200f],
  [0xfe00, 0xfe0f],
];

export function displayWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (ZERO_RANGES.some(([start, end]) => code >= start && code <= end)) {
      continue;
    }
    width += WIDE_RANGES.some(([start, end]) => code >= start && code <= end) ? 2 : 1;
  }
  return width;
}

function repeat(glyph: string, count: number): string {
  return glyph.repeat(Math.max(count, 0));
}

const TAB_WIDTH = 4;

const SEGMENTER =
  typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : undefined;

function segments(text: string): readonly string[] {
  if (!SEGMENTER) {
    return [...text];
  }
  const parts: string[] = [];
  for (const entry of SEGMENTER.segment(text)) {
    parts.push(entry.segment);
  }
  return parts;
}

const ENTITY = /^&[#a-zA-Z0-9]+;$/;

export interface DecoratedHtml {
  html: string;
  width: number;
}

export function decorateHtml(html: string, markers: boolean, tabWidth = TAB_WIDTH): DecoratedHtml {
  let out = '';
  let width = 0;
  let started = false;
  let index = 0;
  while (index < html.length) {
    if (html[index] === '<') {
      const end = html.indexOf('>', index);
      const stop = end < 0 ? html.length : end + 1;
      out += html.slice(index, stop);
      index = stop;
      continue;
    }
    const nextTag = html.indexOf('<', index);
    const stop = nextTag < 0 ? html.length : nextTag;
    for (const piece of html.slice(index, stop).split(/(&[#a-zA-Z0-9]+;)/)) {
      if (ENTITY.test(piece)) {
        out += piece;
        width += 1;
        continue;
      }
      for (const segment of segments(piece)) {
        if (segment === '\t' && markers) {
          const step = tabWidth - (width % tabWidth);
          out += `<span class="markdown-edita-tab">→</span>${' '.repeat(Math.max(step - 1, 0))}`;
          width += step;
          started = true;
          continue;
        }
        if (segment === ' ' && markers && !started) {
          out += '<span class="markdown-edita-space">·</span>';
          width += 1;
          continue;
        }
        const size = displayWidth(segment);
        out += size > 1 ? `<span class="markdown-edita-wide">${segment}</span>` : segment;
        width += size;
        if (segment.trim().length > 0) {
          started = true;
        }
      }
    }
    index = stop;
  }
  return { html: out, width };
}

export function expandTabs(text: string, width = TAB_WIDTH): string {
  let result = '';
  let column = 0;
  for (const character of text) {
    if (character === '\n') {
      result += character;
      column = 0;
      continue;
    }
    if (character === '\t') {
      const spaces = width - (column % width);
      result += ' '.repeat(spaces);
      column += spaces;
      continue;
    }
    result += character;
    column += displayWidth(character);
  }
  return result;
}

export function cellText(raw: string): string {
  return expandTabs(plainInline(raw.replace(/<[^>]*>/g, '').replace(/\\\|/g, '|')).trim());
}

type ColumnAlign = 'left' | 'center' | 'right';

const IMAGE_INLINE = /!\[([^\]]*)\]\([^)]*\)/g;
const CODE_SPAN = /`+[^`]*`+/g;
const MATH_HINT = /(?<!\\)\$/;
const LAYOUT_TAG = /<(?:br|hr|img|svg|video|audio|div|p|pre|table|blockquote|section|figure|details|ul|ol|li|h[1-6])\b/i;

export function tableHasMath(source: string): boolean {
  return MATH_HINT.test(source.replace(CODE_SPAN, ''));
}

function cellHtml(raw: string): string {
  const source = expandTabs(raw.replace(IMAGE_INLINE, '$1').trim());
  if (tableHasMath(source) || LAYOUT_TAG.test(source)) {
    return escapeHtml(cellText(raw));
  }
  return renderInline(source);
}

interface FrameMeasure {
  signature: string;
  advance: number;
  widths: Map<string, number>;
}

let frameMeasure: FrameMeasure = { signature: '', advance: 0, widths: new Map() };
let frameProbe: HTMLElement | null = null;

function frameProbeElement(): HTMLElement | null {
  if (frameProbe && frameProbe.isConnected) {
    return frameProbe;
  }
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }
  const probe = document.createElement('div');
  probe.className = 'markdown-edita-frame-row markdown-edita-frame-probe';
  probe.setAttribute('aria-hidden', 'true');
  probe.style.position = 'absolute';
  probe.style.left = '-10000px';
  probe.style.top = '0';
  probe.style.visibility = 'hidden';
  document.body.append(probe);
  frameProbe = probe;
  return probe;
}

function refreshMeasure(probe: HTMLElement): void {
  const style = getComputedStyle(probe);
  const signature = `${style.fontFamily}|${style.fontSize}|${style.fontWeight}|${style.fontStyle}|${style.letterSpacing}|${style.fontFeatureSettings}|${style.fontVariantLigatures}`;
  if (signature !== frameMeasure.signature) {
    frameMeasure = { signature, advance: 0, widths: new Map() };
  }
}

function frameAdvance(): number {
  const probe = frameProbeElement();
  if (!probe) {
    return 0;
  }
  refreshMeasure(probe);
  if (frameMeasure.advance > 0) {
    return frameMeasure.advance;
  }
  probe.textContent = '0'.repeat(20);
  const width = probe.getBoundingClientRect().width / 20;
  probe.textContent = '';
  frameMeasure.advance = width;
  return width;
}

function measureCell(html: string): number {
  const probe = frameProbeElement();
  if (!probe) {
    return 0;
  }
  refreshMeasure(probe);
  const cached = frameMeasure.widths.get(html);
  if (cached !== undefined) {
    return cached;
  }
  probe.innerHTML = html;
  const width = probe.getBoundingClientRect().width;
  probe.innerHTML = '';
  if (frameMeasure.widths.size > 2000) {
    frameMeasure.widths.clear();
  }
  frameMeasure.widths.set(html, width);
  return width;
}

function columnAlignments(rows: { cells: string[]; delimiter: boolean }[], columns: number): ColumnAlign[] {
  const delimiter = rows.find((row) => row.delimiter);
  const alignments: ColumnAlign[] = [];
  for (let column = 0; column < columns; column += 1) {
    const marker = (delimiter?.cells[column] ?? '').trim();
    alignments.push(/^:.*:$/.test(marker) ? 'center' : /:$/.test(marker) ? 'right' : 'left');
  }
  return alignments;
}

function padCell(text: string, width: number, align: ColumnAlign): string {
  const missing = Math.max(0, width - displayWidth(text));
  const left = align === 'right' ? missing : align === 'center' ? Math.floor(missing / 2) : 0;
  return `${' '.repeat(left)}${escapeHtml(text)}${' '.repeat(missing - left)}`;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === '\\' && trimmed[index + 1] === '|') {
      current += '\\|';
      index += 1;
      continue;
    }
    if (character === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  cells.push(current);
  return cells;
}

function quotePrefix(depth: number, glyphs: GlyphSet): string {
  return `<span class="markdown-edita-quote-mark">${escapeHtml(glyphs.quote)}</span> `.repeat(Math.max(depth, 0));
}

export function renderFramedTable(source: string, glyphs: GlyphSet, depth = 0): FramedFence | undefined {
  const sourceLines = source.split('\n');
  const rows: { line: number; raw: string[]; cells: string[]; html: string[]; header: boolean; delimiter: boolean }[] = [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index];
    if (line.trim().length === 0) {
      continue;
    }
    const raw = splitRow(line);
    const cells = raw.map(cellText);
    const delimiter = cells.every((cell) => /^:?-{2,}:?$/.test(cell));
    rows.push({ line: index, raw, cells, html: [], header: !delimiter && rows.length === 0, delimiter });
  }
  if (rows.length === 0) {
    return undefined;
  }
  const columns = Math.max(...rows.map((row) => row.cells.length));
  const contentRows = rows.filter((row) => !row.delimiter);
  const advance = frameAdvance();
  for (const row of contentRows) {
    row.html = row.raw.map(cellHtml);
  }
  const widths: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    if (advance > 0) {
      const widest = Math.max(0, ...contentRows.map((row) => measureCell(row.html[column] ?? '')));
      widths.push(Math.max(1, Math.ceil(widest / advance)));
      continue;
    }
    widths.push(Math.max(1, ...rows.map((row) => displayWidth(row.cells[column] ?? ''))));
  }
  const alignments = columnAlignments(rows, columns);
  const frame = glyphs.frame;
  const prefix = quotePrefix(depth, glyphs);
  const border = (left: string, middle: string, right: string): string =>
    `${prefix}<span class="markdown-edita-frame">${left}${widths
      .map((width) => repeat(frame.horizontal, width + 2))
      .join(middle)}${right}</span>`;
  const groups: string[][] = sourceLines.map(() => []);
  for (const row of rows) {
    if (row.delimiter) {
      groups[row.line].push(border(frame.teeRight, frame.cross, frame.teeLeft));
      continue;
    }
    const cells = widths.map((width, column) => {
      const align = alignments[column] ?? 'left';
      const markup =
        advance > 0
          ? `<span class="markdown-edita-cell markdown-edita-cell-${align}" style="width:${(width * advance).toFixed(2)}px">${decorateHtml(row.html[column] ?? '', false).html}</span>`
          : `<span class="markdown-edita-cell">${padCell(cellText(row.raw[column] ?? ''), width, align)}</span>`;
      return row.header ? `<span class="markdown-edita-table-head"> ${markup} </span>` : ` ${markup} `;
    });
    groups[row.line].push(
      `${prefix}<span class="markdown-edita-frame">${frame.vertical}</span>${cells.join(`<span class="markdown-edita-frame">${frame.vertical}</span>`)}<span class="markdown-edita-frame">${frame.vertical}</span>`,
    );
  }
  return {
    head: border(frame.topLeft, frame.teeDown, frame.topRight),
    rows: groups.map((group) => group.join('\n')),
    foot: border(frame.bottomLeft, frame.teeUp, frame.bottomRight),
  };
}

export interface FramedFence {
  head: string;
  rows: string[];
  foot: string;
}

export function renderFramedFence(lines: string[], language: string, glyphs: GlyphSet, depth = 0): FramedFence {
  const frame = glyphs.frame;
  const prefix = quotePrefix(depth, glyphs);
  const code = lines.length > 0 ? lines.slice() : [''];
  const label = language.trim().length > 0 ? language.trim() : glyphs.code;
  const labelWidth = displayWidth(label);
  const numberWidth = String(Math.max(code.length, 1)).length;
  const decorated = code.map((line) => decorateHtml(line, true));
  const textWidth = Math.max(12, ...decorated.map((line) => line.width));
  const contentWidth = Math.max(textWidth, labelWidth + 1 - numberWidth);
  const ruleWidth = contentWidth + numberWidth + 5;
  const head = `${prefix}<span class="markdown-edita-frame">${frame.topLeft}${frame.horizontal} </span><span class="markdown-edita-fence-lang">${escapeHtml(label)}</span><span class="markdown-edita-frame"> ${repeat(frame.horizontal, ruleWidth - labelWidth - 5)}${frame.topRight}</span>`;
  const rows = decorated.map((line, index) => {
    const number = String(index + 1).padStart(numberWidth, ' ');
    const padding = ' '.repeat(Math.max(0, contentWidth - line.width));
    return `${prefix}<span class="markdown-edita-frame">${frame.vertical}</span><span class="markdown-edita-fence-number">${number}</span><span class="markdown-edita-frame">${frame.vertical}</span><span class="markdown-edita-fence-code"> ${line.html}${padding}</span><span class="markdown-edita-frame"> ${frame.vertical}</span>`;
  });
  const foot = `${prefix}<span class="markdown-edita-frame">${frame.bottomLeft}${repeat(frame.horizontal, ruleWidth - 2)}${frame.bottomRight}</span>`;
  return { head, rows, foot };
}
