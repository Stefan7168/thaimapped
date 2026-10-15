import Link from 'next/link'
import { strings } from '@/lib/i18n/strings'

/** The 404 page, in the site's own voice; English, as the only locale so far. */
export default function NotFound() {
  const s = strings('en')
  return (
    <main className="tm-nf">
      <Link href="/en" className="tm-wordmark">{s.brand}</Link>
      <h1 className="tm-h2">{s.notFound.title}</h1>
      <p>{s.notFound.lead}</p>
      <Link href="/en/bangkok" className="tm-button">{s.notFound.action}</Link>
    </main>
  )
}
