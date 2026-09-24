import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Tooltip, Empty } from 'antd'
import {
  ArrowLeftOutlined, ThunderboltOutlined, UserOutlined,
  ClockCircleOutlined, DownOutlined, EyeOutlined,
  WarningOutlined, FileTextOutlined,
} from '@ant-design/icons'
import { motion, AnimatePresence } from 'framer-motion'
import { useSheetsStore, type ActionSheet } from '../store'
import dayjs from 'dayjs'

/* ── Status Pill ── */
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    'ACTION TAKEN': 'success', 'APPROVED': 'success', 'NOTED': 'info', 'COMPLETED': 'success',
    'PENDING': 'warning', 'DRAFT': 'draft-pulse', 'IN PROGRESS': 'accent',
    'REJECTED / RETURNED': 'danger', 'REVIEW REQUESTED': 'warning',
    'INFORMATIONAL ONLY': 'muted',
  }
  return <span className={`status-pill status-pill--${map[status] || 'muted'}`}>{status || 'UNKNOWN'}</span>
}

/* ── Severity Badge ── */
function SeverityBadge({ severity }: { severity?: string }) {
  const s = (severity || 'medium').toLowerCase()
  const label = s.charAt(0).toUpperCase() + s.slice(1)
  return (
    <span className={`severity-badge severity-badge--${s}`}>
      <WarningOutlined /> {label}
    </span>
  )
}

/* ── Animation Variants ── */
const EASE_STD = [0.25, 0.1, 0.25, 1] as const
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const

const pageVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, staggerChildren: 0.1 }
  },
}
const headerVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_STD } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.08, duration: 0.5, ease: EASE_SPRING }
  }),
  exit: { opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.3 } },
}
const detailVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { duration: 0.5, ease: EASE_STD } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.3 } },
}

/* ── Skeleton ── */
function ConflictsSkeleton() {
  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: 24 }}>
        <div className="skeleton" style={{ width: 280, height: 28 }} />
        <div className="skeleton skeleton-text w-short" style={{ marginTop: 8 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[1,2,3].map(i => <div key={i} className="skeleton skeleton-card" />)}
      </div>
      {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10, marginBottom: 10 }} />)}
    </div>
  )
}

/* ═══════════════════════════════════
   CONFLICTS VIEW — Main Component
   ═══════════════════════════════════ */
