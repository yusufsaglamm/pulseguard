import { Moon, Sun } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('pulseguard_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('pulseguard_theme', theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
      title={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
    >
      {theme === 'dark' ? (
        <Sun size={18} weight="regular" aria-hidden="true" />
      ) : (
        <Moon size={18} weight="regular" aria-hidden="true" />
      )}
    </button>
  );
}
