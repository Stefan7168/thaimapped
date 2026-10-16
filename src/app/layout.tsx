import type { Metadata, Viewport } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'
import { env } from '@/lib/env'
import { ServiceWorker } from '@/components/app/service-worker'

const inter = Inter({ variable: '--font-sans', subsets: ['latin'] })
const fraunces = Fraunces({ variable: '--font-display', subsets: ['latin'], weight: ['500', '600'] })

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: 'ThaiMapped',
  description: 'See where everything is in Thailand before you book anything.',
  openGraph: { siteName: 'ThaiMapped', type: 'website' },
  twitter: { card: 'summary_large_image' },
  appleWebApp: { title: 'ThaiMapped', statusBarStyle: 'default' },
}

/** The browser chrome on a phone takes the paper colour. */
export const viewport: Viewport = { themeColor: '#f6f4ee' }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <head>
        {/* Entrances hide nothing unless this runs: no script, no hidden content. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        {/* Analytics only when a Plausible domain is set; the outbound_click event is sent from the booking links. */}
        {env.plausibleDomain && <script defer data-domain={env.plausibleDomain} src="https://plausible.io/js/script.js" />}
      </head>
      <body className="min-h-full flex flex-col">{children}<ServiceWorker /></body>
    </html>
  )
}
