import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tooltip } from 'antd'
import {
  BarChartOutlined, FileTextOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ThunderboltOutlined,
  ArrowLeftOutlined, EditOutlined, ClearOutlined,
  LeftOutlined, RightOutlined,
} from '@ant-design/icons'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
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

/* ── Framer Motion variants ── */
const EASE_STD = [0.25, 0.1, 0.25, 1] as const
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const

const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_STD, staggerChildren: 0.08 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: EASE_SPRING } },
}
const chartVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.7, ease: EASE_STD } },
}

/* ── Pie Chart Colors ── */
/* Pie chart colors — MUST match status tag colors for consistency */
const STATUS_PIE_COLORS: Record<string, string> = {
  'COMPLETED': '#15803d',
  'IN_PROGRESS': '#7c3aed',
  'PENDING_REVIEW': '#d97706',
  'DRAFT': '#8a8a8a',
  'IN PROGRESS': '#7c3aed',
  'PENDING': '#d97706',
  'ACTION TAKEN': '#16a34a',
  'APPROVED': '#059669',
  'NOTED': '#2563eb',
  'REJECTED / RETURNED': '#dc2626',
  'REVIEW REQUESTED': '#ea580c',
  'INFORMATIONAL ONLY': '#6b7280',
  'UNKNOWN': '#8a8a8a',
}
const DEFAULT_PIE_COLOR = '#6b7280'

/* ── Status tag color & icon map ── */
const STATUS_TAG_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  'ACTION TAKEN':       { color: '#16a34a', icon: <CheckCircleOutlined /> },
  'APPROVED':           { color: '#059669', icon: <CheckCircleOutlined /> },
  'COMPLETED':          { color: '#15803d', icon: <CheckCircleOutlined /> },
  'NOTED':              { color: '#2563eb', icon: <FileTextOutlined /> },
  'PENDING':            { color: '#d97706', icon: <ClockCircleOutlined /> },
  'IN PROGRESS':        { color: '#7c3aed', icon: <ClockCircleOutlined /> },
  'DRAFT':              { color: '#8a8a8a', icon: <EditOutlined /> },
  'REJECTED / RETURNED': { color: '#dc2626', icon: <ThunderboltOutlined /> },
  'REVIEW REQUESTED':   { color: '#ea580c', icon: <ClockCircleOutlined /> },
  'INFORMATIONAL ONLY': { color: '#6b7280', icon: <FileTextOutlined /> },
}
const DEFAULT_TAG = { color: '#6b7280', icon: <FileTextOutlined /> }

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/* ── Skeleton ── */
function InsightsSkeleton() {
  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div><div className="skeleton" style={{ width: 240, height: 28 }} /><div className="skeleton skeleton-text w-short" style={{ marginTop: 8 }} /></div>
      </div>
      <div className="skeleton" style={{ height: 80, borderRadius: 16, marginBottom: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-card" />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="skeleton" style={{ height: 280, borderRadius: 10 }} />
        <div className="skeleton" style={{ height: 280, borderRadius: 10 }} />
      </div>
      {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8, marginBottom: 6 }} />)}
    </div>
  )
}

/* ═══════════════════════════════════
   MONTHLY INSIGHTS — Main Component
   ═══════════════════════════════════ */
