import katex from 'katex';

export function renderMath(tex: string, display: boolean): string | undefined {
  const source = tex.trim();
  if (source.length === 0) {
    return undefined;
  }
  try {
    return katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return undefined;
  }
}

export const INLINE_MATH = /(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
