export interface MdPosition {
  line: number;
  character: number;
}

export interface MdRange {
  start: MdPosition;
  end: MdPosition;
}

export interface MdHeading {
  level: number;
  line: number;
  startCharacter: number;
  endCharacter: number;
  text: string;
  slug: string;
}

export interface MdDefinition {
  label: string;
  normalizedLabel: string;
  target: string;
  title: string;
  line: number;
  startCharacter: number;
  endCharacter: number;
  targetStartCharacter: number;
  targetEndCharacter: number;
}

export type MdLinkKind = 'inline' | 'reference' | 'shortcut' | 'autolink';

export interface MdFootnote {
  label: string;
  normalizedLabel: string;
  line: number;
  startCharacter: number;
  endCharacter: number;
  text: string;
}

export interface MdFootnoteRef {
  label: string;
  normalizedLabel: string;
  line: number;
  startCharacter: number;
  endCharacter: number;
}

export interface MdAlert {
  kind: string;
  line: number;
  lastLine: number;
  startCharacter: number;
  endCharacter: number;
}

export interface MdLink {
  kind: MdLinkKind;
  isImage: boolean;
  line: number;
  startCharacter: number;
  endCharacter: number;
  textStartCharacter: number;
  textEndCharacter: number;
  targetStartCharacter: number;
  targetEndCharacter: number;
  text: string;
  target: string;
  path: string;
  anchor: string;
  title: string;
  label: string;
}

export interface MdFence {
  startLine: number;
  endLine: number;
  indent: string;
  marker: string;
  info: string;
}

export interface MdInterval {
  from: number;
  to: number;
}

export interface MdScan {
  lines: string[];
  headings: MdHeading[];
  links: MdLink[];
  definitions: MdDefinition[];
  definitionByLabel: Map<string, MdDefinition>;
  footnotes: MdFootnote[];
  footnoteByLabel: Map<string, MdFootnote>;
  footnoteRefs: MdFootnoteRef[];
  alerts: MdAlert[];
  fences: MdFence[];
  maskedLines: string[];
  codeIntervals: Map<number, MdInterval[]>;
}

const ATX_HEADING = /^( {0,3})(#{1,6})([ \t]+|$)(.*)$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const SETEXT = /^( {0,3})(=+|-+)[ \t]*$/;
const DEFINITION = /^( {0,3})\[((?:[^\[\]\\]|\\.)*)\]:[ \t]*(.*)$/;
const FOOTNOTE_DEFINITION = /^( {0,3})\[\^([^\]\s]+)\]:/;
const FOOTNOTE_LABEL = /^\^[^\]\s]+$/;
const QUOTE_PREFIX = /^(?: {0,3}>[ \t]?)+/;
const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\]/i;
const AUTOLINK_LITERAL =
  /(?:https?:\/\/[^\s<>`]+|www\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+[^\s<>`]*|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/y;
const HTML_BLOCK_START =
  /^( {0,3})<(script|pre|style|textarea|div|table|details|summary|iframe|svg|video|audio|section|figure|nav|form|ul|ol|li|blockquote|p|h[1-6]|hr|br|img|!--|\?|!)[\s/>]/i;

export function isEscaped(line: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && line[i] === '\\'; i -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

export function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function plainInline(markdown: string): string {
  let text = markdown;
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, '$1');
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');
  text = text.replace(/`+([^`]*)`+/g, '$1');
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  text = text.replace(/___([^_]+)___/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/\*([^*\n]+)\*/g, '$1');
  text = text.replace(/(^|[^\w])_([^_\n]+)_/g, '$1$2');
  text = text.replace(/~~([^~]+)~~/g, '$1');
  text = text.replace(/<([a-z][a-z0-9+.-]*:[^>]*)>/gi, '$1');
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1');
  return text.trim();
}

export function slugifyHeading(text: string): string {
  return plainInline(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function findHeading(headings: MdHeading[], anchor: string): MdHeading | undefined {
  const decoded = safeDecode(anchor).trim();
  if (decoded.length === 0) {
    return undefined;
  }
  const slug = slugifyHeading(decoded);
  const exact = headings.find((heading) => heading.slug === slug);
  if (exact) {
    return exact;
  }
  const stripped = slug.replace(/-\d+$/, '');
  const partial = headings.find(
    (heading) => heading.slug.replace(/-\d+$/, '') === stripped,
  );
  if (partial) {
    return partial;
  }
  const plain = plainInline(decoded).toLowerCase();
  return headings.find((heading) => plainInline(heading.text).toLowerCase() === plain);
}

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isExternalTarget(path: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//');
}

export function autolinkTarget(raw: string): string {
  if (/^www\./i.test(raw)) {
    return `http://${raw}`;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return raw;
  }
  return `mailto:${raw}`;
}

