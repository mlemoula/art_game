'use client'
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
}: Props) {
  // Zoom : 0 essais -> zoom max (5x), maxAttempts -> 1x
  const safeMaxAttempts = Math.max(maxAttempts, 1)
  const clampedAttempts = Math.min(Math.max(attempts, 0), safeMaxAttempts)
  const zoom = 5 - (clampedAttempts / safeMaxAttempts) * 4

  return (
    <div
      style={{
        width,
        height,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#eee',
      }}
    >
      <motion.img
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        style={{
          width,
          height,
          objectFit: 'cover',
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
