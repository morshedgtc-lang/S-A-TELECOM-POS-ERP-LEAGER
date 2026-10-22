import { createContext, Fragment, useContext, useState, type ReactNode } from 'react';
import { EN } from './i18n.en';

export type Lang = 'bn' | 'en';
export type Theme = 'dark' | 'light';

const LANG_KEY = 'sa_pos_lang';
const THEME_KEY = 'sa_pos_theme';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked; the choice still applies for this visit.
  }
}

let currentLang: Lang = stored(LANG_KEY) === 'en' ? 'en' : 'bn';

/**
 * Bangla text is the key; English comes from the dictionary in i18n.en.ts.
 * `{name}` placeholders are filled from vars. Call at render time, not at module level.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = currentLang === 'en' ? (EN[key] ?? key) : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Picks the visitor's language from a {en, bn} pair (website content). */
export const pick = (v: { en: string; bn: string } | undefined) => (v ? (currentLang === 'en' ? v.en || v.bn : v.bn || v.en) : '');

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

interface Prefs {
  lang: Lang;
  theme: Theme;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
}

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  const [theme, setThemeState] = useState<Theme>(() => {
    const th: Theme = stored(THEME_KEY) === 'light' ? 'light' : 'dark';
    applyTheme(th);
    document.documentElement.lang = currentLang;
    return th;
  });

  const setLang = (l: Lang) => {
    currentLang = l;
    store(LANG_KEY, l);
    document.documentElement.lang = l;
    setLangState(l);
  };
  const setTheme = (th: Theme) => {
    store(THEME_KEY, th);
    applyTheme(th);
    setThemeState(th);
  };

  // Keyed by language so every t() call re-runs after a switch.
  return (
    <PrefsContext.Provider value={{ lang, theme, setLang, setTheme }}>
      <Fragment key={lang}>{children}</Fragment>
    </PrefsContext.Provider>
  );
}

export function usePrefs(): Prefs {
  const v = useContext(PrefsContext);
  if (!v) throw new Error('usePrefs must be used inside PrefsProvider');
  return v;
}

/** EN | বাং and sun/moon switches, used on the public site and in the app bar. */
export function PrefToggles({ compact = false }: { compact?: boolean }) {
  const { lang, theme, setLang, setTheme } = usePrefs();
  return (
    <div className="pref-toggles">
      <div className="seg" role="group" aria-label="Language">
        <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        <button className={lang === 'bn' ? 'on' : ''} onClick={() => setLang('bn')}>বাং</button>
      </div>
      <button className="round" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'} title={compact ? undefined : 'Theme'}>
        <i className={theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'} />
      </button>
    </div>
  );
}
