'use client'

import { useRef, useState, type PointerEvent } from 'react'
import Image from 'next/image'

type Finish = { src: string; alt: string; label: string }

type FinishRevealProps = {
  base: Finish
  reveal: Finish
  sizes: string
}

export function FinishReveal({ base, reveal, sizes }: FinishRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)

  const setOrigin = (e: PointerEvent<HTMLDivElement>) => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    el.style.setProperty('--rx', `${x}%`)
    el.style.setProperty('--ry', `${y}%`)
    el.style.setProperty('--tilt-x', `${(x - 50) / 50}`)
    el.style.setProperty('--tilt-y', `${(y - 50) / 50}`)
  }

  return (
    <div
      ref={rootRef}
      className="group/reveal absolute inset-0 overflow-hidden [--rx:50%] [--ry:50%] [--tilt-x:0] [--tilt-y:0]"
      onPointerEnter={(e) => {
        setOrigin(e)
        if (e.pointerType === 'mouse') setRevealed(true)
      }}
      onPointerMove={(e) => e.pointerType === 'mouse' && setOrigin(e)}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return
        setOrigin(e)
        setRevealed(false)
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return
        setOrigin(e)
        setRevealed((v) => !v)
      }}
    >
      <div className="absolute -inset-4 transition-transform duration-700 ease-out [transform:translate3d(calc(var(--tilt-x)*-8px),calc(var(--tilt-y)*-8px),0)] motion-reduce:transform-none">
        <Image src={base.src} alt={base.alt} fill priority sizes={sizes} className="object-cover" />
        <div
          aria-hidden={!revealed}
          className="absolute inset-0 transition-[clip-path] duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:duration-0"
          style={{
            clipPath: revealed
              ? 'circle(150% at var(--rx) var(--ry))'
              : 'circle(0% at var(--rx) var(--ry))',
          }}
        >
          <Image src={reveal.src} alt={reveal.alt} fill sizes={sizes} className="object-cover" />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-background/85 p-1 text-[11px] font-medium uppercase tracking-[0.18em] backdrop-blur md:bottom-5 md:left-auto md:right-5">
        <span
          className={`rounded-full px-3 py-1 transition-colors duration-500 ${revealed ? 'text-muted-foreground' : 'bg-primary text-primary-foreground'}`}
        >
          {base.label}
        </span>
        <span
          className={`rounded-full px-3 py-1 transition-colors duration-500 ${revealed ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          {reveal.label}
        </span>
      </div>
      <span className="sr-only" aria-live="polite">
        {`Acabamento exibido: ${revealed ? reveal.label : base.label}`}
      </span>
    </div>
  )
}
