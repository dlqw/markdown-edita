import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { findFootnote, findHeading, isExternalTarget, safeDecode, scanMarkdown, splitLinkTarget } from '../shared/mdscan';
import { buildWebviewHtml } from './html';
import { resolveCodeTheme } from './codetheme';
import type {
  DiagnosticSeverityName,
  HostMessage,
  LinkTarget,
  MarkdownEditaDiagnostic,
  SyncReason,
  TextChange,
  WebviewMessage,
} from './protocol';
import { readSettings } from './settings';

const LSP_METHODS = new Set([
  'textDocument/completion',
  'textDocument/hover',
  'textDocument/documentSymbol',
  'textDocument/foldingRange',
]);

const LINK_DEBOUNCE_MS = 250;
const MARKDOWN_FILE = /\.(md|markdown)$/i;

interface RemoteRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface RemoteDocumentLink {
  range: RemoteRange;
  target?: string;
}

export interface MarkdownEditaStatus {
  ready: boolean;
  mode: string;
  line: number;
  column: number;
  length: number;
  total: number;
  diagnostics: number;
  dirty: boolean;
}

function severityName(severity: vscode.DiagnosticSeverity): DiagnosticSeverityName {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'error';
    case vscode.DiagnosticSeverity.Warning:
      return 'warning';
    case vscode.DiagnosticSeverity.Information:
      return 'info';
    default:
      return 'hint';
  }
}

function resourceRoots(document: vscode.TextDocument, context: vscode.ExtensionContext): vscode.Uri[] {
  const roots = [vscode.Uri.joinPath(context.extensionUri, 'media')];
  if (document.uri.scheme !== 'file') {
    return roots;
  }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (folder) {
    roots.push(folder.uri);
  }
  roots.push(vscode.Uri.file(path.dirname(document.uri.fsPath)));
  return roots;
}

function documentDirectory(document: vscode.TextDocument): string | undefined {
  return document.uri.scheme === 'file' ? path.dirname(document.uri.fsPath) : undefined;
}

export class MarkdownEditaEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly sessions = new Map<string, MarkdownEditaSession>();
  private readonly pendingGoto = new Map<string, number>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: LanguageClient,
    private readonly output: vscode.OutputChannel,
  ) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const key = document.uri.toString();
    const initialLine = this.pendingGoto.get(key);
    this.pendingGoto.delete(key);
    const session = new MarkdownEditaSession(
      this.context,
      this.client,
      document,
      panel,
      this.output,
      initialLine,
      (uri, line) => this.goto(uri, line),
      () => {
        if (this.sessions.get(key) === session) {
          this.sessions.delete(key);
        }
      },
    );
    this.sessions.set(key, session);
    session.start();
  }

  broadcastSettings(): void {
    for (const session of this.sessions.values()) {
      session.postSettings();
    }
  }

  statusFor(uri: vscode.Uri): MarkdownEditaStatus | undefined {
    return this.sessions.get(uri.toString())?.status;
  }

  activeStatus(): MarkdownEditaStatus | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (input instanceof vscode.TabInputCustom && input.viewType === 'markdown-edita.editor') {
      return this.statusFor(input.uri);
    }
    return undefined;
  }

  private goto(uri: vscode.Uri, line: number): void {
    const session = this.sessions.get(uri.toString());
    if (session) {
      session.goto(line);
      return;
    }
    this.pendingGoto.set(uri.toString(), line);
  }

  requestGoto(uri: vscode.Uri, line: number): void {
    this.goto(uri, line);
    void vscode.commands.executeCommand('vscode.open', uri);
  }
}

class MarkdownEditaSession {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly resolvedUris = new Map<string, string>();
  private sequence = 0;
  private applying = false;
  private disposed = false;
  private queue: Promise<void> = Promise.resolve();
  private linkTimer: NodeJS.Timeout | undefined;

