import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { createLanguageClient } from './client';
import { MarkdownEditaEditorProvider } from './editor/provider';
import { THEMES, THEME_IDS } from './shared/themes';

let client: LanguageClient | undefined;

function activeMarkdownEditaUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom && input.viewType === 'markdown-edita.editor') {
    return input.uri;
  }
  return undefined;
}

function currentUri(): vscode.Uri | undefined {
  return vscode.window.activeTextEditor?.document.uri ?? activeMarkdownEditaUri();
}

async function toggleSetting(key: string, label: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('markdown-edita');
  const value = config.get<boolean>(key, false);
  await config.update(key, !value, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage(`Markdown_Edita ${label} ${value ? 'off' : 'on'}`, 3000);
}

async function toggleGlyphs(): Promise<void> {
  const config = vscode.workspace.getConfiguration('markdown-edita');
  const current = config.get<string>('appearance.glyphs', 'nerd');
  const next = current === 'ascii' ? 'nerd' : 'ascii';
  await config.update('appearance.glyphs', next, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage(`Markdown_Edita glyph style ${next}`, 3000);
}

interface SettingOption {
  label: string;
  value: string;
  description: string;
}

async function pickSetting(key: string, options: SettingOption[], title: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('markdown-edita');
  const current = config.get<string>(key, options[0].value);
  const picked = await vscode.window.showQuickPick(
    options.map((option) => ({
      label: option.label,
      value: option.value,
      description: option.value === current ? 'current' : option.description,
    })),
    { title },
  );
  if (picked) {
    await config.update(key, picked.value, vscode.ConfigurationTarget.Global);
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Markdown_Edita', { log: true });
  context.subscriptions.push(output);
  client = createLanguageClient(context, output);
  const provider = new MarkdownEditaEditorProvider(context, client, output);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('markdown-edita.editor', provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.commands.registerCommand('markdown-edita.openTextEditor', async () => {
      const uri = currentUri();
      if (!uri) {
        void vscode.window.showInformationMessage('Markdown_Edita: no active editor');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
    }),
    vscode.commands.registerCommand('markdown-edita.openWithMarkdownEdita', async () => {
      const uri = currentUri();
      if (!uri) {
        void vscode.window.showInformationMessage('Markdown_Edita: no active editor');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, 'markdown-edita.editor');
    }),
    vscode.commands.registerCommand('markdown-edita.togglePreview', () =>
      toggleSetting('livePreview.previewMode', 'preview'),
    ),
    vscode.commands.registerCommand('markdown-edita.toggleInlineRendering', () =>
      toggleSetting('livePreview.inline', 'inline rendering'),
    ),
    vscode.commands.registerCommand('markdown-edita.toggleBlockWidgets', () =>
      toggleSetting('livePreview.blocks', 'block widgets'),
    ),
    vscode.commands.registerCommand('markdown-edita.pickTheme', () =>
      pickSetting(
        'appearance.theme',
        THEMES.map((theme) => ({ label: theme.label, value: theme.id, description: theme.description })),
        'Markdown_Edita color palette',
      ),
    ),
    vscode.commands.registerCommand('markdown-edita.setTheme', async (id: unknown) => {
      if (typeof id !== 'string' || !THEME_IDS.includes(id)) {
        return;
      }
      await vscode.workspace
        .getConfiguration('markdown-edita')
        .update('appearance.theme', id, vscode.ConfigurationTarget.Global);
      const theme = THEMES.find((entry) => entry.id === id);
      vscode.window.setStatusBarMessage(`Markdown_Edita theme ${theme ? theme.label : id}`, 3000);
    }),
    vscode.commands.registerCommand('markdown-edita.pickGlyphs', () =>
      pickSetting(
        'appearance.glyphs',
        [
          { label: 'nerd', value: 'nerd', description: 'Nerd Font glyphs' },
          { label: 'ascii', value: 'ascii', description: 'Plain ASCII glyphs' },
        ],
        'Markdown_Edita glyph style',
      ),
    ),
    vscode.commands.registerCommand('markdown-edita.toggleGlyphs', () => toggleGlyphs()),
    vscode.commands.registerCommand('markdown-edita.showStatus', () => {
      const status = provider.activeStatus();
      if (!status) {
        void vscode.window.showInformationMessage('Markdown_Edita: no active Markdown_Edita editor');
        return;
      }
      output.appendLine(JSON.stringify(status));
      void vscode.window.showInformationMessage(
        `Markdown_Edita ${status.mode.toUpperCase()} line ${status.line} column ${status.column} diagnostics ${status.diagnostics} dirty ${status.dirty}`,
      );
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('markdown-edita')) {
        provider.broadcastSettings();
      }
    }),
  );
  try {
    await client.start();
  } catch (error: unknown) {
    output.appendLine(`markdown-edita language server failed to start ${String(error)}`);
  }
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
