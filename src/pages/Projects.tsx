import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Table, Tag, message, Modal, Input, Form, Empty } from 'antd'
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined, ProjectOutlined,
  FileTextOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons'
import { projectsApi, sheetsApi } from '../api/client'
import dayjs from 'dayjs'

interface Project { id: string; name: string; path?: string; color?: string }
interface Sheet { id: string; title: string; status: string; workflowState: string; createdDate: string }

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

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(false)
  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try { const res = await projectsApi.getAll(); setProjects(res.data || []) }
    catch { message.error('Failed to load projects') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // Auto-select project from URL param (from sidebar navigation)
  const { projectId } = useParams<{ projectId: string }>()
  useEffect(() => {
    if (projectId && projects.length > 0) {
      const decodedId = decodeURIComponent(projectId)
      const found = projects.find(p => p.id === decodedId)
      if (found && selectedProject?.id !== found.id) {
        handleSelectProject(found)
      }
    } else if (!projectId) {
      // If we go strictly back to /projects without an ID, clear selection
      setSelectedProject(null)
      setSheets([])
    }
  }, [projectId, projects, selectedProject?.id])

  const handleSelectProject = async (p: Project) => {
    setSelectedProject(p)
    setSheetsLoading(true)
    try {
      const res = await sheetsApi.getAll()
      // Normalize to lowercase alpha-only for fuzzy matching
      const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const projNorm = normalize(p.name)
      const filtered = (res.data || []).filter((s: any) => {
        // 1. Exact projectId match
        if (s.projectId === p.id) return true
        // 2. Sheet ID starts with normalized project name (e.g. MERCEDESSHUWAIKH-... → mercedesshuwaikh)
        const idNorm = normalize(s.id)
        if (projNorm.length >= 3 && idNorm.startsWith(projNorm)) return true
        // 3. originalTo field contains the project name
        const origNorm = normalize(s.formData?.originalTo)
        if (projNorm.length >= 3 && origNorm.includes(projNorm)) return true
        return false
      })
      setSheets(filtered)
    } catch { message.error('Failed to load sheets') }
    finally { setSheetsLoading(false) }
  }

  const handleAdd = async () => {
    try {
      const v = await form.validateFields()
      await projectsApi.create({ name: v.name.trim() })
      message.success(`Project "${v.name}" created`)
      setAddModal(false); form.resetFields(); fetchProjects()
    } catch { message.error('Failed to create project') }
  }

  const handleDelete = (p: Project) => {
    Modal.confirm({
      title: 'Delete Project', icon: <ExclamationCircleOutlined />,
      content: `Delete "${p.name}"? Action sheets will remain but lose their project link.`,
      okText: 'Delete', okType: 'danger',
      onOk: async () => {
        await projectsApi.delete(p.id)
        message.success('Project deleted')
        if (selectedProject?.id === p.id) { setSelectedProject(null); setSheets([]) }
        fetchProjects()
      },
    })
  }

  // Helper: Check if all recipients are info-only
  const isInformationalOnly = (sheet: Sheet) => {
    const recipientTypes = (sheet as any).recipientTypes || {}
    const typeValues = Object.values(recipientTypes)
    return typeValues.length > 0 && typeValues.every(t => t === 'INFO')
  }

  // Helper: Get display status
  const getDisplayStatus = (sheet: Sheet) => {
    if (isInformationalOnly(sheet) && sheet.status !== 'DRAFT') {
      return 'INFORMATIONAL ONLY'
    }
    return sheet.status
  }

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>Dashboard</Button>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
            <ProjectOutlined style={{ color: '#2563eb', marginRight: 8 }} />Projects
          </h2>
          <Tag>{projects.length} projects</Tag>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>New Project</Button>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 24, minHeight: 400 }}>
        {selectedProject ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.4rem' }}>
                <FileTextOutlined style={{ marginRight: 12, color: '#2563eb' }} />{selectedProject.name}
              </h3>
              <Button size="middle" danger icon={<DeleteOutlined />} onClick={() => handleDelete(selectedProject)}>Delete Project</Button>
            </div>
            <Table
              dataSource={sheets}
              loading={sheetsLoading}
              rowKey="id"
              size="middle"
              pagination={{ pageSize: 15 }}
              locale={{ emptyText: 'No action sheets assigned to this project.' }}
              columns={[
                { title: 'ID', dataIndex: 'id', key: 'id', width: 220,
                  render: (id: string) => <code style={{ fontSize: 11, color: '#7c3aed' }}>{id}</code> },
                { title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true,
                  render: (t: string) => <strong style={{ fontSize: '0.9rem' }}>{t}</strong> },
                { title: 'Status', dataIndex: 'status', key: 'status', width: 180,
                  render: (_: string, sheet: Sheet) => {
                    const displayStatus = getDisplayStatus(sheet)
                    return <StatusPill status={displayStatus} />
                  } },
                { title: 'Created', dataIndex: 'createdDate', key: 'date', width: 140,
                  render: (d: string) => d ? dayjs(d).format('DD MMM YYYY') : '—' },
                { title: 'Actions', key: 'actions', width: 220, fixed: 'right' as const,
                  render: (_: any, sheet: any) => (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <Button 
                        size="small" 
                        onClick={() => navigate(`/sheet/${sheet.id}`)}
                        style={{ fontSize: '0.75rem', padding: '0 12px', whiteSpace: 'nowrap' }}
                      >
                        View Details
                      </Button>
                      {sheet.pdfPath && (
                        <Button 
                          size="small" 
                          type="primary"
                          onClick={() => sheetsApi.openPdf(sheet.pdfPath)}
                          style={{ 
                            fontSize: '0.75rem', 
                            padding: '0 12px', 
                            whiteSpace: 'nowrap',
                            background: '#2563eb',
                            borderColor: '#2563eb'
                          }}
                        >
                          View PDF
                        </Button>
                      )}
                    </div>
                  ) },
              ]}
            />
          </>
        ) : (
          <Empty description="Select a project from the sidebar to view its action sheets" style={{ marginTop: 100 }} />
        )}
      </div>

      <Modal title="New Project" open={addModal} onOk={handleAdd} onCancel={() => setAddModal(false)} okText="Create">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Project Name" rules={[{ required: true }]}><Input placeholder="e.g. Mercedes Shuwaikh" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