  readonly status: MarkdownEditaStatus = {
    ready: false,
    mode: 'normal',
    line: 1,
    column: 1,
    length: 0,
    total: 1,
    diagnostics: 0,
    dirty: false,
  };

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: LanguageClient,
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    private readonly output: vscode.OutputChannel,
    private readonly initialLine: number | undefined,
    private readonly requestGoto: (uri: vscode.Uri, line: number) => void,
    private readonly onDisposed: () => void,
  ) {}

  get key(): string {
    return this.document.uri.toString();
  }

  start(): void {
    const webview = this.panel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: resourceRoots(this.document, this.context),
    };
    webview.html = buildWebviewHtml(webview, this.context.extensionUri);
    this.disposables.push(
      webview.onDidReceiveMessage((raw) => this.receive(raw as WebviewMessage)),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === this.key && !this.applying) {
          this.sync('external');
        }
      }),
      vscode.workspace.onDidSaveTextDocument((saved) => {
        if (saved.uri.toString() === this.key && this.status.dirty) {
          this.status.dirty = false;
          this.post({ t: 'dirty', value: false });
        }
      }),
      vscode.languages.onDidChangeDiagnostics((event) => {
        if (event.uris.some((uri) => uri.toString() === this.key)) {
          this.pushDiagnostics();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('markdown-edita')) {
          this.postSettings();
        }
        if (event.affectsConfiguration('workbench.colorTheme')) {
          void this.postCodeTheme();
        }
      }),
      this.panel.onDidDispose(() => this.dispose()),
    );
    this.output.appendLine(`markdown-edita session started ${this.key}`);
  }

  postSettings(): void {
    this.post({ t: 'settings', settings: readSettings() });
  }

  async postCodeTheme(): Promise<void> {
    const theme = await resolveCodeTheme();
    if (theme) {
      this.post({ t: 'codetheme', theme });
    }
  }

  goto(line: number): void {
    this.post({ t: 'goto', line });
  }

  private post(message: HostMessage): void {
    if (!this.disposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private sync(reason: SyncReason): void {
    this.sequence = 0;
    this.status.dirty = true;
    this.post({ t: 'sync', text: this.document.getText(), reason, name: this.name(), uri: this.key });
    this.post({ t: 'dirty', value: true });
    this.scheduleLinks();
  }

  private name(): string {
    return path.basename(this.document.uri.path);
  }

  private receive(message: WebviewMessage): void {
    switch (message.t) {
      case 'ready': {
        this.sequence = 0;
        this.postSettings();
        void this.postCodeTheme();
        this.post({ t: 'sync', text: this.document.getText(), reason: 'init', name: this.name(), uri: this.key });
        if (this.initialLine !== undefined) {
          this.goto(this.initialLine);
        }
        this.post({ t: 'dirty', value: this.status.dirty });
        this.pushDiagnostics();
        this.scheduleLinks();
        break;
      }
      case 'edit':
        this.applyFromWebview(message.seq, message.changes);
        break;
      case 'lsp':
        void this.forward(message.id, message.method, message.params);
        break;
      case 'resolve':
        this.resolveUris(message.id, message.paths);
        break;
      case 'open':
        void this.openTarget(message.href, message.line, message.character);
        break;
      case 'save':
        void this.save();
        break;
      case 'command':
        void vscode.commands.executeCommand(message.id, ...(message.args ?? []));
        break;
      case 'status':
        this.status.ready = true;
        this.status.mode = message.mode;
        this.status.line = message.line;
        this.status.column = message.column;
        this.status.length = message.length;
        this.status.total = message.total;
        break;
      case 'log':
        this.output.appendLine(`[webview ${message.level}] ${message.text}`);
        break;
    }
  }

  private applyFromWebview(seq: number, changes: TextChange[]): void {
    if (seq !== this.sequence) {
      this.sync('resync');
      return;
    }
    this.sequence = seq + 1;
    this.queue = this.queue.then(
      () => this.apply(changes),
      () => this.apply(changes),
    ).catch((error: unknown) => {
      this.output.appendLine(`markdown-edita edit failed ${String(error)}`);
      this.sync('resync');
    });
  }

  private async apply(changes: TextChange[]): Promise<void> {
    if (changes.length === 0 || this.disposed) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    for (const change of changes) {
      const start = this.document.positionAt(change.from);
      const end = this.document.positionAt(change.to);
      edit.replace(this.document.uri, new vscode.Range(start, end), change.insert);
    }
    this.applying = true;
    try {
      await vscode.workspace.applyEdit(edit);
    } finally {
      this.applying = false;
    }
    if (!this.status.dirty) {
      this.status.dirty = true;
      this.post({ t: 'dirty', value: true });
    }
    this.scheduleLinks();
  }

  private async forward(id: number, method: string, params: unknown): Promise<void> {
    if (!LSP_METHODS.has(method)) {
      this.post({ t: 'lspError', id, message: `unsupported method ${method}` });
      return;
    }
    try {
      const result = await this.client.sendRequest<unknown>(method, params);
      this.post({ t: 'lspResult', id, result });
    } catch (error: unknown) {
      this.post({ t: 'lspError', id, message: String(error) });
    }
  }

  private resolveUris(id: number, paths: string[]): void {
    const uris: Record<string, string> = {};
    for (const requested of paths) {
      const cached = this.resolvedUris.get(requested);
      if (cached !== undefined) {
        uris[requested] = cached;
        continue;
      }
      if (/^(data:|https?:|blob:|vscode-)/i.test(requested)) {
        uris[requested] = requested;
        continue;
      }
      const target = this.resolveResource(requested);
      if (!target) {
        continue;
      }
      const resolved = this.panel.webview.asWebviewUri(target).toString();
      this.resolvedUris.set(requested, resolved);
      uris[requested] = resolved;
    }
    this.post({ t: 'uris', id, uris });
  }

  private resolveResource(relative: string): vscode.Uri | undefined {
    const clean = relative.trim().replace(/^</, '').replace(/>$/, '');
    if (clean.length === 0 || /^[a-z][a-z0-9+.-]*:/i.test(clean)) {
      return undefined;
    }
    const directory = documentDirectory(this.document);
    if (!directory) {
      return undefined;
    }
    if (/^[a-zA-Z]:[\\/]/.test(clean)) {
      return vscode.Uri.file(clean);
    }
    if (clean.startsWith('/')) {
      return vscode.Uri.file(path.resolve(path.parse(directory).root, clean.slice(1)));
    }
    return vscode.Uri.file(path.resolve(directory, clean));
  }

  private async openTarget(href: string, line?: number, character?: number): Promise<void> {
    const raw = href.trim();
    if (raw.length === 0) {
      return;
    }
    const parsed = isExternalTarget(raw) ? vscode.Uri.parse(raw, true) : undefined;
    if (parsed !== undefined && parsed.scheme !== 'file') {
      await vscode.env.openExternal(parsed);
      return;
    }
    const parts = parsed === undefined ? splitLinkTarget(raw) : { path: '', anchor: parsed.fragment };
    let target = parsed === undefined ? this.document.uri : parsed.with({ fragment: '' });
    if (parts.path.length > 0) {
      const resolved = this.resolveResource(parts.path);
      if (!resolved) {
        this.post({ t: 'notice', level: 'error', text: `cannot resolve ${raw}` });
        return;
      }
      target = resolved;
    }
    let targetLine = line ?? 0;
    let targetDocument: vscode.TextDocument | undefined;
    try {
      targetDocument = await vscode.workspace.openTextDocument(target);
    } catch (error: unknown) {
      this.post({ t: 'notice', level: 'error', text: `cannot open ${raw}` });
      this.output.appendLine(`markdown-edita open failed ${String(error)}`);
      return;
    }
    if (parts.anchor.length > 0) {
      const targetScan = scanMarkdown(targetDocument.getText());
      const anchored = safeDecode(parts.anchor).trim();
      const footnote = findFootnote(targetScan.footnotes, anchored);
      const heading = findHeading(targetScan.headings, anchored);
      const footnoteFirst = /^(?:user-content-)?fn-/i.test(anchored);
      const resolved = footnoteFirst && footnote ? footnote.line : heading?.line ?? footnote?.line;
      targetLine = resolved ?? targetLine;
    }
    if (MARKDOWN_FILE.test(target.path)) {
      this.requestGoto(target, targetLine);
      return;
    }
    const editor = await vscode.window.showTextDocument(targetDocument, { preview: true });
    const position = new vscode.Position(Math.min(targetLine, targetDocument.lineCount - 1), character ?? 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private async save(): Promise<void> {
    try {
      await this.document.save();
    } catch (error: unknown) {
      this.output.appendLine(`markdown-edita save failed ${String(error)}`);
    }
  }

  private pushDiagnostics(): void {
    const items: MarkdownEditaDiagnostic[] = vscode.languages.getDiagnostics(this.document.uri).map((diagnostic) => ({
      from: this.document.offsetAt(diagnostic.range.start),
      to: this.document.offsetAt(diagnostic.range.end),
      severity: severityName(diagnostic.severity),
      message: diagnostic.message,
      code: typeof diagnostic.code === 'object' ? String(diagnostic.code.value) : String(diagnostic.code ?? ''),
    }));
    this.status.diagnostics = items.length;
    this.post({ t: 'diagnostics', items });
  }

  private scheduleLinks(): void {
    clearTimeout(this.linkTimer);
    this.linkTimer = setTimeout(() => {
      this.linkTimer = undefined;
      void this.pushLinks();
    }, LINK_DEBOUNCE_MS);
  }

  private async pushLinks(): Promise<void> {
    const starts = this.document.getText();
    try {
      const result = await this.client.sendRequest<RemoteDocumentLink[] | null>('textDocument/documentLink', {
        textDocument: { uri: this.key },
      });
      if (!result || starts !== this.document.getText()) {
        return;
      }
      const items: LinkTarget[] = [];
      for (const link of result) {
        if (!link.target) {
          continue;
        }
        items.push({
          from: this.document.offsetAt(new vscode.Position(link.range.start.line, link.range.start.character)),
          to: this.document.offsetAt(new vscode.Position(link.range.end.line, link.range.end.character)),
          target: link.target,
        });
      }
      this.post({ t: 'links', items });
    } catch (error: unknown) {
      this.output.appendLine(`markdown-edita link request failed ${String(error)}`);
    }
  }

  private dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.linkTimer) {
      clearTimeout(this.linkTimer);
      this.linkTimer = undefined;
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.onDisposed();
    this.output.appendLine(`markdown-edita session disposed ${this.key}`);
  }
}
