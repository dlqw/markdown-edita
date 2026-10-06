import * as path from 'node:path';
import type { Diagnostic, Range } from 'vscode-languageserver/node';
import {
  isCodePosition,
  isExternalTarget,
  normalizeLabel,
  type MdDefinition,
  type MdHeading,
  type MdScan,
} from '../shared/mdscan';
import type { LintSettings } from './settings';
import { severityFor } from './settings';
import { fileExists, makeRange } from './util';

const ATX_NO_SPACE = /^( {0,3})(#{1,6})(?!#)([^ \t].*)$/;
const ATX_SPACING = /^( {0,3})(#{1,6})([ \t]+)(.*)$/;
const TRAILING_WHITESPACE = /[ ]+$/;

function headingRange(heading: MdHeading): Range {
  return makeRange(heading.line, heading.startCharacter, heading.endCharacter);
}

function addDiagnostic(
  diagnostics: Diagnostic[],
  settings: LintSettings,
  rule: string,
  range: Range,
  message: string,
): void {
  const severity = severityFor(settings, rule);
  if (severity === undefined) {
    return;
  }
  diagnostics.push({ range, message, severity, source: 'markdown-edita', code: rule });
}

function checkHeadingIncrement(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  let previous = 0;
  for (const heading of scan.headings) {
    if (heading.level > previous + 1) {
      addDiagnostic(
        diagnostics,
        settings,
        'heading-increment',
        headingRange(heading),
        `Heading level jumps from ${previous} to ${heading.level}.`,
      );
    }
    previous = heading.level;
  }
}

function checkSingleH1(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  let seen = false;
  for (const heading of scan.headings) {
    if (heading.level !== 1) {
      continue;
    }
    if (seen) {
      addDiagnostic(
        diagnostics,
        settings,
        'single-h1',
        headingRange(heading),
        'Document contains more than one level 1 heading.',
      );
    }
    seen = true;
  }
}

function checkDuplicateHeading(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  const seen = new Set<string>();
  for (const heading of scan.headings) {
    const key = `${heading.level}:${heading.slug}`;
    if (seen.has(key)) {
      addDiagnostic(
        diagnostics,
        settings,
        'duplicate-heading',
        headingRange(heading),
        `Duplicate level ${heading.level} heading.`,
      );
    }
    seen.add(key);
  }
}

function checkMissingSpaceAtx(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  for (let line = 0; line < scan.lines.length; line += 1) {
    const match = ATX_NO_SPACE.exec(scan.lines[line]);
    if (!match) {
      continue;
    }
    const indent = match[1].length;
    if (isCodePosition(scan, { line, character: indent })) {
      continue;
    }
    addDiagnostic(
      diagnostics,
      settings,
      'missing-space-atx',
      makeRange(line, indent, indent + match[2].length),
      'ATX heading marker must be followed by a space.',
    );
  }
}

function checkMultipleSpaceAtx(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  for (const heading of scan.headings) {
    if (isCodePosition(scan, { line: heading.line, character: heading.startCharacter })) {
      continue;
    }
    const match = ATX_SPACING.exec(scan.lines[heading.line]);
    if (!match || match[3].length <= 1) {
      continue;
    }
    const rest = match[4].replace(/[ \t]+#+[ \t]*$/, '').trim();
    if (rest.length === 0) {
      continue;
    }
    const start = match[1].length + match[2].length;
    addDiagnostic(
      diagnostics,
      settings,
      'multiple-space-atx',
      makeRange(heading.line, start, start + match[3].length),
      'ATX heading marker must be followed by a single space.',
    );
  }
}

function checkNoHardTabs(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  for (let line = 0; line < scan.lines.length; line += 1) {
    const text = scan.lines[line];
    if (!text.includes('\t')) {
      continue;
    }
    const inFence = scan.fences.some((fence) => line >= fence.startLine && line <= fence.endLine);
    const inHtml = (scan.codeIntervals.get(line) ?? []).some(
      (interval) => interval.from === 0 && interval.to >= text.length,
    );
    if (inFence || inHtml) {
      continue;
    }
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== '\t') {
        continue;
      }
      addDiagnostic(
        diagnostics,
        settings,
        'no-hard-tabs',
        makeRange(line, index, index + 1),
        'Hard tab character is not allowed.',
      );
    }
  }
}

function checkTrailingSpaces(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  for (let line = 0; line < scan.lines.length; line += 1) {
    const text = scan.lines[line];
    const match = TRAILING_WHITESPACE.exec(text);
    if (!match) {
      continue;
    }
    const count = match[0].length;
    if (count !== 1 && count < 3) {
      continue;
    }
    addDiagnostic(
      diagnostics,
      settings,
      'trailing-spaces',
      makeRange(line, text.length - count, text.length),
      'Trailing whitespace.',
    );
  }
}

function checkMultipleBlanks(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  let previousBlank = false;
  for (let line = 0; line < scan.lines.length; line += 1) {
    const blank = scan.lines[line].trim().length === 0;
    if (blank) {
      if (previousBlank && !isCodePosition(scan, { line, character: 0 })) {
        addDiagnostic(
          diagnostics,
          settings,
          'multiple-blanks',
          makeRange(line, 0, scan.lines[line].length),
          'Multiple consecutive blank lines.',
        );
      }
    }
    previousBlank = blank;
  }
}

function checkFencedCodeLanguage(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  for (const fence of scan.fences) {
    if (fence.info.length > 0 || fence.endLine <= fence.startLine) {
      continue;
    }
    addDiagnostic(
      diagnostics,
      settings,
      'fenced-code-language',
      makeRange(fence.startLine, 0, scan.lines[fence.startLine].length),
      'Fenced code block should declare a language.',
    );
  }
}

function checkBrokenLink(
  diagnostics: Diagnostic[],
  settings: LintSettings,
  scan: MdScan,
  directory: string | undefined,
): void {
  if (!directory) {
    return;
  }
  for (const link of scan.links) {
    if (link.path.length === 0 || isExternalTarget(link.path)) {
      continue;
    }
    const resolved = path.resolve(directory, link.path);
    if (fileExists(resolved)) {
      continue;
    }
    addDiagnostic(
      diagnostics,
      settings,
      'broken-link',
      makeRange(link.line, link.startCharacter, link.endCharacter),
      `Link target does not exist: ${link.path}`,
    );
  }
}

function checkUndefinedReference(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  for (const link of scan.links) {
    if (link.kind !== 'reference' && link.kind !== 'shortcut') {
      continue;
    }
    if (scan.definitionByLabel.has(normalizeLabel(link.label))) {
      continue;
    }
    addDiagnostic(
      diagnostics,
      settings,
      'undefined-reference',
      makeRange(link.line, link.startCharacter, link.endCharacter),
      `Reference is not defined: ${link.label}`,
    );
  }
}

function checkUnusedDefinition(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  const used = new Set<MdDefinition>();
  for (const link of scan.links) {
    if (link.kind !== 'reference' && link.kind !== 'shortcut') {
      continue;
    }
    const definition = scan.definitionByLabel.get(normalizeLabel(link.label));
    if (definition) {
      used.add(definition);
    }
  }
  for (const definition of scan.definitions) {
    if (used.has(definition)) {
      continue;
    }
    addDiagnostic(
      diagnostics,
      settings,
      'unused-definition',
      makeRange(definition.line, definition.startCharacter, definition.endCharacter),
      `Definition is never referenced: ${definition.label}`,
    );
  }
}

function checkEmptyLink(diagnostics: Diagnostic[], settings: LintSettings, scan: MdScan): void {
  for (const link of scan.links) {
    if (link.text.length > 0 || link.path.length > 0 || link.target.length > 0) {
      continue;
    }
    addDiagnostic(
      diagnostics,
      settings,
      'empty-link',
      makeRange(link.line, link.startCharacter, link.endCharacter),
      'Link is empty.',
    );
  }
}

export function computeDiagnostics(
  scan: MdScan,
  settings: LintSettings,
  directory: string | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  checkHeadingIncrement(diagnostics, settings, scan);
  checkSingleH1(diagnostics, settings, scan);
  checkDuplicateHeading(diagnostics, settings, scan);
  checkMissingSpaceAtx(diagnostics, settings, scan);
  checkMultipleSpaceAtx(diagnostics, settings, scan);
  checkNoHardTabs(diagnostics, settings, scan);
  checkTrailingSpaces(diagnostics, settings, scan);
  checkMultipleBlanks(diagnostics, settings, scan);
  checkFencedCodeLanguage(diagnostics, settings, scan);
  checkBrokenLink(diagnostics, settings, scan, directory);
  checkUndefinedReference(diagnostics, settings, scan);
  checkUnusedDefinition(diagnostics, settings, scan);
  checkEmptyLink(diagnostics, settings, scan);
  diagnostics.sort(
    (a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character,
  );
  return diagnostics;
}
