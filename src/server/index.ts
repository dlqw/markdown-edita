import {
  createConnection,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
} from 'vscode-languageserver/node';
import type { PublishDiagnosticsParams } from 'vscode-languageserver/node';
import { scanMarkdown } from '../shared/mdscan';
import { provideCompletion } from './completion';
import { provideDefinition } from './definition';
import { computeDiagnostics } from './diagnostics';
import { ServerDocumentImpl } from './document';
import { provideFoldingRanges } from './folding';
import { provideHover } from './hover';
import { provideDocumentLinks } from './links';
import { defaultLintSettings, normalizeSettings, type LintSettings } from './settings';
import { provideSymbols } from './symbols';
import { documentDirectory } from './util';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments<ServerDocumentImpl>({
  create: (uri, languageId, version, content) => new ServerDocumentImpl(uri, languageId, version, content),
  update: (document, changes, version) => document.update(changes, version),
});

let settings: LintSettings = defaultLintSettings();

async function refreshSettings(): Promise<void> {
  try {
    const raw = await connection.workspace.getConfiguration('markdown-edita');
    settings = normalizeSettings(raw);
  } catch (error) {
    connection.console.log(`markdown-edita configuration error: ${String(error)}`);
    settings = defaultLintSettings();
  }
}

function publishDiagnostics(document: ServerDocumentImpl): void {
  let params: PublishDiagnosticsParams;
  try {
    if (!settings.enabled) {
      params = { uri: document.uri, diagnostics: [] };
    } else {
      const scan = scanMarkdown(document.getText());
      params = {
        uri: document.uri,
        diagnostics: computeDiagnostics(scan, settings, documentDirectory(document.uri)),
      };
    }
  } catch {
    params = { uri: document.uri, diagnostics: [] };
  }
  void connection.sendDiagnostics(params);
}

connection.onInitialize(() => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['(', '[', '/', '#', '`', '<', ':', ']'],
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      foldingRangeProvider: true,
      documentLinkProvider: { resolveProvider: false },
      definitionProvider: true,
    },
    serverInfo: { name: 'markdown-edita-language-server', version: '0.1.0' },
  };
});

connection.onInitialized(async () => {
  await refreshSettings();
  for (const document of documents.all()) {
    publishDiagnostics(document);
  }
});

connection.onDidChangeConfiguration(async () => {
  await refreshSettings();
  for (const document of documents.all()) {
    publishDiagnostics(document);
  }
});

documents.onDidChangeContent((event) => {
  publishDiagnostics(event.document);
});

connection.onCompletion((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    const scan = scanMarkdown(document.getText());
    return provideCompletion(scan, params.position, documentDirectory(document.uri));
  } catch {
    return null;
  }
});

connection.onHover((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    const scan = scanMarkdown(document.getText());
    return provideHover(scan, params.position, documentDirectory(document.uri));
  } catch {
    return null;
  }
});

connection.onDocumentSymbol((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    return provideSymbols(scanMarkdown(document.getText()));
  } catch {
    return null;
  }
});

connection.onFoldingRanges((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    return provideFoldingRanges(scanMarkdown(document.getText()));
  } catch {
    return null;
  }
});

connection.onDocumentLinks((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    return provideDocumentLinks(
      document.uri,
      scanMarkdown(document.getText()),
      documentDirectory(document.uri),
    );
  } catch {
    return null;
  }
});

connection.onDefinition((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    return provideDefinition(
      document.uri,
      scanMarkdown(document.getText()),
      params.position,
      documentDirectory(document.uri),
    );
  } catch {
    return null;
  }
});

documents.listen(connection);
connection.listen();
