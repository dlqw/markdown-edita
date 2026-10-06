import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { LanguageRegistration, ThemeRegistrationRaw } from 'shiki';
import { bridge } from './bridge';
import { paletteColor, type PaletteSlot } from './palette';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (character) => ESCAPES[character]);
}

export function plainCodeLines(code: string): string[] {
  return code.split('\n').map((line) => escapeHtml(line));
}

export interface CodeRun {
  from: number;
  to: number;
  className: string;
}

export interface CodeLine {
  text: string;
  runs: CodeRun[];
}

interface GrammarEntry {
  lang: string;
  grammars: string[];
}

type GrammarIndex = Record<string, GrammarEntry>;

interface ThemeIndex {
  palettes: Record<string, string>;
  fallback: Record<string, string>;
}

const TOKEN_CACHE_LIMIT = 512;
const MONO_THEME = 'markdown-edita-mono';
const HOST_THEME_PREFIX = 'markdown-edita-vscode-';

const listeners = new Set<() => void>();
const tokenCache = new Map<string, CodeLine[]>();
const loadedGrammars = new Set<string>();
const failedLanguages = new Set<string>();
const loadingLanguages = new Set<string>();
const queuedLanguages = new Set<string>();
const classNames = new Map<string, string>();
const styleRules: string[] = [];

let grammarIndex: GrammarIndex | undefined;
let themeIndex: ThemeIndex | undefined;
let highlighter: HighlighterCore | undefined;
let starting: Promise<void> | undefined;
let palette = 'tokyo';
let hostTheme: CodeTheme | undefined;
let hostThemeCount = 0;
let activeThemeName = '';
let generation = 0;
let styleElement: HTMLStyleElement | undefined;
let stylePending = false;
let indexRequest: Promise<GrammarIndex | undefined> | undefined;


type CodeTheme = ThemeRegistrationRaw & { name: string };

function themeRegistration(raw: unknown, fallbackName: string): CodeTheme | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const rules = 'tokenColors' in raw ? raw.tokenColors : 'settings' in raw ? raw.settings : undefined;
  if (!Array.isArray(rules)) {
    return undefined;
  }
  const name = 'name' in raw && typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : fallbackName;
  const registration: CodeTheme = { name, settings: rules };
  if ('type' in raw && (raw.type === 'dark' || raw.type === 'light')) {
    registration.type = raw.type;
  }
  if ('colors' in raw && typeof raw.colors === 'object' && raw.colors !== null) {
    const colors: Record<string, string> = {};
    for (const [key, color] of Object.entries(raw.colors)) {
      if (typeof color === 'string') {
        colors[key] = color;
      }
    }
    registration.colors = colors;
  }
  return registration;
}

function stringMap(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const map: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      map[key] = entry;
    }
  }
  return map;
}

function mediaBase(): string {
  const meta = document.querySelector('meta[name="markdown-edita-media"]');
  return meta?.getAttribute('content') ?? '';
}

async function fetchJson(relative: string): Promise<unknown> {
  const response = await fetch(`${mediaBase()}${relative}`);
  if (!response.ok) {
    throw new Error(`markdown-edita asset ${relative} answered ${response.status}`);
  }
  return await response.json();
}

async function fetchTheme(relative: string): Promise<CodeTheme | undefined> {
  return themeRegistration(await fetchJson(relative), relative);
}

function bump(): void {
  generation += 1;
  for (const listener of listeners) {
    listener();
  }
}

function report(text: string): void {
  bridge.send({ t: 'log', level: 'warning', text });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function onCodeAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function flushStyles(): void {
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.dataset.markdownEditaTokens = 'true';
    document.head.append(styleElement);
  }
  styleElement.textContent = styleRules.join('');
}

function scheduleStyles(): void {
  if (stylePending) {
    return;
  }
  stylePending = true;
  queueMicrotask(() => {
    stylePending = false;
    flushStyles();
  });
}

function classFor(color: string, fontStyle: number): string {
  const key = `${color}|${fontStyle}`;
  const known = classNames.get(key);
  if (known) {
    return known;
  }
  const name = `markdown-edita-tok-${classNames.size}`;
  classNames.set(key, name);
  let rule = `.cm-content .${name}{color:${color}`;
  if ((fontStyle & 1) !== 0) {
    rule += ';font-style:italic';
  }
  if ((fontStyle & 2) !== 0) {
    rule += ';font-weight:700';
  }
  if ((fontStyle & 4) !== 0) {
    rule += ';text-decoration:underline';
  }
  styleRules.push(`${rule}}`);
  scheduleStyles();
  return name;
}