export function findFootnote(footnotes: MdFootnote[], anchor: string): MdFootnote | undefined {
  const decoded = safeDecode(anchor).trim().replace(/^(?:user-content-)?fn-?/i, '').replace(/^\^/, '');
  const normalized = normalizeLabel(decoded);
  if (normalized.length === 0) {
    return undefined;
  }
  return footnotes.find((footnote) => footnote.normalizedLabel === normalizeLabel(`^${decoded}`) || footnote.normalizedLabel === normalized);
}

function trimAutolink(raw: string): string {
  let end = raw.length;
  while (end > 0) {
    const char = raw[end - 1];
    if ('.,:;!?\'\u2019"*_~'.includes(char)) {
      end -= 1;
      continue;
    }
    if (char === ')') {
      const head = raw.slice(0, end);
      const opens = head.split('(').length - 1;
      const closes = head.split(')').length - 1;
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return raw.slice(0, end);
}

function matchAutolink(text: string, cursor: number): { raw: string; end: number } | undefined {
  const before = cursor === 0 ? '' : text[cursor - 1];
  if (before.length > 0 && /[\p{L}\p{N}_+\-.@]/u.test(before)) {
    return undefined;
  }
  AUTOLINK_LITERAL.lastIndex = cursor;
  const match = AUTOLINK_LITERAL.exec(text);
  if (!match) {
    return undefined;
  }
  const raw = trimAutolink(match[0]);
  if (raw.length < 4) {
    return undefined;
  }
  const last = raw[raw.length - 1];
  const balancedClose = last === ')' && raw.split('(').length === raw.split(')').length;
  if (!/[A-Za-z0-9/_#=%~-]/.test(last) && !balancedClose) {
    return undefined;
  }
  return { raw, end: cursor + raw.length };
}

export function splitLinkTarget(raw: string): { path: string; anchor: string } {
  let target = raw.trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }
  const hashIndex = findUnescaped(target, '#');
  if (hashIndex < 0) {
    return { path: safeDecode(target), anchor: '' };
  }
  return {
    path: safeDecode(target.slice(0, hashIndex).trim()),
    anchor: safeDecode(target.slice(hashIndex + 1).trim()),
  };
}

function findUnescaped(text: string, needle: string): number {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === needle) {
      return i;
    }
  }
  return -1;
}

interface MaskResult {
  masked: string[];
  codeIntervals: Map<number, MdInterval[]>;
  fences: MdFence[];
}

function addInterval(intervals: Map<number, MdInterval[]>, line: number, from: number, to: number): void {
  const list = intervals.get(line);
  const interval = { from, to };
  if (list) {
    list.push(interval);
  } else {
    intervals.set(line, [interval]);
  }
}

function maskToEnd(masked: string[], intervals: Map<number, MdInterval[]>, lines: string[], startLine: number, endLine: number): void {
  for (let line = startLine; line <= endLine && line < lines.length; line += 1) {
    addInterval(intervals, line, 0, lines[line].length);
    masked[line] = ' '.repeat(lines[line].length);
  }
}

