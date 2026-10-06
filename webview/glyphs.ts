export interface FrameGlyphs {
  horizontal: string;
  vertical: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  teeDown: string;
  teeUp: string;
  teeRight: string;
  teeLeft: string;
  cross: string;
}

export interface GlyphSet {
  bullet: string;
  quote: string;
  rule: string;
  taskOpen: string;
  taskDone: string;
  heading: string;
  link: string;
  foldOpen: string;
  foldClosed: string;
  diagError: string;
  diagWarning: string;
  diagInfo: string;
  file: string;
  code: string;
  frame: FrameGlyphs;
}

const ASCII_FRAME: FrameGlyphs = {
  horizontal: '-',
  vertical: '|',
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  teeDown: '+',
  teeUp: '+',
  teeRight: '+',
  teeLeft: '+',
  cross: '+',
};

const NERD_FRAME: FrameGlyphs = {
  horizontal: '─',
  vertical: '│',
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  teeDown: '┬',
  teeUp: '┴',
  teeRight: '├',
  teeLeft: '┤',
  cross: '┼',
};

export const GLYPH_SETS: Record<string, GlyphSet> = {
  nerd: {
    bullet: '\u25b8',
    quote: '\u2503',
    rule: '\u2501',
    taskOpen: '\u2610',
    taskDone: '\u2611',
    heading: '#',
    link: '\u{1f4ce}',
    foldOpen: '\u25be',
    foldClosed: '\u25b8',
    diagError: 'x',
    diagWarning: '!',
    diagInfo: 'i',
    file: '\u25aa',
    code: 'txt',
    frame: NERD_FRAME,
  },
  ascii: {
    bullet: '*',
    quote: '>',
    rule: '-',
    taskOpen: '[ ]',
    taskDone: '[x]',
    heading: '#',
    link: '@',
    foldOpen: '-',
    foldClosed: '+',
    diagError: 'x',
    diagWarning: '!',
    diagInfo: 'i',
    file: '',
    code: 'txt',
    frame: ASCII_FRAME,
  },
};

let activeName = 'nerd';
let active = GLYPH_SETS.nerd;

export function glyphsFor(name: string): GlyphSet {
  return GLYPH_SETS[name] ?? GLYPH_SETS.nerd;
}

export function activeGlyphs(): GlyphSet {
  return active;
}

export function activeGlyphName(): string {
  return activeName;
}

export function applyGlyphs(name: string): void {
  activeName = name;
  active = glyphsFor(name);
  const root = document.documentElement;
  root.dataset.markdownEditaGlyphs = activeName;
  root.style.setProperty('--markdown-edita-diag-error', JSON.stringify(active.diagError));
  root.style.setProperty('--markdown-edita-diag-warning', JSON.stringify(active.diagWarning));
  root.style.setProperty('--markdown-edita-diag-info', JSON.stringify(active.diagInfo));
  root.style.setProperty('--markdown-edita-file-glyph', JSON.stringify(active.file));
  root.style.setProperty('--markdown-edita-rule-glyph', JSON.stringify(active.rule));
}