function monoTheme(): CodeTheme {
  const slot = (name: PaletteSlot): string => paletteColor('mono', name);
  return {
    name: MONO_THEME,
    type: 'dark',
    colors: {
      'editor.foreground': slot('text'),
      'editor.background': slot('codeBg'),
    },
    settings: [
      { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: slot('dim'), fontStyle: 'italic' } },
      { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier'], settings: { foreground: slot('strong') } },
      {
        scope: ['string', 'constant.numeric', 'constant.language', 'constant.character.escape'],
        settings: { foreground: slot('code') },
      },
      { scope: ['entity.name.function', 'support.function', 'meta.function-call'], settings: { foreground: slot('h4') } },
      {
        scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'entity.name.tag'],
        settings: { foreground: slot('h5') },
      },
      {
        scope: ['variable.other.property', 'entity.other.attribute-name', 'meta.object-literal.key'],
        settings: { foreground: slot('h3') },
      },
      {
        scope: ['keyword.operator', 'punctuation', 'punctuation.separator', 'punctuation.terminator'],
        settings: { foreground: slot('url') },
      },
      { scope: ['variable', 'entity.name'], settings: { foreground: slot('text') } },
      { scope: ['invalid', 'invalid.illegal'], settings: { foreground: slot('error') } },
    ],
  };
}

async function loadThemeIndex(): Promise<ThemeIndex> {
  if (!themeIndex) {
    const raw = await fetchJson('themes/index.json');
    const source = typeof raw === 'object' && raw !== null ? raw : {};
    themeIndex = {
      palettes: stringMap('palettes' in source ? source.palettes : undefined),
      fallback: stringMap('fallback' in source ? source.fallback : undefined),
    };
  }
  return themeIndex;
}

async function resolveTheme(): Promise<CodeTheme | undefined> {
  if (palette === 'mono') {
    return monoTheme();
  }
  const known = await loadThemeIndex();
  if (palette === 'vscode') {
    if (hostTheme) {
      return hostTheme;
    }
    const light = document.body.classList.contains('vscode-light');
    const file = known.fallback[light ? 'light' : 'dark'];
    return file ? await fetchTheme(`themes/${file}.json`) : undefined;
  }
  const file = known.palettes[palette] ?? known.fallback.dark;
  return file ? await fetchTheme(`themes/${file}.json`) : undefined;
}

async function start(): Promise<void> {
  if (highlighter) {
    return;
  }
  if (!starting) {
    starting = (async () => {
      try {
        const theme = await resolveTheme();
        if (!theme) {
          return;
        }
        highlighter = await createHighlighterCore({
          themes: [theme],
          langs: [],
          engine: createJavaScriptRegexEngine({ forgiving: true }),
        });
        activeThemeName = theme.name;
      } catch (error) {
        starting = undefined;
        report(`markdown-edita code highlighting disabled: ${describe(error)}`);
      } finally {
        bump();
      }
    })();
  }
  await starting;
  if (highlighter) {
    const queued = [...queuedLanguages];
    queuedLanguages.clear();
    for (const name of queued) {
      void loadLanguage(name);
    }
  }
}

async function applyTheme(): Promise<void> {
  const core = highlighter;
  if (!core) {
    void start();
    return;
  }
  try {
    const theme = await resolveTheme();
    if (!theme || theme.name === activeThemeName) {
      return;
    }
    await core.loadTheme(theme);
    activeThemeName = theme.name;
    tokenCache.clear();
    bump();
  } catch (error) {
    tokenCache.clear();
    report(`markdown-edita code theme ${palette} failed: ${describe(error)}`);
  }
}

export function setCodePalette(name: string): void {
  if (name === palette) {
    return;
  }
  palette = name;
  tokenCache.clear();
  void applyTheme();
}

export function setHostTheme(value: unknown): void {
  hostThemeCount += 1;
  const name = `${HOST_THEME_PREFIX}${hostThemeCount}`;
  const theme = themeRegistration(value, name);
  if (!theme) {
    return;
  }
  hostTheme = { ...theme, name };
  if (palette === 'vscode') {
    tokenCache.clear();
    void applyTheme();
  }
}

async function loadIndex(): Promise<GrammarIndex | undefined> {
  if (grammarIndex) {
    return grammarIndex;
  }
  if (!indexRequest) {
    indexRequest = (async () => {
      try {
        const raw = await fetchJson('langs/index.json');
        if (typeof raw === 'object' && raw !== null) {
          grammarIndex = raw as GrammarIndex;
        }
      } catch (error) {
        report(`markdown-edita code languages unavailable: ${describe(error)}`);
      }
      return grammarIndex;
    })();
  }
  return await indexRequest;
}

