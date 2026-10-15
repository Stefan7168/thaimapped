import { ImageResponse } from 'next/og'

export const alt = 'ThaiMapped: see where everything is in Thailand before you book anything.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** The share card for pages without a photograph of their own: the paper palette, the name, the one sentence. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#f6f4ee', color: '#2b2a26', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 34, fontWeight: 600 }}>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: '#c8553d' }} />
          ThaiMapped
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>Bangkok, mapped before you book.</div>
          <div style={{ fontSize: 36, color: '#6f6a5f' }}>Eight areas, 193 stations, hotels placed where they really stand.</div>
        </div>
      </div>
    ),
    size,
  )
}
