import type { Metadata } from 'next'
import type { Area, AreaPhoto, Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'

/**
 * One shape for every page's share preview: title, description, the
 * canonical address and one picture. Pages pass a real photograph when
 * they have one; without one the default card (src/app/opengraph-image.tsx)
 * is used, so a sent link always shows something.
 */
export function pageMeta({ locale, title, description, path, photo }: { locale: Locale; title: string; description?: string; path: string; photo?: AreaPhoto | null }): Metadata {
  const s = strings(locale)
  const full = `${title} · ${s.brand}`
  // Width and height are left out for photographs: the files vary (most 1600 by 1200) and the crawler reads the file.
  const images = photo ? [{ url: photo.src, alt: photo.alt }] : [{ url: '/opengraph-image', width: 1200, height: 630, alt: s.brand }]
  return {
    title: full,
    description,
    alternates: { canonical: path },
    openGraph: { title: full, description, url: path, type: 'website', siteName: s.brand, locale: locale === 'en' ? 'en_US' : locale, images },
    twitter: { card: 'summary_large_image', title: full, description, images: images.map((i) => i.url) },
  }
}

/** The area's first photograph, else the first place in it with one. */
export function areaPhoto(area: Area): AreaPhoto | null {
  return area.photos?.[0] ?? area.pins.find((p) => p.photo)?.photo ?? null
}
