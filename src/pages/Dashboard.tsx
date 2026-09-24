import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Input, Modal, message, Tooltip, Dropdown, Select } from 'antd'
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined,
  EyeOutlined, ExclamationCircleOutlined, ThunderboltOutlined,
  ClockCircleOutlined, CheckCircleOutlined,
  FileTextOutlined, EditOutlined, TeamOutlined, ProjectOutlined,
  SettingOutlined, PrinterOutlined,
  MoreOutlined, FilePdfOutlined, PaperClipOutlined, AppstoreOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useSheetsStore, useAuthStore, type ActionSheet } from '../store'
import { projectsApi, sheetsApi } from '../api/client'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { Search } = Input

interface Project {
  id: string
  name: string
  path?: string
  color?: string
}

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

/* ── Progress Ring ── */
function ProgressRing({ responded, total, size = 30 }: { responded: number; total: number; size?: number }) {
  const pct = total > 0 ? responded / total : 0
  const r = (size - 4) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct)
  const color = pct === 1 ? 'var(--success)' : pct > 0 ? 'var(--accent)' : '#ddd'
  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#eee" strokeWidth={3} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s var(--ease)' }} />
      </svg>
      <span className="progress-ring-text">{responded}</span>
    </div>
  )
}

/* ── Skeleton ── */
function DashboardSkeleton() {
  return (
    <div className="page-container fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:24 }}>
        <div><div className="skeleton" style={{ width:200, height:24 }} /><div className="skeleton skeleton-text w-short" style={{ marginTop:8 }} /></div>
        <div className="skeleton" style={{ width:140, height:40, borderRadius:6 }} />
      </div>
      <div className="responsive-grid-5" style={{ marginBottom:20 }}>
        {[1,2,3,4,5].map(i => <div key={i} className="skeleton skeleton-card" />)}
      </div>
      {[1,2,3,4,5].map(i => <div key={i} className="skeleton skeleton-row" />)}
    </div>
  )
}

