'use client'

import { useState } from 'react'

type BookCoverProps = {
  src?: string
  width: number
  height: number
  title: string
  className?: string
  eager?: boolean
}

// Shows the publisher's cover; if there is none (or it fails to load) a plain typographic cover takes its place.
// Only a handful of small covers: load them all at once so the page never shows empty frames.
export default function BookCover({ src, width, height, title, className = '', eager = true }: BookCoverProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className="mx-auto flex h-56 w-[150px] flex-col justify-between bg-[#2a2a2a] p-4 text-[#F3EFE6] shadow-[0_18px_28px_-12px_rgba(0,0,0,0.45)]"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F3EFE6]/60">Wayne Thiebaud</span>
        <span className="font-serif text-lg font-bold leading-tight">{title}</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={width}
      height={height}
      alt={`Cover of ${title}`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}
