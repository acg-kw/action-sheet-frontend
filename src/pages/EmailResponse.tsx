import { useState, useEffect, useRef } from 'react'
import MaintenanceBanner from '../components/MaintenanceBanner'

/**
 * EmailResponse — Standalone page that processes email response clicks.
 *
 * SECURITY FIX (v2.1):
 * Previously auto-submitted on page load, which allowed Microsoft ATP and
 * Google email scanners to trigger phantom responses by executing the SPA JS.
 *
 * Now shows a CONFIRMATION screen first — the user must click a button
 * to submit their response. Scanners won't interact with buttons.
 *
 * v2.2 — Added Ahlia logo, animated guide prompting user to click confirm.
 *
 * URL format: /respond?sheet=XX&email=XX&response=XX&token=XX
 */

const API_BASE = import.meta.env.VITE_API_URL || ''

type Status = 'confirm' | 'loading' | 'success' | 'already' | 'info' | 'error' | 'invalid'

interface ResponseResult {
  status: Status
  title: string
  message: string
  color: string
  response?: string
  sheetId?: string
}

/* ── Animated hand pointer component ── */
function AnimatedGuide({ targetRef }: { targetRef: React.RefObject<HTMLButtonElement | null> }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 1200)
    return () => clearTimeout(timer)
  }, [])

  if (!show) return null

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      marginBottom: 12,
      animation: 'guideAppear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
    }}>
      {/* Pulsing arrow */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        animation: 'bounceDown 1.5s ease-in-out infinite',
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#800000',
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
          marginBottom: 6,
          textAlign: 'center' as const,
          background: 'rgba(128,0,0,0.06)',
          padding: '4px 14px',
          borderRadius: 6,
          border: '1px dashed rgba(128,0,0,0.2)',
        }}>
          👇 Click the button below to confirm
        </div>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3 L10 14 M5 10 L10 15 L15 10" stroke="#800000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  )
}

