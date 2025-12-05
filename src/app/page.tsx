'use client'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
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

const DEFAULT_ARTIST_SUGGESTIONS = FALLBACK_ARTISTS.map((artist) => artist.name)
const MAX_WIKI_PARAGRAPHS = 4

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
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const maxAttempts = 5
  const inputRef = useRef<HTMLInputElement | null>(null)
  const blurTimeoutRef = useRef<number | null>(null)

  // Récupérer l'art du jour (ou date spécifique via query param)
  useEffect(() => {
    const controller = new AbortController()
    const loadArt = async () => {
      try {
        let query = ''
        if (typeof window !== 'undefined') {
          const currentParams = new URLSearchParams(window.location.search)
          const forwardParams = new URLSearchParams()
          const offset = currentParams.get('offset')
          const date = currentParams.get('date')
          if (offset) forwardParams.set('offset', offset)
          if (date) forwardParams.set('date', date)
          const built = forwardParams.toString()
          query = built ? `?${built}` : ''
        }
        const response = await fetch(`/api/today${query}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Failed to load artwork')
        const payload = await response.json()
        setArt(payload)
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return
        console.error('Unable to load artwork', error)
        setArt(null)
      }
    }
    loadArt()
    return () => controller.abort()
  }, [])

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
          const wins = data.filter((row) => row.success).length
          const byDay = new Map<string, { success: boolean; attempts?: number | null }>()
          data.forEach((row) => {
            const key = extractDayKey(row.created_at)
            if (!key) return
            if (!byDay.has(key)) {
              byDay.set(key, { success: row.success, attempts: row.attempts })
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
            .filter((row) => row.success && typeof row.attempts === 'number')
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
    DEFAULT_ARTIST_SUGGESTIONS.forEach(addName)
    return Array.from(map.values())
  }, [targetArtist, artistHints])
  const artistMeta = useMemo(() => {
    const key = normalizeString(targetArtist || '')
    return artistHints.find(
      (hint) => normalizeString(hint.name || '') === key
    )
  }, [artistHints, targetArtist])
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

  const shareGlyphs = useMemo(() => {
    const tokens = Array.from({ length: maxAttempts }, (_, idx) => {
      const attempt = attemptsHistory[idx]
      if (!attempt) return '.'
      return attempt.correct ? '✅' : '×'
    })
    return tokens.join(' ')
  }, [attemptsHistory, maxAttempts])

  const buildShareContent = () => {
    if (!art) return ''
    const grid = shareGlyphs || '. . . . .'
    const urlHint =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '')
    const pitchLines = [
      '4rtW0rk — one art puzzle a day',
      'Test your culture, discover painters, no ads.',
      'Tap to play & beat my score:',
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
          const successCount = data.filter((row) => row.success).length
          const fastWins = data.filter(
            (row) => row.success && typeof row.attempts === 'number' && (row.attempts ?? 0) <= 3
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
  const infoParagraphs = wikiIntro.length ? wikiIntro : [fallbackIntro]

  const normalize = normalizeString

  const renderAttempts = (containerClass = 'mt-6 w-full max-w-[360px]') => {
    if (!attemptsHistory.length) return null
    const reversed = [...attemptsHistory].reverse()
    return (
      <div className={`${containerClass} border border-gray-100 rounded-2xl bg-white/80 shadow-sm p-4`}>
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-3 flex justify-between">
          <span>Attempts</span>
          <span className="font-mono text-[11px] text-gray-800">
            {shareGlyphs}
          </span>
        </div>
        <ul className="space-y-3">
          {reversed.map((entry, idx) => {
            const attemptNumber = attemptsHistory.length - idx
            return (
              <li key={`${entry.guess}-${idx}`} className="border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="truncate">
                    #{attemptNumber} {entry.guess}
                  </span>
                  <span>{entry.correct ? '✓' : '–'}</span>
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

    const correctArtist = normalize(art.artist)
    const artistLastName = normalize(
      art.artist
        .split(' ')
        .filter(Boolean)
        .pop() || ''
    )
    const guessNorm = normalize(trimmedGuess)
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

    if (correct) {
      feedbackDetails.push({
        label: 'Status',
        value: 'Exact match!',
        status: 'match',
      })
    } else {
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

      if (birth && death) {
        if (artYearNumber < birth) {
          pushDetail('Era hint', '🔺 Try an older artist', 'earlier')
        } else if (artYearNumber > death) {
          pushDetail('Era hint', '🔻 Try a more recent artist', 'later')
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
  }

  const selectSuggestion = (name: string, submitAfter = false) => {
    setGuess(name)
    setSuggestionsOpen(false)
    setHighlightedSuggestion(0)
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
  const outcomeLabel = finished ? (success ? 'Victory' : 'Not this time') : ''
  const outcomeSubline = finished
    ? success
      ? 'Great eye, see you tomorrow.'
      : 'New masterpiece tomorrow, stay sharp.'
    : ''
  const streakBadge =
    playStats?.currentStreak && playStats.currentStreak >= 2
      ? `${playStats.currentStreak}-day streak`
      : null
  const frameOuterClass = finished
    ? 'w-full sm:w-auto max-w-[420px] rounded-2xl border border-gray-300 bg-gray-50 p-3 shadow-sm transition-all duration-300 mx-auto'
    : 'w-full max-w-[420px] rounded-xl border border-gray-200 bg-white transition-all duration-300'
  const frameInnerClass = finished
    ? 'overflow-hidden rounded-xl border border-gray-100 bg-white'
    : 'overflow-hidden rounded-lg'

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 py-4 min-h-screen bg-white text-gray-900 font-mono">
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
      `}</style>
      <div className="relative w-full max-w-[420px] flex justify-center mb-6">
        <h1 className="text-xl font-normal tracking-tight uppercase">4rtW0rk</h1>
      </div>
      <button
        type="button"
        aria-label="How to play"
        onClick={() => setShowHelp(true)}
        className="absolute top-4 right-4 text-xs border border-gray-300 rounded-full px-2 py-1 text-gray-600 hover:bg-gray-100"
      >
        ?
      </button>

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
        <div className="mt-4 w-[320px] border border-gray-200 rounded-xl px-4 py-3 text-left text-xs text-gray-600">
          <p>
            Answer: {art.artist} – {art.title}
          </p>
          <p className="mt-1 text-gray-500">{art.year} • {museumClue || 'Unknown location'}</p>
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
          <button
            type="button"
            onClick={() => {
              setSuggestionsOpen(false)
              void handleSubmit()
            }}
            className="w-full border border-gray-900 text-gray-900 rounded px-3 py-2 text-sm tracking-tight hover:bg-gray-100 transition-colors"
          >
            Submit
          </button>
          <div className="text-[11px] text-gray-500 text-center space-y-1">
            <p className="font-mono text-sm text-gray-800 text-center tracking-wide">
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
        </div>
      )}

      {playStats && (
        <div className="mt-5 w-full max-w-[360px] text-[10px] text-gray-500">
          <p className="uppercase tracking-wide text-[9px] text-gray-400 mb-1">Your stats</p>
          <div className="flex justify-between">
            <span>Total plays</span>
            <span className="text-gray-800">{playStats.total}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Wins</span>
            <span className="text-gray-800">{playStats.wins}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Current streak</span>
            <span className="text-gray-800">{playStats.currentStreak}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Best streak</span>
            <span className="text-gray-800">{playStats.bestStreak}</span>
          </div>
          {typeof playStats.fastestWin === 'number' && (
            <div className="flex justify-between mt-1">
              <span>Fastest solve</span>
              <span className="text-gray-800">
                {playStats.fastestWin} attempt{playStats.fastestWin === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>
      )}

      {!finished && renderAttempts()}

      {finished && (
        <div className="mt-6 text-center max-w-lg space-y-4">
          <div className="w-full max-w-[360px] mx-auto border border-gray-200 rounded-2xl p-4 text-left space-y-2 bg-white shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">
              <span className="text-gray-900">{outcomeLabel}</span>{' '}
              <span className="text-gray-500">— {outcomeSubline}</span>
            </p>
            {streakBadge && (
              <p className="text-[10px] text-emerald-600 uppercase tracking-wide">{streakBadge}</p>
            )}
            <p className="font-mono text-lg tracking-wider text-gray-800">{shareGlyphs}</p>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="w-full border border-gray-900 text-gray-900 rounded px-3 py-2 text-xs tracking-tight hover:bg-gray-100 transition-colors"
            >
              Share result
            </button>
            {shareMessage && (
              <p className="text-[10px] text-gray-500">{shareMessage}</p>
            )}
            {communityStats && (
              <div className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-gray-600 space-y-1">
                <p>
                  {communityStats.total} plays • {communityStats.successRate}% solved
                </p>
                <p>{communityStats.fastRate}% cracked within 3 tries</p>
              </div>
            )}
          </div>
          <div className="mt-4 w-full space-y-3 text-left">
            {infoParagraphs.map((paragraph, idx) => (
              <p
                key={`${paragraph}-${idx}`}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-sm leading-relaxed text-slate-900"
              >
                {paragraph}
              </p>
            ))}
            <p>
              Learn more on{' '}
              <a
                href={art.wiki_summary_url}
                target="_blank"
                className="text-blue-600 underline"
                rel="noreferrer"
              >
                Wikipedia
              </a>.
            </p>
          </div>
          {renderAttempts('mt-6 w-full max-w-[360px] mx-auto')}
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
              <li>Start from a tight detail—type an artist&apos;s name.</li>
              <li>Hints appear as you miss: venue clues, era cues, movement &amp; country comparisons.</li>
              <li>The image gracefully de-zooms until the full painting is unveiled.</li>
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
        Crafted with care —{' '}
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
