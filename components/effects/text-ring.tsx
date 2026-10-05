// Text Ring — Originkit (ported to plain rAF, no framer-motion)

'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type TextRingProps = {
  words: string[]
  separator?: string
  /** Seconds per full turn at rest. */
  duration?: number
  /** Seconds per full turn while hovered. */
  hoverDuration?: number
  fontSizePx?: number
  letterSpacingEm?: number
  className?: string
  children?: React.ReactNode
}

type Glyph = { char: string; angle: number }

function measureGlyphs(letters: string[], font: string, fontSizePx: number): number[] {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return letters.map((l) => (l === ' ' ? fontSizePx * 0.35 : fontSizePx * 0.6))
  ctx.font = font
  return letters.map((l) => ctx.measureText(l === ' ' ? '\u00A0' : l).width)
}

function layoutRing(
  words: string[],
  separator: string,
  circumference: number,
  font: string,
  fontSizePx: number,
  preferredSpacing: number,
): Glyph[] {
  const segment = `${words.join(` ${separator} `)} ${separator} `
  const segmentLetters = Array.from(segment)
  const segmentWidths = measureGlyphs(segmentLetters, font, fontSizePx)
  const segmentArc =
    segmentWidths.reduce((sum, w) => sum + w, 0) + preferredSpacing * segmentLetters.length

  const repeats = Math.max(1, Math.min(24, Math.floor(circumference / Math.max(segmentArc, 1))))
  const letters = Array.from(segment.repeat(repeats))
  const widths = Array.from({ length: repeats }, () => segmentWidths).flat()
  const glyphTotal = widths.reduce((sum, w) => sum + w, 0)
  const spacing = Math.max(0, (circumference - glyphTotal) / letters.length)

  let cursor = 0
  return letters.map((char, i) => {
    const center = cursor + widths[i] / 2
    cursor += widths[i] + spacing
    return { char, angle: (center / circumference) * 360 }
  })
}

export function TextRing({
  words,
  separator = '•',
  duration = 18,
  hoverDuration = 6,
  fontSizePx = 11,
  letterSpacingEm = 0.2,
  className,
  children,
}: TextRingProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const spinRef = useRef<HTMLDivElement>(null)
  const hoveredRef = useRef(false)
  const [size, setSize] = useState(0)
  const [fontFamily, setFontFamily] = useState('sans-serif')

  useLayoutEffect(() => {
    const node = frameRef.current
    if (!node) return
    setFontFamily(getComputedStyle(node).fontFamily || 'sans-serif')
    const update = () => setSize(Math.floor(Math.min(node.clientWidth, node.clientHeight)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  const radius = Math.max(8, size / 2 - fontSizePx * 0.9)
  const font = `600 ${fontSizePx}px ${fontFamily}`

  const glyphs = useMemo(() => {
    if (size === 0) return []
    return layoutRing(
      words,
      separator,
      2 * Math.PI * radius,
      font,
      fontSizePx,
      letterSpacingEm * fontSizePx,
    )
  }, [words, separator, radius, font, fontSizePx, letterSpacingEm, size])

  useEffect(() => {
    const spin = spinRef.current
    const frame = frameRef.current
    if (!spin || !frame) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let last = performance.now()
    let angle = 0
    let rate = 360 / duration

    const tick = (now: number) => {
      const dt = Math.min(now - last, 64) / 1000
      last = now
      const target = 360 / (hoveredRef.current ? hoverDuration : duration)
      rate += (target - rate) * (1 - Math.exp(-dt * 4))
      angle = (angle + rate * dt) % 360
      spin.style.transform = `rotate(${angle}deg)`
      raf = requestAnimationFrame(tick)
    }

    const io = new IntersectionObserver((entries) => {
      cancelAnimationFrame(raf)
      if (entries[0]?.isIntersecting) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    })
    io.observe(frame)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [duration, hoverDuration])

  return (
    <div
      ref={frameRef}
      onPointerEnter={() => (hoveredRef.current = true)}
      onPointerLeave={() => (hoveredRef.current = false)}
      className={cn('relative flex items-center justify-center', className)}
    >
      <div
        ref={spinRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 will-change-transform"
        style={{ fontSize: fontSizePx, fontWeight: 600, lineHeight: 1 }}
      >
        {glyphs.map((glyph, i) => {
          const rad = ((glyph.angle - 90) * Math.PI) / 180
          const x = radius * Math.cos(rad)
          const y = radius * Math.sin(rad)
          return (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 inline-block"
              style={{
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${glyph.angle}deg)`,
              }}
            >
              {glyph.char === ' ' ? '\u00A0' : glyph.char}
            </span>
          )
        })}
      </div>
      <span className="sr-only">{words.join(', ')}</span>
      {children}
    </div>
  )
}
