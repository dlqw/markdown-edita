import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { CodeThemePayload } from './protocol';
import { candidateOf, loadThemeJson, type ThemeCandidate } from './themefile';

interface LocalCandidate {
  theme: ThemeCandidate;
  extension: vscode.Extension<unknown>;
  resolved?: string;
}

const themeCache = new Map<string, CodeThemePayload | undefined>();
const messageCache = new Map<string, Record<string, string>>();

export async function resolveCodeTheme(): Promise<CodeThemePayload | undefined> {
  const label = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
  if (!label || label.trim().length === 0) {
    return undefined;
  }
  const cached = themeCache.get(label);
  if (cached !== undefined) {
    return cached;
  }
  const theme = await lookup(label.trim());
  themeCache.set(label, theme);
  return theme;
}

async function lookup(label: string): Promise<CodeThemePayload | undefined> {
  const candidates = collect();
  const exact = candidates.find((candidate) => matches(candidate.theme, label));
  const chosen = exact ?? (await translated(candidates, label));
  if (!chosen) {
    return undefined;
  }
  const loaded = await loadThemeJson(chosen.theme.file);
  if (!loaded) {
    return undefined;
  }
  const light = chosen.theme.uiTheme === 'vs' || chosen.theme.uiTheme === 'hc-light';
  return {
    name: chosen.resolved ?? chosen.theme.label,
    type: loaded.type ?? (light ? 'light' : 'dark'),
    colors: loaded.colors,
    tokenColors: loaded.tokenColors,
  };
}

function stripDefault(label: string): string {
  return label.startsWith('Default ') ? label.slice('Default '.length) : label;
}

function matches(candidate: ThemeCandidate, label: string): boolean {
  return (
    candidate.label === label ||
    candidate.id === label ||
    stripDefault(candidate.label) === label ||
    stripDefault(label) === candidate.label
  );
}

function contributions(extension: vscode.Extension<unknown>): object[] {
  const pkg: unknown = extension.packageJSON;
  if (typeof pkg !== 'object' || pkg === null || !('contributes' in pkg)) {
    return [];
  }
  const contributes = pkg.contributes;
  if (typeof contributes !== 'object' || contributes === null || !('themes' in contributes)) {
    return [];
  }
  const themes = contributes.themes;
  if (!Array.isArray(themes)) {
    return [];
  }
  return themes.filter((theme): theme is object => typeof theme === 'object' && theme !== null);
}

function collect(): LocalCandidate[] {
  const candidates: LocalCandidate[] = [];
  for (const extension of vscode.extensions.all) {
    for (const entry of contributions(extension)) {
      const id = 'id' in entry && typeof entry.id === 'string' ? entry.id : '';
      const label = 'label' in entry && typeof entry.label === 'string' ? entry.label : '';
      const uiTheme = 'uiTheme' in entry && typeof entry.uiTheme === 'string' ? entry.uiTheme : 'vs-dark';
      const file = 'path' in entry && typeof entry.path === 'string' ? entry.path : '';
      const theme = candidateOf(extension.extensionPath, id, label, uiTheme, file);
      if (theme) {
        candidates.push({ theme, extension });
      }
    }
  }
  return candidates;
}

function resolveLabel(label: string, messages: Record<string, string>): string {
  const match = /^%(.*)%$/.exec(label);
  if (!match) {
    return label;
  }
  return messages[match[1]] ?? label;
}

async function translated(candidates: LocalCandidate[], label: string): Promise<LocalCandidate | undefined> {
  for (const candidate of candidates) {
    const messages = await messagesFor(candidate.extension);
    const resolved = resolveLabel(candidate.theme.label, messages);
    if (resolved === label || stripDefault(resolved) === label || stripDefault(label) === resolved) {
      return { ...candidate, resolved };
    }
  }
  return undefined;
}

async function messagesFor(extension: vscode.Extension<unknown>): Promise<Record<string, string>> {
  const cached = messageCache.get(extension.id);
  if (cached) {
    return cached;
  }
  const messages: Record<string, string> = {};
  const language = vscode.env.language.toLowerCase();
  await mergeNls(path.join(extension.extensionPath, 'package.nls.json'), messages);
  await mergeNls(path.join(extension.extensionPath, `package.nls.${language}.json`), messages);
  for (const pack of vscode.extensions.all) {
    await mergePack(pack, extension.id, language, messages);
  }
  messageCache.set(extension.id, messages);
  return messages;
}

async function mergePack(
  pack: vscode.Extension<unknown>,
  extensionId: string,
  language: string,
  messages: Record<string, string>,
): Promise<void> {
  const pkg: unknown = pack.packageJSON;
  if (typeof pkg !== 'object' || pkg === null || !('contributes' in pkg)) {
    return;
  }
  const contributes = pkg.contributes;
  if (typeof contributes !== 'object' || contributes === null || !('localizations' in contributes)) {
    return;
  }
  const localizations = contributes.localizations;
  if (!Array.isArray(localizations)) {
    return;
  }
  for (const localization of localizations) {
    if (typeof localization !== 'object' || localization === null) {
      continue;
    }
    const languageId = 'languageId' in localization && typeof localization.languageId === 'string' ? localization.languageId : '';
    if (languageId.toLowerCase() !== language || !('translations' in localization)) {
      continue;
    }
    const translations = localization.translations;
    if (!Array.isArray(translations)) {
      continue;
    }
    for (const translation of translations) {
      if (typeof translation !== 'object' || translation === null) {
        continue;
      }
      const id = 'id' in translation && typeof translation.id === 'string' ? translation.id : '';
      const target = 'path' in translation && typeof translation.path === 'string' ? translation.path : '';
      if (id.toLowerCase() !== extensionId.toLowerCase() || target.length === 0) {
        continue;
      }
      const resolved = path.isAbsolute(target) ? target : path.resolve(pack.extensionPath, target);
      const file =
        path.extname(resolved) === '.json'
          ? resolved
          : path.join(resolved, 'extensions', `${extensionId.toLowerCase()}.i18n.json`);
      await mergeNls(file, messages);
    }
  }
}

async function mergeNls(file: string, messages: Record<string, string>): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return;
  }
  const source =
    'contents' in parsed && typeof parsed.contents === 'object' && parsed.contents !== null && 'package' in parsed.contents
      ? parsed.contents.package
      : parsed;
  if (typeof source !== 'object' || source === null) {
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      messages[key] = value;
    }
  }
}
