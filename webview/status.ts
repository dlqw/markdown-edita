export interface StatusLine {
  vimContainer: HTMLElement;
  glyphsContainer: HTMLElement;
  setFile(name: string): void;
  setMode(text: string, visible: boolean): void;
  setGlyphs(name: string): void;
  setPosition(line: number, column: number, length: number, total: number): void;
  setDiagnostics(count: number): void;
  setDirty(value: boolean): void;
  notice(level: 'info' | 'warning' | 'error', text: string): void;
}

const NOTICE_TIMEOUT_MS = 4000;

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`missing element ${id}`);
  }
  return found;
}

export function createStatusLine(): StatusLine {
  const mode = element('markdown-edita-mode');
  const file = element('markdown-edita-file');
  const vim = element('markdown-edita-vim');
  const message = element('markdown-edita-message');
  const diagnostics = element('markdown-edita-diagnostics');
  const glyphs = element('markdown-edita-glyphs');
  const position = element('markdown-edita-position');
  let fileName = '';
  let dirty = false;
  let noticeTimer = 0;

  const renderFile = (): void => {
    file.textContent = dirty ? `${fileName} [+]` : fileName;
  };

  const clearNotice = (): void => {
    noticeTimer = 0;
    message.textContent = '';
    message.className = 'markdown-edita-message';
  };

  return {
    vimContainer: vim,
    glyphsContainer: glyphs,
    setFile(name: string): void {
      fileName = name;
      renderFile();
    },
    setGlyphs(name: string): void {
      glyphs.textContent = `[${name}]`;
    },
    setMode(text: string, visible: boolean): void {
      mode.textContent = text;
      mode.hidden = !visible;
    },
    setPosition(line: number, column: number, length: number, total: number): void {
      const percent = total > 0 ? Math.round((line / total) * 100) : 0;
      const selection = length > 0 ? ` ${length} sel` : '';
      position.textContent = `${line}:${column}${selection} ${percent}%`;
    },
    setDiagnostics(count: number): void {
      diagnostics.textContent = count > 0 ? `E${count}` : '';
      diagnostics.hidden = count === 0;
    },
    setDirty(value: boolean): void {
      dirty = value;
      renderFile();
    },
    notice(level: 'info' | 'warning' | 'error', text: string): void {
      message.textContent = text;
      message.className = `markdown-edita-message markdown-edita-${level}`;
      if (noticeTimer) {
        clearTimeout(noticeTimer);
      }
      noticeTimer = window.setTimeout(clearNotice, NOTICE_TIMEOUT_MS);
    },
  };
}