function maskBlocks(lines: string[]): MaskResult {
  const masked = lines.map((line) => line);
  const codeIntervals: Map<number, MdInterval[]> = new Map();
  const fences: MdFence[] = [];

  let frontMatterClosed = lines.length === 0 || lines[0].trim() !== '---';
  if (!frontMatterClosed) {
    for (let line = 1; line < lines.length; line += 1) {
      const trimmed = lines[line].trim();
      if (trimmed === '---' || trimmed === '...') {
        maskToEnd(masked, codeIntervals, lines, 0, line);
        frontMatterClosed = true;
        break;
      }
    }
    if (!frontMatterClosed) {
      maskToEnd(masked, codeIntervals, lines, 0, lines.length - 1);
    }
  }

  let line = 0;
  while (line < lines.length) {
    const text = lines[line];
    const fence = FENCE.exec(text);
    if (fence) {
      const marker = fence[2];
      const indent = fence[1];
      let endLine = lines.length - 1;
      for (let candidate = line + 1; candidate < lines.length; candidate += 1) {
        const closing = FENCE.exec(lines[candidate]);
        if (
          closing &&
          closing[2][0] === marker[0] &&
          closing[2].length >= marker.length &&
          closing[3].trim().length === 0
        ) {
          endLine = candidate;
          break;
        }
      }
      fences.push({
        startLine: line,
        endLine,
        indent,
        marker,
        info: fence[3].trim(),
      });
      maskToEnd(masked, codeIntervals, lines, line, endLine);
      line = endLine + 1;
      continue;
    }
    if (HTML_BLOCK_START.test(text)) {
      let endLine = line;
      if (text.trimStart().startsWith('<!--')) {
        while (endLine < lines.length && !lines[endLine].includes('-->')) {
          endLine += 1;
        }
        endLine = Math.min(endLine, lines.length - 1);
      } else {
        while (endLine + 1 < lines.length && lines[endLine + 1].trim().length > 0) {
          endLine += 1;
        }
      }
      maskToEnd(masked, codeIntervals, lines, line, endLine);
      line = endLine + 1;
      continue;
    }
    line += 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    let text = masked[index];
    if (text.trim().length === 0) {
      continue;
    }
    let cursor = 0;
    while (cursor < text.length) {
      if (text[cursor] !== '`' || isEscaped(text, cursor)) {
        cursor += 1;
        continue;
      }
      let runEnd = cursor;
      while (runEnd < text.length && text[runEnd] === '`') {
        runEnd += 1;
      }
      const runLength = runEnd - cursor;
      let closeStart = -1;
      let probe = runEnd;
      while (probe < text.length) {
        if (text[probe] !== '`' || isEscaped(text, probe)) {
          probe += 1;
          continue;
        }
        let closeEnd = probe;
        while (closeEnd < text.length && text[closeEnd] === '`') {
          closeEnd += 1;
        }
        if (closeEnd - probe === runLength) {
          closeStart = probe;
          break;
        }
        probe = closeEnd;
      }
      if (closeStart < 0) {
        cursor = runEnd;
        continue;
      }
      const spanEnd = closeStart + runLength;
      addInterval(codeIntervals, index, cursor, spanEnd);
      text = text.slice(0, cursor) + ' '.repeat(spanEnd - cursor) + text.slice(spanEnd);
      masked[index] = text;
      cursor = spanEnd;
    }
  }

  return { masked, codeIntervals, fences };
}

function readDestination(text: string, start: number): { value: string; end: number } | undefined {
  let index = start;
  while (index < text.length && (text[index] === ' ' || text[index] === '\t')) {
    index += 1;
  }
  if (index >= text.length) {
    return undefined;
  }
  if (text[index] === '<') {
    const close = text.indexOf('>', index + 1);
    if (close < 0) {
      return undefined;
    }
    return { value: text.slice(index + 1, close), end: close + 1 };
  }
  const valueStart = index;
  let depth = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      if (depth === 0) {
        break;
      }
      depth -= 1;
    } else if (/\s/.test(char)) {
      break;
    }
    index += 1;
  }
  if (index === valueStart) {
    return undefined;
  }
  return { value: text.slice(valueStart, index), end: index };
}

