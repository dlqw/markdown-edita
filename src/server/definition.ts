import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Location, Position } from 'vscode-languageserver/node';
import { findHeading, isExternalTarget, normalizeLabel, scanMarkdown, type MdScan } from '../shared/mdscan';
import { fileExists, makeRange, readTextFile } from './util';

export function provideDefinition(
  uri: string,
  scan: MdScan,
  position: Position,
  directory: string | undefined,
): Location | Location[] | null {
  const footnote = scan.footnoteRefs.find(
    (candidate) =>
      candidate.line === position.line &&
      position.character >= candidate.startCharacter &&
      position.character <= candidate.endCharacter,
  );
  if (footnote) {
    const definition = scan.footnoteByLabel.get(footnote.normalizedLabel);
    return definition === undefined
      ? null
      : { uri, range: makeRange(definition.line, definition.startCharacter, definition.endCharacter) };
  }
  const link = scan.links.find(
    (candidate) =>
      candidate.line === position.line &&
      position.character >= candidate.startCharacter &&
      position.character <= candidate.endCharacter,
  );
  if (!link) {
    return null;
  }
  if (link.kind === 'reference' || link.kind === 'shortcut') {
    const definition = scan.definitionByLabel.get(normalizeLabel(link.label));
    if (!definition) {
      return null;
    }
    return {
      uri,
      range: makeRange(definition.line, definition.targetStartCharacter, definition.targetEndCharacter),
    };
  }
  if (link.kind !== 'inline' || link.path.length === 0 || isExternalTarget(link.path) || !directory) {
    return null;
  }
  const resolved = path.resolve(directory, link.path);
  if (!fileExists(resolved)) {
    return null;
  }
  const targetUri = pathToFileURL(resolved).toString();
  if (link.anchor.length > 0) {
    const text = readTextFile(resolved);
    if (text !== undefined) {
      const heading = findHeading(scanMarkdown(text).headings, link.anchor);
      if (heading) {
        return { uri: targetUri, range: makeRange(heading.line, heading.startCharacter, heading.endCharacter) };
      }
    }
  }
  return { uri: targetUri, range: makeRange(0, 0, 0) };
}
