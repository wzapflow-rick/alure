'use client'

import { ArrowRight } from 'lucide-react'
import { FinishReveal } from '@/components/effects/finish-reveal'

export function CatalogHero({ productCount }: { productCount: number | null }) {
  return (
    <section aria-labelledby="hero-title" className="mx-auto max-w-[1440px] px-5 pt-4 md:px-8 md:pt-8">
      <div className="grid overflow-hidden rounded-2xl bg-surface-2 md:grid-cols-[1fr_1fr] lg:grid-cols-[1.05fr_1fr]">
        <div className="order-2 flex flex-col justify-center gap-2.5 px-5 py-5 md:order-none md:gap-5 md:py-12 md:pl-12 md:pr-10 lg:pl-16">
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.24em] text-info md:block">
            {'Metais • Acabamentos • Soluções'}
          </p>
          <h1
            id="hero-title"
            className="text-[1.35rem] font-semibold leading-[1.12] tracking-tight text-balance md:text-[2.6rem] md:leading-[1.06] lg:text-5xl"
          >
            Metais e acabamentos para projetos que se destacam.
          </h1>
          <p className="hidden max-w-md leading-relaxed text-muted-foreground text-pretty md:block">
            Qualidade, design e durabilidade para banheiros e cozinhas.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
            <a
              href="#selecao"
              className="group inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60 md:h-12 md:px-7"
            >
              Explorar produtos
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </a>
            {productCount ? (
              <p className="text-sm text-muted-foreground">
                <span className="tabular font-semibold text-foreground">{productCount}</span>{' '}
                {productCount === 1 ? 'produto disponível' : 'produtos disponíveis'}
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative order-1 aspect-[16/7] md:order-none md:aspect-auto md:min-h-[360px]">
          <FinishReveal
            sizes="(min-width: 1440px) 700px, (min-width: 768px) 50vw, 100vw"
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
        </div>
      </div>
    </section>
  )
}
