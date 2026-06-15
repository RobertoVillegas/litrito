import { useAction, useQuery } from 'convex/react'
import { useEffect, useRef } from 'react'
import { api } from '../../convex/_generated/api'
import { brandLogo } from '#/lib/brandLogo'

type StationPhotoProps = {
  permitNumber: string
  stationName: string
  // Reviewed forecourt brand, once the brand pipeline projects it onto the
  // public station. Drives the logo tier of the cascade; undefined for now.
  brand?: string | null
}

// Cascade: brand logo (instant, free, recognizable) → cached Mapillary street
// photo (fetched lazily on first view) → nothing. Keeps the hero clean when no
// imagery exists rather than showing an empty frame.
export function StationPhoto({ permitNumber, stationName, brand }: StationPhotoProps) {
  const logo = brandLogo(brand)
  const photo = useQuery(
    api.photos.getStationPhoto,
    logo ? 'skip' : { permitNumber },
  )
  const ensurePhoto = useAction(api.photos.ensureStationPhoto)
  const requested = useRef(false)

  useEffect(() => {
    if (!logo && photo?.status === 'unchecked' && !requested.current) {
      requested.current = true
      void ensurePhoto({ permitNumber }).catch(() => undefined)
    }
  }, [logo, photo?.status, permitNumber, ensurePhoto])

  if (logo) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-md border border-white/15 bg-white/[0.04] p-4">
        <img
          src={logo}
          alt={`Logo ${brand}`}
          className="h-12 w-auto object-contain"
        />
        <span className="text-sm font-bold text-white/80">{brand}</span>
      </div>
    )
  }

  if (photo?.status === 'found' && photo.url) {
    return (
      <figure className="mt-6 overflow-hidden rounded-md border border-white/15">
        <img
          src={photo.url}
          alt={`Vista de ${stationName}`}
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
        {photo.attribution && (
          <figcaption className="bg-black/40 px-3 py-1 text-[10px] font-semibold text-white/60">
            {photo.attribution}
          </figcaption>
        )}
      </figure>
    )
  }

  if (photo?.status === 'unchecked' || photo === undefined) {
    return (
      <div className="mt-6 aspect-video w-full animate-pulse rounded-md border border-white/15 bg-white/[0.04]" />
    )
  }

  // status === 'none': no logo and no Mapillary coverage — render nothing.
  return null
}
