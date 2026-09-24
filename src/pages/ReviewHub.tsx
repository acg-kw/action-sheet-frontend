import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, Select, Input, message, Tooltip, Spin } from 'antd'
import {
  ArrowLeftOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  FilePdfOutlined,
} from '@ant-design/icons'
import { motion, AnimatePresence } from 'framer-motion'
import { reviewHubApi, sheetsApi } from '../api/client'
import type { ActionSheet } from '../store'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { TextArea } = Input

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

/* ── Framer Motion ── */
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const

const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number], staggerChildren: 0.08 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: EASE_SPRING } },
}

/* ── MAIN COMPONENT ── */
export default function ReviewHub() {
  const navigate = useNavigate()
  const [sheets, setSheets] = useState<ActionSheet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [markModal, setMarkModal] = useState<{ sheetId: string; title: string } | null>(null)
  const [markStatus, setMarkStatus] = useState('ACTION TAKEN')
  const [markNote, setMarkNote] = useState('')
  const [marking, setMarking] = useState(false)

  const fetchEscalated = useCallback(async () => {
    try {
      const res = await reviewHubApi.getEscalatedSheets()
      setSheets(res.data || [])
    } catch (e) {
      console.error('Failed to fetch escalated sheets', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEscalated()
    const iv = setInterval(fetchEscalated, 60000) // Refresh every 60s
    return () => clearInterval(iv)
  }, [fetchEscalated])

  const handleMarkStatus = async () => {
    if (!markModal) return
    setMarking(true)
    try {
      await reviewHubApi.markStatus(markModal.sheetId, markStatus, markNote)
      message.success(`Sheet marked as "${markStatus}"`)
      setMarkModal(null)
      setMarkStatus('ACTION TAKEN')
      setMarkNote('')
      fetchEscalated() // Refresh list
    } catch {
      message.error('Failed to update status')
    } finally {
      setMarking(false)
    }
  }

  // Stats
  const stats = useMemo(() => {
    const pending = sheets.filter(s => s.status === 'PENDING').length
    const inProgress = sheets.filter(s => s.status === 'IN PROGRESS').length
    const total = sheets.length
    const avgDays = total > 0
      ? Math.round(sheets.reduce((sum, s) => {
          const sent = s.sentDate || s.createdDate
          return sum + dayjs().diff(dayjs(sent), 'day')
        }, 0) / total)
      : 0
    return { pending, inProgress, total, avgDays }
  }, [sheets])

  // Sort: oldest first (most overdue at top)
  const sortedSheets = useMemo(() =>
    [...sheets].sort((a, b) => {
      const dateA = a.sentDate || a.createdDate
      const dateB = b.sentDate || b.createdDate
      return dayjs(dateA).unix() - dayjs(dateB).unix()
    }),
    [sheets]
  )

  if (isLoading) {
    return (
      <div className="page-container fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <motion.div className="page-container" variants={pageVariants} initial="hidden" animate="visible">
      {/* ── Header ── */}
      <motion.div className="page-header" variants={cardVariants} style={{ marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="compass-back-btn" onClick={() => navigate(-1)}>
              <ArrowLeftOutlined />
            </button>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertOutlined style={{ color: '#d97706' }} />
              GM Review Hub
            </h1>
          </div>
          <p className="page-subtitle" style={{ marginLeft: 42 }}>
            Action sheets pending resolution for 10+ days · Escalated for management review
          </p>
        </div>
        <Button icon={<ReloadOutlined />} size="large" onClick={fetchEscalated} loading={isLoading}
          style={{ height: 40, fontWeight: 500 }}>
          Refresh
        </Button>
      </motion.div>

      {/* ── Stat Cards ── */}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Escalated', value: stats.total, icon: <AlertOutlined />, color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
          { label: 'Pending', value: stats.pending, icon: <ClockCircleOutlined />, color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
          { label: 'In Progress', value: stats.inProgress, icon: <ThunderboltOutlined />, color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
          { label: 'Avg. Days Overdue', value: stats.avgDays, icon: <FileTextOutlined />, color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
        ].map((s, i) => (
          <motion.div key={s.label} className="stat-card review-hub-stat"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: EASE_SPRING }}
            whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
              <div style={{
                width: 36, height: 36, borderRadius: 8, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 16,
                color: s.color, background: s.bg,
              }}>{s.icon}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Sheet List ── */}
      <motion.div variants={cardVariants}>
        <div className="review-hub-list">
          <div className="review-hub-list-header">
            <AlertOutlined style={{ color: '#d97706' }} />
            <span>Escalated Action Sheets</span>
            <span className="review-hub-list-count">{sheets.length}</span>
          </div>

          <AnimatePresence mode="popLayout">
            {sortedSheets.map((sheet, si) => {
              const sentDate = sheet.sentDate || sheet.createdDate
              const daysAgo = dayjs().diff(dayjs(sentDate), 'day')
              const refNo = (sheet.formData as any)?.refNo || ''
              const from = (sheet.formData as any)?.from || ''
              const urgency = daysAgo >= 20 ? 'critical' : daysAgo >= 14 ? 'high' : 'medium'

              return (
                <motion.div key={sheet.id}
                  className={`review-hub-sheet-row review-hub-urgency--${urgency}`}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16, height: 0, marginBottom: 0 }}
                  transition={{ delay: Math.min(si * 0.04, 0.5), duration: 0.35 }}
                  layout>
                  {/* Left: Days indicator */}
                  <div className="review-hub-days-badge" data-urgency={urgency}>
                    <div className="review-hub-days-num">{daysAgo}</div>
                    <div className="review-hub-days-label">days</div>
                  </div>

                  {/* Middle: Sheet info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sheet.title || sheet.id}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {sheet.id}
                      </span>
                      {refNo && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 3 }}>
                          Ref: {refNo}
                        </span>
                      )}
                      {from && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          From: {from}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <StatusPill status={sheet.status} />
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Sent {dayjs(sentDate).format('DD MMM YYYY')} · {dayjs(sentDate).fromNow()}
                      </span>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <Tooltip title="Mark as Action Taken">
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 600, fontSize: '0.75rem' }}
                        onClick={() => setMarkModal({ sheetId: sheet.id, title: sheet.title })}
                      >
                        Update Status
                      </Button>
                    </Tooltip>
                    {sheet.pdfPath && (
                      <Tooltip title="View PDF">
                        <Button size="small" icon={<FilePdfOutlined />}
                          style={{ background: '#2563eb', borderColor: '#2563eb', color: 'white' }}
                          onClick={() => sheetsApi.openPdf(sheet.pdfPath!)} />
                      </Tooltip>
                    )}
                    <Tooltip title="View Details">
                      <Button size="small" icon={<EyeOutlined />}
                        onClick={() => navigate(`/sheet/${sheet.id}`)} />
                    </Tooltip>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Empty State */}
          {sortedSheets.length === 0 && !isLoading && (
            <motion.div className="empty-state"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}>
              <div className="empty-state-icon" style={{ background: 'rgba(22,163,74,0.08)' }}>✅</div>
              <div className="empty-state-title">All Caught Up!</div>
              <div className="empty-state-desc">
                No action sheets are currently escalated. All sheets have been responded to within the expected timeframe.
              </div>
              <Button type="primary" onClick={() => navigate('/')} style={{ marginTop: 8 }}>
                Back to Dashboard
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* ── Mark Status Modal ── */}
      <Modal
        title={<><EditOutlined /> Update Sheet Status</>}
        open={!!markModal}
        onCancel={() => { setMarkModal(null); setMarkStatus('ACTION TAKEN'); setMarkNote('') }}
        onOk={handleMarkStatus}
        okText="Update Status"
        okButtonProps={{ loading: marking, style: { background: '#16a34a', borderColor: '#16a34a' } }}
        width={480}
      >
        {markModal && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: '0.85rem' }}>
              Update the status of <strong>"{markModal.title}"</strong>. If the action has been taken,
              the sheet will be automatically removed from the review hub.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                New Status
              </label>
              <Select
                value={markStatus}
                onChange={setMarkStatus}
                style={{ width: '100%' }}
                options={[
                  { value: 'ACTION TAKEN', label: '✅ ACTION TAKEN' },
                  { value: 'COMPLETED', label: '✓ COMPLETED' },
                  { value: 'APPROVED', label: '👍 APPROVED' },
                  { value: 'IN PROGRESS', label: '🔄 IN PROGRESS (still working)' },
                  { value: 'NOTED', label: '📋 NOTED' },
                  { value: 'NEEDS REVIEW', label: '🔍 NEEDS REVIEW' },
                  { value: 'REJECTED / RETURNED', label: '❌ REJECTED / RETURNED' },
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                Note (optional)
              </label>
              <TextArea
                rows={3}
                value={markNote}
                onChange={e => setMarkNote(e.target.value)}
                placeholder="Add a note for this status update..."
              />
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  )
}
