import mermaid from 'mermaid';
import { isDarkPalette, paletteColor } from '../palette';

let sequence = 0;

export async function renderMermaid(
  source: string,
  theme: string,
  canvas: HTMLElement,
  host: HTMLElement,
): Promise<void> {
  const dark = isDarkPalette(theme);
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      fontFamily: 'inherit',
      themeVariables: {
        darkMode: dark,
        background: paletteColor(theme, 'bg'),
        primaryColor: paletteColor(theme, 'codeBg'),
        primaryTextColor: paletteColor(theme, 'text'),
        primaryBorderColor: paletteColor(theme, 'accent'),
        secondaryColor: paletteColor(theme, 'codeBg'),
        tertiaryColor: paletteColor(theme, 'bg'),
        lineColor: paletteColor(theme, 'dim'),
        textColor: paletteColor(theme, 'text'),
        mainBkg: paletteColor(theme, 'codeBg'),
        nodeBorder: paletteColor(theme, 'accent'),
        clusterBkg: paletteColor(theme, 'bg'),
        clusterBorder: paletteColor(theme, 'border'),
        edgeLabelBackground: paletteColor(theme, 'bg'),
        noteBkgColor: paletteColor(theme, 'codeBg'),
        noteBorderColor: paletteColor(theme, 'border'),
        noteTextColor: paletteColor(theme, 'text'),
        fontFamily: 'inherit',
      },
    });
    sequence += 1;
    const { svg } = await mermaid.render(`markdown-edita-mermaid-${sequence}`, source);
    if (!host.isConnected) {
      return;
    }
    canvas.innerHTML = svg;
    host.classList.add('markdown-edita-mermaid-ready');
  } catch (error) {
    if (!host.isConnected) {
      return;
    }
    host.classList.add('markdown-edita-mermaid-error');
    canvas.textContent = error instanceof Error ? error.message : String(error);
  }
}
