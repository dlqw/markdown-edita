import * as path from 'node:path';
import { MarkupKind } from 'vscode-languageserver/node';
import type { Hover, Position } from 'vscode-languageserver/node';
import {
  findHeading,
  isExternalTarget,
  normalizeLabel,
  plainInline,
  scanMarkdown,
  type MdHeading,
  type MdLink,
  type MdScan,
} from '../shared/mdscan';
import { fileExists, readTextFile } from './util';

function anchorHeading(scan: MdScan, link: MdLink, directory: string | undefined): MdHeading | undefined {
  if (link.path.length === 0) {
    return findHeading(scan.headings, link.anchor);
  }
  if (!directory || isExternalTarget(link.path)) {
    return undefined;
  }
  const resolved = path.resolve(directory, link.path);
  const text = readTextFile(resolved);
  if (text === undefined) {
    return undefined;
  }
  return findHeading(scanMarkdown(text).headings, link.anchor);
}

function linkHover(scan: MdScan, link: MdLink, directory: string | undefined): Hover | null {
  const lines: string[] = [];
  if (link.kind === 'reference' || link.kind === 'shortcut') {
    lines.push(`Label: \`${link.label}\``);
    const definition = scan.definitionByLabel.get(normalizeLabel(link.label));
    if (definition) {
      lines.push(`Definition: \`${definition.target}\` (line ${definition.line + 1})`);
    } else {
      lines.push('Definition: not found');
    }
  } else {
    if (link.path.length > 0) {
      if (directory && !isExternalTarget(link.path)) {
        const resolved = path.resolve(directory, link.path);
        lines.push(`Target: \`${resolved}\``);
        lines.push(fileExists(resolved) ? 'Exists: yes' : 'Exists: no');
      } else {
        lines.push(`Target: \`${link.target}\``);
      }
    }
    if (link.anchor.length > 0) {
      const heading = anchorHeading(scan, link, directory);
      if (heading) {
        lines.push(`Heading: ${plainInline(heading.text)}`);
      }
    }
  }
  if (lines.length === 0) {
    return null;
  }
  return { contents: { kind: MarkupKind.Markdown, value: lines.join('\n\n') } };
}

function headingPath(scan: MdScan, target: MdHeading): string {
  const stack: MdHeading[] = [];
  for (const heading of scan.headings) {
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }
    stack.push(heading);
    if (heading === target) {
      break;
    }
  }
  return stack.map((heading) => `${'#'.repeat(heading.level)} ${plainInline(heading.text)}`).join('\n');
}

export function provideHover(scan: MdScan, position: Position, directory: string | undefined): Hover | null {
  const link = scan.links.find(
    (candidate) =>
      candidate.line === position.line &&
      position.character >= candidate.startCharacter &&
      position.character <= candidate.endCharacter,
  );
  if (link) {
    return linkHover(scan, link, directory);
  }
  const fence = scan.fences.find((candidate) => {
    if (candidate.startLine !== position.line || candidate.info.length === 0) {
      return false;
    }
    const infoStart = candidate.indent.length + candidate.marker.length;
    return position.character >= infoStart && position.character <= (scan.lines[candidate.startLine] ?? '').length;
  });
  if (fence) {
    return { contents: { kind: MarkupKind.Markdown, value: `Language: \`${fence.info}\`` } };
  }
  const heading = scan.headings.find(
    (candidate) =>
      candidate.line === position.line &&
      position.character >= candidate.startCharacter &&
      position.character <= candidate.endCharacter,
  );
  if (heading) {
    return { contents: { kind: MarkupKind.Markdown, value: headingPath(scan, heading) } };
  }
  return null;
}
