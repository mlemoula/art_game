'use client'
import { useEffect, useState, type SyntheticEvent } from 'react'
import { motion } from 'framer-motion'

interface Props {
  src: string
  srcSet?: string
  sizes?: string
  width: number
  height: number
  attempts: number
  maxAttempts: number
  detailX?: string
  detailY?: string
  fit?: 'cover' | 'contain'
  lockWidthToImage?: boolean
}

export default function ZoomableImage({
  src,
  srcSet,
  sizes = '(max-width: 640px) 90vw, 400px',
  width,
  height,
  attempts,
  maxAttempts,
  detailX = '50%',
  detailY = '50%',
  fit = 'cover',
  lockWidthToImage = false,
}: Props) {
  // Zoom : 0 essais -> zoom max (5x), maxAttempts -> 1x
  const safeMaxAttempts = Math.max(maxAttempts, 1)
  const clampedAttempts = Math.min(Math.max(attempts, 0), safeMaxAttempts)
  const zoom = 5 - (clampedAttempts / safeMaxAttempts) * 4
  const baseRatio = width / height || 1
  const [containerRatio, setContainerRatio] = useState<number>(baseRatio)
  const [maxContainerWidth, setMaxContainerWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return width
    return Math.min(width, window.innerWidth - 32)
  })
  const [maxContainerHeight, setMaxContainerHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return height
    return Math.min(height, Math.round(window.innerHeight * 0.7))
  })

  useEffect(() => {
    setContainerRatio(baseRatio)
  }, [baseRatio, src])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const computeSize = () => {
      setMaxContainerWidth(Math.min(width, window.innerWidth - 32))
      setMaxContainerHeight(Math.min(height, Math.round(window.innerHeight * 0.7)))
    }
    computeSize()
    window.addEventListener('resize', computeSize)
    return () => window.removeEventListener('resize', computeSize)
  }, [width, height])

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setContainerRatio(img.naturalWidth / img.naturalHeight)
    }
  }

  const targetWidth = (() => {
    if (!lockWidthToImage) return maxContainerWidth
    const widthFromHeight = containerRatio * maxContainerHeight
    if (!Number.isFinite(widthFromHeight) || widthFromHeight <= 0) {
      return maxContainerWidth
    }
    return Math.min(maxContainerWidth, widthFromHeight)
  })()

  return (
    <div
      style={{
        width: lockWidthToImage ? `${targetWidth}px` : '100%',
        maxWidth: lockWidthToImage ? `${targetWidth}px` : '100%',
        maxHeight: maxContainerHeight,
        aspectRatio: containerRatio,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#eee',
        margin: '0 auto',
      }}
    >
      <motion.img
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        onLoad={handleLoad}
        style={{
          width: '100%',
          height: '100%',
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
