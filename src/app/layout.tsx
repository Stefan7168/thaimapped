import type { Metadata } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

const inter = Inter({ variable: '--font-sans', subsets: ['latin'] })
const fraunces = Fraunces({ variable: '--font-display', subsets: ['latin'], weight: ['500', '600'] })

export const metadata: Metadata = {
  title: 'ThaiMapped',
  description: 'See where everything is in Thailand before you book anything.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <head>
        {/* Entrances hide nothing unless this runs: no script, no hidden content. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
