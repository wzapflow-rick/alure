import Image from 'next/image'
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
  sku: string
  sizes: string
  priority?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative overflow-hidden bg-surface', className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-contain p-6" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground" aria-hidden>
          <span className="font-mono text-2xl tracking-wider text-foreground/25">{sku}</span>
          <span className="text-xs">Foto em breve</span>
        </div>
      )}
    </div>
  )
}
