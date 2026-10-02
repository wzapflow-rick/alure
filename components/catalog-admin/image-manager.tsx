'use client'

import Image from 'next/image'
import { ActionForm, InlineAction, SubmitButton } from '@/components/forms/action-form'
import { makePrimaryImage, removeCatalogImage, uploadCatalogImages } from '@/lib/actions/catalog'

export function ImageManager({ id, images }: { id: number; images: string[] }) {
  return (
    <div className="flex flex-col gap-5">
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((url, i) => (
            <li key={url} className="flex flex-col gap-2">
              <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-[#ffffff]">
                <Image src={url} alt={`Foto ${i + 1}`} fill sizes="200px" className="object-contain p-2" />
                {i === 0 ? (
                  <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Capa
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1">
                {i > 0 ? <InlineAction action={makePrimaryImage} fields={{ id, url }} label="Usar como capa" /> : null}
                <InlineAction action={removeCatalogImage} fields={{ id, url }} label="Remover" variant="danger" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma foto ainda. A primeira foto vira a capa no catálogo.</p>
      )}

      <ActionForm action={uploadCatalogImages} resetOnSuccess className="gap-3">
        <input type="hidden" name="id" value={id} />
        <label htmlFor="ci-images" className="text-xs font-medium text-muted-foreground">
          Adicionar fotos (JPG, PNG ou WebP, até 8 MB cada)
        </label>
        <input
          id="ci-images"
          name="images"
          type="file"
          multiple
          required
          accept="image/jpeg,image/png,image/webp"
          className="text-sm text-muted-foreground file:mr-3 file:h-8 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:text-sm file:text-foreground"
        />
        <div>
          <SubmitButton size="sm">Enviar fotos</SubmitButton>
        </div>
      </ActionForm>
    </div>
  )
}
