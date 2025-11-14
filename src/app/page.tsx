'use client'
import { useEffect, useMemo, useState } from 'react'
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
  const data = payload as Record<string, any>
  if (typeof data.extract === 'string') return data.extract
  if (typeof data.extract_html === 'string') return data.extract_html
  if (typeof data.summary === 'string') return data.summary
  if (typeof data.content === 'string') return data.content
  const pages = data.query?.pages
  if (pages && typeof pages === 'object') {
    const firstPage = Object.values(pages)[0] as Record<string, any>
    if (firstPage) {
      if (typeof firstPage.extract === 'string') return firstPage.extract
      if (typeof firstPage.summary === 'string') return firstPage.summary
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
  const [attemptsHistory, setAttemptsHistory] = useState<Attempt[]>([])
  const [artistHints, setArtistHints] =
    useState<ArtistRecommendation[]>(FALLBACK_ARTISTS)
  const [userToken, setUserToken] = useState('')
  const [playSaved, setPlaySaved] = useState(false)
  const [playStats, setPlayStats] = useState<{ total: number; wins: number } | null>(null)
  const [wikiIntro, setWikiIntro] = useState<string[]>([])
  const maxAttempts = 5

  // Récupérer l'art du jour
  useEffect(() => {
    fetch('/api/today')
      .then(res => res.json())
      .then(data => setArt(data))
  }, [])

  const mediaUrls = art
    ? getWikimediaUrls(art.image_url)
    : { thumb: '', medium: '', hd: '' }
  const { thumb, medium, hd } = mediaUrls
  const baseSrc = thumb || medium || hd || ''
  const attemptsCount = attemptsHistory.length

  // Reset gameplay quand nouvelle oeuvre arrive
  useEffect(() => {
    if (!art?.id) return
    setGuess('')
    setFinished(false)
    setSuccess(false)
    setAttemptsHistory([])
    setArtistHints(FALLBACK_ARTISTS)
    setMediumLoaded(false)
    setPlaySaved(false)
  }, [art?.id])

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
          .select('success')
          .eq('user_token', userToken)

        if (!cancelled && data) {
          const total = data.length
          const wins = data.filter((row) => row.success).length
          setPlayStats({ total, wins })
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
  const filteredSuggestions = useMemo(() => {
    if (guess.length < MIN_SUGGESTION_LENGTH) return []
    return artistSuggestions
  }, [artistSuggestions, guess])

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
    if (!finished || !art || !userToken || playSaved || !attemptsHistory.length)
      return
    const payload = {
      daily_id: art.id,
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
  }, [finished, art?.id, userToken, playSaved, attemptsHistory, success])

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

  const renderAttempts = (containerClass = 'mt-6 w-80 space-y-2.5') => {
    if (!attemptsHistory.length) return null
    const reversed = [...attemptsHistory].reverse()
    return (
      <div className={containerClass}>
        {reversed.map((entry, idx) => {
          const attemptNumber = attemptsHistory.length - idx
          return (
            <div
              key={`${entry.guess}-${idx}`}
              className="p-3 border border-gray-100 rounded-xl bg-white/80 shadow-sm"
            >
              <div className="text-xs flex items-center justify-between text-slate-600 mb-1">
                <span className="truncate">
                  Attempt {attemptNumber}: {entry.guess}
                </span>
                <span>{entry.correct ? '✓' : '–'}</span>
              </div>
              {Array.isArray(entry.feedback) ? (
                <ul className="text-[11px] space-y-1 text-gray-600">
                  {entry.feedback.map((detail, detailIdx) => (
                    <li
                      key={`${detail.label}-${detailIdx}`}
                      className="flex items-center justify-between border-b border-gray-100 pb-1.5 last:border-b-0"
                    >
                      <span className="text-slate-500">{detail.label}</span>
                      <span
                        className={`font-normal ${FEEDBACK_TONES[detail.status] || 'text-slate-700'}`}
                      >
                        {detail.value}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : entry.feedback ? (
                <pre className="mt-1 text-[11px] text-gray-600 whitespace-pre-wrap">
                  {entry.feedback as unknown as string}
                </pre>
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }

  const handleSubmit = async () => {
    if (finished || !art) return
    const trimmedGuess = guess.trim()
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
    const hasArtYear = !Number.isNaN(artYearNumber)
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
  }

  const placeholderText = 'Who painted this?'
  const frameOuterClass = finished
    ? 'w-full max-w-[420px] rounded-2xl border border-gray-300 bg-gray-50 p-3 shadow-sm transition-all duration-300'
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
      <h1 className="text-xl font-normal mb-6 tracking-tight uppercase">4rtW0rk</h1>

      {/* Affiche placeholder jusqu'à ce que l'image jouable soit prête */}
      <div className={frameOuterClass}>
        <div className={frameInnerClass}>
          {isDisplayReady && displaySrc ? (
            <ZoomableImage
              src={displaySrc}
              srcSet={displaySrcSet}
              width={400}
              height={300}
              attempts={displayAttempts}
              maxAttempts={maxAttempts}
              detailX="50%"
              detailY="30%"
              fit={finished ? 'contain' : 'cover'}
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
          <input
            id="guess-input"
            name="guess"
            type="text"
            list="artist-suggestions"
            autoComplete="on"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder={placeholderText}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm tracking-tight bg-white"
          />
          <datalist id="artist-suggestions">
            {filteredSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            className="w-full border border-gray-900 text-gray-900 rounded px-3 py-2 text-sm tracking-tight hover:bg-gray-100 transition-colors"
          >
            Submit
          </button>
          <div className="text-[11px] text-gray-500 text-center space-y-1">
            <p>
              Attempts {attemptsHistory.length} / {maxAttempts}
            </p>
            <p>Clue: This artwork can be seen in {museumClue || 'Unknown location'}</p>
            {attemptsHistory.length >= 3 && (
              <p>It was painted in {art.year}</p>
            )}
          </div>
        </div>
      )}

      {playStats && (
        <div className="mt-4 w-[320px] text-[11px] text-gray-500 text-center space-y-1">
          <p>Total plays {playStats.total}</p>
          <p>Wins {playStats.wins}</p>
        </div>
      )}

      {!finished && renderAttempts()}

      {finished && (
        <div className="mt-6 text-center max-w-lg space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 text-xs tracking-wide uppercase text-gray-600">
            {success ? 'Success, come back tomorrow' : 'Better luck tomorrow'}
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
          {renderAttempts('mt-6 w-[320px] mx-auto space-y-2.5 text-left')}
        </div>
      )}
    </div>
  )
}
