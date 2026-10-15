# Pre-launch checklist

Stefan's rule (2026-10-15): do not raise setup or launch items with him before go-live. Everything that needs his account, a key, or an environment variable waits here until he says we are going live. Keep building the product meanwhile.

## Needs Stefan at go-live

- [ ] Travelpayouts marker: set `NEXT_PUBLIC_TP_MARKER` on Vercel (Production). Until then hotel links are plain Booking.com searches. Parked by Stefan on 2026-10-15 ("way too soon").
- [ ] Analytics: set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (or pick another provider). The outbound-click event is already wired in `src/lib/links/track.ts` and sends nothing until the domain is set.
- [ ] Domain: point thaimapped.com at the Vercel project and add it under the project's domains.
- [ ] Hotel deep links: swap name searches for exact hotel pages once the affiliate marker exists (lookup of exact pages is a content task and can run earlier).
- [ ] Hotel photos: 19 hotels have no picture (Commons and Openverse have none of the building); check the Agoda and Booking.com affiliate terms on reusing their hotel images before adding any.

## Can be done without Stefan (before go-live)

- [ ] `/credits` page listing every photo credit and licence; a content test that every photo file exists and every licence is on the allowed list.
- [ ] Verify the `when` hours of every place against the venue's own page (first pass is editorial).
- [ ] Open Graph image and metadata per page.
- [ ] Sitemap and robots: confirm every static route is listed.
- [ ] Phone home page: the map band sits behind the scrolling text (backlog item 4).
