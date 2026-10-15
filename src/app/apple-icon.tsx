import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** The home-screen icon on an iPhone: the same mark, square (iOS rounds the corners itself). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f4ee' }}>
        <div style={{ width: 86, height: 86, borderRadius: 999, background: '#c8553d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 999, border: '11px solid #ffffff' }} />
        </div>
      </div>
    ),
    size,
  )
}
