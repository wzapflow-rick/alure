import Image from 'next/image'
import { cn } from '@/lib/utils'

export function ProductImage({
  src,
  alt,
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
      {src ? <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-contain p-5 md:p-7" /> : null}
    </div>
  )
}
