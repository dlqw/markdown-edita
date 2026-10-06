import * as vscode from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

export function createLanguageClient(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): LanguageClient {
  const module = context.asAbsolutePath('dist/server.js');
  const serverOptions: ServerOptions = {
    run: { module, transport: TransportKind.ipc },
    debug: {
      module,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6010'] },
    },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'markdown' },
      { scheme: 'untitled', language: 'markdown' },
    ],
    synchronize: { configurationSection: 'markdown-edita' },
    outputChannel: output,
  };
  return new LanguageClient('markdown-edita', 'Markdown_Edita Language Server', serverOptions, clientOptions);
}
