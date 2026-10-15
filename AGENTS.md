<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ThaiMapped rules for AI sessions

- Read README.md first, then the two plan links in it. The plan and architecture docs carry the decisions; chat memory does not.
- Content JSON in `content/` is the product. Never hardcode a place, hotel or link in a component. `pnpm validate:content` must pass.
- Every user-visible string goes through `src/lib/i18n/strings.ts`. English only at launch, but the shape is multi-locale.
- Nothing may require a key to run. Keys are read only in `src/lib/env.ts` and their absence degrades, never crashes.
- Map style lives in `public/map/paper.json` (warm paper palette, mirrored in `src/app/globals.css`). Do not switch to a hosted style.
- Affiliate URLs are built at render time by `src/lib/links/build.ts` with a sub-ID. Content stores plain destination URLs only.
- Run `pnpm check` and `pnpm build` before every commit. Report results honestly.