export default function EmailResponse() {
  const params = new URLSearchParams(window.location.search)
  const sheet = params.get('sheet')
  const email = params.get('email')
  const response = params.get('response')
  const token = params.get('token')

  // Determine if params are valid
  const isValid = !!(sheet && email && response && token)

  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  const [result, setResult] = useState<ResponseResult>(
    isValid
      ? {
          status: 'confirm',
          title: 'Confirm Your Response',
          message: `You are about to respond to this action sheet.`,
          color: '#800000',
          response: response!,
          sheetId: sheet!,
        }
      : {
          status: 'invalid',
          title: '⚠️ Invalid Link',
          message: 'This response link is missing required parameters.',
          color: '#e65100',
        }
  )

  // Only called when user clicks the confirm button — NOT on page load
  async function submitResponse() {
    setResult({
      status: 'loading',
      title: 'Processing Your Response',
      message: 'Please wait...',
      color: '#800000',
    })

    try {
      const apiUrl = `${API_BASE}/api/respond/process?` + new URLSearchParams({
        sheet: sheet!,
        email: email!,
        response: response!,
        token: token!,
      }).toString()

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'text/html,application/json',
        },
      })

      const html = await res.text()

      if (html.includes('Already Responded') || html.includes('already responded')) {
        setResult({
          status: 'already',
          title: 'ℹ️ Already Responded',
          message: extractMessage(html, 'You have already responded to this action sheet.'),
          color: '#1976d2',
        })
      } else if (html.includes('Response Updated') || html.includes('recorded successfully')) {
        const responseMatch = html.match(/"([^"]*)" has been recorded/)
                           || html.match(/&quot;([^&]*)&quot; has been recorded/)
        const recordedResponse = responseMatch?.[1] || response
        setResult({
          status: 'success',
          title: '✅ Response Recorded',
          message: `Your response "${recordedResponse}" has been recorded successfully for Action Sheet ${sheet}.`,
          color: '#16a34a',
        })
      } else if (html.includes('Information Only') || html.includes('information only')) {
        setResult({
          status: 'info',
          title: 'ℹ️ Information Only',
          message: 'This action sheet was sent to you for information only. No response is required.',
          color: '#1976d2',
        })
      } else if (html.includes('Invalid') || html.includes('expired')) {
        setResult({
          status: 'invalid',
          title: '⚠️ Invalid Link',
          message: 'This response link has expired or is invalid.',
          color: '#e65100',
        })
      } else if (html.includes('Not Found')) {
        setResult({
          status: 'error',
          title: '⚠️ Sheet Not Found',
          message: `Action Sheet ${sheet} does not exist.`,
          color: '#e65100',
        })
      } else if (html.includes('Error') || !res.ok) {
        setResult({
          status: 'error',
          title: '❌ Error',
          message: 'An error occurred while processing your response. Please try again later.',
          color: '#dc2626',
        })
      } else {
        setResult({
          status: 'success',
          title: '✅ Response Recorded',
          message: `Your response "${response}" has been recorded successfully.`,
          color: '#16a34a',
        })
      }
    } catch (err: any) {
      console.error('Failed to process email response:', err)
      setResult({
        status: 'error',
        title: '❌ Connection Error',
        message: 'Could not reach the server. Please check your connection and try again.',
        color: '#dc2626',
      })
    }
  }

  function extractMessage(html: string, fallback: string): string {
    const match = html.match(/<p>(.*?)<\/p>/s)
    if (match) {
      return match[1].replace(/<[^>]+>/g, '').trim() || fallback
    }
    return fallback
  }

  // Determine button color and emoji for the response type
  function getResponseStyle(resp: string) {
    const upper = (resp || '').toUpperCase()
    if (upper.includes('ACTION TAKEN') || upper.includes('COMPLETED')) return { color: '#16a34a', emoji: '✅' }
    if (upper.includes('PROGRESS')) return { color: '#2563eb', emoji: '🔄' }
    if (upper.includes('NOTED') || upper.includes('ACKNOWLEDGED')) return { color: '#6b7280', emoji: '📋' }
    if (upper.includes('REVIEW')) return { color: '#d97706', emoji: '🔍' }
    if (upper.includes('REJECT')) return { color: '#dc2626', emoji: '❌' }
    if (upper.includes('APPROVED')) return { color: '#16a34a', emoji: '✅' }
    return { color: '#800000', emoji: '📋' }
  }

  const isLoading = result.status === 'loading'
  const isConfirm = result.status === 'confirm'
  const style = getResponseStyle(response || '')

  return (
    <div style={{
      margin: 0,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f0ea 0%, #e8e0d4 50%, #f0ebe4 100%)',
      fontFamily: "'Segoe UI', -apple-system, Arial, sans-serif",
      padding: '20px',
    }}>
      <MaintenanceBanner floating />
      <div style={{
        background: 'white',
        borderRadius: 20,
        boxShadow: '0 25px 80px rgba(128,0,0,0.12), 0 8px 30px rgba(0,0,0,0.06)',
        maxWidth: 480,
        width: '100%',
        overflow: 'hidden',
        animation: 'cardEntrance 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      }}>
        {/* ── Header with Logo ── */}
        <div style={{
          background: 'linear-gradient(135deg, #800000, #5c0000)',
          padding: '28px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative shimmer */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.05) 50%, transparent 60%)',
            animation: 'headerShimmer 4s ease-in-out infinite',
          }} />

          {/* Logo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
            animation: 'logoFloat 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.25)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <img
                src="/acg_logo_hq.ico"
                alt="Al-Ahlia Contracting Group"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          </div>

          <h1 style={{
            color: 'white',
            fontSize: 15,
            fontWeight: 700,
            margin: 0,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            animation: 'textSlideUp 0.6s ease 0.3s both',
          }}>
            AL-AHLIA CONTRACTING GROUP
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: 11,
            marginTop: 4,
            margin: '4px 0 0',
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            animation: 'textSlideUp 0.6s ease 0.45s both',
          }}>
            Action Sheet System
          </p>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '36px 32px 28px', textAlign: 'center' }}>
          {isLoading ? (
            <>
              <div style={{
                width: 52,
                height: 52,
                border: '4px solid #f0ebe5',
                borderTopColor: '#800000',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 20px',
              }} />
              <h2 style={{ color: '#800000', fontSize: 20, marginBottom: 8, fontWeight: 700 }}>
                {result.title}
              </h2>
              <p style={{ color: '#666', fontSize: 14, margin: 0 }}>{result.message}</p>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 4,
                marginTop: 16,
              }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#800000',
                    animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </>
          ) : isConfirm ? (
            <>
              {/* Response badge */}
              <div style={{
                animation: 'badgeEntrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s both',
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: `${style.color}12`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  fontSize: 28,
                  border: `2px solid ${style.color}20`,
                }}>
                  {style.emoji}
                </div>
              </div>

              <h2 style={{
                color: '#1a1a1a',
                fontSize: 21,
                marginBottom: 8,
                fontWeight: 700,
                animation: 'textSlideUp 0.5s ease 0.6s both',
              }}>
                Confirm Your Response
              </h2>
              <p style={{
                color: '#666',
                fontSize: 14,
                lineHeight: 1.6,
                marginBottom: 16,
                animation: 'textSlideUp 0.5s ease 0.7s both',
              }}>
                You are about to respond to this action sheet with:
              </p>

              {/* Response tag */}
              <div style={{
                animation: 'tagPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s both',
              }}>
                <div style={{
                  display: 'inline-block',
                  background: `linear-gradient(135deg, ${style.color}, ${style.color}dd)`,
                  color: 'white',
                  padding: '10px 28px',
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 15,
                  letterSpacing: '0.04em',
                  marginBottom: 12,
                  boxShadow: `0 4px 16px ${style.color}30`,
                }}>
                  {response}
                </div>
              </div>

              <p style={{
                color: '#aaa',
                fontSize: 11,
                marginBottom: 20,
                fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                animation: 'textSlideUp 0.5s ease 0.9s both',
              }}>
                Sheet: {sheet}
              </p>

              {/* Animated guide */}
              <div style={{ animation: 'textSlideUp 0.5s ease 1s both' }}>
                <AnimatedGuide targetRef={confirmBtnRef} />
              </div>

              {/* Confirm button with glow animation */}
              <button
                ref={confirmBtnRef}
                onClick={submitResponse}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '16px',
                  background: `linear-gradient(135deg, ${style.color}, ${style.color}cc)`,
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  boxShadow: `0 6px 24px ${style.color}35`,
                  letterSpacing: '0.02em',
                  animation: 'btnGlow 2s ease-in-out infinite, btnEntrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 1.1s both',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'
                  e.currentTarget.style.boxShadow = `0 10px 32px ${style.color}45`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)'
                  e.currentTarget.style.boxShadow = `0 6px 24px ${style.color}35`
                }}
              >
                {style.emoji} Click to Confirm Response
              </button>
            </>
          ) : (
            <>
              {/* Result state */}
              <div style={{
                animation: 'resultPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
              }}>
                <div style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  background: `${result.color}12`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  fontSize: 38,
                  border: `2px solid ${result.color}20`,
                }}>
                  {result.status === 'success' ? '✅' :
                   result.status === 'already' ? 'ℹ️' :
                   result.status === 'info' ? '📋' :
                   result.status === 'invalid' ? '⚠️' : '❌'}
                </div>
              </div>
              <h2 style={{
                color: result.color,
                fontSize: 22,
                marginBottom: 12,
                fontWeight: 700,
                animation: 'textSlideUp 0.5s ease 0.2s both',
              }}>
                {result.title}
              </h2>
              <p style={{
                color: '#555',
                fontSize: 14,
                lineHeight: 1.6,
                margin: 0,
                animation: 'textSlideUp 0.5s ease 0.35s both',
              }}>
                {result.message}
              </p>

              {result.status === 'success' && (
                <div style={{
                  marginTop: 20,
                  animation: 'textSlideUp 0.5s ease 0.5s both',
                }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    background: 'rgba(22,163,74,0.06)',
                    borderRadius: 8,
                    color: '#16a34a',
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Response confirmed successfully
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          background: '#faf8f5',
          padding: '14px 24px',
          textAlign: 'center',
          borderTop: '1px solid #e5e0d8',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}>
            <img
              src="/acg_logo_hq.ico"
              alt=""
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                objectFit: 'cover',
                opacity: 0.5,
              }}
            />
            <p style={{ color: '#b0a898', fontSize: 10, margin: 0, letterSpacing: '0.02em' }}>
              {isConfirm ? 'If you did not request this, you can safely close this page.' : 'You may close this window.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Inline Keyframe Animations ── */}
      <style>{`
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes headerShimmer {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
        @keyframes logoFloat {
          from { opacity: 0; transform: translateY(15px) scale(0.8); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes textSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes badgeEntrance {
          from { opacity: 0; transform: scale(0.5) rotate(-10deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes tagPop {
          from { opacity: 0; transform: scale(0.7); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes btnEntrance {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes btnGlow {
          0%, 100% { box-shadow: 0 6px 24px rgba(128,0,0,0.2); }
          50% { box-shadow: 0 8px 32px rgba(128,0,0,0.35), 0 0 0 4px rgba(128,0,0,0.08); }
        }
        @keyframes guideAppear {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounceDown {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
        @keyframes resultPop {
          from { opacity: 0; transform: scale(0.6); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
