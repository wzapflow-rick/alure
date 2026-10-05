import Image from 'next/image'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProductImage({
  src,
  alt,
  sku,
  sizes,
  priority,
  className,
}: {
  src: string | null | undefined
  alt: string
  sku?: string
  sizes: string
  priority?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative overflow-hidden bg-surface', className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-contain p-5 md:p-7" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 text-muted-foreground">
          <ImageIcon className="size-5" aria-hidden="true" />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em]">Foto em breve</span>
          {sku ? <span className="font-mono text-[10px] opacity-70">{sku}</span> : null}
          <span className="sr-only">{alt}</span>
        </div>
      )}
    </div>
  )
}
