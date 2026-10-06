export interface MarkdownEditaSettings {
  inline: boolean;
  blocks: boolean;
  images: boolean;
  previewMode: boolean;
  modalKeys: boolean;
  lineNumbers: boolean;
  relativeLineNumbers: boolean;
  lint: boolean;
  theme: string;
  glyphs: string;
}

export type DiagnosticSeverityName = 'error' | 'warning' | 'info' | 'hint';

export interface MarkdownEditaDiagnostic {
  from: number;
  to: number;
  severity: DiagnosticSeverityName;
  message: string;
  code: string;
}

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

export interface LinkTarget {
  from: number;
  to: number;
  target: string;
}

export type SyncReason = 'init' | 'external' | 'resync';

export interface CodeThemePayload {
  name: string;
  type: 'dark' | 'light';
  colors: Record<string, string>;
  tokenColors: unknown[];
}

export type HostMessage =
  | { t: 'sync'; text: string; reason: SyncReason; name: string; uri: string }
  | { t: 'settings'; settings: MarkdownEditaSettings }
  | { t: 'codetheme'; theme: CodeThemePayload }
  | { t: 'diagnostics'; items: MarkdownEditaDiagnostic[] }
  | { t: 'links'; items: LinkTarget[] }
  | { t: 'dirty'; value: boolean }
  | { t: 'goto'; line: number }
  | { t: 'lspResult'; id: number; result: unknown }
  | { t: 'lspError'; id: number; message: string }
  | { t: 'uris'; id: number; uris: Record<string, string> }
  | { t: 'notice'; level: 'info' | 'warning' | 'error'; text: string };

export type WebviewMessage =
  | { t: 'ready' }
  | { t: 'edit'; seq: number; changes: TextChange[] }
  | { t: 'lsp'; id: number; method: string; params: unknown }
  | { t: 'resolve'; id: number; paths: string[] }
  | { t: 'open'; href: string; line?: number; character?: number }
  | { t: 'save' }
  | { t: 'command'; id: string; args?: unknown[] }
  | {
      t: 'status';
      mode: string;
      line: number;
      column: number;
      length: number;
      total: number;
      diagnostics: number;
    }
  | { t: 'log'; level: 'info' | 'warning' | 'error'; text: string };
