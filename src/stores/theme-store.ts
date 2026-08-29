import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeState {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (pref: ThemePreference) => void;
  initialize: (saved?: ThemePreference) => void;
}

function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

function applyThemeToDOM(theme: 'light' | 'dark') {
  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: 'system',
  resolved: 'light',

  setPreference: (pref) => {
    const resolved = resolveTheme(pref);
    applyThemeToDOM(resolved);
    set({ preference: pref, resolved });
  },

  initialize: (saved) => {
    const pref = saved || 'system';
    const resolved = resolveTheme(pref);
    applyThemeToDOM(resolved);
    set({ preference: pref, resolved });

    // Listen for system changes when set to "system"
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = get();
      if (current.preference === 'system') {
        const newResolved = resolveTheme('system');
        applyThemeToDOM(newResolved);
        set({ resolved: newResolved });
      }
    });
  },
}));
