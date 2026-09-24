import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { useAuthStore } from '../store'

/**
 * Ambient welcome panel — a translucent glass card that slides in once
 * whenever the app is opened (Electron window launch or a web page load)
 * and greets the user according to their local time.
 */

const VISIBLE_MS = 4200
const EXIT_MS = 420

// Once per launch. Flipped only after the panel has actually finished, so
// React StrictMode's double-mount in dev still shows it.
let alreadyGreeted = false

function greetingFor(hour: number) {
  if (hour < 12) return { en: 'Good morning', ar: 'صباح الخير' }
  if (hour < 17) return { en: 'Good afternoon', ar: 'مساء الخير' }
  return { en: 'Good evening', ar: 'مساء الخير' }
}

export default function WelcomePanel() {
  const { user } = useAuthStore()
  const [visible, setVisible] = useState(!alreadyGreeted)
  const [leaving, setLeaving] = useState(false)

  // Frozen at mount — the panel only lives a few seconds
  const [greeting] = useState(() => greetingFor(new Date().getHours()))
  const [stamp] = useState(() => dayjs().format('dddd, D MMMM · HH:mm'))

  const dismiss = useCallback(() => setLeaving(true), [])

  // Auto-dismiss
  useEffect(() => {
    if (!visible || leaving) return
    const t = setTimeout(dismiss, VISIBLE_MS)
    return () => clearTimeout(t)
  }, [visible, leaving, dismiss])

  // Unmount after the exit animation
  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => { alreadyGreeted = true; setVisible(false) }, EXIT_MS)
    return () => clearTimeout(t)
  }, [leaving])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, dismiss])

  if (!visible) return null

  const firstName = user?.name?.trim().split(/\s+/)[0]

  return (
    <div className={`welcome-layer${leaving ? ' leaving' : ''}`} role="status" aria-live="polite">
      <div className="welcome-shell">
        <div className="welcome-glow" aria-hidden="true" />
        <div
          className="welcome-glass"
          onClick={dismiss}
          title="Dismiss"
        >
          <img className="welcome-logo" src="/acg_logo.jpg" alt="" />
          <div className="welcome-copy">
            <div className="welcome-eyebrow">
              Action Sheets System
              <span className="welcome-divider">|</span>
              <span className="welcome-brand">Al-Ahlia</span>
            </div>
            <div className="welcome-greeting">
              {greeting.en}{firstName ? `, ${firstName}` : ''}
            </div>
            <div className="welcome-meta">
              <span className="welcome-ar">{greeting.ar}</span>
              <span className="welcome-sep">·</span>
              <span>{stamp}</span>
            </div>
          </div>
          <span className="welcome-timer" style={{ animationDuration: `${VISIBLE_MS}ms` }} />
        </div>
      </div>
    </div>
  )
}
