import type { MetadataRoute } from 'next'

/** "Add to Home Screen" on a phone: the name, the icon, the paper colour, opening on the English home page. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ThaiMapped',
    short_name: 'ThaiMapped',
    description: 'See where everything is in Thailand before you book anything.',
    start_url: '/en',
    display: 'standalone',
    background_color: '#f6f4ee',
    theme_color: '#f6f4ee',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
