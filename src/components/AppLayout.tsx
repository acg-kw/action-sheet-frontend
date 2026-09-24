import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Button, Dropdown, Modal, Input, message, Badge } from 'antd'
import {
  PlusOutlined,
  DashboardOutlined,
  LogoutOutlined,
  UserOutlined,
  TeamOutlined,
  ProjectOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FolderOpenOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  DeleteOutlined,
  BarChartOutlined,
  AlertOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store'
import { projectsApi, reviewHubApi } from '../api/client'
import MaintenanceBanner from './MaintenanceBanner'

const { Sider, Content, Header } = Layout

interface Project {
  id: string
  name: string
  path?: string
  color?: string
}

// Breakpoints
const TABLET_BP = 1024
const MOBILE_BP = 768

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  // Projects state
  const [projects, setProjects] = useState<Project[]>([])

  const [newProjectModal, setNewProjectModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  // Project selection dialog (for New Sheet)
  const [projectSelectModal, setProjectSelectModal] = useState(false)

  // Responsive detection
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth
      const mobile = w <= MOBILE_BP
      const tablet = w <= TABLET_BP && w > MOBILE_BP
      setIsMobile(mobile)
      setIsTablet(tablet)
      if (mobile) {
        setCollapsed(true)
        setMobileOpen(false)
      } else if (tablet) {
        setCollapsed(true)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close mobile drawer on navigation
  useEffect(() => {
    if (isMobile) setMobileOpen(false)
  }, [location.pathname, isMobile])

  const fetchProjects = useCallback(async () => {
    try {
      const res = await projectsApi.getAll()
      console.log('[DEBUG] fetchProjects response:', res.status, JSON.stringify(res.data))
      setProjects(res.data || [])
    } catch (e: unknown) {
      console.error('[DEBUG] fetchProjects FAILED:', e)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // ── Escalated sheets count (for sidebar badge) ──
  const [escalatedCount, setEscalatedCount] = useState(0)
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await reviewHubApi.getEscalatedCount()
        setEscalatedCount(res.data?.count || 0)
      } catch { /* silently fail */ }
    }
    fetchCount()
    const iv = setInterval(fetchCount, 60000)
    return () => clearInterval(iv)
  }, [])

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


  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const isExm = user?.role?.toLowerCase() === "ex.m's"
  const isViewer = user?.role?.toLowerCase() === 'viewer'
  const isReadOnly = isExm || isViewer

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    ...(!isReadOnly ? [{
      key: 'new-sheet-trigger',
      icon: <PlusOutlined />,
      label: 'New Sheet',
    }] : []),
    { key: '/repository', icon: <FolderOpenOutlined />, label: 'Repository' },
    { key: '/insights', icon: <BarChartOutlined />, label: 'Monthly Insights' },
    { key: '/review-hub', icon: <AlertOutlined />, label: (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        GM Review Hub
        {escalatedCount > 0 && (
          <Badge count={escalatedCount} size="small" style={{ backgroundColor: '#d97706', boxShadow: '0 0 0 2px var(--bg-primary)' }} />
        )}
      </span>
    ) },
    // Projects dropdown in sidebar — shows all projects inline
    {
      key: 'projects-sub',
      icon: <ProjectOutlined />,
      label: `Projects (${projects.length})`,
      children: [
        ...projects.map(p => ({
          key: `/projects/${encodeURIComponent(p.id)}`,
          icon: <AppstoreOutlined />,
          label: p.name,
        })),
        ...(projects.length === 0 ? [{
          key: 'no-projects',
          label: 'No projects yet',
          disabled: true,
        }] : []),
        ...(!isReadOnly ? [{ type: 'divider' as const }, {
          key: 'create-project-trigger',
          icon: <PlusOutlined />,
          label: 'Create Project',
        }] : []),
      ],
    },
    // Settings — admin only
    ...(isAdmin ? [{ key: '/settings', icon: <SettingOutlined />, label: 'Settings' }] : []),
    ...(isAdmin ? [
      { type: 'divider' as const },
      { key: '/employees', icon: <TeamOutlined />, label: 'Manage Users' },
      { key: '/admin/trash', icon: <DeleteOutlined />, label: 'Trash' },
      { key: '/admin/draft-recovery', icon: <FileTextOutlined />, label: 'Draft Recovery' },
    ] : []),
  ]

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: `${user?.name || 'User'} (${user?.role || ''})`,
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      danger: true,
      onClick: () => { logout(); navigate('/login') },
    },
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'new-sheet-trigger') {
      handleNewSheetClick()
      return
    }
    if (key === 'projects-sub' || key === 'no-projects') {
      return // parent items, no navigation
    }
    if (key === 'create-project-trigger') {
      setNewProjectModal(true)
      return
    }
    if (key.startsWith('/projects/')) {
      // Navigate to project page with pre-selected project
      navigate(key)
      return
    }
    navigate(key)
  }

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen)
    } else {
      setCollapsed(!collapsed)
    }
  }

  // Compute sidebar metrics
  const sidebarWidth = isMobile ? 220 : (collapsed ? 64 : 220)
  const contentMarginLeft = isMobile ? 0 : (collapsed ? 64 : 220)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Mobile overlay backdrop */}
      {isMobile && mobileOpen && (
        <div
          className="mobile-sidebar-overlay visible"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sider
        collapsible
        collapsed={isMobile ? false : collapsed}
        onCollapse={setCollapsed}
        width={220}
        collapsedWidth={isMobile ? 0 : 64}
        trigger={null}
        style={{
          background: '#ffffff',
          borderRight: '1px solid var(--border)',
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: isMobile ? (mobileOpen ? 0 : -220) : 0,
          top: 0,
          bottom: 0,
          zIndex: isMobile ? 20 : 10,
          transition: 'left 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
          boxShadow: isMobile && mobileOpen ? '4px 0 20px rgba(0,0,0,0.15)' : 'none',
        }}
      >
        {/* Logo Area */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: (isMobile || !collapsed) ? 'flex-start' : 'center',
            padding: (isMobile || !collapsed) ? '0 16px' : '0',
            borderBottom: '1px solid var(--border)',
            gap: 10,
          }}
        >
          <img
            src="/acg_logo.jpg"
            alt="ACG"
            style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4 }}
          />
          {(isMobile || !collapsed) && (
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#800000',
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
            }}>
              Action Sheets
            </span>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ background: 'transparent', border: 'none', marginTop: 4 }}
        />
      </Sider>

      <Layout style={{ marginLeft: contentMarginLeft, transition: 'margin-left 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)' }}>
        {/* Premium Header */}
        <Header
          style={{
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            padding: isMobile ? '0 12px' : '0 24px',
            height: 60,
            lineHeight: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 9,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Button
              type="text"
              icon={collapsed && !isMobile ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSidebar}
              style={{ color: '#111827', fontSize: 16 }}
            />
            {!isMobile && (
              <Button
                type={location.pathname === '/' ? 'primary' : 'text'}
                icon={<DashboardOutlined />}
                onClick={() => navigate('/')}
                style={{
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  color: location.pathname === '/' ? 'white' : '#4B5563',
                  background: location.pathname === '/' ? '#111827' : 'transparent',
                  borderColor: location.pathname === '/' ? '#111827' : 'transparent',
                  borderRadius: 8,
                  height: 36,
                }}
              >
                Dashboard
              </Button>
            )}
            <div id="navbar-actions" style={{ marginLeft: 4 }}></div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F0FDF4', padding: '4px 10px', borderRadius: '16px', border: '1px solid #DCFCE7' }}>
              <span className="live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 2px #DCFCE7' }} />
              {!isMobile && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>
                  Connected
                </span>
              )}
            </div>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 8px', borderRadius: 24,
                cursor: 'pointer', transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Avatar
                  size={32}
                  style={{ background: '#111827', fontSize: 13, fontWeight: 600, color: 'white' }}
                >
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </Avatar>
                {!isMobile && (
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                    {user?.name || 'User'} <span style={{ fontSize: '10px' }}>▼</span>
                  </span>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ background: 'var(--bg-primary)' }}>
          <MaintenanceBanner />
          {children}
        </Content>
      </Layout>

      {/* Project Selection Modal — shown when clicking "New Sheet" */}
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
        width={isMobile ? '95vw' : 500}
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        width={isMobile ? '95vw' : undefined}
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
    </Layout>
  )
}
