export interface ThemeInfo {
  id: string;
  label: string;
  description: string;
}

export const THEMES: readonly ThemeInfo[] = [
  {
    id: 'vscode',
    label: 'VS Code',
    description: 'Follow the active VS Code color theme',
  },
  {
    id: 'tokyo',
    label: 'Tokyo Night',
    description: 'Cool blues on a deep indigo background',
  },
  {
    id: 'gruvbox',
    label: 'Gruvbox',
    description: 'Warm retro earth tones',
  },
  {
    id: 'nord',
    label: 'Nord',
    description: 'Arctic blue gray tones',
  },
  {
    id: 'dracula',
    label: 'Dracula',
    description: 'Violet and green at high contrast',
  },
  {
    id: 'solarized',
    label: 'Solarized',
    description: 'Low contrast palette with precise hues',
  },
  {
    id: 'mono',
    label: 'Mono',
    description: 'Grayscale palette without hue',
  },
];

export const THEME_IDS: readonly string[] = THEMES.map((theme) => theme.id);