function readTitle(text: string, start: number): { value: string; end: number } | undefined {
  let index = start;
  while (index < text.length && (text[index] === ' ' || text[index] === '\t')) {
    index += 1;
  }
  if (index >= text.length) {
    return undefined;
  }
  const open = text[index];
  const close = open === '(' ? ')' : open;
  if (open !== '"' && open !== "'" && open !== '(') {
    return undefined;
  }
  const end = text.indexOf(close, index + 1);
  if (end < 0) {
    return undefined;
  }
  return { value: text.slice(index + 1, end), end: end + 1 };
}

function findClosingBracket(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function findTitleEnd(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

interface LinkScan {
  links: MdLink[];
  footnoteRefs: MdFootnoteRef[];
}

function scanLinks(
  masked: string[],
  definitions: MdDefinition[],
  footnotes: MdFootnote[],
  alerts: MdAlert[],
): LinkScan {
  const links: MdLink[] = [];
  const footnoteRefs: MdFootnoteRef[] = [];
  const definitionLines = new Set(definitions.map((definition) => definition.line));
  const footnoteMarkers = new Map<number, number>();
  for (const footnote of footnotes) {
    footnoteMarkers.set(footnote.line, footnote.endCharacter);
  }
  const alertMarkers = new Map<number, Set<number>>();
  for (const alert of alerts) {
    const existing = alertMarkers.get(alert.line);
    if (existing) {
      existing.add(alert.startCharacter);
    } else {
      alertMarkers.set(alert.line, new Set([alert.startCharacter]));
    }
  }

  for (let lineIndex = 0; lineIndex < masked.length; lineIndex += 1) {
    const text = masked[lineIndex];
    if (text.trim().length === 0 || definitionLines.has(lineIndex)) {
      continue;
    }
    let cursor = footnoteMarkers.get(lineIndex) ?? 0;
    while (cursor < text.length) {
      const char = text[cursor];
      if (char === '\\') {
        cursor += 2;
        continue;
      }
      if (char === '<' && !isEscaped(text, cursor)) {
        const close = text.indexOf('>', cursor + 1);
        if (close > cursor && /^[a-z][a-z0-9+.-]*:/i.test(text.slice(cursor + 1, close))) {
          const target = text.slice(cursor + 1, close);
          const { path, anchor } = splitLinkTarget(target);
          links.push({
            kind: 'autolink',
            isImage: false,
            line: lineIndex,
            startCharacter: cursor,
            endCharacter: close + 1,
            textStartCharacter: cursor + 1,
            textEndCharacter: close,
            targetStartCharacter: cursor + 1,
            targetEndCharacter: close,
            text: target,
            target,
            path,
            anchor,
            title: '',
            label: '',
          });
          cursor = close + 1;
          continue;
        }
        cursor += 1;
        continue;
      }
      const literal = matchAutolink(text, cursor);
      if (literal) {
        const target = autolinkTarget(literal.raw);
        links.push({
          kind: 'autolink',
          isImage: false,
          line: lineIndex,
          startCharacter: cursor,
          endCharacter: literal.end,
          textStartCharacter: cursor,
          textEndCharacter: literal.end,
          targetStartCharacter: cursor,
          targetEndCharacter: literal.end,
          text: literal.raw,
          target,
          path: target,
          anchor: '',
          title: '',
          label: '',
        });
        cursor = literal.end;
        continue;
      }
      const isImage = char === '!' && text[cursor + 1] === '[';
      if (char !== '[' && !isImage) {
        cursor += 1;
        continue;
      }
      const open = isImage ? cursor + 1 : cursor;
      const close = findClosingBracket(text, open);
      if (close < 0) {
        cursor += 1;
        continue;
      }
      const label = text.slice(open + 1, close);
      let after = close + 1;
      while (after < text.length && (text[after] === ' ' || text[after] === '\t')) {
        after += 1;
      }
      if (after < text.length && text[after] === '(') {
        const end = findTitleEnd(text, after);
        if (end >= 0) {
          const destination = readDestination(text, after + 1);
          if (!destination || destination.end > end) {
            cursor = close + 1;
            continue;
          }
          const title = readTitle(text, destination.end);
          const { path, anchor } = splitLinkTarget(destination.value);
          links.push({
            kind: 'inline',
            isImage,
            line: lineIndex,
            startCharacter: isImage ? cursor : open,
            endCharacter: end + 1,
            textStartCharacter: open + 1,
            textEndCharacter: close,
            targetStartCharacter: after + 1,
            targetEndCharacter: destination.end,
            text: label,
            target: destination.value,
            path,
            anchor,
            title: title && title.end <= end ? title.value : '',
            label: '',
          });
          cursor = end + 1;
          continue;
        }
      }
      if (after < text.length && text[after] === '[') {
        const labelClose = text.indexOf(']', after + 1);
        if (labelClose > after) {
          const reference = text.slice(after + 1, labelClose);
          const effective = reference.length === 0 ? label : reference;
          links.push({
            kind: 'reference',
            isImage,
            line: lineIndex,
            startCharacter: isImage ? cursor : open,
            endCharacter: labelClose + 1,
            textStartCharacter: open + 1,
            textEndCharacter: close,
            targetStartCharacter: after + 1,
            targetEndCharacter: labelClose,
            text: label,
            target: effective,
            path: '',
            anchor: '',
            title: '',
            label: reference.length === 0 ? label : reference,
          });
          cursor = labelClose + 1;
          continue;
        }
      }
      const shortcutLabel = text.slice(open + 1, close);
      if (alertMarkers.get(lineIndex)?.has(open)) {
        cursor = close + 1;
        continue;
      }
      if (!isImage && FOOTNOTE_LABEL.test(shortcutLabel)) {
        footnoteRefs.push({
          label: shortcutLabel,
          normalizedLabel: normalizeLabel(shortcutLabel),
          line: lineIndex,
          startCharacter: open,
          endCharacter: close + 1,
        });
        cursor = close + 1;
        continue;
      }
      const before = text.slice(0, open).replace(/[ \t]+$/, '');
      const taskMarker = /^\s*(?:[-*+]|\d+[.)])$/.test(before) && /^\s*[xX]?\s*$/.test(shortcutLabel);
      if (taskMarker) {
        cursor = close + 1;
        continue;
      }
      links.push({
        kind: 'shortcut',
        isImage,
        line: lineIndex,
        startCharacter: isImage ? cursor : open,
        endCharacter: close + 1,
        textStartCharacter: open + 1,
        textEndCharacter: close,
        targetStartCharacter: open + 1,
        targetEndCharacter: close,
        text: label,
        target: label,
        path: '',
        anchor: '',
        title: '',
        label,
      });
      cursor = close + 1;
    }
  }
  return { links, footnoteRefs };
}

function stripDefinitionReference(label: string): string {
  return label.replace(/\\([\\\[\]])/g, '$1');
}

function scanDefinitions(lines: string[], masked: string[]): MdDefinition[] {
  const definitions: MdDefinition[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = DEFINITION.exec(masked[index]);
    if (!match) {
      continue;
    }
    const label = stripDefinitionReference(match[2]);
    if (label.trim().length === 0 || label.startsWith('^')) {
      continue;
    }
    const rest = match[3];
    const restStart = match[1].length + match[2].length + 4;
    if (rest.trim().length === 0) {
      continue;
    }
    const destination = readDestination(rest, 0);
    if (!destination) {
      continue;
    }
    const title = readTitle(rest, destination.end);
    definitions.push({
      label,
      normalizedLabel: normalizeLabel(label),
      target: destination.value,
      title: title ? title.value : '',
      line: index,
      startCharacter: 0,
      endCharacter: match[1].length + match[2].length + 3,
      targetStartCharacter: restStart + destination.end - destination.value.length,
      targetEndCharacter: restStart + destination.end,
    });
  }
  return definitions;
}

function scanFootnoteDefinitions(lines: string[], masked: string[]): MdFootnote[] {
  const footnotes: MdFootnote[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = FOOTNOTE_DEFINITION.exec(masked[index]);
    if (!match) {
      continue;
    }
    const label = `^${match[2]}`;
    footnotes.push({
      label,
      normalizedLabel: normalizeLabel(label),
      line: index,
      startCharacter: match[1].length,
      endCharacter: match[0].length,
      text: lines[index].slice(match[0].length).trim(),
    });
  }
  return footnotes;
}

function scanAlerts(lines: string[], masked: string[]): MdAlert[] {
  const alerts: MdAlert[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const text = masked[index];
    const prefix = QUOTE_PREFIX.exec(text);
    if (!prefix) {
      continue;
    }
    const marker = ALERT_MARKER.exec(text.slice(prefix[0].length));
    if (!marker) {
      continue;
    }
    let lastLine = index;
    for (let next = index + 1; next < lines.length; next += 1) {
      if (!QUOTE_PREFIX.test(masked[next])) {
        break;
      }
      lastLine = next;
    }
    alerts.push({
      kind: marker[1].toLowerCase(),
      line: index,
      lastLine,
      startCharacter: prefix[0].length,
      endCharacter: prefix[0].length + marker[0].length,
    });
    index = lastLine;
  }
  return alerts;
}

export function isCodePosition(scan: MdScan, position: MdPosition): boolean {
  const intervals = scan.codeIntervals.get(position.line);
  if (!intervals) {
    return false;
  }
  return intervals.some((interval) => position.character >= interval.from && position.character <= interval.to);
}

export function scanMarkdown(text: string): MdScan {
  const lines = text.split(/\r\n|[\n\r]/);
  const { masked, codeIntervals, fences } = maskBlocks(lines);
  const definitions = scanDefinitions(lines, masked);
  const definitionByLabel = new Map<string, MdDefinition>();
  for (const definition of definitions) {
    if (!definitionByLabel.has(definition.normalizedLabel)) {
      definitionByLabel.set(definition.normalizedLabel, definition);
    }
  }
  const headings: MdHeading[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = ATX_HEADING.exec(masked[index]);
    if (match) {
      const text = match[4].replace(/[ \t]+#+[ \t]*$/, '').trim();
      const startCharacter = match[1].length + match[2].length;
      headings.push({
        level: match[2].length,
        line: index,
        startCharacter,
        endCharacter: lines[index].length,
        text,
        slug: slugifyHeading(text),
      });
      continue;
    }
    if (index + 1 < lines.length && masked[index].trim().length > 0 && !SETEXT.test(masked[index])) {
      const setext = SETEXT.exec(masked[index + 1]);
      if (setext && !isCodePosition({ codeIntervals } as unknown as MdScan, { line: index, character: 0 })) {
        const text = masked[index].trim();
        headings.push({
          level: setext[2][0] === '=' ? 1 : 2,
          line: index,
          startCharacter: 0,
          endCharacter: lines[index].length,
          text,
          slug: slugifyHeading(text),
        });
      }
    }
  }
  const footnotes = scanFootnoteDefinitions(lines, masked);
  const footnoteByLabel = new Map<string, MdFootnote>();
  for (const footnote of footnotes) {
    if (!footnoteByLabel.has(footnote.normalizedLabel)) {
      footnoteByLabel.set(footnote.normalizedLabel, footnote);
    }
  }
  const alerts = scanAlerts(lines, masked);
  const { links, footnoteRefs } = scanLinks(masked, definitions, footnotes, alerts);
  return {
    lines,
    headings,
    links,
    definitions,
    definitionByLabel,
    footnotes,
    footnoteByLabel,
    footnoteRefs,
    alerts,
    fences,
    maskedLines: masked,
    codeIntervals,
  };
}
