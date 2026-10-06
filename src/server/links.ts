import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DocumentLink } from 'vscode-languageserver/node';
import { isExternalTarget, normalizeLabel, splitLinkTarget, type MdScan } from '../shared/mdscan';
import { makeRange } from './util';

export function provideDocumentLinks(
  uri: string,
  scan: MdScan,
  directory: string | undefined,
): DocumentLink[] {
  const links: DocumentLink[] = [];
  for (const reference of scan.footnoteRefs) {
    if (!scan.footnoteByLabel.has(reference.normalizedLabel)) {
      continue;
    }
    links.push({
      range: makeRange(reference.line, reference.startCharacter, reference.endCharacter),
      target: `${uri}#fn-${reference.label.replace(/^\^/, '')}`,
    });
  }
  for (const link of scan.links) {
    if (link.isImage) {
      continue;
    }
    const range = makeRange(link.line, link.startCharacter, link.endCharacter);
    if (link.kind === 'inline' || link.kind === 'autolink') {
      if (link.path.length === 0) {
        if (link.anchor.length > 0) {
          links.push({ range, target: `${uri}#${link.anchor}` });
        }
        continue;
      }
      if (isExternalTarget(link.path)) {
        links.push({ range, target: link.target });
        continue;
      }
      if (!directory) {
        continue;
      }
      const resolved = path.resolve(directory, link.path);
      const base = pathToFileURL(resolved).toString();
      links.push({ range, target: link.anchor.length > 0 ? `${base}#${link.anchor}` : base });
      continue;
    }
    const definition = scan.definitionByLabel.get(normalizeLabel(link.label));
    if (!definition) {
      continue;
    }
    const fragment = splitLinkTarget(definition.target).anchor;
    links.push({ range, target: fragment.length > 0 ? `${uri}#${fragment}` : uri });
  }
  return links;
}
