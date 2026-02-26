const ISO_DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const getTodayDateKey = () => new Date().toISOString().split('T')[0]

export const normalizeDayKey = (value?: string | null) => {
  if (!value) return null
  const candidate = value.trim().slice(0, 10)
  if (!ISO_DAY_REGEX.test(candidate)) return null
  const parsed = new Date(`${candidate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  if (parsed.toISOString().slice(0, 10) !== candidate) return null
  return candidate
}

export const resolvePlayableDate = (value?: string | null) => {
  const day = normalizeDayKey(value)
  if (!day) return null
  return day <= getTodayDateKey() ? day : null
}