export default function MonthlyInsights() {
  const { sheets, isLoading, fetchSheets } = useSheetsStore()
  const navigate = useNavigate()
  const [initialLoad, setInitialLoad] = useState(true)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Navigation state (NOT filters)
  const [selectedYear, setSelectedYear] = useState(dayjs().year())
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month()) // 0-indexed
  const [slideDirection, setSlideDirection] = useState(0) // -1 left, 1 right

  // Status filters (the ONLY real filters)
  const [activeStatus, setActiveStatus] = useState<string | null>(null)

  useEffect(() => {
    fetchSheets().finally(() => setInitialLoad(false))
  }, [fetchSheets])

  /* ── Years with actual data ── */
  const yearsWithData = useMemo(() => {
    const years = new Set<number>()
    sheets.forEach(s => { if (s.createdDate) years.add(dayjs(s.createdDate).year()) })
    return years
  }, [sheets])

  /* ── Full year range (earliest data year → current+1, minimum 5 years shown) ── */
  const allYears = useMemo(() => {
    const now = dayjs().year()
    const dataYears = Array.from(yearsWithData)
    const minYear = dataYears.length > 0 ? Math.min(...dataYears, now - 2) : now - 2
    const maxYear = Math.max(...dataYears, now) + 1
    const years: number[] = []
    for (let y = minYear; y <= maxYear; y++) years.push(y)
    return years
  }, [yearsWithData])

  /* ── Visible year window (max 7 at a time, scrollable) ── */
  const [yearOffset, setYearOffset] = useState(0)
  const VISIBLE_YEARS = 7
  const visibleYears = useMemo(() => {
    // Auto-center on selected year
    const idx = allYears.indexOf(selectedYear)
    const maxOffset = Math.max(0, allYears.length - VISIBLE_YEARS)
    let offset = Math.max(0, Math.min(idx - Math.floor(VISIBLE_YEARS / 2), maxOffset))
    return { years: allYears.slice(offset, offset + VISIBLE_YEARS), offset, maxOffset }
  }, [allYears, selectedYear])

  const canScrollYearsLeft = visibleYears.offset > 0
  const canScrollYearsRight = visibleYears.offset < visibleYears.maxOffset

  /* ── Navigate months ── */
  const navigateMonth = useCallback((direction: number) => {
    setSlideDirection(direction)
    setSelectedMonth(prev => {
      let newMonth = prev + direction
      if (newMonth > 11) {
        setSelectedYear(y => y + 1)
        return 0
      }
      if (newMonth < 0) {
        setSelectedYear(y => y - 1)
        return 11
      }
      return newMonth
    })
  }, [])

  const jumpToMonth = useCallback((monthIndex: number) => {
    setSlideDirection(monthIndex > selectedMonth ? 1 : -1)
    setSelectedMonth(monthIndex)
  }, [selectedMonth])

  const jumpToYear = useCallback((year: number) => {
    setSlideDirection(year > selectedYear ? 1 : -1)
    setSelectedYear(year)
  }, [selectedYear])

  const navigateYear = useCallback((direction: number) => {
    const idx = allYears.indexOf(selectedYear)
    const nextIdx = idx + direction
    if (nextIdx >= 0 && nextIdx < allYears.length) {
      setSlideDirection(direction)
      setSelectedYear(allYears[nextIdx])
    }
  }, [allYears, selectedYear])

  /* ── Toggle status filter (single select only) ── */
  const toggleStatus = useCallback((key: string) => {
    setActiveStatus(prev => prev === key ? null : key)
  }, [])

  const clearFilters = useCallback(() => setActiveStatus(null), [])

  /* ── Sheets for the selected month/year ── */
  const monthKey = useMemo(() =>
    `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`,
    [selectedYear, selectedMonth]
  )

  const monthSheets = useMemo(() =>
    sheets.filter(s => dayjs(s.createdDate).format('YYYY-MM') === monthKey)
      .sort((a, b) => dayjs(b.createdDate).unix() - dayjs(a.createdDate).unix()),
    [sheets, monthKey]
  )

  /* ── Dynamic status tags from actual sheet data ── */
  const statusTags = useMemo(() => {
    const counts = new Map<string, number>()
    monthSheets.forEach(s => {
      const tag = s.status || 'UNKNOWN'
      counts.set(tag, (counts.get(tag) || 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({
        tag,
        count,
        ...(STATUS_TAG_CONFIG[tag] || DEFAULT_TAG),
      }))
  }, [monthSheets])

  /* ── Apply status filters ── */
  const filteredSheets = useMemo(() => {
    if (!activeStatus) return monthSheets
    return monthSheets.filter(s => (s.status || 'UNKNOWN') === activeStatus)
  }, [monthSheets, activeStatus])

  /* ── Monthly chart data (last 12 months) ── */
  const monthlyChartData = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>()
    sheets.forEach(s => {
      const key = dayjs(s.createdDate).format('YYYY-MM')
      if (!map.has(key)) map.set(key, { total: 0, completed: 0 })
      const entry = map.get(key)!
      entry.total++
      if (s.workflowState === 'COMPLETED') entry.completed++
    })
    const now = dayjs()
    const result = []
    for (let i = 11; i >= 0; i--) {
      const m = now.subtract(i, 'month')
      const key = m.format('YYYY-MM')
      const found = map.get(key)
      result.push({ month: m.format('MMM'), total: found?.total || 0, completed: found?.completed || 0 })
    }
    return result
  }, [sheets])

  /* ── Pie chart data for selected month ── */
  const pieData = useMemo(() => {
    const counts: Record<string, number> = {}
    monthSheets.forEach(s => {
      const st = s.workflowState || 'UNKNOWN'
      counts[st] = (counts[st] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({
      name: name.replace(/_/g, ' '),
      value,
      color: STATUS_PIE_COLORS[name] || STATUS_PIE_COLORS[name.replace(/_/g, ' ')] || DEFAULT_PIE_COLOR,
    }))
  }, [monthSheets])

  /* ── Summary stats for selected month ── */
  const summary = useMemo(() => {
    const total = monthSheets.length
    let totalExpected = 0, totalReceived = 0
    monthSheets.forEach(s => {
      const expected = s.recipientCount ?? Object.keys(s.assignedTo || {}).length
      const received = s.responseCount ?? Object.keys(s.responses || {}).length
      totalExpected += expected
      totalReceived += received
    })
    const completionPct = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0
    return { total, completionPct }
  }, [monthSheets])

  /* ── Months that have data (for indicator dots) ── */
  const monthsWithData = useMemo(() => {
    const s = new Set<string>()
    sheets.forEach(sh => { if (sh.createdDate) s.add(dayjs(sh.createdDate).format('YYYY-MM')) })
    return s
  }, [sheets])

  /* ── Get respondents ── */
  const getRespondents = (sheet: ActionSheet) => Object.keys(sheet.responses || {})

  /* ── Slide animation variants ── */
  const contentSlide = {
    enter: (dir: number) => ({ x: dir * 60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir * -60, opacity: 0 }),
  }

  if (initialLoad && isLoading) return <InsightsSkeleton />

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
              <BarChartOutlined style={{ color: 'var(--accent)' }} />
              Monthly Insights
            </h1>
          </div>
          <p className="page-subtitle" style={{ marginLeft: 42 }}>
            Navigate through time · {sheets.length} action sheets tracked
          </p>
        </div>
      </motion.div>

      {/* ═══ COMPASS TIMELINE NAVIGATOR ═══ */}
      <motion.div className="compass-navigator" variants={cardVariants}>
        {/* Year Selector with arrows */}
        <div className="compass-year-track">
          <motion.button
            className="compass-year-arrow"
            onClick={() => navigateYear(-1)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{ opacity: allYears.indexOf(selectedYear) > 0 ? 1 : 0.3, pointerEvents: allYears.indexOf(selectedYear) > 0 ? 'auto' : 'none' }}
          >
            <LeftOutlined />
          </motion.button>

          <div className="compass-year-pills">
            {visibleYears.years.map(year => {
              const hasData = yearsWithData.has(year)
              return (
                <motion.button
                  key={year}
                  className={`compass-year-btn ${year === selectedYear ? 'active' : ''} ${!hasData ? 'disabled' : ''}`}
                  onClick={() => jumpToYear(year)}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {year}
                </motion.button>
              )
            })}
          </div>

          <motion.button
            className="compass-year-arrow"
            onClick={() => navigateYear(1)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{ opacity: allYears.indexOf(selectedYear) < allYears.length - 1 ? 1 : 0.3, pointerEvents: allYears.indexOf(selectedYear) < allYears.length - 1 ? 'auto' : 'none' }}
          >
            <RightOutlined />
          </motion.button>
        </div>

        {/* Month Timeline */}
        <div className="compass-month-row">
          <motion.button
            className="compass-arrow compass-arrow--left"
            onClick={() => navigateMonth(-1)}
            whileHover={{ scale: 1.15, x: -2 }}
            whileTap={{ scale: 0.9 }}
          >
            <LeftOutlined />
          </motion.button>

          <div className="compass-months-track" ref={timelineRef}>
            {MONTH_NAMES.map((name, idx) => {
              const key = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`
              const hasData = monthsWithData.has(key)
              const isActive = idx === selectedMonth
              const isNow = idx === dayjs().month() && selectedYear === dayjs().year()
              return (
                <motion.button
                  key={idx}
                  className={`compass-month-node ${isActive ? 'active' : ''} ${isNow ? 'current' : ''}`}
                  onClick={() => jumpToMonth(idx)}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  layout
                >
                  <div className="compass-month-label">{name}</div>
                  {isActive && (
                    <motion.div
                      className="compass-month-glow"
                      layoutId="monthGlow"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  {hasData && <div className="compass-month-dot" />}
                </motion.button>
              )
            })}
          </div>

          <motion.button
            className="compass-arrow compass-arrow--right"
            onClick={() => navigateMonth(1)}
            whileHover={{ scale: 1.15, x: 2 }}
            whileTap={{ scale: 0.9 }}
          >
            <RightOutlined />
          </motion.button>
        </div>

        {/* Active period display */}
        <AnimatePresence mode="wait" custom={slideDirection}>
          <motion.div
            key={monthKey}
            className="compass-active-label"
            custom={slideDirection}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <span className="compass-active-month">{MONTH_FULL[selectedMonth]}</span>
            <span className="compass-active-year">{selectedYear}</span>
            <span className="compass-active-count">{monthSheets.length} sheet{monthSheets.length !== 1 ? 's' : ''}</span>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* ═══ ANIMATED CONTENT AREA ═══ */}
      <AnimatePresence mode="wait" custom={slideDirection}>
        <motion.div
          key={monthKey}
          custom={slideDirection}
          variants={contentSlide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {/* ── Summary Cards ── */}
          <div className="compass-stats-row">
            {[
              { label: 'Total Sheets', value: summary.total, icon: <FileTextOutlined />, color: 'var(--accent)' },
              { label: 'Status Tags', value: statusTags.length, icon: <ThunderboltOutlined />, color: 'var(--warning)' },
              { label: 'Response Rate', value: `${summary.completionPct}%`, icon: <CheckCircleOutlined />, color: 'var(--success)' },
              { label: 'Filtered', value: filteredSheets.length, icon: <BarChartOutlined />, color: 'var(--info)' },
            ].map((s, i) => (
              <motion.div key={s.label} className="stat-card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: EASE_SPRING }}
                whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 16, color: s.color,
                    background: `${s.color}15`,
                  }}>{s.icon}</div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── Charts Row ── */}
          <motion.div variants={chartVariants}
            style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 28 }}>
            <motion.div className="chart-card" whileHover={{ y: -2 }}>
              <div className="chart-card-title">📊 Monthly Sheet Creation (Last 12 Months)</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" />
                  <XAxis dataKey="month" fontSize={11} stroke="#8a8a8a" />
                  <YAxis fontSize={11} stroke="#8a8a8a" allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e0d8', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                  <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} name="Total" />
                  <Bar dataKey="completed" fill="#16a34a" radius={[4, 4, 0, 0]} name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div className="chart-card" whileHover={{ y: -2 }}>
              <div className="chart-card-title">🍩 {MONTH_FULL[selectedMonth]} Status Distribution</div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      paddingAngle={3} dataKey="value" animationBegin={0} animationDuration={800}>
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e0d8' }} />
                    <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No data for {MONTH_FULL[selectedMonth]}
                </div>
              )}
            </motion.div>
          </motion.div>

          {/* ── Status Filter Chips (actual status tags) ── */}
          <div className="compass-filters">
            <div className="compass-filters-label">Filter by Status</div>
            <div className="compass-filters-row">
              {statusTags.map(st => {
                const isActive = activeStatus === st.tag
                return (
                  <motion.button key={st.tag}
                    className={`compass-filter-chip ${isActive ? 'active' : ''}`}
                    onClick={() => toggleStatus(st.tag)}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      '--chip-color': st.color,
                    } as React.CSSProperties}
                  >
                    <span className="compass-filter-icon">{st.icon}</span>
                    <span className="compass-filter-count">{st.count}</span>
                    <span>{st.tag}</span>
                  </motion.button>
                )
              })}
              {activeStatus !== null && (
                <motion.button
                  className="compass-filter-clear"
                  onClick={clearFilters}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <ClearOutlined /> Clear
                </motion.button>
              )}
            </div>
          </div>

          {/* ── Sheet List ── */}
          <div className="compass-sheet-list">
            <div className="compass-list-header">
              📅 {MONTH_FULL[selectedMonth]} {selectedYear}
              {activeStatus !== null && (
                <span> · Filtered</span>
              )}
              <span className="compass-list-count">{filteredSheets.length}</span>
            </div>

            <AnimatePresence mode="popLayout">
              {filteredSheets.map((sheet, si) => (
                <motion.div key={sheet.id}
                  className="sheet-entry"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ delay: Math.min(si * 0.03, 0.4), duration: 0.35 }}
                  whileHover={{ x: 6, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}
                  onClick={() => navigate(`/sheet/${sheet.id}`)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sheet.title || sheet.id}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{sheet.id}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {dayjs(sheet.createdDate).format('DD MMM YYYY, HH:mm')}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex' }}>
                      {getRespondents(sheet).slice(0, 3).map((email, ri) => (
                        <Tooltip key={email} title={email}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)',
                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.6rem', fontWeight: 700, marginLeft: ri > 0 ? -6 : 0,
                            border: '2px solid white', position: 'relative', zIndex: 3 - ri,
                          }}>
                            {email[0]?.toUpperCase()}
                          </div>
                        </Tooltip>
                      ))}
                      {getRespondents(sheet).length > 3 && (
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%', background: '#e5e0d8',
                          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.58rem', fontWeight: 700, marginLeft: -6, border: '2px solid white',
                        }}>
                          +{getRespondents(sheet).length - 3}
                        </div>
                      )}
                    </div>
                    <StatusPill status={sheet.status} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredSheets.length === 0 && !isLoading && (
              <motion.div className="empty-state" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-title">No sheets found</div>
                <div className="empty-state-desc">
                  {monthSheets.length === 0
                    ? `No action sheets in ${MONTH_FULL[selectedMonth]} ${selectedYear}.`
                    : 'No sheets match the active status filters.'}
                </div>
                {activeStatus !== null && (
                  <button className="compass-filter-clear" onClick={clearFilters} style={{ marginTop: 8 }}>
                    <ClearOutlined /> Clear Filters
                  </button>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
