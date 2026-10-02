'use client'

import Image from 'next/image'
import { useState } from 'react'
import { ProductImage } from '@/components/catalog/product-image'
import { cn } from '@/lib/utils'

export function ProductGallery({ images, name, sku }: { images: string[]; name: string; sku: string }) {
  const [index, setIndex] = useState(0)
  const current = images[index] ?? images[0]

  return (
    <div className="flex flex-col gap-3">
      <ProductImage
        src={current}
        alt={name}
        sku={sku}
        sizes="(min-width: 768px) 560px, 92vw"
        priority
        className="aspect-square rounded-2xl border border-border"
      />
      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Fotos do produto">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Foto ${i + 1}`}
              aria-pressed={i === index}
              className={cn(
                'relative size-20 shrink-0 overflow-hidden rounded-lg border bg-surface transition-colors',
                i === index ? 'border-primary' : 'border-border hover:border-foreground/30',
              )}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-contain p-1.5" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
