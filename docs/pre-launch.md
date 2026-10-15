# Pre-launch checklist

Stefan's rule (2026-10-15): do not raise setup or launch items with him before go-live. Everything that needs his account, a key, or an environment variable waits here until he says we are going live. Keep building the product meanwhile.

## Needs Stefan at go-live

- [ ] Travelpayouts marker: set `NEXT_PUBLIC_TP_MARKER` on Vercel (Production). Until then hotel links are plain Booking.com searches. Parked by Stefan on 2026-10-15 ("way too soon").
- [ ] Analytics: set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (or pick another provider). The outbound-click event is already wired in `src/lib/links/track.ts` and sends nothing until the domain is set.
- [ ] Domain: point thaimapped.com at the Vercel project and add it under the project's domains.
- [ ] Hotel deep links: swap name searches for exact hotel pages once the affiliate marker exists (lookup of exact pages is a content task and can run earlier).
- [ ] Hotel photos: 19 hotels have no picture (Commons and Openverse have none of the building); check the Agoda and Booking.com affiliate terms on reusing their hotel images before adding any.

## Can be done without Stefan (before go-live)

- [x] `/credits` page and the photo file + licence check in `scripts/validate-content.mjs` (done 2026-10-15).
- [ ] Verify the `when` hours of every place against the venue's own page (first pass is editorial).
- [x] Open Graph image and metadata per page (done 2026-10-15: `src/lib/seo/page-meta.ts`, default card at `/opengraph-image`).
- [x] Sitemap and robots (done 2026-10-15: `src/app/sitemap.ts` lists every static route except `/saved`, which is personal and noindex).
- [x] Phone home page: the map band sits behind the scrolling text (closed 2026-10-15, batch 6: a tapped highlight's card lands in view).
- [ ] Set `NEXT_PUBLIC_SITE_URL` on Vercel to the real domain once it is connected; until then the sitemap and robots.txt point at the Vercel address.

## Needs a real phone or a browser (before go-live, no account needed)

- [ ] Agoda link parameters: tap "This weekend" then "Open on Agoda" on a weekend page and confirm the dates and 2 adults arrive (the parameter names `checkIn`, `checkOut`, `los`, `adults`, `rooms` were written from memory; the cloud box cannot open agoda.com). Booking.com's were read from a live URL.
- [ ] "Add to calendar" (.ics) on a weekend page: open the file in Apple Calendar or Google Calendar and check the five events land on the right days in Bangkok time.
- [ ] "Add to Home Screen" on iPhone and Android: the icon, the name and the standalone window (manifest at `/manifest.webmanifest`, icons at `/icon`, `/apple-icon`, `/icon.svg`).
- [ ] Structured data: run an area page, a station page and a trip page through Google's Rich Results test (schema.org ItemList and TouristTrip from `src/lib/seo/json-ld.tsx`).
