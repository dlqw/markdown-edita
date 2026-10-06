export const PALETTE_SLOTS = [
  'bg',
  'text',
  'dim',
  'border',
  'accent',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'strike',
  'link',
  'url',
  'code',
  'codeBg',
  'quote',
  'bullet',
  'task',
  'taskDone',
  'tableHead',
  'tableBorder',
  'frame',
  'math',
  'html',
  'error',
  'warning',
  'info',
] as const;

export type PaletteSlot = (typeof PALETTE_SLOTS)[number];

export type Palette = Record<PaletteSlot, string>;

const VSCODE_PALETTE: Palette = {
  bg: 'var(--vscode-editor-background)',
  text: 'var(--vscode-editor-foreground)',
  dim: 'var(--vscode-editorLineNumber-foreground, #7d8590)',
  border: 'var(--vscode-editorWidget-border, #3c3c3c)',
  accent: 'var(--vscode-terminal-ansiBrightCyan, #56d4dd)',
  h1: 'var(--vscode-terminal-ansiRed, #e06c75)',
  h2: 'var(--vscode-terminal-ansiYellow, #d7af5f)',
  h3: 'var(--vscode-terminal-ansiGreen, #89d185)',
  h4: 'var(--vscode-terminal-ansiCyan, #56b6c2)',
  h5: 'var(--vscode-terminal-ansiBlue, #6cb6ff)',
  h6: 'var(--vscode-terminal-ansiMagenta, #c586c0)',
  strong: 'var(--vscode-terminal-ansiBrightYellow, #f0d17a)',
  em: 'var(--vscode-terminal-ansiMagenta, #c586c0)',
  strike: 'var(--vscode-editorLineNumber-foreground, #7d8590)',
  link: 'var(--vscode-textLink-foreground, #4daafc)',
  url: 'var(--vscode-editorLineNumber-foreground, #7d8590)',
  code: 'var(--vscode-terminal-ansiGreen, #89d185)',
  codeBg: 'var(--vscode-textCodeBlock-background, rgba(128, 128, 128, 0.14))',
  quote: 'var(--vscode-editorLineNumber-foreground, #7d8590)',
  bullet: 'var(--vscode-terminal-ansiBrightCyan, #56d4dd)',
  task: 'var(--vscode-editorLineNumber-foreground, #7d8590)',
  taskDone: 'var(--vscode-terminal-ansiGreen, #89d185)',
  tableHead: 'var(--vscode-terminal-ansiBrightCyan, #56d4dd)',
  tableBorder: 'var(--vscode-editorWidget-border, #3c3c3c)',
  frame: 'var(--vscode-editorLineNumber-foreground, #7d8590)',
  math: 'var(--vscode-terminal-ansiCyan, #56b6c2)',
  html: 'var(--vscode-terminal-ansiCyan, #56b6c2)',
  error: 'var(--vscode-editorError-foreground, #f14c4c)',
  warning: 'var(--vscode-editorWarning-foreground, #cca700)',
  info: 'var(--vscode-editorInfo-foreground, #3794ff)',
};

