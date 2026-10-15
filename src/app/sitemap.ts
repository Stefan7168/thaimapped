import type { MetadataRoute } from 'next'
import { liveCityIds, loadCityBundle, loadRoutes } from '@/lib/content/load'
import { stationPages } from '@/lib/explorer/stations'
import { LOCALES } from '@/lib/i18n/locales'
import { env } from '@/lib/env'

/** Every static page, from the same content the pages are built from. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.siteUrl
  const urls: MetadataRoute.Sitemap = []
  for (const locale of LOCALES) {
    urls.push({ url: `${base}/${locale}`, changeFrequency: 'weekly', priority: 1 })
    urls.push({ url: `${base}/${locale}/credits`, changeFrequency: 'monthly', priority: 0.2 })
    for (const city of liveCityIds()) {
      const bundle = loadCityBundle(city)
      if (!bundle) continue
      urls.push({ url: `${base}/${locale}/${city}`, changeFrequency: 'weekly', priority: 0.9 })
      urls.push({ url: `${base}/${locale}/${city}/trip`, changeFrequency: 'weekly', priority: 0.6 })
      for (const r of loadRoutes(city)) urls.push({ url: `${base}/${locale}/${city}/trip/${r.id}`, changeFrequency: 'monthly', priority: 0.6 })
      for (const a of bundle.areas) urls.push({ url: `${base}/${locale}/${city}/weekend/${a.id}`, changeFrequency: 'weekly', priority: 0.8 })
      urls.push({ url: `${base}/${locale}/${city}/station`, changeFrequency: 'weekly', priority: 0.6 })
      for (const p of stationPages(bundle)) urls.push({ url: `${base}/${locale}/${city}/station/${p.slug}`, changeFrequency: 'weekly', priority: 0.7 })
    }
  }
  return urls
}
