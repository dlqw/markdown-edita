import MarkdownIt from 'markdown-it';
import markdownKatex from '@vscode/markdown-it-katex';
import { highlightFenceLines, onCodeAssets } from './code';
import { resolveImage } from './resources';

const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'meta',
  'link',
  'base',
  'template',
  'noscript',
]);

const UNSAFE_URL = /^\s*(javascript|vbscript|data:text\/html)/i;
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

const engine = new MarkdownIt({
  html: true,
  linkify: false,
  breaks: false,
  typographer: false,
  highlight: (code, language) => {
    const lines = highlightFenceLines(code, language);
    return lines ? lines.join('\n') : '';
  },
});

markdownKatex(engine, { throwOnError: false });

const cache = new Map<string, string>();
const CACHE_LIMIT = 400;

onCodeAssets(() => {
  cache.clear();
});

export function renderMarkdown(source: string): string {
  const cached = cache.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const template = document.createElement('template');
  template.innerHTML = engine.render(source);
  clean(template.content);
  if (cache.size >= CACHE_LIMIT) {
    cache.clear();
  }
  cache.set(source, template.innerHTML);
  return template.innerHTML;
}

export function renderInline(source: string): string {
  const template = document.createElement('template');
  template.innerHTML = engine.renderInline(source);
  clean(template.content);
  return template.innerHTML;
}

function clean(root: ParentNode): void {
  for (const element of Array.from(root.querySelectorAll('*'))) {
    const tag = element.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tag)) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && UNSAFE_URL.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (tag === 'img') {
      const source = element.getAttribute('src') ?? '';
      if (source.length > 0 && !ABSOLUTE_URL.test(source)) {
        element.removeAttribute('src');
        void resolveImage(source).then((uri) => {
          if (uri) {
            element.setAttribute('src', uri);
          }
        });
      }
    }
  }
}
