'use client'

import type { ThemeMode } from '@/hooks/useThemeState'

type ThemeToggleButtonProps = {
  theme: ThemeMode
  toggleTheme: () => void
}

export default function ThemeToggleButton({ theme, toggleTheme }: ThemeToggleButtonProps) {
  return (
    <button
      type="button"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      onClick={toggleTheme}
      className="text-xs border border-gray-300 rounded-full px-2 py-1 text-gray-600 button-hover dark:text-gray-200 dark:border-gray-500"
    >
      {theme === 'dark' ? '🌞' : '🌑'}
    </button>
  )
}
