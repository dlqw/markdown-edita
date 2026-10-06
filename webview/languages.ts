import { LanguageDescription, LanguageSupport, StreamLanguage, type StreamParser } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { go } from '@codemirror/lang-go';
import { sql } from '@codemirror/lang-sql';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { csharp, scala, kotlin, dart } from '@codemirror/legacy-modes/mode/clike';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { r } from '@codemirror/legacy-modes/mode/r';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { perl } from '@codemirror/legacy-modes/mode/perl';
import { swift } from '@codemirror/legacy-modes/mode/swift';
import { erlang } from '@codemirror/legacy-modes/mode/erlang';
import { haskell } from '@codemirror/legacy-modes/mode/haskell';
import { pug } from '@codemirror/legacy-modes/mode/pug';

interface LanguageEntry {
  alias: string[];
  extensions: string[];
  support: () => LanguageSupport;
}

const stream = (parser: StreamParser<unknown>): LanguageSupport => new LanguageSupport(StreamLanguage.define(parser));

const TABLE: Record<string, LanguageEntry> = {
  javascript: {
    alias: ['js', 'jsx', 'mjs', 'cjs', 'node'],
    extensions: ['js', 'jsx', 'mjs', 'cjs'],
    support: () => javascript({ jsx: true }),
  },
  typescript: {
    alias: ['ts', 'tsx'],
    extensions: ['ts', 'tsx', 'mts', 'cts'],
    support: () => javascript({ jsx: true, typescript: true }),
  },
  python: { alias: ['py'], extensions: ['py'], support: () => python() },
  json: { alias: ['json5', 'jsonc'], extensions: ['json', 'jsonc'], support: () => json() },
  html: { alias: ['htm'], extensions: ['html', 'htm'], support: () => html() },
  css: { alias: ['scss', 'less'], extensions: ['css', 'scss', 'less'], support: () => css() },
  xml: { alias: ['svg', 'xsl'], extensions: ['xml', 'svg', 'xsl'], support: () => xml() },
  yaml: { alias: ['yml'], extensions: ['yaml', 'yml'], support: () => yaml() },
  rust: { alias: ['rs'], extensions: ['rs'], support: () => rust() },
  cpp: { alias: ['c', 'c++', 'cc', 'h', 'hpp'], extensions: ['c', 'cc', 'cpp', 'h', 'hpp'], support: () => cpp() },
  java: { alias: [], extensions: ['java'], support: () => java() },
  go: { alias: ['golang'], extensions: ['go'], support: () => go() },
  sql: { alias: ['mysql', 'postgres', 'sqlite', 'plsql'], extensions: ['sql'], support: () => sql() },
  csharp: { alias: ['cs', 'c#', 'dotnet'], extensions: ['cs'], support: () => stream(csharp) },
  kotlin: { alias: ['kt'], extensions: ['kt', 'kts'], support: () => stream(kotlin) },
  scala: { alias: [], extensions: ['scala'], support: () => stream(scala) },
  dart: { alias: [], extensions: ['dart'], support: () => stream(dart) },
  lua: { alias: [], extensions: ['lua'], support: () => stream(lua) },
  r: { alias: ['rscript'], extensions: ['r'], support: () => stream(r) },
  ruby: { alias: ['rb'], extensions: ['rb'], support: () => stream(ruby) },
  perl: { alias: ['pl'], extensions: ['pl', 'pm'], support: () => stream(perl) },
  swift: { alias: [], extensions: ['swift'], support: () => stream(swift) },
  erlang: { alias: ['erl'], extensions: ['erl'], support: () => stream(erlang) },
  haskell: { alias: ['hs'], extensions: ['hs'], support: () => stream(haskell) },
  pug: { alias: ['jade'], extensions: ['pug', 'jade'], support: () => stream(pug) },
  shell: { alias: ['sh', 'bash', 'zsh', 'console', 'shell-session'], extensions: ['sh', 'bash', 'zsh'], support: () => stream(shell) },
  dockerfile: { alias: ['docker'], extensions: ['dockerfile'], support: () => stream(dockerFile) },
  toml: { alias: [], extensions: ['toml'], support: () => stream(toml) },
  diff: { alias: ['patch'], extensions: ['diff', 'patch'], support: () => stream(diff) },
  ini: { alias: ['properties', 'conf', 'cfg'], extensions: ['ini', 'properties', 'conf'], support: () => stream(properties) },
  powershell: { alias: ['ps1', 'pwsh'], extensions: ['ps1'], support: () => stream(powerShell) },
};

const BUILT = Object.entries(TABLE).map(([name, entry]) => ({ name, entry, support: entry.support() }));
const BY_NAME = new Map<string, LanguageSupport>();

for (const { name, entry, support } of BUILT) {
  for (const key of [name, ...entry.alias, ...entry.extensions]) {
    BY_NAME.set(key.toLowerCase(), support);
  }
}

export function matchLanguage(name: string): LanguageSupport | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

export const codeLanguages = BUILT.map(({ name, entry, support }) =>
  LanguageDescription.of({
    name,
    alias: entry.alias,
    extensions: entry.extensions,
    load: async () => support,
  }),
);
