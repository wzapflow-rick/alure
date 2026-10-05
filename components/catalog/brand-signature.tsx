'use client'

import dynamic from 'next/dynamic'

const FluidText = dynamic(() => import('@/components/effects/fluid-text'), { ssr: false })

const FINISH_PALETTE = ['#2b6977', '#b8925a', '#5f9aa6']

export function BrandSignature() {
  return (
    <section aria-label="ALURE" className="mt-16 bg-foreground text-background md:mt-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 pt-10 md:px-8 md:pt-14">
        <div className="relative h-[28vw] max-h-72 min-h-28 w-full">
          <FluidText
            text="ALURE"
            fit
            color="rgba(246, 244, 239, 0.94)"
            paletteColors={FINISH_PALETTE}
            font={{ fontFamily: 'Inter', fontWeight: 600, letterSpacing: '0.12em', lineHeight: '1em' }}
            splatRadius={6}
            curl={30}
            densityDissipation={3}
          />
        </div>
        <p className="pb-8 text-center text-xs uppercase tracking-[0.24em] text-background/50">
          Passe o cursor ou toque na marca
        </p>
      </div>
    </section>
  )
}
