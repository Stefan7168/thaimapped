import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

/** The app icon at full size: the paper square and the pin dot, the same mark as icon.svg. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f4ee', borderRadius: 112, border: '24px solid #e5e0d3' }}>
        <div style={{ width: 240, height: 240, borderRadius: 999, background: '#c8553d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 168, height: 168, borderRadius: 999, border: '32px solid #ffffff' }} />
        </div>
      </div>
    ),
    size,
  )
}
