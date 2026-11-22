import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** `paper` (warm architectural light, default) or `carbon` (warm hardware dark). */
export type Theme = 'paper' | 'carbon';

/** Also read by the pre-paint script in index.html — keep the key and shape in sync. */
export const THEME_STORAGE_KEY = 'schemaflow:theme';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'paper',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'paper' ? 'carbon' : 'paper' }),
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const theme = (persisted as Partial<ThemeState> | undefined)?.theme;
        return { ...current, theme: theme === 'carbon' ? 'carbon' : 'paper' };
      },
    },
  ),
);

// Keep <html data-theme> in sync with the store.
applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((s) => applyTheme(s.theme));
