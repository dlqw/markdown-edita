import * as vscode from 'vscode';

export function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'style.css'));
  const katexUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'katex', 'katex.css'));
  const mediaUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media')).toString();
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: https: http:`,
    `media-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `connect-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="markdown-edita-media" content="${mediaUri}/">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${styleUri}">
<link rel="stylesheet" href="${katexUri}">
<title>Markdown_Edita</title>
</head>
<body>
<div id="markdown-edita-app">
<div id="markdown-edita-editor"></div>
<div id="markdown-edita-status">
<span id="markdown-edita-mode" class="markdown-edita-mode">NORMAL</span>
<span id="markdown-edita-file" class="markdown-edita-file"></span>
<span id="markdown-edita-vim" class="markdown-edita-vim"></span>
<span id="markdown-edita-message" class="markdown-edita-message"></span>
<span id="markdown-edita-diagnostics" class="markdown-edita-diagnostics"></span>
<span id="markdown-edita-glyphs" class="markdown-edita-glyphs"></span>
<span id="markdown-edita-position" class="markdown-edita-position"></span>
</div>
</div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
