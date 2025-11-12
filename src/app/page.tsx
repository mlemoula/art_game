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

const FEEDBACK_STYLES: Record<FeedbackStatus, string> = {
  match: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  earlier: 'border-amber-200 bg-amber-50 text-amber-900',
  later: 'border-amber-200 bg-amber-50 text-amber-900',
  different: 'border-rose-200 bg-rose-50 text-rose-900',
  info: 'border-slate-200 bg-slate-50 text-slate-800',
  missing: 'border-gray-200 bg-gray-50 text-gray-500',
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
  const [shareUrl, setShareUrl] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [attemptsHistory, setAttemptsHistory] = useState<Attempt[]>([])
  const [artistHints, setArtistHints] =
    useState<ArtistRecommendation[]>(FALLBACK_ARTISTS)
  const [userToken, setUserToken] = useState('')
  const [playSaved, setPlaySaved] = useState(false)
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

  // Capture URL pour les liens de partage
  useEffect(() => {
    if (typeof window === 'undefined') return
    setShareUrl(window.location.href)
  }, [])

  // Reset gameplay quand nouvelle oeuvre arrive
  useEffect(() => {
    if (!art?.id) return
    setGuess('')
    setFinished(false)
    setSuccess(false)
    setAttemptsHistory([])
    setShareMessage('')
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
    getArtistRecommendations(art.artist, 500)
      .then((data) => {
        if (!cancelled)
          setArtistHints(mergeArtistData(FALLBACK_ARTISTS, data || []))
      })
      .catch(() => {
        if (!cancelled) setArtistHints(FALLBACK_ARTISTS)
      })
    return () => {
      cancelled = true
    }
  }, [art?.artist])

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

  const shareScore = success ? attemptsCount : 0
  const shareText = `I just played 4rtW0rk and scored ${shareScore}/${maxAttempts}! Can you beat me?`
  const targetArtist = art?.artist ?? ''
  const artistSuggestions = useMemo(() => {
    const names = new Set<string>()
    if (targetArtist) names.add(targetArtist)
    artistHints.forEach((hint) => hint.name && names.add(hint.name))
    DEFAULT_ARTIST_SUGGESTIONS.forEach((name) => names.add(name))
    return Array.from(names).filter(Boolean)
  }, [targetArtist, artistHints])
  const artistMeta = useMemo(
    () => artistHints.find((hint) => hint.name === targetArtist),
    [artistHints, targetArtist]
  )
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
      <div className="flex flex-col items-center p-4">
        <h1 className="text-2xl font-bold mb-4">4rtW0rk</h1>
        <div
          style={{
            width: 400,
            height: 300,
            background: '#eee',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: '#666',
          }}
        >
          Loading artwork...
        </div>
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
  const extractYear = (value: string) => {
    const match = value.match(/\d{4}/)
    if (!match) return null
    const parsed = parseInt(match[0], 10)
    return Number.isNaN(parsed) ? null : parsed
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

    if (correct) {
      feedbackDetails.push({
        label: 'Status',
        value: 'Exact match! ✅',
        status: 'match',
      })
    } else {
      const guessedYear = extractYear(trimmedGuess)
      if (hasArtYear) {
        if (guessedYear !== null) {
          const diff = guessedYear - artYearNumber
          feedbackDetails.push({
            label: 'Painting year',
            value:
              diff === 0
                ? 'Perfect timing'
                : `${Math.abs(diff)} year(s) ${
                    diff > 0 ? 'later' : 'earlier'
                  }`,
            status: diff === 0 ? 'match' : diff > 0 ? 'later' : 'earlier',
          })
        } else {
          feedbackDetails.push({
            label: 'Painting year',
            value: 'No year mentioned',
            status: 'info',
          })
        }
      }

      const compareArtistYear = (
        label: 'Birth' | 'Death',
        actual?: number | null,
        guessYear?: number | null
      ) => {
        if (!actual || !artistMeta) return
        if (!guessYear) {
          feedbackDetails.push({
            label: `${label} year`,
            value: 'No data',
            status: 'missing',
          })
          return
        }
        const delta = guessYear - actual
        feedbackDetails.push({
          label: `${label} year`,
          value:
            delta === 0
              ? 'Match'
              : `${Math.abs(delta)} year(s) ${
                  delta > 0 ? 'later' : 'earlier'
                }`,
          status: delta === 0 ? 'match' : delta > 0 ? 'later' : 'earlier',
        })
      }

      const compareField = (
        label: string,
        actual?: string | null,
        guessField?: string | null
      ) => {
        if (!actual || !artistMeta) return
        if (!guessField) {
          feedbackDetails.push({
            label,
            value: 'No data',
            status: 'missing',
          })
          return
        }
        const match = normalize(actual) === normalize(guessField)
        feedbackDetails.push({
          label,
          value: guessField,
          status: match ? 'match' : 'different',
        })
      }

      compareArtistYear('Birth', artistMeta?.birth_year, guessedArtistData?.birth_year)
      compareArtistYear('Death', artistMeta?.death_year, guessedArtistData?.death_year)
      compareField('Movement', artistMeta?.movement, guessedArtistData?.movement)
      compareField('Country', artistMeta?.country, guessedArtistData?.country)

      if (!guessedArtistData) {
        feedbackDetails.push({
          label: 'Data',
          value: 'No reference yet for this artist.',
          status: 'info',
        })
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

  const handleShare = async () => {
    if (!finished) return
    const shareContent = `${shareText}\n${art.title} by ${art.artist} (${art.year})`
    const urlToShare =
      shareUrl || (typeof window !== 'undefined' ? window.location.href : '')
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & {
            share?: (data: ShareData) => Promise<void>
            clipboard?: Clipboard
          })
        : undefined

    setShareMessage('')

    try {
      if (nav?.share && urlToShare) {
        await nav.share({
          title: '4rtW0rk',
          text: shareContent,
          url: urlToShare,
        })
        setShareMessage('Shared with your device dialog! 🙌')
      } else if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(`${shareContent}\n${urlToShare}`)
        setShareMessage('Result copied to clipboard 📋')
      } else {
        setShareMessage(`${shareContent}\n${urlToShare}`)
      }
    } catch {
      setShareMessage('Share canceled or unavailable.')
    }
  }

  const placeholderText = 'Who painted this?'

  return (
    <div className="flex flex-col items-center p-4">
      <h1 className="text-2xl font-bold mb-4">4rtW0rk</h1>

      {/* Affiche placeholder jusqu'à ce que l'image jouable soit prête */}
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
        />
      ) : (
        <div
          style={{
            width: 400,
            height: 300,
            background: '#eee',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: '#666',
          }}
        >
          Loading...
        </div>
      )}

      {!finished && (
        <div className="flex flex-col items-center mt-4">
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
            className="border px-3 py-2 rounded w-80 mb-2"
          />
          <datalist id="artist-suggestions">
            {artistSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Submit
          </button>
          <p className="mt-2 text-gray-600">
            Attempts: {attemptsHistory.length} / {maxAttempts}
          </p>
          <p className="text-xs text-gray-500 mt-1 text-center">
            Tip: this artwork can be seen in {museumClue || 'an unknown location'}
            {attemptsHistory.length >= 3 && (
              <>
                <br />
                This artwork was made in {art.year}.
              </>
            )}
          </p>
        </div>
      )}

      {attemptsHistory.length > 0 && (
        <div className="mt-4 w-80">
          {attemptsHistory.map((entry, idx) => (
            <div
              key={`${entry.guess}-${idx}`}
              className="mb-3 p-3 border rounded-lg bg-white shadow-sm"
            >
              <p className="text-sm font-medium flex items-center justify-between">
                Attempt {idx + 1}:{' '}
                <strong className="break-words">{entry.guess}</strong>
                <span>{entry.correct ? '✅' : '❌'}</span>
              </p>
              {Array.isArray(entry.feedback) ? (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  {entry.feedback.map((detail, detailIdx) => (
                    <div
                      key={`${detail.label}-${detailIdx}`}
                      className={`rounded-md border px-2 py-1 flex flex-col gap-0.5 ${
                        FEEDBACK_STYLES[detail.status] ||
                        'border-slate-200 bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span className="uppercase tracking-wide text-[10px] text-gray-500">
                        {detail.label}
                      </span>
                      <span className="font-semibold text-sm">
                        {detail.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : entry.feedback ? (
                <pre className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">
                  {entry.feedback as unknown as string}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {finished && (
        <div className="mt-6 text-center max-w-lg">
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${
              success
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {success ? 'Nice work! Think you can do even better tomorrow?' : 'Almost there! Try again tomorrow with a new artist!'}
          </div>
          <div className="mt-4 w-full space-y-3 text-left">
            {!success && (
            <p className="text-gray-700 mt-3">
              The painter was <strong>{art.artist}</strong>, author of{' '}
              <em>{art.title}</em>.
            </p>
            )}
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
          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              onClick={handleShare}
              className="px-4 py-2 bg-indigo-600 text-white rounded"
            >
              Share result
            </button>
            {shareMessage && (
              <p className="text-sm text-gray-600">{shareMessage}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
