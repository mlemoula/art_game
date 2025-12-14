'use client'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Analytics } from '@vercel/analytics/next'
import ZoomableImage from '@/components/ZoomableImage'
import { getWikimediaUrls } from '@/utils/getWikimediaUrls'
import {
  getArtistRecommendations,
  getArtistProfile,
  type ArtistRecommendation,
} from '@/utils/getArtistRecommendations'
import { supabase } from '@/lib/supabaseClient'

const normalizeString = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const FALLBACK_ARTISTS: ArtistRecommendation[] = []
const PROGRESS_KEY_PREFIX = 'art-progress-'
const DAY_MS = 24 * 60 * 60 * 1000

const mergeArtistData = (
  ...lists: Array<ArtistRecommendation[] | undefined>
): ArtistRecommendation[] => {
  const map = new Map<string, ArtistRecommendation>()
  const addEntry = (entry?: ArtistRecommendation | null) => {
    if (!entry?.name) return
    map.set(normalizeString(entry.name), {
      ...map.get(normalizeString(entry.name)),
      ...entry,
    })
  }
  lists.forEach((list) => list?.forEach(addEntry))
  return Array.from(map.values())
}

const extractDayKey = (iso: string | null | undefined) => {
  if (!iso) return ''
  return iso.slice(0, 10)
}

const diffDays = (fromDay: string, toDay: string) => {
  if (!fromDay || !toDay) return Number.NaN
  const fromTime = Date.parse(`${fromDay}T00:00:00Z`)
  const toTime = Date.parse(`${toDay}T00:00:00Z`)
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return Number.NaN
  return Math.round((toTime - fromTime) / DAY_MS)
}

interface DailyArt {
  id: number
  image_url: string
  title: string
  artist: string
  year: string
  museum: string
  wiki_summary_url: string
  wiki_artist_summary_url?: string | null
}

type FeedbackStatus = 'match' | 'earlier' | 'later' | 'different' | 'info' | 'missing'

interface FeedbackDetail {
  label: string
  value: string
  status: FeedbackStatus
}

interface Attempt {
  guess: string
  correct: boolean
  feedback: FeedbackDetail[]
}

interface CommunityStats {
  total: number
  successRate: number
  fastRate: number
}

interface UserStats {
  total: number
  wins: number
  currentStreak: number
  bestStreak: number
  fastestWin: number | null
}

const FEEDBACK_TONES: Record<FeedbackStatus, string> = {
  match: 'text-emerald-700',
  earlier: 'text-amber-700',
  later: 'text-amber-700',
  different: 'text-rose-700',
  info: 'text-slate-600',
  missing: 'text-gray-500',
}

const MAX_WIKI_PARAGRAPHS = 4
const ASSUMED_MAX_ARTIST_AGE = 85
const normalizeSuccessFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === 't' || normalized === '1'
  }
  return false
}

const stripHtml = (value: string) => {
  const content = value || ''
  if (typeof window !== 'undefined' && 'DOMParser' in window) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/html')
    return doc.body.textContent || ''
  }
  return content.replace(/<[^>]+>/g, ' ')
}

const extractParagraphs = (raw: string) =>
  stripHtml(raw || '')
    .replace(/\r/g, '')
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, MAX_WIKI_PARAGRAPHS)

