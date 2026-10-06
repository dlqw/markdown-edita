import { FoldingRangeKind } from 'vscode-languageserver/node';
import type { FoldingRange } from 'vscode-languageserver/node';
import type { MdScan } from '../shared/mdscan';
import { headingSectionEnd } from './util';

export function provideFoldingRanges(scan: MdScan): FoldingRange[] {
  const ranges: FoldingRange[] = [];
  for (let index = 0; index < scan.headings.length; index += 1) {
    const endLine = headingSectionEnd(scan, index);
    if (endLine > scan.headings[index].line) {
      ranges.push({ startLine: scan.headings[index].line, endLine, kind: FoldingRangeKind.Comment });
    }
  }
  for (const fence of scan.fences) {
    if (fence.endLine > fence.startLine) {
      ranges.push({ startLine: fence.startLine, endLine: fence.endLine, kind: FoldingRangeKind.Region });
    }
  }
  return ranges;
}
