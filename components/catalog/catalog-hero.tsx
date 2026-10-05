'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { ArrowDown } from 'lucide-react'
import { TextRing } from '@/components/effects/text-ring'

const LenticularDuo = dynamic(() => import('@/components/effects/lenticular-duo'), { ssr: false })

const FINISH_WORDS = ['Cromado', 'Gold Matte', 'Deca', 'ALURE']

export function CatalogHero() {
  const [webgl] = useState(
    () =>
      typeof window === 'undefined' ||
      Boolean(document.createElement('canvas').getContext('webgl2')),
  )
  const [active, setActive] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activate = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setActive(true)
  }
  // Delay lets the sheet spring back to flat before the crisp photo fades back in.
  const deactivate = (delayMs: number) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setActive(false), delayMs)
  }

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  return (
    <section className="mx-auto max-w-6xl px-5 pt-4 md:px-8 md:pt-8">
      <div className="grid overflow-hidden rounded-2xl bg-surface-2 md:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col justify-center gap-4 px-6 py-7 md:gap-5 md:py-14 md:pl-12 md:pr-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-info">
            {'Metais • Acabamentos • Soluções'}
          </p>
          <h1 className="text-[1.85rem] font-semibold leading-[1.08] tracking-tight text-balance md:text-5xl">
            Metais e acabamentos Deca para seus projetos.
          </h1>
          <p className="max-w-md leading-relaxed text-muted-foreground text-pretty">
            Uma seleção ALURE para profissionais, lojas e projetos.
          </p>
          <a
            href="#selecao"
            className="inline-flex h-12 w-fit items-center rounded-full bg-primary px-7 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ver produtos
          </a>
        </div>

        <div className="relative aspect-[16/9] md:aspect-auto md:min-h-[420px]">
          {/* The static photo stays underneath as the LCP image and the fallback when WebGL is unavailable. */}
          <Image
            src="/catalogo/hero.png"
            alt="Misturador Deca sobre bancada de pedra clara, alternando entre acabamento cromado e Gold Matte"
            fill
            priority
            sizes="(min-width: 1152px) 600px, (min-width: 768px) 52vw, 100vw"
            className="object-cover"
          />
          {webgl ? (
            <div
              className={`absolute inset-0 transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`}
              onPointerEnter={(e) => e.pointerType === 'mouse' && activate()}
              onPointerDown={activate}
              onPointerLeave={(e) => e.pointerType === 'mouse' && deactivate(500)}
              onPointerUp={(e) => e.pointerType !== 'mouse' && deactivate(900)}
              onPointerCancel={() => deactivate(500)}
            >
              <LenticularDuo
                background="var(--surface-2)"
                slotA={{ image: '/catalogo/hero.png' }}
                slotB={{ image: '/catalogo/hero-gold.png' }}
                density={36}
                ridge={45}
                distance={10}
                perspective={60}
                light={{ lightColor: '#ffffff', intensity: 150 }}
                intro={{ angle: 0, duration: 900 }}
              />
            </div>
          ) : null}

          {webgl ? (
            <span
              className={`pointer-events-none absolute bottom-3 left-3 rounded-full bg-background/85 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground backdrop-blur transition-opacity duration-300 md:bottom-5 md:left-auto md:right-5 ${active ? 'opacity-0' : 'opacity-100'}`}
            >
              <span className="md:hidden">Arraste para ver o Gold Matte</span>
              <span className="hidden md:inline">Passe o cursor para ver o Gold Matte</span>
            </span>
          ) : null}

          <a
            href="#selecao"
            className="group absolute right-3 top-3 size-24 rounded-full bg-background text-foreground shadow-sm transition-transform hover:scale-105 md:left-0 md:right-auto md:top-1/2 md:size-32 md:-translate-x-1/2 md:-translate-y-1/2 md:hover:scale-105"
          >
            <TextRing
              words={FINISH_WORDS}
              fontSizePx={10}
              className="size-full text-primary md:hidden"
            >
              <ArrowDown className="size-5 transition-transform group-hover:translate-y-0.5" aria-hidden />
            </TextRing>
            <TextRing
              words={FINISH_WORDS}
              fontSizePx={12}
              className="hidden size-full text-primary md:flex"
            >
              <ArrowDown className="size-6 transition-transform group-hover:translate-y-0.5" aria-hidden />
            </TextRing>
            <span className="sr-only">Ver produtos</span>
          </a>
        </div>
      </div>
    </section>
  )
}