const cleanArtistIntroParagraphs = (paragraphs: string[]) =>
  paragraphs
    .map((p) =>
      p
        .replace(/\([^)]*pronunciation[^)]*\)/gi, '')
        .replace(/\([^)]*\d{3,4}[^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((p) => p.length > 0)

const extractTextFromWikiJson = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return ''
  const data = payload as Record<string, unknown>
  if (typeof data.extract === 'string') return data.extract
  if (typeof data.extract_html === 'string') return data.extract_html
  if (typeof data.summary === 'string') return data.summary
  if (typeof data.content === 'string') return data.content
  const query = data.query
  if (query && typeof query === 'object') {
    const pages = (query as { pages?: unknown }).pages
    if (pages && typeof pages === 'object') {
      const firstPage = Object.values(pages)[0] as Record<string, unknown>
      if (firstPage) {
        if (typeof firstPage.extract === 'string') return firstPage.extract
        if (typeof firstPage.summary === 'string') return firstPage.summary
      }
    }
  }
  return ''
}

const buildWikiApiUrl = (raw: string) => {
  try {
    const url = new URL(raw)
    if (!url.hostname.includes('wikipedia.org')) return raw
    const lang = url.hostname.split('.')[0]
    const title = decodeURIComponent(url.pathname.split('/').pop() || '')
    if (!title) return raw
    return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`
  } catch {
    return raw
  }
}

export default function Home() {
  const [art, setArt] = useState<DailyArt | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [hdLoaded, setHdLoaded] = useState(false)
  const [mediumLoaded, setMediumLoaded] = useState(false)
  const [guess, setGuess] = useState('')
  const [finished, setFinished] = useState(false)
  const [success, setSuccess] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [attemptsHistory, setAttemptsHistory] = useState<Attempt[]>([])
  const [artistHints, setArtistHints] =
    useState<ArtistRecommendation[]>(FALLBACK_ARTISTS)
  const [userToken, setUserToken] = useState('')
  const [playSaved, setPlaySaved] = useState(false)
  const [playStats, setPlayStats] = useState<UserStats | null>(null)
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null)
  const [wikiIntro, setWikiIntro] = useState<string[]>([])
  const [artistWikiIntro, setArtistWikiIntro] = useState<string[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [guessError, setGuessError] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [gaveUp, setGaveUp] = useState(false)
  const [attemptsOpen, setAttemptsOpen] = useState(false)
  const [loadingPreviousPuzzle, setLoadingPreviousPuzzle] = useState(false)
  const [viewingOffset, setViewingOffset] = useState(0)
  const maxAttempts = 5
  const inputRef = useRef<HTMLInputElement | null>(null)
  const blurTimeoutRef = useRef<number | null>(null)
  const submitLockRef = useRef(false)
  const targetArtist = art?.artist ?? ''
  const artistSuggestions = useMemo(() => {
    const map = new Map<string, string>()
    const addName = (name?: string) => {
      if (!name) return
      const key = normalizeString(name)
      if (!map.has(key)) map.set(key, name)
    }
    addName(targetArtist)
    artistHints.forEach((hint) => addName(hint.name))
    return Array.from(map.values())
  }, [targetArtist, artistHints])
  const allowedGuessSet = useMemo(() => {
    const set = new Set<string>()
    artistSuggestions.forEach((name) => {
      if (name) set.add(normalizeString(name))
    })
    return set
  }, [artistSuggestions])
  const artistMeta = useMemo(() => {
    const key = normalizeString(targetArtist || '')
    return artistHints.find(
      (hint) => normalizeString(hint.name || '') === key
    )
  }, [artistHints, targetArtist])
  const artistParagraphs = useMemo(() => {
    if (!art?.artist) return []
    const birth = artistMeta?.birth_year ?? null
    const death = artistMeta?.death_year ?? null
    const movement = artistMeta?.movement ?? null
    const country = artistMeta?.country ?? null
    const sentences: string[] = []
    let subject = art.artist
    if (typeof birth === 'number' && typeof death === 'number') {
      subject += ` (${birth}–${death})`
    }
    const descriptorBase = movement
      ? `painter associated with the ${movement} movement`
      : 'painter'
    const descriptor = country ? `${country} ${descriptorBase}` : descriptorBase
    sentences.push(`${subject} was a ${descriptor}.`)
    const timelineParts: string[] = []
    if (typeof birth === 'number') timelineParts.push(`born in ${birth}`)
    if (typeof death === 'number') timelineParts.push(`died in ${death}`)
    if (timelineParts.length) {
      sentences.push(`They were ${timelineParts.join(' and ')}.`)
    }
    return [sentences.join(' ')]
  }, [art?.artist, artistMeta])

  const requestArtFromApi = useCallback(
    async (params: URLSearchParams, signal?: AbortSignal) => {
      const query = params.toString()
      const response = await fetch(`/api/today${query ? `?${query}` : ''}`, {
        signal,
      })
      if (!response.ok) {
        throw new Error('Failed to load artwork')
      }
      const payload = (await response.json()) as DailyArt
      setArt(payload)
    },
    []
  )

  // Récupérer l'art du jour (ou date spécifique via query param)
  useEffect(() => {
    const controller = new AbortController()
    const loadArt = async () => {
      try {
        const params = new URLSearchParams()
        let offsetValue = 0
        if (typeof window !== 'undefined') {
          const currentParams = new URLSearchParams(window.location.search)
          const offset = currentParams.get('offset')
          const date = currentParams.get('date')
          if (offset) {
            params.set('offset', offset)
            const parsed = Number(offset)
            if (!Number.isNaN(parsed)) offsetValue = parsed
          }
          if (date) {
            params.set('date', date)
            if (!offset) {
              const todayKey = extractDayKey(new Date().toISOString())
              const dayDiff = diffDays(date, todayKey)
              if (!Number.isNaN(dayDiff)) offsetValue = dayDiff
            }
          }
        }
        setViewingOffset(offsetValue)
        await requestArtFromApi(params, controller.signal)
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return
        console.error('Unable to load artwork', error)
        setArt(null)
      }
    }
    loadArt()
    return () => controller.abort()
  }, [requestArtFromApi])

  const mediaUrls = art
    ? getWikimediaUrls(art.image_url)
    : { thumb: '', medium: '', hd: '' }
  const { thumb, medium, hd } = mediaUrls
  const baseSrc = thumb || medium || hd || ''
  const attemptsCount = attemptsHistory.length
  const revealProgress = Math.min(
    1,
    (attemptsCount + (finished ? 1 : 0)) / maxAttempts
  )
  const showFullImage = finished
  const artId = art?.id ?? null

  // Reset gameplay quand nouvelle oeuvre arrive et restaurer progression locale
  useEffect(() => {
    if (!artId) return
    setArtistHints(FALLBACK_ARTISTS)
    setMediumLoaded(false)
    setShareMessage('')
    setSuggestionsOpen(false)
    setHighlightedSuggestion(0)

    const resetCoreState = () => {
      setGuess('')
      setFinished(false)
      setSuccess(false)
      setAttemptsHistory([])
      setPlaySaved(false)
    }

    if (typeof window === 'undefined') {
      resetCoreState()
      return
    }

    const key = `${PROGRESS_KEY_PREFIX}${artId}`
    const stored = window.localStorage.getItem(key)
    if (!stored) {
      resetCoreState()
      return
    }

    try {
      const parsed = JSON.parse(stored) as {
        currentGuess?: string
        finished?: boolean
        success?: boolean
        attemptsHistory?: Attempt[]
        playSaved?: boolean
      }
      setGuess(parsed.currentGuess || '')
      setFinished(Boolean(parsed.finished))
      setSuccess(Boolean(parsed.success))
      setAttemptsHistory(
        Array.isArray(parsed.attemptsHistory) ? parsed.attemptsHistory : []
      )
      setPlaySaved(Boolean(parsed.playSaved))
    } catch {
      resetCoreState()
    }
  }, [artId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let token = window.localStorage.getItem('art_game_user_token')
    if (!token) {
      token =
        (window.crypto?.randomUUID && window.crypto.randomUUID()) ||
        Math.random().toString(36).slice(2)
      window.localStorage.setItem('art_game_user_token', token)
    }
    setUserToken(token)
    const helpSeen = window.localStorage.getItem('art_game_help_seen')
    if (!helpSeen) setShowHelp(true)
  }, [])

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  // Suggestions artistes dynamiques & métadonnées pour feedback
  useEffect(() => {
    if (!art?.artist) {
      setArtistHints(FALLBACK_ARTISTS)
      return
    }
    let cancelled = false
    const loadHints = async () => {
      try {
        const [recs, profile] = await Promise.all([
          getArtistRecommendations(art.artist, 500),
          getArtistProfile(art.artist),
        ])
        if (!cancelled) {
          setArtistHints(
            mergeArtistData(
              profile ? [profile] : undefined,
              recs || [],
              FALLBACK_ARTISTS
            )
          )
        }
      } catch {
        if (!cancelled) setArtistHints(FALLBACK_ARTISTS)
      }
    }
    loadHints()
    return () => {
      cancelled = true
    }
  }, [art?.artist])

  // Statistiques utilisateur pour personnaliser l'expérience
  useEffect(() => {
    if (!userToken) return
    let cancelled = false

    const fetchStats = async () => {
      try {
        const { data } = await supabase
          .from('plays')
          .select('success, attempts, created_at')
          .eq('user_token', userToken)
          .order('created_at', { ascending: false })

        if (!cancelled && data) {
          const total = data.length
          const wins = data.filter((row) => normalizeSuccessFlag(row.success)).length
          const byDay = new Map<string, { success: boolean; attempts?: number | null }>()
          data.forEach((row) => {
            const key = extractDayKey(row.created_at)
            if (!key) return
            if (!byDay.has(key)) {
              byDay.set(key, {
                success: normalizeSuccessFlag(row.success),
                attempts: row.attempts,
              })
            }
          })
          const orderedDays = Array.from(byDay.entries()).sort((a, b) =>
            a[0].localeCompare(b[0])
          )
          let bestStreak = 0
          let rolling = 0
          let previousDay: string | null = null
          orderedDays.forEach(([day, info]) => {
            if (!info.success) {
              rolling = 0
              previousDay = null
              return
            }
            if (!previousDay) {
              rolling = 1
            } else {
              const gap = diffDays(previousDay, day)
              rolling = gap === 1 ? rolling + 1 : 1
            }
            previousDay = day
            if (rolling > bestStreak) bestStreak = rolling
          })
          let currentStreak = 0
          let expectedDay: string | null = null
          for (let i = orderedDays.length - 1; i >= 0; i -= 1) {
            const [day, info] = orderedDays[i]
            if (!info.success) break
            if (!expectedDay) {
              currentStreak = 1
              expectedDay = day
              continue
            }
            const gap = diffDays(day, expectedDay)
            if (gap === 1) {
              currentStreak += 1
              expectedDay = day
            } else {
              break
            }
          }
          const fastestWin = data
            .filter(
              (row) =>
                normalizeSuccessFlag(row.success) && typeof row.attempts === 'number'
            )
            .reduce<number | null>(
              (best, row) =>
                best === null
                  ? (row.attempts ?? null)
                  : Math.min(best, row.attempts ?? best),
              null
            )
          setPlayStats({
            total,
            wins,
            currentStreak,
            bestStreak,
            fastestWin,
          })
        }
      } catch {
        if (!cancelled) setPlayStats(null)
      }
    }

    fetchStats()
    return () => {
      cancelled = true
    }
  }, [userToken, playSaved])

  // Récupération intro Wikipedia (3-4 paragraphes)
  useEffect(() => {
    if (!art?.wiki_summary_url) {
      setWikiIntro([])
      return
    }
    let cancelled = false

    const fetchIntro = async () => {
      try {
        const summaryUrl = buildWikiApiUrl(art.wiki_summary_url)
        const response = await fetch(summaryUrl, {
          headers: { accept: 'application/json' },
        })
        const contentType = response.headers.get('content-type') || ''
        let rawText = ''
        if (contentType.includes('application/json')) {
          const json = await response.json()
          rawText = extractTextFromWikiJson(json)
        } else {
          rawText = await response.text()
        }
        const paragraphs = extractParagraphs(rawText)
        if (!cancelled) setWikiIntro(paragraphs)
      } catch {
        if (!cancelled) setWikiIntro([])
      }
    }

    fetchIntro()

    return () => {
      cancelled = true
    }
  }, [art?.wiki_summary_url])

  useEffect(() => {
    if (!art?.artist) {
      setArtistWikiIntro([])
      return
    }
    let cancelled = false
    const fetchArtistWiki = async () => {
      const preferredUrl =
        artistMeta?.wiki_summary_url ||
        art.wiki_artist_summary_url ||
        (art.artist
          ? `https://en.wikipedia.org/wiki/${encodeURIComponent(
              art.artist.replace(/\s+/g, '_')
            )}`
          : '')
      if (!preferredUrl) {
        if (!cancelled) setArtistWikiIntro([])
        return
      }
      try {
        const summaryUrl = buildWikiApiUrl(preferredUrl)
        const response = await fetch(summaryUrl, {
          headers: { accept: 'application/json' },
        })
        const contentType = response.headers.get('content-type') || ''
        let rawText = ''
        if (contentType.includes('application/json')) {
          const json = await response.json()
          rawText = extractTextFromWikiJson(json)
        } else {
          rawText = await response.text()
        }
        const paragraphs = cleanArtistIntroParagraphs(extractParagraphs(rawText))
        if (!cancelled) setArtistWikiIntro(paragraphs)
      } catch {
        if (!cancelled) setArtistWikiIntro([])
      }
    }
    fetchArtistWiki()
    return () => {
      cancelled = true
    }
  }, [art?.artist, artistMeta?.wiki_summary_url, art?.wiki_artist_summary_url])

  // Précharger la version de base (thumb prioritaire pour un affichage rapide)
  useEffect(() => {
    if (!baseSrc) {
      setImageReady(false)
      return
    }

    let cancelled = false
    setImageReady(false)
    const img = new Image()
    img.src = baseSrc

    const markReady = () => {
      if (!cancelled) setImageReady(true)
    }

    const decodeOrResolve = () => {
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(markReady)
          .catch(markReady)
      } else {
        markReady()
      }
    }

    if (img.complete && img.naturalWidth > 0) {
      decodeOrResolve()
      return
    }

    img.onload = decodeOrResolve
    img.onerror = markReady

    return () => {
      cancelled = true
    }
  }, [baseSrc])

  // Précharger HD en arrière-plan pour la révélation finale
  useEffect(() => {
    if (!hd) {
      setHdLoaded(false)
      return
    }
    let cancelled = false
    setHdLoaded(false)
    const img = new Image()
    img.src = hd
    const handleDone = () => {
      if (!cancelled) setHdLoaded(true)
    }
    if (img.complete) {
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(handleDone)
          .catch(handleDone)
      } else {
        handleDone()
      }
      return
    }
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(handleDone)
          .catch(handleDone)
      } else {
        handleDone()
      }
    }
    img.onerror = handleDone
    return () => {
      cancelled = true
    }
  }, [hd])

  // Précharger medium pour basculer en douceur
  useEffect(() => {
    if (!medium) {
      setMediumLoaded(false)
      return
    }
    let cancelled = false
    setMediumLoaded(false)
    const img = new Image()
    img.src = medium
    const finish = () => {
      if (!cancelled) setMediumLoaded(true)
    }
    if (img.complete && img.naturalWidth > 0) {
      finish()
      return
    }
    img.onload = finish
    img.onerror = finish
    return () => {
      cancelled = true
    }
  }, [medium])
  const MIN_SUGGESTION_LENGTH = 2
  const MAX_SUGGESTIONS = 25
  const deferredGuess = useDeferredValue(guess)
  const filteredSuggestions = useMemo(() => {
    if (deferredGuess.trim().length < MIN_SUGGESTION_LENGTH) return []
    const needle = normalizeString(deferredGuess.trim())
    const results: string[] = []
    for (const name of artistSuggestions) {
      if (normalizeString(name).includes(needle)) {
        results.push(name)
      }
      if (results.length >= MAX_SUGGESTIONS) break
    }
    return results
  }, [artistSuggestions, deferredGuess])
  useEffect(() => {
    setHighlightedSuggestion(0)
  }, [deferredGuess, filteredSuggestions.length])
  const showSuggestions = suggestionsOpen && filteredSuggestions.length > 0

  const imageSrcSet = useMemo(() => {
    const entries = [
      thumb && `${thumb} 480w`,
      medium && `${medium} 900w`,
      hd && `${hd} 1600w`,
    ].filter(Boolean)
    return entries.length ? entries.join(', ') : undefined
  }, [thumb, medium, hd])
  const safeMaxAttempts = Math.max(maxAttempts, 1)
  const zoomProgress = finished ? 1 : attemptsCount / safeMaxAttempts
  type QualityTier = 'detail' | 'medium' | 'wide'
  const qualityTier: QualityTier = (() => {
    if (finished) return 'wide'
    if (zoomProgress < 0.35) return 'detail'
    if (zoomProgress < 0.75) return 'medium'
    return 'wide'
  })()
  const detailCandidate = hd || medium || baseSrc
  const mediumCandidate = medium || baseSrc
  const wideCandidate = thumb || mediumCandidate

  const selectSrcForTier = (tier: QualityTier) => {
    if (tier === 'detail') {
      if (hdLoaded && hd) return hd
      if (mediumLoaded && medium) return medium
      if (imageReady) return baseSrc
      return ''
    }
    if (tier === 'medium') {
      if (mediumLoaded && mediumCandidate) return mediumCandidate
      if (imageReady) return baseSrc
      if (hdLoaded && detailCandidate) return detailCandidate
      return ''
    }
    if (mediumLoaded && wideCandidate) return wideCandidate
    if (imageReady) return baseSrc
    return ''
  }
  const displaySrc = selectSrcForTier(qualityTier)
  const displaySrcSet =
    qualityTier === 'detail' && hdLoaded && displaySrc === hd
      ? imageSrcSet
      : undefined
  const displayAttempts = finished ? maxAttempts : attemptsCount
  const srcReady = (() => {
    if (!displaySrc) return false
    if (displaySrc === hd) return hdLoaded
    if (displaySrc === medium) return mediumLoaded
    return imageReady
  })()
  const isDisplayReady = Boolean(displaySrc && srcReady)

  useEffect(() => {
    if (!finished || !artId || !userToken || playSaved || !attemptsHistory.length)
      return
    const payload = {
      daily_id: artId,
      attempts: attemptsHistory.length,
      success,
      user_token: userToken,
      attempts_data: attemptsHistory,
    }
    const persistPlay = async () => {
      try {
        const { error } = await supabase.from('plays').insert(payload)
        if (!error) setPlaySaved(true)
      } catch {
        // ignore, fallback to local history
      }
    }
    persistPlay()
  }, [finished, artId, userToken, playSaved, attemptsHistory, success])

  const isViewingPreviousPuzzle = viewingOffset < 0
  const shareGlyphs = useMemo(() => {
    const tokens = Array.from({ length: maxAttempts }, (_, idx) => {
      const attempt = attemptsHistory[idx]
      if (!attempt) return '.'
      return attempt.correct ? '✅' : '×'
    })
    if (gaveUp && finished && !success) {
      return tokens.map((token) => (token === '.' ? '×' : token)).join(' ')
    }
    return tokens.join(' ')
  }, [attemptsHistory, maxAttempts, gaveUp, finished, success])

  const buildShareContent = () => {
    if (!art) return ''
    const grid = shareGlyphs || '. . . . .'
    const urlHint =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '')
    const pitchLines = [
      '4rtW0rk - One minute art puzzle',
      'Can you guess who painted it and beat my score?',
      grid,
    ]
    if (urlHint) pitchLines.push(urlHint)
    return pitchLines.join('\n')
  }

  const handleShare = async () => {
    if (!finished) return
    const shareContent = buildShareContent()
    if (!shareContent) return
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & {
            share?: (data: ShareData) => Promise<void>
            clipboard?: Clipboard
          })
        : undefined
    setShareMessage('')
    try {
      if (nav?.share) {
        await nav.share({
          title: '4rtW0rk',
          text: shareContent,
        })
        setShareMessage('Shared with your device dialog.')
      } else if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(shareContent)
        setShareMessage('Result copied to clipboard.')
      } else {
        setShareMessage(shareContent)
      }
    } catch {
      setShareMessage('Share canceled or unavailable.')
    }
  }

  const handleTryPreviousPuzzle = async () => {
    if (loadingPreviousPuzzle) return
    setLoadingPreviousPuzzle(true)
    try {
      const params = new URLSearchParams()
      const targetOffset = viewingOffset < 0 ? 0 : -1
      params.set('offset', String(targetOffset))
      await requestArtFromApi(params)
      setViewingOffset(targetOffset)
    } catch (error) {
      console.error('Unable to load previous puzzle', error)
    } finally {
      setLoadingPreviousPuzzle(false)
    }
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('art_game_theme', next)
    }
  }

  const dismissHelp = (persist = true) => {
    setShowHelp(false)
    if (persist && typeof window !== 'undefined') {
      window.localStorage.setItem('art_game_help_seen', '1')
    }
  }

  useEffect(() => {
    if (!finished || !artId) {
      setCommunityStats(null)
      return
    }
    let cancelled = false
    const fetchCommunityStats = async () => {
      try {
        const { data, count } = await supabase
          .from('plays')
          .select('attempts, success', { count: 'exact' })
          .eq('daily_id', artId)
        if (!cancelled && data) {
          const total = count ?? data.length
          if (!total) {
            setCommunityStats(null)
            return
          }
          const successCount = data.filter((row) => normalizeSuccessFlag(row.success)).length
          const fastWins = data.filter(
            (row) =>
              normalizeSuccessFlag(row.success) &&
              typeof row.attempts === 'number' &&
              (row.attempts ?? 0) <= 3
          ).length
          const successRate = Math.round((successCount / total) * 100)
          const fastRate = Math.round((fastWins / total) * 100)
          setCommunityStats({
            total,
            successRate,
            fastRate,
          })
        }
      } catch {
        if (!cancelled) setCommunityStats(null)
      }
    }
    fetchCommunityStats()
    return () => {
      cancelled = true
    }
  }, [finished, artId])


  // Sauvegarde locale de la progression du jour
  useEffect(() => {
    if (!artId || typeof window === 'undefined') return
    const key = `${PROGRESS_KEY_PREFIX}${artId}`
    const payload = {
      currentGuess: guess,
      finished,
      success,
      attemptsHistory,
      playSaved,
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(payload))
    } catch {
      // ignore storage failures
    }
  }, [artId, guess, finished, success, attemptsHistory, playSaved])

  useEffect(() => {
    setAttemptsOpen(false)
  }, [finished, artId])

  useEffect(() => {
    setGaveUp(false)
  }, [artId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('art_game_theme')
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored)
      return
    }
    if (typeof window.matchMedia === 'function') {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      setTheme(media.matches ? 'dark' : 'light')
      const listener = (event: MediaQueryListEvent) => {
        if (window.localStorage.getItem('art_game_theme')) return
        setTheme(event.matches ? 'dark' : 'light')
      }
      media.addEventListener('change', listener)
      return () => {
        media.removeEventListener('change', listener)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = window.document.documentElement
    root.dataset.theme = theme
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  const normalize = normalizeString
  const usedGuessSet = useMemo(() => {
    const set = new Set<string>()
    attemptsHistory.forEach((attempt) => {
      set.add(normalize(attempt.guess))
    })
    return set
  }, [attemptsHistory])

  if (!art) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white text-gray-600 font-mono">
        <span className="text-xs tracking-wide uppercase">Loading…</span>
      </div>
    )
  }

  const museumClue =
    art.museum
      ?.split(',')
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .pop() || art.museum
  const fallbackIntro = `${art.title} is a painting by ${art.artist} from ${art.year}, currently exhibited at ${art.museum}.`
  const paintingParagraphs = wikiIntro.length ? wikiIntro : [fallbackIntro]
  const artistDetailParagraphs = artistWikiIntro.length ? artistWikiIntro : artistParagraphs
  const fallbackArtistWikiUrl = art.artist
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(
        art.artist.replace(/\s+/g, '_')
      )}`
    : ''
  const artistWikiHref =
    artistMeta?.wiki_summary_url || art.wiki_artist_summary_url || fallbackArtistWikiUrl

  const renderAttempts = (
    containerClass = 'mt-6 w-full max-w-[360px]',
    variant: 'card' | 'inline' = 'card'
  ) => {
    if (!attemptsHistory.length) return null
    const reversed = [...attemptsHistory].reverse()
    const compact = variant === 'inline'
    const headerClasses = compact
      ? 'text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-2 flex justify-between'
      : 'text-xs uppercase tracking-wide text-gray-500 mb-3 flex justify-between'
    const glyphClasses = compact
      ? 'font-mono text-[11px] text-gray-800 tracking-[0.12em]'
      : 'font-mono text-[11px] text-gray-800 tracking-[0.12em]'
    const listClasses = compact ? 'space-y-2' : 'space-y-3'
    const itemClasses = compact
      ? 'border-b border-gray-100 pb-2 last:border-b-0 last:pb-0'
      : 'border-b border-gray-100 pb-2 last:border-b-0 last:pb-0'
    const attemptLabelClass = compact
      ? 'text-[12px] text-slate-600 flex items-center justify-between'
      : 'text-xs text-slate-600 flex items-center justify-between'
    return (
      <div
        className={
          variant === 'card'
            ? `${containerClass} border border-gray-100 rounded-2xl bg-white/80 shadow-sm p-4 attempt-card`
            : containerClass
            ? `${containerClass} attempt-card`
            : 'attempt-card'
        }
      >
        <div className={headerClasses}>
          <span>Attempts</span>
          <span className={glyphClasses}>{shareGlyphs}</span>
        </div>
        <ul className={listClasses}>
          {reversed.map((entry, idx) => {
            const attemptNumber = attemptsHistory.length - idx
            return (
              <li key={`${entry.guess}-${idx}`} className={itemClasses}>
                <div className={attemptLabelClass}>
                  <span
                    className={`truncate ${
                      entry.correct ? 'font-medium text-emerald-700' : ''
                    }`}
                  >
                    #{attemptNumber} {entry.guess}
                  </span>
                  <span
                    className={`ml-2 whitespace-nowrap ${
                      entry.correct ? 'text-emerald-600 font-semibold' : ''
                    }`}
                  >
                    {entry.correct ? 'Exact match!' : '–'}
                  </span>
                </div>
                {Array.isArray(entry.feedback) ? (
                  <div className="mt-1 text-[11px] text-gray-600 space-y-1">
                    {entry.feedback.map((detail, detailIdx) => (
                      <div key={`${detail.label}-${detailIdx}`} className="flex justify-between">
                        <span className="text-slate-500">{detail.label}</span>
                        <span className={`${FEEDBACK_TONES[detail.status] || 'text-slate-700'}`}>
                          {detail.value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : entry.feedback ? (
                  <pre className="mt-1 text-[11px] text-gray-600 whitespace-pre-wrap">
                    {entry.feedback as unknown as string}
                  </pre>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const handleSubmit = async (overrideGuess?: string) => {
    if (finished || !art) return
    const rawGuess = typeof overrideGuess === 'string' ? overrideGuess : guess
    const trimmedGuess = rawGuess.trim()
    if (!trimmedGuess) return
    const guessNorm = normalize(trimmedGuess)
    setGaveUp(false)
    if (!allowedGuessSet.has(guessNorm)) {
      setGuessError('Pick an artist from the suggestions.')
      return
    }
    if (usedGuessSet.has(guessNorm)) {
      setGuessError('You already tried this artist.')
      return
    }
    if (submitLockRef.current) return
    submitLockRef.current = true

    try {
      const correctArtist = normalize(art.artist)
      const artistLastName = normalize(
        art.artist
          .split(' ')
          .filter(Boolean)
          .pop() || ''
      )
      const correct =
        guessNorm === correctArtist ||
        (!!artistLastName && guessNorm === artistLastName)

      const feedbackDetails: FeedbackDetail[] = []
      const artYearNumber = parseInt(art.year, 10)
      const guessedProfile = await getArtistProfile(trimmedGuess)
      const localGuessMeta = artistHints.find(
        (hint) => normalize(hint.name) === guessNorm
      )
      const guessedArtistData = guessedProfile || localGuessMeta || null

      const pushDetail = (label: string, value: string, status: FeedbackStatus) =>
        feedbackDetails.push({ label, value, status })

      if (!correct) {
        const birth = guessedArtistData?.birth_year
        const death = guessedArtistData?.death_year

        if (birth) {
          const aliveDuringPainting =
            death && artYearNumber >= birth && artYearNumber <= death
          pushDetail(
            'Birth year',
            String(birth),
            aliveDuringPainting ? 'match' : 'info'
          )
        } else {
          pushDetail('Birth year', '—', 'missing')
        }

        if (death) {
          pushDetail(
            'Death year',
            String(death),
            artYearNumber > death ? 'earlier' : 'info'
          )
        } else {
          pushDetail('Death year', '—', 'missing')
        }

        const artYearValid = Number.isFinite(artYearNumber)
        if (artYearValid && (birth || death)) {
          const birthYear = typeof birth === 'number' ? birth : null
          const fallbackDeath =
            birthYear !== null
              ? Math.min(
                  birthYear + ASSUMED_MAX_ARTIST_AGE,
                  new Date().getUTCFullYear()
                )
              : null
          const deathYear =
            typeof death === 'number' ? death : fallbackDeath

          if (birthYear !== null && artYearNumber < birthYear) {
            pushDetail('Era hint', '🔻 Try an older artist', 'earlier')
          } else if (deathYear !== null && artYearNumber > deathYear) {
            pushDetail('Era hint', '🔺 Try a more recent artist', 'later')
          } else {
            pushDetail('Era hint', 'Within their lifetime', 'match')
          }
        }

        const compareField = (
          label: string,
          actual?: string | null,
          guessField?: string | null
        ) => {
          if (!guessField) {
            pushDetail(label, '—', 'missing')
            return
          }
          if (!actual || !artistMeta) {
            pushDetail(label, guessField, 'info')
            return
          }
          const match = normalize(actual) === normalize(guessField)
          pushDetail(label, guessField, match ? 'match' : 'different')
        }

        compareField('Movement', artistMeta?.movement, guessedArtistData?.movement)
        compareField('Country', artistMeta?.country, guessedArtistData?.country)

        const guessPopularity = guessedArtistData?.popularity_score ?? null
        const targetPopularity = artistMeta?.popularity_score ?? null
        if (guessPopularity !== null && targetPopularity !== null) {
          const delta = guessPopularity - targetPopularity
          let popularityHint = ''
          let tone: FeedbackStatus = 'info'
          const threshold = 7
          if (Math.abs(delta) <= threshold) {
            popularityHint = 'Similar fame'
            tone = 'match'
          } else if (delta > threshold) {
            popularityHint = 'Artist of the day is less famous'
            tone = 'different'
          } else {
            popularityHint = 'Try a more famous artist'
            tone = 'different'
          }
          pushDetail('Fame hint', popularityHint, tone)
        } else {
          pushDetail('Fame hint', '—', 'missing')
        }

        if (!guessedArtistData) {
          pushDetail('Data', 'No reference yet for this artist.', 'info')
        }
      }

      setAttemptsHistory((prev) => [
        ...prev,
        {
          guess: trimmedGuess,
          correct,
          feedback: feedbackDetails,
        },
      ])

      const nextAttemptCount = attemptsCount + 1

      if (correct) {
        setSuccess(true)
        setFinished(true)
      } else if (nextAttemptCount >= maxAttempts) {
        setFinished(true)
      }
      setGuess('')
      setSuggestionsOpen(false)
      setGuessError(null)
    } finally {
      submitLockRef.current = false
    }
  }

  const handleGiveUp = () => {
    if (finished || !art) return
    setFinished(true)
    setSuccess(false)
    setGuess('')
    setSuggestionsOpen(false)
    setGuessError(null)
    setGaveUp(true)
  }

  const selectSuggestion = (name: string, submitAfter = false) => {
    setGuess(name)
    setSuggestionsOpen(false)
    setHighlightedSuggestion(0)
    if (guessError) setGuessError(null)
    if (submitAfter) {
      setTimeout(() => {
        void handleSubmit(name)
      }, 0)
    }
  }

  const clearPendingBlur = () => {
    if (blurTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
  }

  const handleInputFocus = () => {
    clearPendingBlur()
    setSuggestionsOpen(true)
  }

  const handleInputBlur = () => {
    if (typeof window === 'undefined') {
      setSuggestionsOpen(false)
      return
    }
    clearPendingBlur()
    blurTimeoutRef.current = window.setTimeout(() => {
      setSuggestionsOpen(false)
      blurTimeoutRef.current = null
    }, 120)
  }

  const placeholderText = 'Who painted this?'
  const attemptsUsed = attemptsHistory.length
  const outcomeLabel = finished ? (success ? 'Congrats !' : 'Not this time') : ''
  const outcomeSubline = finished
    ? success
      ? 'See you tomorrow'
      : 'Better luck tomorrow'
    : ''
  const streakBadge =
    playStats?.currentStreak && playStats.currentStreak >= 2
      ? `${playStats.currentStreak}-day streak`
      : null
  const frameOuterClass = finished
    ? 'frame-outer w-full sm:w-auto max-w-[420px] rounded-[32px] border border-slate-200 shadow-sm transition-all duration-300 mx-auto overflow-hidden p-3 sm:p-4'
    : 'frame-outer w-full max-w-[420px] rounded-[28px] border border-slate-200 transition-all duration-300 overflow-hidden p-2'
  const frameInnerClass = finished
    ? 'frame-inner w-full h-full overflow-hidden rounded-[26px]'
    : 'frame-inner w-full h-full overflow-hidden rounded-2xl'

  return (
    <div
      className="flex flex-col items-center px-4 sm:px-6 py-4 min-h-screen bg-white text-gray-900 font-mono"
      data-theme={theme}
    >
      <style jsx global>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-20px);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translateY(60px);
            opacity: 0;
          }
        }

        .animate-fall {
          animation: confetti-fall 1.2s ease-out forwards;
        }
        .stats-card {
          background-color: rgba(255, 255, 255, 0.95);
          border-color: rgba(148, 163, 184, 0.4);
        }
        [data-theme='dark'] .stats-card {
          background-color: rgba(15, 23, 42, 0.75);
          border-color: rgba(148, 163, 184, 0.35);
        }
        .stats-panel {
          background-color: rgba(248, 250, 252, 0.7);
        }
        [data-theme='dark'] .stats-panel {
          background-color: rgba(15, 23, 42, 0.7);
        }
        .attempt-card {
          background-color: rgba(255, 255, 255, 0.92);
        }
        [data-theme='dark'] .attempt-card {
          background-color: rgba(15, 23, 42, 0.85);
        }
        .attempt-breakdown {
          background-color: rgba(255, 255, 255, 0.95);
        }
        [data-theme='dark'] .attempt-breakdown {
          background-color: rgba(15, 23, 42, 0.95);
        }
        .hover-bg-secondary:hover {
          background-color: rgba(248, 250, 252, 0.75);
        }
        [data-theme='dark'] .hover-bg-secondary:hover {
          background-color: rgba(255, 255, 255, 0.08) !important;
        }
        .result-card {
          background-color: rgba(255, 255, 255, 0.95);
          border-color: rgba(148, 163, 184, 0.6);
        }
        [data-theme='dark'] .result-card {
          background-color: rgba(15, 23, 42, 0.85);
          border-color: rgba(59, 130, 246, 0.3);
        }
        .answer-card {
          background-color: rgba(255, 255, 255, 0.95);
          border-color: rgba(148, 163, 184, 0.6);
        }
        [data-theme='dark'] .answer-card {
          background-color: rgba(15, 23, 42, 0.85);
          border-color: rgba(59, 130, 246, 0.3);
        }
        .frame-outer {
          background-color: transparent;
          border-color: rgba(148, 163, 184, 0.35);
          box-shadow:
            inset 0 0 0 1px rgba(148, 163, 184, 0.45),
            0 30px 70px rgba(15, 23, 42, 0.08);
          position: relative;
        }
        [data-theme='dark'] .frame-outer {
          background-color: transparent;
          border-color: rgba(59, 130, 246, 0.25);
          box-shadow:
            inset 0 0 0 1px rgba(59, 130, 246, 0.3),
            0 30px 70px rgba(2, 6, 23, 0.65);
        }
        .frame-inner {
          width: 100%;
          height: 100%;
          background-color: rgba(255, 255, 255, 0.97);
        }
        [data-theme='dark'] .frame-inner {
          background-color: rgba(2, 6, 23, 0.94);
        }
        .button-hover {
          transition: background-color 0.2s ease;
        }
        .button-hover:hover {
          background-color: rgba(15, 23, 42, 0.05);
        }
        [data-theme='dark'] .button-hover:hover {
          background-color: rgba(255, 255, 255, 0.08);
        }
        .primary-share-button {
          border-color: #0f172a;
          color: #0f172a;
          background-color: rgba(255, 255, 255, 0.92);
        }
        .primary-share-button:hover {
          background-color: rgba(15, 23, 42, 0.08);
        }
        [data-theme='dark'] .primary-share-button {
          border-color: #f8fafc;
          color: #f8fafc;
          background-color: rgba(15, 23, 42, 0.6);
        }
        [data-theme='dark'] .primary-share-button:hover {
          background-color: rgba(248, 250, 252, 0.08);
        }
        [data-theme='dark'] {
          background-color: #020617;
          color: #e2e8f0;
        }
        [data-theme='dark'] .bg-white {
          background-color: #020617 !important;
        }
        [data-theme='dark'] .bg-white\\/80 {
          background-color: rgba(15, 23, 42, 0.8) !important;
        }
        [data-theme='dark'] .bg-white\\/90 {
          background-color: rgba(15, 23, 42, 0.9) !important;
        }
        [data-theme='dark'] .from-slate-50 {
          --tw-gradient-from: #0f172a !important;
        }
        [data-theme='dark'] .to-white {
          --tw-gradient-to: #020617 !important;
        }
        [data-theme='dark'] .bg-gray-50,
        [data-theme='dark'] .bg-gray-50\\/70 {
          background-color: #0f172a !important;
        }
        [data-theme='dark'] .bg-gray-100 {
          background-color: #111827 !important;
        }
        [data-theme='dark'] .bg-slate-50,
        [data-theme='dark'] .bg-slate-50\\/60 {
          background-color: #0f172a !important;
        }
        [data-theme='dark'] .border-gray-200,
        [data-theme='dark'] .border-slate-200,
        [data-theme='dark'] .border-gray-100 {
          border-color: #1f2937 !important;
        }
        [data-theme='dark'] .text-gray-900,
        [data-theme='dark'] .text-gray-800,
        [data-theme='dark'] .text-slate-900,
        [data-theme='dark'] .text-slate-800 {
          color: #f8fafc !important;
        }
        [data-theme='dark'] .text-gray-500,
        [data-theme='dark'] .text-slate-500 {
          color: #94a3b8 !important;
        }
        .answer-label {
          color: #94a3b8;
        }
        [data-theme='dark'] .answer-label {
          color: #94a3b8;
        }
        .answer-title,
        .answer-subtitle {
          color: #0f172a;
        }
        [data-theme='dark'] .answer-title,
        [data-theme='dark'] .answer-subtitle {
          color: #f8fafc;
        }
        .answer-artist {
          color: #0f172a;
        }
        [data-theme='dark'] .answer-artist {
          color: #cbd5f5;
        }
        .answer-meta {
          color: #475569;
        }
        [data-theme='dark'] .answer-meta {
          color: #94a3b8;
        }
        .answer-hint {
          color: #94a3b8;
        }
        [data-theme='dark'] .answer-hint {
          color: #cbd5f5;
        }
      `}</style>
      <div className="w-full max-w-[420px] relative flex items-center justify-center gap-2 mb-6">
        <h1 className="text-xl font-normal tracking-tight uppercase">4rtW0rk</h1>
        <div className="absolute right-0 flex items-center gap-2">
          <button
            type="button"
            aria-label="How to play"
            onClick={() => setShowHelp(true)}
            className="text-xs border border-gray-300 rounded-full px-2 py-1 text-gray-600 button-hover"
          >
            ?
          </button>
          <button
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
            className="text-xs border border-gray-300 rounded-full px-2 py-1 text-gray-600 button-hover"
          >
            {theme === 'dark' ? '🌞' : '🌑'}
          </button>
        </div>
        <p className="sr-only">
          Guess the painter in up to five attempts. Each wrong guess gracefully zooms out the artwork to reveal more clues.
        </p>
      </div>

      {/* Affiche placeholder jusqu'à ce que l'image jouable soit prête */}
      <div className={frameOuterClass}>
        <div className={frameInnerClass}>
          {isDisplayReady && displaySrc ? (
            <ZoomableImage
              key={displaySrc}
              src={displaySrc}
              srcSet={displaySrcSet}
              width={400}
              height={300}
              attempts={displayAttempts}
              maxAttempts={maxAttempts}
              detailX="50%"
              detailY="30%"
              fit={showFullImage ? 'contain' : 'cover'}
              lockWidthToImage={finished || showFullImage}
              revealProgress={revealProgress}
            />
          ) : (
            <div className="w-full aspect-[4/3] flex items-center justify-center text-gray-500 text-xs tracking-wide bg-gray-50">
              Loading…
            </div>
          )}
        </div>
      </div>

      {finished && (
        <div className="mt-2 w-[320px] text-center text-xs text-gray-600">
          <div className="w-full max-w-[360px] rounded-2xl p-4 text-center space-y-1 result-card answer-card">
            <p className="text-sm tracking-tight answer-title">{art.title}</p>
            <p className="text-sm tracking-tight answer-subtitle">
              by <span className="answer-artist font-semibold">{art.artist}</span>
            </p>
            <p className="mt-2 text-[11px] answer-meta">
              {art.year} • {museumClue || 'Unknown location'}
            </p>
          </div>
        </div>
      )}

      {!finished && (
        <div className="flex flex-col items-center mt-6 space-y-3 w-full max-w-[360px]">
          <label htmlFor="guess-input" className="sr-only">
            Guess the painter
          </label>
          <div className="relative w-full">
            <input
              id="guess-input"
              ref={inputRef}
              name="guess"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              value={guess}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onChange={(e) => {
                setGuess(e.target.value)
                setSuggestionsOpen(true)
                if (guessError) setGuessError(null)
              }}
              onKeyDown={(e) => {
                if (showSuggestions && filteredSuggestions.length) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setHighlightedSuggestion((prev) =>
                      prev + 1 >= filteredSuggestions.length ? 0 : prev + 1
                    )
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setHighlightedSuggestion((prev) =>
                      prev - 1 < 0
                        ? filteredSuggestions.length - 1
                        : prev - 1
                    )
                    return
                  }
                  if (e.key === 'Tab') {
                    setSuggestionsOpen(false)
                    return
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setSuggestionsOpen(false)
                    return
                  }
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (showSuggestions && filteredSuggestions.length) {
                    const choice =
                      filteredSuggestions[highlightedSuggestion] ||
                      filteredSuggestions[0]
                    selectSuggestion(choice, true)
                    return
                  }
                  void handleSubmit()
                }
              }}
              placeholder={placeholderText}
              className="w-full border border-gray-300 rounded px-3 py-2 text-base tracking-tight bg-white"
              style={{ fontSize: '16px' }}
            />
            {showSuggestions && (
              <ul className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto border border-gray-200 rounded-xl bg-white shadow-lg z-10">
                {filteredSuggestions.map((name, idx) => {
                  const active = idx === highlightedSuggestion
                  return (
                    <li
                      key={name}
                      className={`px-3 py-2 text-xs cursor-pointer ${
                        active
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-800'
                      } ${idx !== filteredSuggestions.length - 1 ? 'border-b border-gray-100' : ''}`}
                      onMouseEnter={() => setHighlightedSuggestion(idx)}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        clearPendingBlur()
                        selectSuggestion(name)
                      }}
                    >
                      {name}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {guessError && (
            <p className="w-full text-left text-xs text-rose-600">{guessError}</p>
          )}
          <button
            type="button"
            onClick={() => {
              setSuggestionsOpen(false)
              void handleSubmit()
            }}
            className="w-full border border-gray-900 text-gray-900 rounded px-3 py-2 text-sm tracking-tight button-hover"
          >
            Submit
          </button>
          <div className="text-[11px] text-gray-500 text-center space-y-1">
            <p className="font-mono text-sm text-gray-800 text-center tracking-[0.12em]">
              {shareGlyphs}
            </p>
            {attemptsHistory.length >= 1 && (
              <p>
                ✦ Clue: This artwork can be seen in {museumClue || 'unknown venues'}
              </p>
            )}
            {attemptsHistory.length >= 3 && (
              <p>✦ Painted in {art.year}</p>
            )}
            {attemptsHistory.length >= maxAttempts - 1 && (
              <p>
                ✦ Movement: {artistMeta?.movement || 'not documented'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleGiveUp}
            className="w-full text-center text-xs text-gray-500 underline decoration-dotted hover:text-gray-800"
          >
            I give up, show me the answer
          </button>
        </div>
      )}

      {!finished && renderAttempts()}

      {playStats && !finished && (
        <div className="mt-5 w-full max-w-[360px] rounded-2xl border border-gray-100 bg-white/80 p-4 text-[11px] text-gray-600 stats-card">
          <p className="uppercase tracking-[0.25em] text-[9px] text-gray-400 mb-2">Your stats</p>
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt>Total plays</dt>
              <dd className="text-gray-900">{playStats.total}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Wins</dt>
              <dd className="text-gray-900">{playStats.wins}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Current streak</dt>
              <dd className="text-gray-900">{playStats.currentStreak}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Best streak</dt>
              <dd className="text-gray-900">{playStats.bestStreak}</dd>
            </div>
            {typeof playStats.fastestWin === 'number' && (
              <div className="flex justify-between">
                <dt>Fastest solve</dt>
                <dd className="text-gray-900">
                  {playStats.fastestWin} attempt{playStats.fastestWin === 1 ? '' : 's'}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {finished && (
        <div className="mt-6 w-full flex flex-col items-center gap-5">
          <div className="w-full max-w-[360px] border border-gray-200 rounded-2xl p-4 text-left space-y-3 bg-white shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.35em] text-gray-400">
              <span className="text-gray-900">{outcomeLabel}</span>{' '}
              <span className="text-gray-500">- {outcomeSubline}</span>
            </p>
            {streakBadge && (
              <p className="text-[10px] text-emerald-600 uppercase tracking-[0.35em]">{streakBadge}</p>
            )}
            <p className="font-mono text-lg tracking-[0.12em] text-gray-900 text-center">{shareGlyphs}</p>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="w-full border border-gray-900 text-gray-900 rounded-full px-4 py-2 text-xs tracking-[0.25em] button-hover primary-share-button"
            >
              Share result
            </button>
            <button
              type="button"
              onClick={handleTryPreviousPuzzle}
              disabled={loadingPreviousPuzzle}
              className="w-full border border-gray-300 text-gray-600 rounded-full px-4 py-2 text-xs tracking-[0.25em] button-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingPreviousPuzzle
                ? isViewingPreviousPuzzle
                  ? 'Loading today…'
                  : 'Loading yesterday…'
                : isViewingPreviousPuzzle
                ? "Back to today's puzzle"
                : "Try yesterday's puzzle"}
            </button>
            {shareMessage && <p className="text-[10px] text-gray-500">{shareMessage}</p>}
            <div className="pt-3 border-t border-gray-100 space-y-3">
              {playStats ? (
                <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3 stats-panel">
                  <p className="text-[10px] uppercase tracking-[0.35em] text-gray-400">Your stats</p>
                  <dl className="mt-2 space-y-1 text-[11px] text-gray-600">
                    <div className="flex justify-between">
                      <dt>Total plays</dt>
                      <dd className="text-gray-900">{playStats.total}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Wins</dt>
                      <dd className="text-gray-900">{playStats.wins}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Current streak</dt>
                      <dd className="text-gray-900">{playStats.currentStreak}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Best streak</dt>
                      <dd className="text-gray-900">{playStats.bestStreak}</dd>
                    </div>
                    {typeof playStats.fastestWin === 'number' && (
                      <div className="flex justify-between">
                        <dt>Fastest solve</dt>
                        <dd className="text-gray-900">
                          {playStats.fastestWin} attempt{playStats.fastestWin === 1 ? '' : 's'}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              ) : null}
              {communityStats ? (
                <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3 stats-panel">
                  <p className="text-[10px] uppercase tracking-[0.35em] text-gray-400">Community stats</p>
                  <p className="mt-2 text-[11px] text-gray-600">
                    {communityStats.total === 1
                      ? '1 person has played today'
                      : `${communityStats.total} have played today`}
                  </p>
                  <p className="text-[11px] text-gray-600">
                    {communityStats.successRate}% solved • {communityStats.fastRate}% in 3 tries or fewer
                  </p>
                </div>
              ) : null}
              {attemptsHistory.length > 0 ? (
                <div className="rounded-2xl border border-gray-100 p-3 attempt-breakdown">
                  <button
                    type="button"
                    onClick={() => setAttemptsOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between text-left text-sm text-gray-700"
                  >
                    <span>Breakdown of my attempts</span>
                    <span className="text-xs text-gray-500">
                      {attemptsOpen ? 'Hide details' : 'Show details'}
                    </span>
                  </button>
                  {attemptsOpen && <div className="mt-3">{renderAttempts('', 'inline')}</div>}
                </div>
              ) : null}
            </div>
          </div>
          <div className="w-full text-left space-y-3 max-w-[360px]">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">The artist</p>
                {artistDetailParagraphs.map((paragraph, idx) => (
                  <p key={`artist-${idx}`} className="text-sm leading-relaxed text-slate-900">
                    {paragraph}
                    {artistWikiHref ? (
                      <>
                        <br />
                        <a
                          href={artistWikiHref}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600"
                        >
                          learn more about {art.artist}
                        </a>
                      </>
                    ) : null}
                  </p>
                ))}
              </div>
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">The artwork</p>
                {paintingParagraphs.map((paragraph, idx) => (
                  <p key={`artwork-${idx}`} className="text-sm leading-relaxed text-slate-900">
                    {paragraph}
                    {art.wiki_summary_url ? (
                      <>
                        <br />
                        <a
                          href={art.wiki_summary_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600"
                        >
                          learn more about the painting
                        </a>
                      </>
                    ) : null}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {showHelp && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-6">
          <div className="max-w-sm w-full bg-white border border-gray-200 rounded-2xl p-5 text-sm text-gray-700 space-y-3 shadow-2xl">
            <p className="text-xs uppercase tracking-wide text-gray-500">How it works</p>
            <p>
              Guess the painter in up to five attempts. Each wrong guess zooms out to reveal more of the
              artwork.
            </p>
            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
              <li>Start from a tight detail</li>
              <li>Type an artist&apos;s name.</li>
              <li>Hints appear as you miss: venue clues, era, movement &amp; country comparisons.</li>
              <li>The image de-zooms until the full painting is unveiled.</li>
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs px-3 py-1 rounded-full border border-gray-900 text-gray-900"
                onClick={() => dismissHelp(true)}
              >
                Let&apos;s play
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="mt-8 text-[10px] text-gray-400 tracking-wide uppercase text-center">
        Crafted with care -{' '}
        <a
          href="https://www.linkedin.com/in/martin-lemoulant/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted hover:text-gray-600 transition-colors"
        >
          send feedback
        </a>
      </p>
      <Analytics />
    </div>
  )
}
