import * as vscode from 'vscode';
import type { MarkdownEditaSettings } from './protocol';

export function readSettings(): MarkdownEditaSettings {
  const config = vscode.workspace.getConfiguration('markdown-edita');
  return {
    inline: config.get<boolean>('livePreview.inline', true),
    blocks: config.get<boolean>('livePreview.blocks', true),
    images: config.get<boolean>('livePreview.images', true),
    previewMode: config.get<boolean>('livePreview.previewMode', false),
    modalKeys: config.get<boolean>('tui.modalKeys', true),
    lineNumbers: config.get<boolean>('tui.lineNumbers', true),
    relativeLineNumbers: config.get<boolean>('tui.relativeLineNumbers', false),
    lint: config.get<boolean>('lint.enabled', true),
    theme: config.get<string>('appearance.theme', 'tokyo'),
    glyphs: config.get<string>('appearance.glyphs', 'nerd'),
  };
}
