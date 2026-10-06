import { SymbolKind } from 'vscode-languageserver/node';
import type { DocumentSymbol } from 'vscode-languageserver/node';
import { plainInline, type MdScan } from '../shared/mdscan';
import { headingSectionEnd, makeRange } from './util';

export function provideSymbols(scan: MdScan): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  const stack: DocumentSymbol[] = [];
  const levels: number[] = [];
  for (let index = 0; index < scan.headings.length; index += 1) {
    const heading = scan.headings[index];
    const endLine = headingSectionEnd(scan, index);
    const symbol: DocumentSymbol = {
      name: plainInline(heading.text),
      kind: SymbolKind.String,
      range: {
        start: { line: heading.line, character: 0 },
        end: { line: endLine, character: scan.lines[endLine].length },
      },
      selectionRange: makeRange(heading.line, heading.startCharacter, heading.endCharacter),
      children: [],
    };
    while (stack.length > 0 && levels[levels.length - 1] >= heading.level) {
      stack.pop();
      levels.pop();
    }
    if (stack.length > 0) {
      stack[stack.length - 1].children?.push(symbol);
    } else {
      symbols.push(symbol);
    }
    stack.push(symbol);
    levels.push(heading.level);
  }
  return symbols;
}
