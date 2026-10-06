import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const INCLUDE_LIMIT = 8;
const FOLDER_THEME = 'color-theme.json';

export interface ThemeCandidate {
  id: string;
  label: string;
  uiTheme: string;
  file: string;
}

function themePath(root: string, relative: string): string {
  return path.isAbsolute(relative) ? relative : path.resolve(root, relative);
}

async function themeFile(file: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(file);
    if (stats.isDirectory()) {
      const nested = path.join(file, FOLDER_THEME);
      await fs.access(nested);
      return nested;
    }
    return file;
  } catch {
    return undefined;
  }
}

function stringsOf(value: unknown): Record<string, string> {
  const strings: Record<string, string> = {};
  if (typeof value !== 'object' || value === null) {
    return strings;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      strings[key] = entry;
    }
  }
  return strings;
}

function rulesOf(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const rules = 'tokenColors' in value ? value.tokenColors : 'settings' in value ? value.settings : undefined;
  return Array.isArray(rules) ? rules : [];
}

export function candidateOf(root: string, id: string, label: string, uiTheme: string, file: string): ThemeCandidate | undefined {
  const trimmedLabel = label.trim();
  const trimmedFile = file.trim();
  if (trimmedLabel.length === 0 || trimmedFile.length === 0) {
    return undefined;
  }
  return { id, label: trimmedLabel, uiTheme, file: themePath(root, trimmedFile) };
}

export interface LoadedTheme {
  name: string;
  type?: 'dark' | 'light';
  colors: Record<string, string>;
  tokenColors: unknown[];
}

export async function loadThemeJson(file: string, seen = new Set<string>()): Promise<LoadedTheme | undefined> {
  const target = await themeFile(file);
  if (!target || seen.has(target) || seen.size >= INCLUDE_LIMIT) {
    return undefined;
  }
  seen.add(target);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(target, 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const colors: Record<string, string> = {};
  const tokenColors: unknown[] = [];
  let type: 'dark' | 'light' | undefined;
  if ('include' in parsed && typeof parsed.include === 'string' && parsed.include.length > 0) {
    const parent = await loadThemeJson(path.resolve(path.dirname(target), parsed.include), seen);
    if (parent) {
      Object.assign(colors, parent.colors);
      tokenColors.push(...parent.tokenColors);
      type = parent.type;
    }
  }
  Object.assign(colors, stringsOf('colors' in parsed ? parsed.colors : undefined));
  tokenColors.push(...rulesOf(parsed));
  if ('type' in parsed && (parsed.type === 'dark' || parsed.type === 'light')) {
    type = parsed.type;
  }
  const name =
    'name' in parsed && typeof parsed.name === 'string' && parsed.name.length > 0
      ? parsed.name
      : path.basename(target, path.extname(target));
  return { name, type, colors, tokenColors };
}
