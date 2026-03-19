export type NavThemeKey = 'slate' | 'navy' | 'teal' | 'purple' | 'zinc';

export interface NavTheme {
  key: NavThemeKey;
  label: string;
  bg: string;       // main background hex
  preview: string;  // tailwind classes for the preview swatch
}

export const NAV_THEMES: NavTheme[] = [
  { key: 'slate',  label: 'Pizarra',   bg: '#0f172a', preview: 'bg-slate-900' },
  { key: 'navy',   label: 'Marino',    bg: '#0a1628', preview: 'bg-[#0a1628]' },
  { key: 'teal',   label: 'Esmeralda', bg: '#042f2e', preview: 'bg-teal-950'  },
  { key: 'purple', label: 'Violeta',   bg: '#180729', preview: 'bg-[#180729]' },
  { key: 'zinc',   label: 'Carbón',    bg: '#18181b', preview: 'bg-zinc-900'  },
];

export function getNavTheme(key: NavThemeKey): NavTheme {
  return NAV_THEMES.find((t) => t.key === key) ?? NAV_THEMES[0];
}