export default function ConflictsView() {
  const { sheets, isLoading, fetchSheets } = useSheetsStore()
  const navigate = useNavigate()
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [initialLoad, setInitialLoad] = useState(true)

  useEffect(() => {
    fetchSheets().finally(() => setInitialLoad(false))
  }, [fetchSheets])

  /* ── Get conflicted sheets ── */
  const conflictSheets = useMemo(() =>
    sheets.filter(s => s.hasConflict)
      .sort((a, b) => dayjs(b.createdDate).unix() - dayjs(a.createdDate).unix()),
    [sheets]
  )

  /* ── Summary stats ── */
  const stats = useMemo(() => {
    const total = conflictSheets.length
    const severities: Record<string, number> = {}
    conflictSheets.forEach(s => {
      const sev = (s.conflictSeverity || 'medium').toLowerCase()
      severities[sev] = (severities[sev] || 0) + 1
    })
    return { total, severities }
  }, [conflictSheets])

  /* ── Toggle card expansion ── */
  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* ── Get users involved ── */
  const getUsersInvolved = (sheet: ActionSheet) => {
    const users = new Set<string>()
    Object.keys(sheet.assignedTo || {}).forEach(u => users.add(u))
    Object.keys(sheet.responses || {}).forEach(u => users.add(u))
    return Array.from(users)
  }

  /* ── Get conflicting responses ── */
  const getConflictingResponses = (sheet: ActionSheet) => {
    const responses = sheet.responses || {}
    return Object.entries(responses).map(([email, response]) => ({ email, response }))
  }

  if (initialLoad && isLoading) return <ConflictsSkeleton />

  return (
    <motion.div className="page-container" variants={pageVariants} initial="hidden" animate="visible">
      {/* ── Header ── */}
      <motion.div className="page-header" variants={headerVariants}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}
              style={{ color: 'var(--text-muted)' }} />
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <motion.span
                animate={{ rotate: [0, -10, 10, -5, 0] }}
                transition={{ duration: 0.8, delay: 0.5 }}>
                <ThunderboltOutlined style={{ color: 'var(--danger)' }} />
              </motion.span>
              Conflict Resolution Center
            </h1>
          </div>
          <p className="page-subtitle" style={{ marginLeft: 42 }}>
            {stats.total} active conflict{stats.total !== 1 ? 's' : ''} requiring attention
          </p>
        </div>
      </motion.div>

      {/* ── Summary Cards ── */}
      <motion.div variants={headerVariants}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <motion.div className="stat-card" whileHover={{ y: -3, boxShadow: '0 6px 20px rgba(220,38,38,0.1)' }}>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.total}</div>
          <div className="stat-label">Total Conflicts</div>
        </motion.div>
        {Object.entries(stats.severities).map(([sev, count]) => (
          <motion.div key={sev} className="stat-card"
            whileHover={{ y: -3, boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="stat-value" style={{ color: sev === 'critical' ? '#dc2626' : sev === 'high' ? '#ea580c' : '#d97706' }}>
                  {count}
                </div>
                <div className="stat-label">{sev.charAt(0).toUpperCase() + sev.slice(1)} Severity</div>
              </div>
              <SeverityBadge severity={sev} />
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Conflict List ── */}
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
        ⚡ Conflicted Action Sheets
      </div>

      <AnimatePresence mode="popLayout">
        {conflictSheets.map((sheet, idx) => {
          const isExpanded = expandedCards.has(sheet.id)
          const users = getUsersInvolved(sheet)
          const responses = getConflictingResponses(sheet)
          const conflictLog = sheet.conflictLog || []
          const conflictThreads = sheet.conflictThreads || []

          return (
            <motion.div key={sheet.id}
              className={`conflict-card ${isExpanded ? 'expanded' : ''}`}
              variants={cardVariants} custom={idx} initial="hidden" animate="visible" exit="exit"
              layout>
              {/* Card Header */}
              <div className="conflict-card-header" onClick={() => toggleCard(sheet.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      rotate: isExpanded ? 180 : 0,
                    }}
                    transition={{ duration: 0.4, ease: EASE_SPRING as unknown as [number, number, number, number] }}>
                    <DownOutlined style={{ fontSize: 11, color: 'var(--danger)' }} />
                  </motion.div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sheet.title || sheet.id}
                      </span>
                      <SeverityBadge severity={sheet.conflictSeverity} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {sheet.id}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        <ClockCircleOutlined style={{ marginRight: 3 }} />
                        {dayjs(sheet.createdDate).format('DD MMM YYYY')}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* User avatars */}
                  <div style={{ display: 'flex' }}>
                    {users.slice(0, 4).map((email, ri) => (
                      <Tooltip key={email} title={email}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%',
                          background: ri % 2 === 0 ? '#dc2626' : '#ea580c',
                          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.62rem', fontWeight: 700, marginLeft: ri > 0 ? -8 : 0,
                          border: '2px solid white', position: 'relative', zIndex: 4 - ri,
                        }}>
                          {email[0]?.toUpperCase()}
                        </div>
                      </Tooltip>
                    ))}
                    {users.length > 4 && (
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', background: '#f0ebe4',
                        color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.58rem', fontWeight: 700, marginLeft: -8, border: '2px solid white',
                      }}>
                        +{users.length - 4}
                      </div>
                    )}
                  </div>
                  <StatusPill status={sheet.status} />
                </div>
              </div>

              {/* Expanded Detail Panel */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div variants={detailVariants} initial="hidden" animate="visible" exit="exit"
                    style={{ borderTop: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px' }}>
                      {/* Response Comparison */}
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 }}>
                        Response Comparison
                      </div>
                      {responses.length > 0 ? (
                        <div className="response-comparison" style={{ padding: 0, marginBottom: 16 }}>
                          {responses.map((r, ri) => {
                            const isPositive = ['ACTION TAKEN', 'APPROVED', 'NOTED', 'COMPLETED'].includes(r.response)
                            const isNegative = r.response.includes('REJECT')
                            return (
                              <motion.div key={r.email} className="response-card"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: ri * 0.08 }}
                                whileHover={{ scale: 1.02, borderColor: 'var(--accent)' }}
                                style={{
                                  borderLeft: `3px solid ${isPositive ? 'var(--success)' : isNegative ? 'var(--danger)' : 'var(--warning)'}`,
                                }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: isPositive ? 'var(--success)' : isNegative ? 'var(--danger)' : 'var(--warning)',
                                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.65rem', fontWeight: 700,
                                  }}>
                                    {r.email[0]?.toUpperCase()}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {r.email}
                                    </div>
                                  </div>
                                </div>
                                <div style={{
                                  fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 4,
                                  background: isPositive ? 'var(--success-muted)' : isNegative ? 'var(--danger-muted)' : 'var(--warning-muted)',
                                  color: isPositive ? 'var(--success)' : isNegative ? 'var(--danger)' : 'var(--warning)',
                                  textAlign: 'center',
                                }}>
                                  {r.response}
                                </div>
                              </motion.div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                          No responses recorded yet.
                        </div>
                      )}

                      {/* Conflict Log */}
                      {conflictLog.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 }}>
                            Conflict Timeline
                          </div>
                          {conflictLog.map((entry: any, ti: number) => (
                            <motion.div key={ti} className="timeline-item"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: ti * 0.06 }}>
                              <div className="timeline-dot" style={{ background: 'var(--danger)', boxShadow: '0 0 0 2px var(--danger)' }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{entry.description || entry.message || 'Conflict detected'}</span>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                    {entry.timestamp ? dayjs(entry.timestamp).format('DD MMM, HH:mm') : '—'}
                                  </span>
                                </div>
                                {entry.user && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                    <UserOutlined style={{ fontSize: 10, marginRight: 4 }} />{entry.user}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {/* Conflict Threads */}
                      {conflictThreads.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 }}>
                            Discussion Threads
                          </div>
                          {conflictThreads.map((thread: any, ti: number) => (
                            <motion.div key={ti}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: ti * 0.08 }}
                              style={{
                                padding: '10px 14px', background: 'var(--bg-primary)',
                                border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6,
                              }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{thread.user || 'System'}</span>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                  {thread.timestamp ? dayjs(thread.timestamp).format('DD MMM, HH:mm') : '—'}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {thread.message || thread.content || '—'}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {/* Action Button */}
                      <motion.div whileHover={{ scale: 1.01 }} style={{ display: 'flex', gap: 8 }}>
                        <Button type="primary" icon={<EyeOutlined />}
                          onClick={() => navigate(`/sheet/${sheet.id}`)}
                          style={{ fontWeight: 600 }}>
                          View Full Sheet
                        </Button>
                        <Button icon={<FileTextOutlined />}
                          onClick={() => navigate(`/sheet/${sheet.id}/edit`)}
                          style={{ fontWeight: 500 }}>
                          Edit Sheet
                        </Button>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {conflictSheets.length === 0 && !isLoading && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE_SPRING as unknown as [number, number, number, number] }}
          className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-title">No Conflicts</div>
          <div className="empty-state-desc">
            All action sheets are in harmony. No conflicts detected.
          </div>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
            Back to Dashboard
          </Button>
        </motion.div>
      )}
    </motion.div>
  )
}
