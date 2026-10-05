'use client'

import { ArrowDown } from 'lucide-react'
import { TextRing } from '@/components/effects/text-ring'
import { FinishReveal } from '@/components/effects/finish-reveal'

const FINISH_WORDS = ['Cromado', 'Gold Matte', 'Deca', 'ALURE']

export function CatalogHero() {
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
          <FinishReveal
            sizes="(min-width: 1152px) 600px, (min-width: 768px) 52vw, 100vw"
            base={{
              src: '/catalogo/hero.png',
              alt: 'Misturador Deca cromado sobre bancada de pedra clara',
              label: 'Cromado',
            }}
            reveal={{
              src: '/catalogo/hero-gold.png',
              alt: 'Misturador Deca Gold Matte sobre bancada de pedra clara',
              label: 'Gold Matte',
            }}
          />

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