export const PALETTES: Record<string, Palette> = {
  vscode: VSCODE_PALETTE,
  gruvbox: {
    bg: '#1d2021',
    text: '#ebdbb2',
    dim: '#928374',
    border: '#504945',
    accent: '#d79921',
    h1: '#fb4934',
    h2: '#fabd2f',
    h3: '#b8bb26',
    h4: '#8ec07c',
    h5: '#83a598',
    h6: '#d3869b',
    strong: '#fabd2f',
    em: '#d3869b',
    strike: '#928374',
    link: '#83a598',
    url: '#665c54',
    code: '#b8bb26',
    codeBg: '#282828',
    quote: '#928374',
    bullet: '#d79921',
    task: '#928374',
    taskDone: '#b8bb26',
    tableHead: '#fabd2f',
    tableBorder: '#504945',
    frame: '#665c54',
    math: '#83a598',
    html: '#8ec07c',
    error: '#fb4934',
    warning: '#fabd2f',
    info: '#83a598',
  },
  nord: {
    bg: '#2e3440',
    text: '#d8dee9',
    dim: '#7b88a1',
    border: '#434c5e',
    accent: '#88c0d0',
    h1: '#bf616a',
    h2: '#d08770',
    h3: '#ebcb8b',
    h4: '#a3be8c',
    h5: '#b48ead',
    h6: '#88c0d0',
    strong: '#ebcb8b',
    em: '#b48ead',
    strike: '#7b88a1',
    link: '#88c0d0',
    url: '#616e88',
    code: '#a3be8c',
    codeBg: '#292e39',
    quote: '#7b88a1',
    bullet: '#88c0d0',
    task: '#7b88a1',
    taskDone: '#a3be8c',
    tableHead: '#88c0d0',
    tableBorder: '#434c5e',
    frame: '#4c566a',
    math: '#8fbcbb',
    html: '#8fbcbb',
    error: '#bf616a',
    warning: '#ebcb8b',
    info: '#81a1c1',
  },
  dracula: {
    bg: '#282a36',
    text: '#f8f8f2',
    dim: '#6272a4',
    border: '#44475a',
    accent: '#ff79c6',
    h1: '#ff5555',
    h2: '#ffb86c',
    h3: '#f1fa8c',
    h4: '#50fa7b',
    h5: '#8be9fd',
    h6: '#bd93f9',
    strong: '#ffb86c',
    em: '#ff79c6',
    strike: '#6272a4',
    link: '#8be9fd',
    url: '#6272a4',
    code: '#50fa7b',
    codeBg: '#21222c',
    quote: '#6272a4',
    bullet: '#ff79c6',
    task: '#6272a4',
    taskDone: '#50fa7b',
    tableHead: '#ff79c6',
    tableBorder: '#44475a',
    frame: '#6272a4',
    math: '#8be9fd',
    html: '#50fa7b',
    error: '#ff5555',
    warning: '#ffb86c',
    info: '#8be9fd',
  },
  tokyo: {
    bg: '#24283b',
    text: '#c0caf5',
    dim: '#565f89',
    border: '#3b4261',
    accent: '#7aa2f7',
    h1: '#7aa2f7',
    h2: '#e0af68',
    h3: '#9ece6a',
    h4: '#1abc9c',
    h5: '#bb9af7',
    h6: '#9d7cd8',
    strong: '#ff9e64',
    em: '#bb9af7',
    strike: '#565f89',
    link: '#1abc9c',
    url: '#565f89',
    code: '#7aa2f7',
    codeBg: '#414868',
    quote: '#565f89',
    bullet: '#ff9e64',
    task: '#7aa2f7',
    taskDone: '#73daca',
    tableHead: '#f7768e',
    tableBorder: '#3b4261',
    frame: '#545c7e',
    math: '#7dcfff',
    html: '#2ac3de',
    error: '#f7768e',
    warning: '#e0af68',
    info: '#7aa2f7',
  },
  solarized: {
    bg: '#002b36',
    text: '#93a1a1',
    dim: '#586e75',
    border: '#073642',
    accent: '#268bd2',
    h1: '#dc322f',
    h2: '#b58900',
    h3: '#859900',
    h4: '#2aa198',
    h5: '#268bd2',
    h6: '#6c71c4',
    strong: '#b58900',
    em: '#6c71c4',
    strike: '#586e75',
    link: '#268bd2',
    url: '#586e75',
    code: '#859900',
    codeBg: '#073642',
    quote: '#586e75',
    bullet: '#b58900',
    task: '#586e75',
    taskDone: '#859900',
    tableHead: '#268bd2',
    tableBorder: '#073642',
    frame: '#586e75',
    math: '#2aa198',
    html: '#2aa198',
    error: '#dc322f',
    warning: '#b58900',
    info: '#268bd2',
  },
  mono: {
    bg: '#101010',
    text: '#d0d0d0',
    dim: '#707070',
    border: '#303030',
    accent: '#ffffff',
    h1: '#ffffff',
    h2: '#e8e8e8',
    h3: '#d8d8d8',
    h4: '#c8c8c8',
    h5: '#b8b8b8',
    h6: '#a8a8a8',
    strong: '#ffffff',
    em: '#c8c8c8',
    strike: '#707070',
    link: '#d0d0d0',
    url: '#808080',
    code: '#e0e0e0',
    codeBg: '#1a1a1a',
    quote: '#808080',
    bullet: '#ffffff',
    task: '#808080',
    taskDone: '#ffffff',
    tableHead: '#ffffff',
    tableBorder: '#404040',
    frame: '#606060',
    math: '#e0e0e0',
    html: '#d0d0d0',
    error: '#ffffff',
    warning: '#c0c0c0',
    info: '#a0a0a0',
  },
};

export function paletteFor(name: string): Palette {
  return PALETTES[name] ?? PALETTES.tokyo;
}

function resolveColor(value: string): string {
  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.display = 'none';
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved.length > 0 ? resolved : value;
}

function luminance(color: string): number {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    red = Number.parseInt(digits.slice(0, 2), 16);
    green = Number.parseInt(digits.slice(2, 4), 16);
    blue = Number.parseInt(digits.slice(4, 6), 16);
  } else {
    const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color);
    if (!rgb) {
      return 0.5;
    }
    red = Number(rgb[1]);
    green = Number(rgb[2]);
    blue = Number(rgb[3]);
  }
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

export function paletteColor(name: string, slot: PaletteSlot): string {
  return resolveColor(paletteFor(name)[slot]);
}

export function isDarkPalette(name: string): boolean {
  return luminance(resolveColor(paletteFor(name).bg)) < 0.5;
}

export function applyPalette(name: string): void {
  const palette = paletteFor(name);
  const root = document.documentElement;
  for (const slot of PALETTE_SLOTS) {
    root.style.setProperty(`--markdown-edita-${slot}`, palette[slot]);
  }
  root.dataset.markdownEditaPalette = name;
}
