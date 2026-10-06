import * as esbuild from 'esbuild';
import { cp, mkdir, writeFile } from 'node:fs/promises';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function copyKatex() {
  await mkdir('media/katex/fonts', { recursive: true });
  await cp('node_modules/katex/dist/katex.min.css', 'media/katex/katex.css');
  await cp('node_modules/katex/dist/fonts', 'media/katex/fonts', { recursive: true });
}

const CODE_LANGUAGES = [
  'javascript',
  'jsx',
  'typescript',
  'tsx',
  'python',
  'json',
  'jsonc',
  'html',
  'css',
  'scss',
  'less',
  'stylus',
  'xml',
  'yaml',
  'rust',
  'cpp',
  'c',
  'java',
  'go',
  'sql',
  'plsql',
  'csharp',
  'kotlin',
  'scala',
  'dart',
  'lua',
  'r',
  'ruby',
  'perl',
  'swift',
  'erlang',
  'haskell',
  'pug',
  'shellscript',
  'shellsession',
  'powershell',
  'bat',
  'docker',
  'make',
  'cmake',
  'toml',
  'ini',
  'dotenv',
  'diff',
  'git-commit',
  'git-rebase',
  'log',
  'regexp',
  'php',
  'markdown',
  'rst',
  'mermaid',
  'vue',
  'svelte',
  'astro',
  'graphql',
  'cypher',
  'protobuf',
  'http',
  'prisma',
  'nginx',
  'apache',
  'groovy',
  'clojure',
  'scheme',
  'common-lisp',
  'fennel',
  'elixir',
  'ocaml',
  'fsharp',
  'elm',
  'haxe',
  'purescript',
  'raku',
  'nim',
  'crystal',
  'coffeescript',
  'vb',
  'pascal',
  'objective-c',
  'zig',
  'nix',
  'hcl',
  'bicep',
  'julia',
  'matlab',
  'fortran-free-form',
  'ada',
  'cobol',
  'abap',
  'smalltalk',
  'viml',
  'tex',
  'bibtex',
  'csv',
  'jsonnet',
  'asm',
  'wasm',
  'wgsl',
  'glsl',
  'hlsl',
  'solidity',
  'gdscript',
  'awk',
  'systemd',
  'twig',
  'vyper',
  'zenscript',
];

const CODE_ALIASES = {
  htm: 'html',
  xhtml: 'html',
  svg: 'xml',
  xsl: 'xml',
  json5: 'json',
  jsonl: 'json',
  md: 'markdown',
  mdown: 'markdown',
  mk: 'make',
  makefile: 'make',
  dockerfile: 'docker',
  console: 'shellsession',
  'shell-session': 'shellsession',
  'sh-session': 'shellsession',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  ps1: 'powershell',
  pwsh: 'powershell',
  batch: 'bat',
  cmd: 'bat',
  golang: 'go',
  kt: 'kotlin',
  kts: 'kotlin',
  rs: 'rust',
  py: 'python',
  rb: 'ruby',
  yml: 'yaml',
  tf: 'hcl',
  terraform: 'hcl',
  patch: 'diff',
  mysql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  sqlite: 'sql',
  'objectivec': 'objective-c',
  objc: 'objective-c',
  tex: 'tex',
  latex: 'tex',
  vim: 'viml',
  vimscript: 'viml',
  lisp: 'common-lisp',
  clj: 'clojure',
  cljs: 'clojure',
  scm: 'scheme',
  hs: 'haskell',
  erl: 'erlang',
  ex: 'elixir',
  exs: 'elixir',
  fs: 'fsharp',
  'f#': 'fsharp',
  ml: 'ocaml',
  pl: 'perl',
  rscript: 'r',
  jl: 'julia',
  asm: 'asm',
  nasm: 'asm',
  wat: 'wasm',
  protobuf: 'protobuf',
  proto: 'protobuf',
  gql: 'graphql',
  hbs: 'html',
  jinja: 'twig',
  ejs: 'html',
};

const CODE_THEMES = {
  tokyo: 'tokyo-night',
  gruvbox: 'gruvbox-dark-medium',
  nord: 'nord',
  dracula: 'dracula',
  solarized: 'solarized-dark',
};

const CODE_THEME_FALLBACK = {
  dark: 'dark-plus',
  light: 'light-plus',
};

async function buildCodeAssets() {
  await mkdir('media/langs', { recursive: true });
  await mkdir('media/themes', { recursive: true });
  const grammars = new Map();
  const index = {};
  for (const name of CODE_LANGUAGES) {
    const loaded = await import(`@shikijs/langs/${name}`);
    const bundle = Array.isArray(loaded.default) ? loaded.default : [loaded.default];
    const own = bundle.find((grammar) => grammar.name === name) ?? bundle[bundle.length - 1];
    for (const grammar of bundle) {
      grammars.set(grammar.name, grammar);
    }
    const entry = { lang: own.name, grammars: bundle.map((grammar) => grammar.name) };
    index[name] = entry;
    for (const alias of own.aliases ?? []) {
      index[String(alias).toLowerCase()] = entry;
    }
  }
  for (const [alias, name] of Object.entries(CODE_ALIASES)) {
    const entry = index[name];
    if (entry) {
      index[alias] = entry;
    }
  }
  await Promise.all(
    [...grammars].map(([name, grammar]) =>
      writeFile(`media/langs/${name}.json`, JSON.stringify(grammar)),
    ),
  );
  await writeFile('media/langs/index.json', JSON.stringify(index));
  const themeFiles = new Set([...Object.values(CODE_THEMES), ...Object.values(CODE_THEME_FALLBACK)]);
  for (const theme of themeFiles) {
    const loaded = await import(`@shikijs/themes/${theme}`);
    const registration = Array.isArray(loaded.default) ? loaded.default[0] : loaded.default;
    await writeFile(`media/themes/${theme}.json`, JSON.stringify(registration));
  }
  await writeFile('media/themes/index.json', JSON.stringify({ palettes: CODE_THEMES, fallback: CODE_THEME_FALLBACK }));
  console.log(
    `markdown-edita code assets: ${grammars.size} grammars, ${Object.keys(index).length} names, ${themeFiles.size} themes`,
  );
}

const shared = {
  bundle: true,
  minify: production,
  sourcemap: production ? false : true,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': production ? '"production"' : '"development"' },
};

const targets = [
  {
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  },
  {
    ...shared,
    entryPoints: ['src/server/index.ts'],
    outfile: 'dist/server.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  },
  {
    ...shared,
    entryPoints: ['webview/main.ts'],
    outfile: 'media/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  },
];

if (watch) {
  await copyKatex();
  await buildCodeAssets();
  const contexts = await Promise.all(targets.map((target) => esbuild.context(target)));
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('markdown-edita watching');
} else {
  await Promise.all(targets.map((target) => esbuild.build(target)));
  await copyKatex();
  await buildCodeAssets();
}
