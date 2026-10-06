import { DiagnosticSeverity } from 'vscode-languageserver/node';

export type LintSeverity = 'error' | 'warning' | 'info' | 'off';

export interface LintSettings {
  enabled: boolean;
  rules: Record<string, LintSeverity>;
}

export const DEFAULT_RULES: Record<string, LintSeverity> = {
  'heading-increment': 'warning',
  'single-h1': 'info',
  'duplicate-heading': 'warning',
  'missing-space-atx': 'error',
  'multiple-space-atx': 'info',
  'no-hard-tabs': 'warning',
  'trailing-spaces': 'info',
  'multiple-blanks': 'info',
  'fenced-code-language': 'info',
  'broken-link': 'warning',
  'undefined-reference': 'warning',
  'unused-definition': 'info',
  'empty-link': 'warning',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asSeverity(value: unknown): LintSeverity | undefined {
  if (value === 'error' || value === 'warning' || value === 'info' || value === 'off') {
    return value;
  }
  return undefined;
}

export function defaultLintSettings(): LintSettings {
  return { enabled: true, rules: { ...DEFAULT_RULES } };
}

export function normalizeSettings(raw: unknown): LintSettings {
  const settings = defaultLintSettings();
  const root = asRecord(raw);
  if (!root) {
    return settings;
  }
  const section = asRecord(root['markdown-edita']) ?? root;
  const lint = asRecord(section.lint);
  if (!lint) {
    return settings;
  }
  if (typeof lint.enabled === 'boolean') {
    settings.enabled = lint.enabled;
  }
  const rules = asRecord(lint.rules);
  if (rules) {
    for (const [name, value] of Object.entries(rules)) {
      const severity = asSeverity(value);
      if (severity) {
        settings.rules[name] = severity;
      }
    }
  }
  return settings;
}

export function severityFor(settings: LintSettings, rule: string): DiagnosticSeverity | undefined {
  const severity = settings.rules[rule];
  if (severity === 'error') {
    return DiagnosticSeverity.Error;
  }
  if (severity === 'warning') {
    return DiagnosticSeverity.Warning;
  }
  if (severity === 'info') {
    return DiagnosticSeverity.Information;
  }
  return undefined;
}
