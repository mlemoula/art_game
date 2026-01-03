'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useThemeState } from '@/hooks/useThemeState'

type ThemeContextValue = ReturnType<typeof useThemeState>

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeState()
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
