'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'

const MotionImage = motion(Image)

interface Props {
  src: string
  width: number
  height: number
  attempts: number
  maxAttempts: number
  detailX?: string
  detailY?: string
  fit?: 'cover' | 'contain'
  lockWidthToImage?: boolean
  revealProgress?: number
  sizes?: string
  alt?: string
  fallbackSrc?: string
}

export default function ZoomableImage({
  src,
  sizes = '(max-width: 640px) 90vw, 400px',
  width,
  height,
  attempts,
  maxAttempts,
  detailX = '50%',
  detailY = '50%',
  fit = 'cover',
  lockWidthToImage = false,
  revealProgress = 0,
  alt = 'Artwork preview',
  fallbackSrc,
}: Props) {
  // Zoom : 0 essais -> zoom max (≈4.6x), maxAttempts -> 1x
  const safeMaxAttempts = Math.max(maxAttempts, 1)
  const clampedAttempts = Math.min(Math.max(attempts, 0), safeMaxAttempts)
  const revealClamped = Math.min(Math.max(revealProgress, 0), 1)
  const revealBoost = revealClamped * (safeMaxAttempts * 0.6)
  const stage = Math.min(
    safeMaxAttempts,
    clampedAttempts + revealBoost
  )
  const normalized = stage / safeMaxAttempts
  const eased = Math.pow(1 - normalized, 0.6)
  const maxZoom = 4.8
  const minZoom = 1
  const targetZoom = minZoom + eased * (maxZoom - minZoom)
  const zoom = fit === 'contain' ? 1 : targetZoom
  const baseRatio = width / height || 1
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null)
  const [maxContainerWidth, setMaxContainerWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return width
    return Math.min(width, window.innerWidth - 32)
  })
  const [maxContainerHeight, setMaxContainerHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return height
    return Math.max(320, Math.round(window.innerHeight * 0.75))
  })
  const viewportRef = useRef<{
    width: number
    height: number
    orientation: 'portrait' | 'landscape'
  }>({
    width: maxContainerWidth,
    height: maxContainerHeight,
    orientation:
      typeof window !== 'undefined' && window.innerWidth < window.innerHeight
        ? 'portrait'
        : 'landscape',
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const computeSize = () => {
      const visualViewport = window.visualViewport
      if (visualViewport && visualViewport.scale !== 1) {
        return
      }
      const nextWidth = Math.min(width, window.innerWidth - 32)
      const nextHeight = Math.max(320, Math.round(window.innerHeight * 0.75))
      const orientation =
        window.innerWidth < window.innerHeight ? 'portrait' : 'landscape'
      const prev = viewportRef.current
      const widthDiff = Math.abs(prev.width - nextWidth)
      const orientationChanged = prev.orientation !== orientation
      if (widthDiff > 8 || orientationChanged) {
        viewportRef.current = {
          width: nextWidth,
          height: nextHeight,
          orientation,
        }
        setMaxContainerWidth(nextWidth)
        setMaxContainerHeight(nextHeight)
      }
    }
    computeSize()
    window.addEventListener('resize', computeSize)
    return () => window.removeEventListener('resize', computeSize)
  }, [width, height])

  const handleLoadingComplete = (result: {
    naturalWidth?: number
    naturalHeight?: number
  }) => {
    if (result.naturalWidth && result.naturalHeight) {
      setNaturalRatio(result.naturalWidth / result.naturalHeight)
    }
  }
  const [activeSrc, setActiveSrc] = useState(src)
  useEffect(() => {
    setActiveSrc(src)
  }, [src])

  const handleError = () => {
    if (fallbackSrc && fallbackSrc !== activeSrc) {
      setActiveSrc(fallbackSrc)
    }
  }

  const containerRatio = naturalRatio || baseRatio

  const computeWrapperSize = () => {
    let widthBound = maxContainerWidth
    let heightBound =
      widthBound / (containerRatio || 1)

    if (heightBound > maxContainerHeight) {
      heightBound = maxContainerHeight
      widthBound = heightBound * (containerRatio || 1)
    }

    if (!Number.isFinite(widthBound) || widthBound <= 0) {
      widthBound = maxContainerWidth
    }
    if (!Number.isFinite(heightBound) || heightBound <= 0) {
      heightBound = maxContainerHeight
    }

    return {
      width: widthBound,
      height: heightBound,
    }
  }

  const { width: wrapperWidth, height: wrapperHeight } = computeWrapperSize()
  const widthStyle = lockWidthToImage ? `${Math.round(wrapperWidth)}px` : '100%'
  const maxWidthStyle = `${Math.round(wrapperWidth)}px`
  const heightStyle = lockWidthToImage ? `${Math.round(wrapperHeight)}px` : 'auto'
  const maxHeightStyle = `${Math.round(wrapperHeight)}px`

  return (
    <div
      onContextMenu={(event) => event.preventDefault()}
      style={{
        width: widthStyle,
        maxWidth: maxWidthStyle,
        height: heightStyle,
        maxHeight: maxHeightStyle,
        aspectRatio: containerRatio,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#eee',
        margin: '0 auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <MotionImage
        src={activeSrc}
        sizes={sizes}
        width={width}
        height={height}
        priority
        fetchPriority="high"
        quality={85}
        draggable={false}
        onLoadingComplete={handleLoadingComplete}
        onError={handleError}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          objectFit: fit,
          objectPosition: `${detailX} ${detailY}`,
          willChange: 'transform',
          transformOrigin: `${detailX} ${detailY}`,
        }}
        initial={{ scale: zoom }}
        animate={{ scale: zoom }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  )
}