export function preloadCodeLanguages(names: Iterable<string>): void {
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (key.length > 0) {
      void loadLanguage(key);
    }
  }
}

async function loadLanguage(key: string): Promise<void> {
  const index = await loadIndex();
  if (!index) {
    return;
  }
  const entry = index[key];
  if (!entry) {
    failedLanguages.add(key);
    return;
  }
  const core = highlighter;
  if (!core) {
    queuedLanguages.add(key);
    void start();
    return;
  }
  if (entry.grammars.every((name) => loadedGrammars.has(name))) {
    return;
  }
  if (loadingLanguages.has(key)) {
    return;
  }
  loadingLanguages.add(key);
  try {
    const grammars: LanguageRegistration[] = [];
    let broken = false;
    for (const name of entry.grammars) {
      if (loadedGrammars.has(name)) {
        continue;
      }
      try {
        grammars.push((await fetchJson(`langs/${name}.json`)) as LanguageRegistration);
      } catch {
        broken = true;
      }
    }
    if (broken || grammars.length === 0) {
      failedLanguages.add(key);
      failedLanguages.add(entry.lang);
      report(`markdown-edita code grammar for ${key} could not be read`);
      return;
    }
    try {
      await core.loadLanguage(...grammars);
    } catch (error) {
      failedLanguages.add(key);
      failedLanguages.add(entry.lang);
      report(`markdown-edita code grammar for ${key} failed: ${describe(error)}`);
      return;
    }
    for (const grammar of grammars) {
      loadedGrammars.add(grammar.name);
    }
    tokenCache.clear();
    bump();
  } finally {
    loadingLanguages.delete(key);
  }
}

function languageKey(info: string): string {
  const first = info.trim().split(/\s+/)[0] ?? '';
  return first.replace(/^\{[^}]*\}/, '').trim().toLowerCase();
}

function requestLanguage(key: string): void {
  if (failedLanguages.has(key)) {
    return;
  }
  void loadIndex().then((index) => {
    if (!index) {
      return;
    }
    if (index[key]) {
      void loadLanguage(key);
    } else {
      failedLanguages.add(key);
    }
  });
}

function tokenize(code: string, entry: GrammarEntry): CodeLine[] | undefined {
  const core = highlighter;
  if (!core) {
    return undefined;
  }
  let result;
  try {
    result = core.codeToTokens(code, { lang: entry.lang, theme: activeThemeName });
  } catch {
    return undefined;
  }
  const fallbackColor = result.fg ?? '';
  const lines: CodeLine[] = [];
  for (const tokens of result.tokens) {
    const runs: CodeRun[] = [];
    let position = 0;
    let text = '';
    for (const token of tokens) {
      text += token.content;
      if (token.content.length > 0) {
        runs.push({
          from: position,
          to: position + token.content.length,
          className: classFor(token.color ?? fallbackColor, token.fontStyle ?? 0),
        });
      }
      position += token.content.length;
    }
    lines.push({ text, runs });
  }
  return lines;
}

export function highlightCode(code: string, info: string): CodeLine[] | undefined {
  const key = languageKey(info);
  if (key.length === 0) {
    return undefined;
  }
  if (highlighter === undefined) {
    void start();
  }
  const entry = grammarIndex?.[key];
  if (!entry) {
    requestLanguage(key);
    return undefined;
  }
  if (failedLanguages.has(key) || failedLanguages.has(entry.lang)) {
    return undefined;
  }
  if (!entry.grammars.every((name) => loadedGrammars.has(name))) {
    requestLanguage(key);
    return undefined;
  }
  const cacheKey = `${key}\u0000${code}`;
  const cached = tokenCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const lines = tokenize(code, entry);
  if (!lines) {
    return undefined;
  }
  if (tokenCache.size >= TOKEN_CACHE_LIMIT) {
    tokenCache.clear();
  }
  tokenCache.set(cacheKey, lines);
  return lines;
}

function codeLinesHtml(lines: CodeLine[]): string[] {
  return lines.map((line) => {
    if (line.runs.length === 0) {
      return escapeHtml(line.text);
    }
    let html = '';
    let position = 0;
    for (const run of line.runs) {
      if (run.from > position) {
        html += escapeHtml(line.text.slice(position, run.from));
      }
      html += `<span class="${run.className}">${escapeHtml(line.text.slice(run.from, run.to))}</span>`;
      position = run.to;
    }
    return html + escapeHtml(line.text.slice(position));
  });
}

export function highlightFenceLines(code: string, info: string): string[] | undefined {
  const lines = highlightCode(code, info);
  return lines ? codeLinesHtml(lines) : undefined;
}
