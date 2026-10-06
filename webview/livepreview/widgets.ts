import { WidgetType } from '@codemirror/view';
import { imageSource, resolveImage } from '../resources';
import { renderMermaid } from './mermaid';

export class RenderedBlockWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly kind: string,
  ) {
    super();
  }

  override eq(other: RenderedBlockWidget): boolean {
    return other.html === this.html && other.kind === this.kind;
  }

  override toDOM(): HTMLElement {
    const host = document.createElement('div');
    host.className = `markdown-edita-block markdown-edita-block-${this.kind}`;
    host.innerHTML = this.html;
    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export class HtmlWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly className: string,
    readonly tagName: 'span' | 'div',
  ) {
    super();
  }

  override eq(other: HtmlWidget): boolean {
    return other.html === this.html && other.className === this.className && other.tagName === this.tagName;
  }

  override toDOM(): HTMLElement {
    const host = document.createElement(this.tagName);
    if (this.className.length > 0) {
      host.className = this.className;
    }
    host.innerHTML = this.html;
    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export class MathBlockWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly lines: number,
  ) {
    super();
  }

  override eq(other: MathBlockWidget): boolean {
    return other.html === this.html && other.lines === this.lines;
  }

  override toDOM(): HTMLElement {
    const host = document.createElement('div');
    host.className = 'markdown-edita-math markdown-edita-math-block';
    host.style.setProperty('--markdown-edita-math-lines', String(this.lines));
    const inner = document.createElement('div');
    inner.className = 'markdown-edita-math-fit';
    inner.innerHTML = this.html;
    host.append(inner);
    fitMathBlock(host, this.lines);
    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const MATH_SCALE_CACHE = new Map<string, number>();

function fitMathBlock(host: HTMLElement, lines: number): void {
  const key = `${lines}|${host.textContent ?? ''}`;
  const cached = MATH_SCALE_CACHE.get(key);
  if (cached !== undefined) {
    host.style.setProperty('--markdown-edita-math-scale', String(cached));
    return;
  }
  const probe = host.cloneNode(true) as HTMLElement;
  probe.style.position = 'fixed';
  probe.style.top = '0';
  probe.style.left = '-10000px';
  probe.style.height = 'auto';
  probe.style.overflow = 'visible';
  probe.style.visibility = 'hidden';
  document.body.append(probe);
  const inner = probe.firstElementChild;
  const natural = inner ? inner.getBoundingClientRect().height : 0;
  probe.remove();
  const lineSource = document.querySelector('.cm-line') ?? document.body;
  const lineHeight = parseFloat(getComputedStyle(lineSource).lineHeight) || 20.8;
  const available = lines * lineHeight;
  const scale = natural > available && natural > 0 ? available / natural : 1;
  MATH_SCALE_CACHE.set(key, scale);
  host.style.setProperty('--markdown-edita-math-scale', String(scale));
}

export class GlyphWidget extends WidgetType {
  constructor(
    readonly glyph: string,
    readonly className: string,
    readonly href = '',
  ) {
    super();
  }

  override eq(other: GlyphWidget): boolean {
    return other.glyph === this.glyph && other.className === this.className && other.href === this.href;
  }

  override toDOM(): HTMLElement {
    const host = document.createElement('span');
    host.className = this.className;
    host.textContent = this.glyph;
    if (this.href.length > 0) {
      host.dataset.href = this.href;
    }
    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export class HorizontalRuleWidget extends WidgetType {
  constructor(readonly rule: string) {
    super();
  }

  override eq(other: HorizontalRuleWidget): boolean {
    return other.rule === this.rule;
  }

  override toDOM(): HTMLElement {
    const host = document.createElement('div');
    host.className = 'markdown-edita-rule';
    host.textContent = this.rule.repeat(160);
    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly alt: string,
    readonly title: string,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return other.source === this.source && other.alt === this.alt && other.title === this.title;
  }

  override toDOM(): HTMLElement {
    const host = document.createElement('span');
    host.className = 'markdown-edita-image';
    const image = document.createElement('img');
    image.alt = this.alt;
    image.loading = 'lazy';
    if (this.title.length > 0) {
      image.title = this.title;
    }
    host.appendChild(image);
    const known = imageSource(this.source);
    if (known !== undefined) {
      image.src = known;
    } else {
      void resolveImage(this.source).then((uri) => {
        if (uri) {
          image.src = uri;
        } else {
          host.classList.add('markdown-edita-image-missing');
        }
      });
    }
    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export class TaskWidget extends WidgetType {
  constructor(
    readonly open: string,
    readonly done: string,
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  override eq(other: TaskWidget): boolean {
    return (
      other.checked === this.checked &&
      other.open === this.open &&
      other.done === this.done &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  override toDOM(): HTMLElement {
    const host = document.createElement('span');
    host.className = this.checked ? 'markdown-edita-task markdown-edita-task-done' : 'markdown-edita-task';
    host.textContent = this.checked ? this.done : this.open;
    if (this.to > this.from) {
      host.dataset.from = String(this.from);
      host.dataset.to = String(this.to);
    }
    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly theme: string,
  ) {
    super();
  }

  override eq(other: MermaidWidget): boolean {
    return other.source === this.source && other.theme === this.theme;
  }

  override toDOM(): HTMLElement {
    const host = document.createElement('div');
    host.className = 'markdown-edita-mermaid';
    const canvas = document.createElement('div');
    canvas.className = 'markdown-edita-mermaid-canvas';
    host.appendChild(canvas);
    void renderMermaid(this.source, this.theme, canvas, host);
    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
