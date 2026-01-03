'use client'

import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'
const THEME_STORAGE_KEY = 'art_game_theme'

const applyTheme = (theme: ThemeMode) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const body = document.body
  root.dataset.theme = theme
  body.dataset.theme = theme
  if (theme === 'dark') {
    root.classList.add('dark')
    body.classList.add('dark')
  } else {
    root.classList.remove('dark')
    body.classList.remove('dark')
  }
}

const getStoredTheme = (): ThemeMode | null => {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'dark' || stored === 'light' ? stored : null
}

const getSystemTheme = (): ThemeMode => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export const useThemeState = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = getStoredTheme()
    return stored ?? getSystemTheme()
  })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    applyTheme(theme)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    queueMicrotask(() => {
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent) => {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'dark' || stored === 'light') return
      setTheme(event.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', listener)
    return () => {
      media.removeEventListener('change', listener)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme, hydrated }
}
