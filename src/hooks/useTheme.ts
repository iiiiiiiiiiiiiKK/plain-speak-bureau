import { useCallback, useEffect, useState } from 'react';
import { loadPrefs, savePrefs, type Prefs } from '../lib/storage';

type Theme = Prefs['theme'];

/** 深色模式：默认跟随系统，用户手动切换后记住选择 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = loadPrefs();
    if (typeof window === 'undefined') return saved.theme;
    const stored = window.localStorage.getItem('ht.v1.prefs');
    // 没存过就跟随系统
    if (!stored && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return saved.theme;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    savePrefs({ theme, reduceMotion: loadPrefs().reduceMotion });
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
