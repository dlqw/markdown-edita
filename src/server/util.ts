import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Range } from 'vscode-languageserver/node';
import type { MdScan } from '../shared/mdscan';

export function makeRange(line: number, startCharacter: number, endCharacter: number): Range {
  return { start: { line, character: startCharacter }, end: { line, character: endCharacter } };
}

export function headingSectionEnd(scan: MdScan, index: number): number {
  const heading = scan.headings[index];
  for (let next = index + 1; next < scan.headings.length; next += 1) {
    if (scan.headings[next].level <= heading.level) {
      return Math.max(heading.line, scan.headings[next].line - 1);
    }
  }
  return scan.lines.length - 1;
}

export function documentDirectory(uri: string): string | undefined {
  if (!uri.startsWith('file:')) {
    return undefined;
  }
  try {
    return path.dirname(fileURLToPath(uri));
  } catch {
    return undefined;
  }
}

export function fileExists(filePath: string): boolean {
  try {
    fs.statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function readTextFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}
