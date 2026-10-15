export type Locale = 'en' | 'th' | 'es' | 'pt' | 'zh'
export type Localized = { en: string } & Partial<Record<Exclude<Locale, 'en'>, string>>

export interface Camera {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

export interface Country {
  id: string
  name: Localized
  tagline: Localized
  camera: Camera
  cities: Array<{ id: string; status: 'live' | 'planned' }>
}

export interface City {
  id: string
  name: Localized
  tagline: Localized
  camera: Camera
  camera2d: Camera
  stations?: string
  lines?: string
  areas: string[]
}

export interface Station {
  id: string
  system: string
  line: string
  /** Operator code such as E4 or BL22; empty when the operator publishes none. */
  code: string
  name: Localized
  lat: number
  lon: number
}

export interface Line {
  id: string
  system: string
  line: string
  color: string
}

export type PinKind = 'hotel' | 'sight' | 'food' | 'market' | 'nightlife' | 'transport'
export type PinLinks = Partial<Record<'agoda' | 'booking' | 'viator' | 'klook' | 'official', string>>

export interface Pin {
  id: string
  kind: PinKind
  tier?: 'budget' | 'mid' | 'luxury'
  name: Localized
  why: Localized
  location: { lon: number; lat: number }
  walk?: { station: string; minutes: number }
  /** Sub-area id within the pin's area, when it sits inside a named one. */
  subarea?: string
  links: PinLinks
}

export interface Subarea {
  id: string
  name: Localized
  center: [number, number]
}

export interface Video {
  platform: 'instagram' | 'youtube' | 'tiktok'
  url: string
  creator: string
  thumb: string
}

export interface Area {
  id: string
  city: string
  name: Localized
  tagline: Localized
  fits: string[]
  color: `area-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  camera: Camera
  polygon?: string
  stations: string[]
  subareas: Subarea[]
  video: Video | null
  pins: Pin[]
}

/** Everything a city page needs, resolved and validated, serialisable to the client. */
export interface CityBundle {
  city: City
  areas: Area[]
  stations: Station[]
  lines: Line[]
}
