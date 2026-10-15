/**
 * A weekend plan as a calendar file (.ics): one event per slot, Bangkok
 * time, with the stops in the description and the page's address. Built in
 * the browser from the plan on the page; nothing is fetched or stored.
 */
export type CalendarEvent = {
  /** YYYY-MM-DD, local to Bangkok. */
  date: string
  /** "HH:MM" start and end, Bangkok time. */
  start: string
  end: string
  title: string
  description: string
  location?: string
  url: string
}

function stamp(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Folds lines at 75 octets as the format asks; a long description stays valid. */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) {
      out.push(cur)
      cur = ' ' + ch
    } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n')
}

export function buildIcs(events: CalendarEvent[], calendarName: string): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ThaiMapped//Weekend plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Bangkok',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Bangkok',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0700',
    'TZOFFSETTO:+0700',
    'TZNAME:ICT',
    'END:STANDARD',
    'END:VTIMEZONE',
  ]
  events.forEach((e, i) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.date}-${i}-${e.url.replace(/[^a-z0-9]/gi, '').slice(-24)}@thaimapped`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Asia/Bangkok:${stamp(e.date, e.start)}`,
      `DTEND;TZID=Asia/Bangkok:${stamp(e.date, e.end)}`,
      `SUMMARY:${escapeText(e.title)}`,
      `DESCRIPTION:${escapeText(e.description)}`,
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      `URL:${e.url}`,
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Hands the file to the browser as a download. */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
