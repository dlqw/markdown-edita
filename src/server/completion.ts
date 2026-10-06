import * as fs from 'node:fs';
import * as path from 'node:path';
import { CompletionItemKind } from 'vscode-languageserver/node';
import type { CompletionItem, Position } from 'vscode-languageserver/node';
import type { MdScan } from '../shared/mdscan';

const FENCE_LANGUAGES: string[] = [
  'plaintext',
  'text',
  'markdown',
  'md',
  'mermaid',
  'html',
  'xml',
  'svg',
  'css',
  'scss',
  'sass',
  'less',
  'javascript',
  'js',
  'jsx',
  'typescript',
  'ts',
  'tsx',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'ini',
  'bash',
  'sh',
  'shell',
  'zsh',
  'powershell',
  'cmd',
  'bat',
  'c',
  'cpp',
  'csharp',
  'java',
  'kotlin',
  'scala',
  'go',
  'rust',
  'php',
  'ruby',
  'python',
  'py',
  'swift',
  'dart',
  'lua',
  'perl',
  'r',
  'julia',
  'haskell',
  'elixir',
  'erlang',
  'clojure',
  'fsharp',
  'sql',
  'graphql',
  'dockerfile',
  'makefile',
  'diff',
  'tex',
  'latex',
  'asm',
  'vim',
  'nginx',
  'apache',
  'csv',
  'vue',
  'svelte',
  'protobuf',
];

function referenceCompletion(scan: MdScan, before: string): CompletionItem[] | null {
  const index = before.lastIndexOf('][');
  if (index < 0) {
    return null;
  }
  const tail = before.slice(index + 2);
  if (tail.includes(']') || tail.includes('[')) {
    return null;
  }
  if (scan.definitions.length === 0) {
    return null;
  }
  return scan.definitions.map((definition) => ({
    label: definition.label,
    kind: CompletionItemKind.Reference,
    insertText: definition.label,
  }));
}

function fenceCompletion(before: string): CompletionItem[] | null {
  if (!/^ {0,3}`{3,}[^`]*$/.test(before)) {
    return null;
  }
  return FENCE_LANGUAGES.map((language) => ({
    label: language,
    kind: CompletionItemKind.Value,
    insertText: language,
  }));
}

function linkDestination(line: string, cursor: number): string | undefined {
  const index = line.lastIndexOf('](', cursor - 1);
  if (index < 0) {
    return undefined;
  }
  const open = index + 2;
  if (open > cursor) {
    return undefined;
  }
  const content = line.slice(open, cursor);
  if (content.includes(')')) {
    return undefined;
  }
  return content;
}

function headingCompletion(scan: MdScan): CompletionItem[] | null {
  if (scan.headings.length === 0) {
    return null;
  }
  return scan.headings.map((heading) => {
    const insert = `#${heading.slug}`;
    return { label: insert, kind: CompletionItemKind.Reference, insertText: insert };
  });
}

function destinationCompletion(
  scan: MdScan,
  content: string,
  directory: string | undefined,
): CompletionItem[] | null {
  if (content.length === 0 || content.startsWith('#')) {
    return headingCompletion(scan);
  }
  if (!directory) {
    return null;
  }
  const slash = content.lastIndexOf('/');
  const dirPart = slash >= 0 ? content.slice(0, slash + 1) : '';
  try {
    const entries = fs.readdirSync(path.resolve(directory, dirPart), { withFileTypes: true });
    return entries.map((entry) => {
      const isDirectory = entry.isDirectory();
      const label = isDirectory ? `${entry.name}/` : entry.name;
      return {
        label,
        kind: isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
        insertText: `${dirPart}${label}`,
      };
    });
  } catch {
    return null;
  }
}

export function provideCompletion(
  scan: MdScan,
  position: Position,
  directory: string | undefined,
): CompletionItem[] | null {
  const line = scan.lines[position.line] ?? '';
  const cursor = Math.min(position.character, line.length);
  const before = line.slice(0, cursor);
  const reference = referenceCompletion(scan, before);
  if (reference) {
    return reference;
  }
  const fence = fenceCompletion(before);
  if (fence) {
    return fence;
  }
  const destination = linkDestination(line, cursor);
  if (destination !== undefined) {
    return destinationCompletion(scan, destination, directory);
  }
  return null;
}