/* ── MAIN DASHBOARD ── */
export default function Dashboard() {
  const { sheets, isLoading, fetchSheets, deleteSheet } = useSheetsStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [, setSearchTerm] = useState('')
  const [initialLoad, setInitialLoad] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  // Role checks
  const isExm = user?.role?.toLowerCase() === "ex.m's"
  const isViewer = user?.role?.toLowerCase() === 'viewer'
  const isReadOnly = isExm || isViewer

  // Email responses preview state
  const [responsesPreview, setResponsesPreview] = useState<{ sheetId: string; responses: Record<string, string>; responseHistory: any[] } | null>(null)

  const [projects, setProjects] = useState<Project[]>([])
  const [projectSelectModal, setProjectSelectModal] = useState(false)
  const [newProjectModal, setNewProjectModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  // Print state
  const [printModal, setPrintModal] = useState(false)
  const [printSelectedKeys, setPrintSelectedKeys] = useState<React.Key[]>([])

  const fetchProjects = useCallback(async () => {
    try {
      const res = await projectsApi.getAll()
      setProjects(res.data || [])
    } catch { /* silently fail */ }
  }, [])

  useEffect(() => {
    fetchSheets().finally(() => setInitialLoad(false))
    fetchProjects()
    const iv = setInterval(() => fetchSheets(), 30000)
    return () => clearInterval(iv)
  }, [fetchSheets, fetchProjects])

  const handleSearch = useCallback((v: string) => {
    setSearchTerm(v); fetchSheets(v || undefined)
  }, [fetchSheets])

  const handleDelete = (id: string, title: string) => {
    Modal.confirm({
      title: 'Delete Action Sheet',
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to delete "${title}"?`,
      okText: 'Delete', okType: 'danger',
      onOk: async () => {
        await deleteSheet(id, user?.email || 'unknown')
        message.success('Sheet deleted')
        // If we're on the sheet detail page, navigate back to dashboard
        if (window.location.pathname.includes(`/sheet/${id}`)) {
          navigate('/')
        }
      },
    })
  }

  // New Action Sheet — show project selection dialog
  const handleNewSheetClick = () => {
    if (projects.length > 0) {
      setProjectSelectModal(true)
    } else {
      navigate('/sheet/new')
    }
  }

  const handleProjectSelected = (projectId: string) => {
    setProjectSelectModal(false)
    navigate(`/sheet/new?project=${encodeURIComponent(projectId)}`)
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) { message.warning('Enter a project name'); return }
    try {
      await projectsApi.create({ name: newProjectName.trim() })
      message.success(`Project "${newProjectName}" created`)
      setNewProjectName('')
      setNewProjectModal(false)
      fetchProjects()
    } catch {
      message.error('Failed to create project')
    }
  }

  const stats = useMemo(() => ({
    total: sheets.length,
    drafts: sheets.filter(s => s.workflowState === 'DRAFT').length,
    inProgress: sheets.filter(s => ['IN_PROGRESS','PENDING_REVIEW'].includes(s.workflowState)).length,
    completed: sheets.filter(s => s.workflowState === 'COMPLETED').length,
    conflicts: sheets.filter(s => s.hasConflict).length,
  }), [sheets])

  /* Sort: DRAFT sheets first, then newest (most recent) on top */
  const sortedSheets = useMemo(() => {
    return [...sheets].sort((a, b) => {
      const aDraft = a.workflowState === 'DRAFT' || a.status === 'DRAFT'
      const bDraft = b.workflowState === 'DRAFT' || b.status === 'DRAFT'
      if (aDraft && !bDraft) return -1
      if (!aDraft && bDraft) return 1
      // Within same group: newest first (by createdDate desc)
      const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0
      const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0
      return dateB - dateA
    })
  }, [sheets])

  /* Apply stat card filter */
  const filteredSheets = useMemo(() => {
    if (!activeFilter) return sortedSheets
    switch (activeFilter) {
      case 'DRAFT': return sortedSheets.filter(s => s.workflowState === 'DRAFT')
      case 'ACTIVE': return sortedSheets.filter(s => ['IN_PROGRESS','PENDING_REVIEW'].includes(s.workflowState))
      case 'COMPLETED': return sortedSheets.filter(s => s.workflowState === 'COMPLETED')
      default: return sortedSheets
    }
  }, [sortedSheets, activeFilter])

  // Helper: Check if all recipients are info-only
  const isInformationalOnly = (sheet: ActionSheet) => {
    const types = sheet.recipientTypes || {}
    const typeValues = Object.values(types)
    return typeValues.length > 0 && typeValues.every(t => t === 'INFO')
  }

  // Helper: Get display status
  const getDisplayStatus = (sheet: ActionSheet) => {
    if (isInformationalOnly(sheet) && sheet.status !== 'DRAFT') {
      return 'INFORMATIONAL ONLY'
    }
    return sheet.status
  }

  // GM Status Change Handler
  const [statusChangeModal, setStatusChangeModal] = useState<{ sheetId: string; currentStatus: string } | null>(null)
  const [newStatus, setNewStatus] = useState('')

  const handleGMStatusChange = async () => {
    if (!statusChangeModal || !newStatus) return
    try {
      await sheetsApi.override(statusChangeModal.sheetId, {
        status: newStatus,
        gmEmail: user?.email || '',
        note: 'GM Status Override'
      })
      message.success('Status updated')
      setStatusChangeModal(null)
      setNewStatus('')
      fetchSheets()
    } catch {
      message.error('Failed to update status')
    }
  }

  const columns: ColumnsType<ActionSheet> = [
    {
      title: 'Sheet', key: 'sheet',
      render: (_, r) => (
        <div>
          <div style={{
            fontWeight: 500, marginBottom: 1,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.4',
          }}>{r.title || r.id}</div>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-muted)' }}>{r.id}</span>
        </div>
      ),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 200,
      filters: [
        { text:'Draft', value:'DRAFT' }, { text:'Pending', value:'PENDING' },
        { text:'Action Taken', value:'ACTION TAKEN' }, { text:'Approved', value:'APPROVED' },
        { text:'Informational Only', value:'INFORMATIONAL ONLY' },
      ],
      onFilter: (v, r) => getDisplayStatus(r) === v,
      render: (status: string, r) => {
        const displayStatus = getDisplayStatus(r)
        const isGM = user?.role?.toLowerCase() === 'gm' || user?.role?.toLowerCase() === 'general manager'
        const isDraftOrInfoOnly = r.status === 'DRAFT' || displayStatus === 'INFORMATIONAL ONLY'
        return (
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <StatusPill status={displayStatus} />
            {r.overriddenBy && <Tooltip title={`Locked by GM: ${r.overriddenBy}`}><span style={{cursor:'help'}}>🔒</span></Tooltip>}
            {isGM && !isDraftOrInfoOnly && (
              <Tooltip title="Change Status (GM)">
                <Button 
                  type="text" 
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    setStatusChangeModal({ sheetId: r.id, currentStatus: displayStatus })
                    setNewStatus(displayStatus)
                  }}
                  style={{ padding: '0 4px', height: 20, fontSize: 10 }}
                />
              </Tooltip>
            )}
          </div>
        )
      },
    },
    {
      title: 'Ref. No', key: 'refNo', width: 140,
      render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.formData?.refNo || '—'}</span>,
    },
    {
      title: 'Responses', key: 'responses', width: 90, align: 'center' as const,
      render: (_: unknown, r: ActionSheet) => {
        const total = r.recipientCount ?? Object.keys(r.assignedTo || {}).length
        const responded = r.responseCount ?? Object.keys(r.responses || {}).length
        return (
          <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center', cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              setResponsesPreview({
                sheetId: r.id,
                responses: r.responses || {},
                responseHistory: r.responseHistory || [],
              })
            }}
          >
            <ProgressRing responded={responded} total={total} />
            <span style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>/{total}</span>
          </div>
        )
      },
    },
    {
      title: 'Date Created', dataIndex: 'createdDate', key: 'createdDate', width: 130,
      sorter: (a, b) => dayjs(a.createdDate).unix() - dayjs(b.createdDate).unix(),
      render: (date: string) => {
        const d = dayjs(date)
        return (
          <Tooltip title={d.format('ddd, DD MMM YYYY HH:mm')}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {date ? d.format('DD MMM YYYY') : '—'}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '', key: 'actions', width: 200,
      render: (_: unknown, r: ActionSheet) => {
        const isDraft = r.workflowState === 'DRAFT' || r.status === 'DRAFT'
        return (
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            {isDraft && !isReadOnly ? (
              <Button size="small" icon={<EditOutlined />}
                style={{ background: '#fee2e2', borderColor: '#fee2e2', color: '#dc2626', fontWeight: 600, fontSize: '0.75rem' }}
                onClick={(e) => { e.stopPropagation(); navigate(`/sheet/${r.id}/edit`) }}>
                Edit Draft
              </Button>
            ) : (
              <Button size="small" icon={<FilePdfOutlined />}
                style={{ background: '#2563eb', borderColor: '#2563eb', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (r.pdfPath) {
                    sheetsApi.openPdf(r.pdfPath)
                  } else {
                    navigate(`/sheet/${r.id}`)
                  }
                }}>
                View PDF
              </Button>
            )}
            {/* File/Attachments preview button */}
            {r.pdfPath && (
              <Tooltip title="View attached file">
                <Button size="small" icon={<PaperClipOutlined />}
                  style={{ fontWeight: 600, fontSize: '0.75rem' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    sheetsApi.openPdf(r.pdfPath!)
                  }}
                />
              </Tooltip>
            )}
            <Dropdown menu={{ items: [
              { key:'view', icon:<EyeOutlined />, label:'View Details', onClick:() => navigate(`/sheet/${r.id}`) },
              ...(!isReadOnly ? [{ key:'edit', icon:<EditOutlined />, label:'Edit', onClick:() => navigate(`/sheet/${r.id}/edit`) }] : []),
              ...(r.pdfPath ? [{ key:'pdf', icon:<FilePdfOutlined />, label:'Open PDF', onClick:() => sheetsApi.openPdf(r.pdfPath!) }] : []),
              ...(!isReadOnly ? [{ type:'divider' as const }, { key:'delete', icon:<DeleteOutlined />, label:'Delete', danger:true, onClick:() => handleDelete(r.id, r.title) }] : []),
            ]}} trigger={['click']}>
              <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
            </Dropdown>
          </div>
        )
      },
    },
  ]

  if (initialLoad && isLoading) return <DashboardSkeleton />

  return (
    <div className="page-container fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Action Sheets</h1>
          <p className="page-subtitle">
            {stats.total} total · {stats.inProgress} active
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button icon={<PrinterOutlined />} size="large" onClick={() => setPrintModal(true)}
            style={{ height: 40, fontWeight: 500 }}>
            Print
          </Button>
          {!isReadOnly && (
            <Button type="primary" icon={<PlusOutlined />} size="large"
              onClick={handleNewSheetClick}
              style={{ height: 40, paddingInline: 20, fontWeight: 600 }}>
              New Action Sheet
            </Button>
          )}
        </div>
      </div>

      {/* ── Admin Panel (Admin Only) ── */}
      {user?.role?.toLowerCase() === 'admin' && (
        <div className="admin-panel">
          <div className="admin-panel-title">⚙ Administration</div>
          <div className="admin-btn-group">
            <Button icon={<TeamOutlined />} onClick={() => navigate('/employees')}>Manage Users & Employees</Button>
            <Button icon={<ProjectOutlined />} onClick={() => navigate('/projects')}>Manage Projects</Button>
            <Button icon={<SettingOutlined />} onClick={() => navigate('/settings')}>Settings & Config</Button>
          </div>
        </div>
      )}

      {/* ── Stat Cards (Visible to ALL users) — ALL clickable ── */}
      <div className="stagger responsive-grid-5" style={{ marginBottom:20 }}>
        {[
          { label:'Total', value:stats.total, icon:<FileTextOutlined />, color:'var(--accent)', filterKey: null },
          { label:'Drafts', value:stats.drafts, icon:<EditOutlined />, color:'var(--warning)', filterKey: 'DRAFT' },
          { label:'Active', value:stats.inProgress, icon:<ClockCircleOutlined />, color:'var(--info)', filterKey: 'ACTIVE' },
          { label:'Completed', value:stats.completed, icon:<CheckCircleOutlined />, color:'var(--success)', filterKey: 'COMPLETED' },
          { label:'Conflicts', value:stats.conflicts, icon:<ThunderboltOutlined />, color:'var(--danger)', filterKey: 'CONFLICTS' },
        ].map(s => (
          <div className={`stat-card fade-in-up stat-card--clickable ${activeFilter === s.filterKey || (s.filterKey === null && !activeFilter) ? 'stat-card--active' : ''}`} key={s.label}
            onClick={() => s.filterKey === 'CONFLICTS' ? navigate('/conflicts') : setActiveFilter(prev => prev === s.filterKey ? null : s.filterKey)}
            style={activeFilter === s.filterKey ? { borderColor: s.color === 'var(--accent)' ? '#2563eb' : s.color === 'var(--warning)' ? '#d97706' : s.color === 'var(--info)' ? '#2563eb' : s.color === 'var(--success)' ? '#16a34a' : '#dc2626', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' } : undefined}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
              <div style={{ width:32, height:32, borderRadius:6, display:'flex',
                alignItems:'center', justifyContent:'center', fontSize:14, color:s.color,
                background: s.color === 'var(--accent)' ? 'var(--accent-muted)' :
                  s.color === 'var(--warning)' ? 'var(--warning-muted)' :
                  s.color === 'var(--info)' ? 'var(--info-muted)' :
                  s.color === 'var(--success)' ? 'var(--success-muted)' : 'var(--danger-muted)' }}>
                {s.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Active filter indicator */}
      {activeFilter && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, animation: 'fadeIn 0.25s ease both' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>Showing:</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-muted)', padding: '3px 10px', borderRadius: 5 }}>
            {activeFilter === 'DRAFT' ? 'Drafts' : activeFilter === 'ACTIVE' ? 'Active' : 'Completed'}
          </span>
          <button onClick={() => setActiveFilter(null)} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 5,
            padding: '2px 8px', fontSize: '0.72rem', color: 'var(--text-muted)',
            cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s',
          }}>✕ Clear</button>
        </div>
      )}

      {/* Search Bar */}
      <div className="action-bar">
        <Search placeholder="Search sheets..." allowClear enterButton={<SearchOutlined />}
          size="large" style={{ maxWidth:380 }} onSearch={handleSearch}
          onChange={e => !e.target.value && handleSearch('')} />
        <Button icon={<ReloadOutlined />} size="large" onClick={() => fetchSheets()} loading={isLoading}>Refresh</Button>
      </div>

      {/* Table */}
      <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
        {sheets.length === 0 && !isLoading ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No action sheets yet</div>
            <div className="empty-state-desc">Create your first action sheet to start tracking tasks and collecting responses.</div>
            {!isReadOnly && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleNewSheetClick} style={{ height:38, paddingInline:20 }}>
                Create Action Sheet
              </Button>
            )}
          </div>
        ) : (
          <Table columns={columns} dataSource={filteredSheets} rowKey="id" loading={isLoading}
            pagination={{ pageSize:20, showSizeChanger:true, showTotal: t => <span style={{color:'var(--text-muted)'}}>{t} sheets</span> }}
            size="middle"
            onRow={r => ({
              onClick: () => {
                if (isReadOnly) {
                  // Viewer / EX.M's role can only view non-draft sheets
                  const isDraftRow = r.workflowState === 'DRAFT' || r.status === 'DRAFT'
                  if (isViewer && isDraftRow) return // Viewers cannot open drafts at all
                  navigate(`/sheet/${r.id}`)
                  return
                }
                const isDraft = r.workflowState === 'DRAFT' || r.status === 'DRAFT'
                navigate(isDraft ? `/sheet/${r.id}/edit` : `/sheet/${r.id}`)
              },
              style: { cursor: 'pointer' },
            })} />
        )}
      </div>

      {/* ═══ Project Selection Modal ═══ */}
      <Modal
        title={<><AppstoreOutlined /> Select Project</>}
        open={projectSelectModal}
        onCancel={() => setProjectSelectModal(false)}
        footer={[
          <Button key="none" onClick={() => { setProjectSelectModal(false); navigate('/sheet/new') }}>
            No Project (General)
          </Button>,
          <Button key="cancel" onClick={() => setProjectSelectModal(false)}>
            Cancel
          </Button>,
        ]}
        width={500}
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: '0.85rem' }}>
          Assign this Action Sheet to a project. Select a project below or proceed without one.
        </p>
        <div style={{ maxHeight: 350, overflow: 'auto' }}>
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => handleProjectSelected(p.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 8, marginBottom: 6,
                border: '1px solid var(--border)', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5f0ea'; e.currentTarget.style.borderColor = '#2563eb' }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: p.color || 'linear-gradient(135deg, #2563eb, #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 14,
              }}>
                {p.name[0]?.toUpperCase() || 'P'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {p.id}
                </div>
              </div>
              <ProjectOutlined style={{ color: '#888', fontSize: 16 }} />
            </div>
          ))}
          {projects.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              No projects created yet. Create one below or proceed without.
            </div>
          )}
        </div>
        <Button
          type="dashed" block style={{ marginTop: 12 }}
          icon={<PlusOutlined />}
          onClick={() => { setProjectSelectModal(false); setNewProjectModal(true) }}
        >
          Create New Project
        </Button>
      </Modal>

      {/* Create Project Modal */}
      <Modal
        title="Create New Project"
        open={newProjectModal}
        onOk={handleCreateProject}
        onCancel={() => { setNewProjectModal(false); setNewProjectName('') }}
        okText="Create"
      >
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 600 }}>
            Project Name
          </label>
          <Input
            size="large"
            placeholder="e.g. Mercedes Workshop, KDC Tower..."
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onPressEnter={handleCreateProject}
            autoFocus
          />
        </div>
      </Modal>

      {/* ── Print Modal ── */}
      <Modal
        title={<><PrinterOutlined /> Print Action Sheets</>}
        open={printModal}
        onCancel={() => { setPrintModal(false); setPrintSelectedKeys([]) }}
        width={800}
        okText={`Print ${printSelectedKeys.length} Sheet(s)`}
        okButtonProps={{ disabled: printSelectedKeys.length === 0, icon: <PrinterOutlined /> }}
        onOk={() => {
          if (printSelectedKeys.length === 0) return
          const printUrl = `${window.location.origin}/print?ids=${printSelectedKeys.join(',')}&mode=print`
          window.open(printUrl, '_blank')
          setPrintModal(false)
          setPrintSelectedKeys([])
        }}
      >
        <div style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
          Select the active or completed action sheets you wish to print. They will be opened in a new tab formatted for printing.
        </div>
        <Table
          rowSelection={{
            selectedRowKeys: printSelectedKeys,
            onChange: (keys) => setPrintSelectedKeys(keys),
          }}
          columns={[
            { title: 'Ref No', key: 'refNo', width: 140, render: (_, r: any) => r.formData?.refNo || '—' },
            { title: 'Action Sheet', dataIndex: 'title', key: 'title', ellipsis: true },
            { title: 'Status', dataIndex: 'status', key: 'status', width: 160 },
          ]}
          dataSource={sheets.filter(s => s.workflowState !== 'DRAFT').sort((a, b) => {
            const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0
            const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0
            return dateB - dateA
          })}
          rowKey="id"
          size="small"
          scroll={{ y: 400 }}
          pagination={false}
        />
      </Modal>

      {/* ── GM Status Change Modal ── */}
      <Modal
        title="Change Status (GM Override)"
        open={!!statusChangeModal}
        onCancel={() => {
          setStatusChangeModal(null)
          setNewStatus('')
        }}
        onOk={handleGMStatusChange}
        okText="Update Status"
        okButtonProps={{ danger: true }}
      >
        <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
          Change the status of this action sheet. This will override the current status.
        </p>
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>New Status</label>
          <Select
            value={newStatus}
            onChange={setNewStatus}
            style={{ width: '100%' }}
            options={[
              { value: 'PENDING', label: 'PENDING' },
              { value: 'ACTION TAKEN', label: 'ACTION TAKEN' },
              { value: 'APPROVED', label: 'APPROVED' },
              { value: 'REJECTED / RETURNED', label: 'REJECTED / RETURNED' },
              { value: 'NOTED', label: 'NOTED' },
              { value: 'IN PROGRESS', label: 'IN PROGRESS' },
              { value: 'COMPLETED', label: 'COMPLETED' },
              { value: 'INFORMATIONAL ONLY', label: 'INFORMATIONAL ONLY' },
            ]}
          />
        </div>
      </Modal>

      {/* ── Email Responses Preview Modal ── */}
      <Modal
        title={<><HistoryOutlined /> Email Responses — {responsesPreview?.sheetId}</>}
        open={!!responsesPreview}
        onCancel={() => setResponsesPreview(null)}
        footer={null}
        width={520}
      >
        {responsesPreview && (() => {
          const entries = Object.entries(responsesPreview.responses)
          const history = responsesPreview.responseHistory || []
          return (
            <div>
              {/* Quick summary */}
              {entries.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Recorded Responses ({entries.length})
                  </div>
                  {entries.map(([email, response]) => {
                    const isPositive = ['ACTION TAKEN', 'APPROVED', 'NOTED', 'ACKNOWLEDGED', 'COMPLETED'].includes(response)
                    const isNegative = response.includes('REJECT')
                    return (
                      <div key={email} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', marginBottom: 4,
                        background: isPositive ? 'rgba(16,185,129,0.06)' : isNegative ? 'rgba(239,68,68,0.06)' : '#f9fafb',
                        borderRadius: 6, border: '1px solid #f0f0f0',
                      }}>
                        <span style={{ fontSize: '0.82rem', color: '#333' }}>{email}</span>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          color: isPositive ? '#10b981' : isNegative ? '#ef4444' : '#3b82f6',
                          background: isPositive ? 'rgba(16,185,129,0.12)' : isNegative ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
                        }}>
                          {response}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
                  <ClockCircleOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
                  No email responses recorded yet
                </div>
              )}

              {/* Response history timeline */}
              {history.length > 0 && (
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 8 }}>
                  <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Response Timeline
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {history.map((entry: any, i: number) => (
                      <div key={i} style={{
                        padding: '6px 10px', marginBottom: 4,
                        background: '#fafafa', borderRadius: 4, borderLeft: '3px solid #2563eb',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#333' }}>{entry.response}</span>
                          <span style={{ fontSize: '0.68rem', color: '#999' }}>
                            {entry.timestamp ? dayjs(entry.timestamp).format('DD MMM, HH:mm') : '—'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#666' }}>{entry.email}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
