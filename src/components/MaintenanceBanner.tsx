import { useEffect, useState } from 'react'
import { Alert } from 'antd'

/**
 * Scheduled maintenance notice, shown on every page.
 *
 * Set MAINTENANCE to null when nothing is scheduled. Times carry the Kuwait
 * offset (+03:00) so every screen shows the same moment, whatever the
 * computer's own clock or time zone says. The banner removes itself after
 * `end`, so a forgotten notice never lingers.
 */
const MAINTENANCE: { start: string; end: string } | null = {
  start: '2026-09-24T14:45:00+03:00',
  end: '2026-09-24T15:30:00+03:00',
}

const TIME_ZONE = 'Asia/Kuwait'

function kuwaitTime(ms: number) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE }).format(ms)
}

function kuwaitDay(ms: number) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: TIME_ZONE }).format(ms)
}

export default function MaintenanceBanner({ floating = false }: { floating?: boolean }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  if (!MAINTENANCE) return null
  const start = Date.parse(MAINTENANCE.start)
  const end = Date.parse(MAINTENANCE.end)
  if (Number.isNaN(start) || Number.isNaN(end) || now >= end) return null

  const at = kuwaitTime(start)
  const day = kuwaitDay(start) === kuwaitDay(now) ? 'today' : `on ${kuwaitDay(start)}`
  const upcoming = now < start
  const minutesLeft = Math.ceil((start - now) / 60_000)

  let countdown = ''
  if (upcoming && minutesLeft <= 60) {
    countdown = minutesLeft <= 1 ? ' Starting now.' : ` Starts in ${minutesLeft} minutes.`
  }

  const message = upcoming
    ? `Security maintenance ${day} at ${at}`
    : 'Security maintenance in progress'

  const description = upcoming
    ? `Please save your work and finish what you are doing before ${at}. ` +
      `The Action Sheet System will be unavailable for a short time after ${at}.${countdown}`
    : 'The Action Sheet System may be unavailable for a few minutes. ' +
      'If a page does not load, please wait a minute and try again.'

  return (
    <div
      role="status"
      style={floating ? { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1100 } : undefined}
    >
      <Alert
        banner
        showIcon
        type={upcoming && minutesLeft > 15 ? 'warning' : 'error'}
        message={<strong>{message}</strong>}
        description={description}
      />
    </div>
  )
}
