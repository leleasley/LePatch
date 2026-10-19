import { useCallback, useEffect, useState } from 'react';

// Theme handling. The chosen appearance is stored locally for instant paint
// and pushed to the account so it follows the user to other devices.
export const THEMES = [
  { id: 'dark', label: 'Midnight', swatch: '#08080a' },
  { id: 'midnight', label: 'Deep Space', swatch: '#06080e' },
  { id: 'oled', label: 'OLED', swatch: '#000000' },
  { id: 'light', label: 'Paper', swatch: '#f5f5f7' },
];

const STORAGE_KEY = 'lepatch-theme';

function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.some(theme => theme.id === value) ? value : 'dark';
  } catch {
    return 'dark';
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(storedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.className = `theme-${theme}`;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage can be disabled; the theme still applies for this session.
    }
  }, [theme]);

  const setTheme = useCallback(next => {
    setThemeState(THEMES.some(item => item.id === next) ? next : 'dark');
  }, []);

  return [theme, setTheme];
}
