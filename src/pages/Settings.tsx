import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tabs, Card, Descriptions, Tag, Button, Spin, message, Table, Modal, Tooltip } from 'antd'
import {
  MailOutlined, CloudServerOutlined, BellOutlined, FileTextOutlined,
  ArrowLeftOutlined, UndoOutlined, DeleteOutlined, ExclamationCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined, DesktopOutlined,
} from '@ant-design/icons'
import { configApi, draftRecoveryApi } from '../api/client'
import { useAuthStore } from '../store'
import dayjs from 'dayjs'

// ═══════════════════════════════════════
//  SETTINGS PAGE — Admin Only
//  Tabs: Email · Active Directory · Notifications · Draft Recovery
// ═══════════════════════════════════════

interface DraftSnapshot {
  sheetId: string; title: string; status: string; workflowState: string
  createdDate: string; snapshotTimestamp: string; projectId: string
  fileName: string; assignedTo: Record<string, string>
  attachmentFiles?: string[]; legacyAttachmentFiles?: string[]
}

export default function Settings() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('email')

  if (user?.role?.toLowerCase() !== 'admin') {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>
        <h2>Access Denied</h2>
        <p>Only administrators can access Settings.</p>
        <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="settings-container" style={{ padding: '24px 32px', maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>Dashboard</Button>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#1a1a1a' }}>⚙ Settings</h2>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        items={[
          { key: 'email',   label: <span><MailOutlined /> Email Config</span>,   children: <EmailConfig /> },
          { key: 'ad',      label: <span><CloudServerOutlined /> Active Directory</span>, children: <ADConfig /> },
          { key: 'notify',  label: <span><BellOutlined /> Notifications</span>, children: <NotificationsConfig /> },
          { key: 'recovery', label: <span><FileTextOutlined /> Draft Recovery</span>, children: <DraftRecoveryTab /> },
          { key: 'system',  label: <span><DesktopOutlined /> System Info</span>, children: <SystemInfo /> },
        ]}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
//  EMAIL CONFIG TAB
// ─────────────────────────────────────────────
function EmailConfig() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    configApi.getEmail().then(r => setData(r.data)).catch(() => message.error('Failed to load email config')).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />

  return (
    <div>
      <Card title="SMTP Settings (Outgoing Mail)" size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="SMTP Host">{data?.smtpHost || '—'}</Descriptions.Item>
          <Descriptions.Item label="SMTP Port">{data?.smtpPort || '—'}</Descriptions.Item>
          <Descriptions.Item label="Username">{data?.smtpUsername || '—'}</Descriptions.Item>
          <Descriptions.Item label="From Address">{data?.emailFrom || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="IMAP Settings (Incoming Mail / Response Polling)" size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="IMAP Enabled">
            <StatusBadge active={data?.imapEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="IMAP Host">{data?.imapHost || '—'}</Descriptions.Item>
          <Descriptions.Item label="IMAP Port">{data?.imapPort || '—'}</Descriptions.Item>
          <Descriptions.Item label="Email Tracking">
            <StatusBadge active={data?.trackingEnabled} />
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <div style={{ color: '#888', fontSize: 12, marginTop: 12 }}>
        <InfoCircleOutlined style={{ marginRight: 6 }} />
        Email configuration is set in <code>application.yml</code>. Changes require a server restart.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
//  ACTIVE DIRECTORY TAB
// ─────────────────────────────────────────────
function ADConfig() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    configApi.getAd().then(r => setData(r.data)).catch(() => message.error('Failed to load AD config')).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />

  return (
    <div>
      <Card title="Active Directory Configuration" size="small">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="AD Authentication">
            <StatusBadge active={data?.adEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="Domain">{data?.adDomain || <span style={{ color: '#ccc' }}>Not configured</span>}</Descriptions.Item>
          <Descriptions.Item label="Server">{data?.adServer || <span style={{ color: '#ccc' }}>Not configured</span>}</Descriptions.Item>
        </Descriptions>
      </Card>

      <div style={{ color: '#888', fontSize: 12, marginTop: 12 }}>
        <InfoCircleOutlined style={{ marginRight: 6 }} />
        Active Directory settings are configured in <code>application.yml</code> under <code>app.ad</code>. Requires server restart after changes.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
//  NOTIFICATIONS TAB
// ─────────────────────────────────────────────
function NotificationsConfig() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    configApi.getNotifications().then(r => setData(r.data)).catch(() => message.error('Failed to load notifications config')).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />

  return (
    <div>
      <Card title="Notification & Polling Settings" size="small">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Auto-Refresh Interval">
            {data?.autoRefreshInterval ? `${data.autoRefreshInterval / 1000}s` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Base URL">{data?.baseUrl || '—'}</Descriptions.Item>
          <Descriptions.Item label="Data Path">{data?.dataPath || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <div style={{ color: '#888', fontSize: 12, marginTop: 12 }}>
        <InfoCircleOutlined style={{ marginRight: 6 }} />
        WebSocket notifications are automatically pushed to all connected clients. The refresh interval controls the fallback polling frequency.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
//  DRAFT RECOVERY TAB
// ─────────────────────────────────────────────
function DraftRecoveryTab() {
  const [snapshots, setSnapshots] = useState<DraftSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => { loadSnapshots() }, [])

  const loadSnapshots = async () => {
    setLoading(true)
    try {
      const res = await draftRecoveryApi.list()
      setSnapshots(res.data || [])
    } catch { message.error('Failed to load snapshots') }
    finally { setLoading(false) }
  }

  const handleRestore = (fileName: string, title: string) => {
    Modal.confirm({
      title: 'Restore Draft?',
      icon: <ExclamationCircleOutlined />,
      content: `Restore "${title}" to the system? If it still exists, it will be overwritten.`,
      okText: 'Restore',
      onOk: async () => {
        setRestoring(fileName)
        try {
          const res = await draftRecoveryApi.restore(fileName)
          if (res.data.success) {
            message.success(`"${title}" restored!`)
            navigate(`/sheet/${res.data.sheetId}/edit`)
          } else { message.error(res.data.error || 'Restore failed') }
        } catch { message.error('Failed to restore') }
        finally { setRestoring(null) }
      },
    })
  }

  const handleDelete = (fileName: string) => {
    Modal.confirm({
      title: 'Delete Snapshot?',
      icon: <ExclamationCircleOutlined />,
      content: 'Permanently remove this snapshot from the recovery drive.',
      okText: 'Delete', okType: 'danger',
      onOk: async () => {
        try { await draftRecoveryApi.deleteSnapshot(fileName); message.success('Deleted'); loadSnapshots() }
        catch { message.error('Failed to delete') }
      },
    })
  }

  const columns = [
    { title: 'Sheet ID', dataIndex: 'sheetId', key: 'id', width: 200,
      render: (id: string) => <code style={{ fontSize: 11, color: '#7c3aed' }}>{id}</code> },
    { title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true,
      render: (t: string) => <strong>{t}</strong> },
    { title: 'State', dataIndex: 'workflowState', key: 'state', width: 100,
      render: (s: string) => <Tag color={s === 'DRAFT' ? 'orange' : s === 'IN_PROGRESS' ? 'blue' : 'green'}>{s || 'DRAFT'}</Tag> },
    { title: 'Recipients', key: 'recip', width: 90,
      render: (_: unknown, r: DraftSnapshot) => Object.keys(r.assignedTo || {}).length },
    { title: 'Snapshot', dataIndex: 'snapshotTimestamp', key: 'snap', width: 160,
      render: (d: string) => d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '—' },
    { title: 'Actions', key: 'act', width: 160,
      render: (_: unknown, r: DraftSnapshot) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Tooltip title="Restore">
            <Button type="primary" size="small" icon={<UndoOutlined />}
              loading={restoring === r.fileName}
              onClick={() => handleRestore(r.fileName, r.title)}
              style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>Restore</Button>
          </Tooltip>
          <Tooltip title="Delete">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.fileName)} />
          </Tooltip>
        </div>
      ),
    },
  ]

  return (
    <div>
      <p style={{ margin: '0 0 12px', color: '#888', fontSize: 13 }}>
        Every draft and sent sheet is automatically backed up to the network drive. If sheets disappear, restore them here.
      </p>
      <Table
        dataSource={snapshots} columns={columns} rowKey="fileName"
        loading={loading} size="small"
        pagination={{ pageSize: 15, showTotal: t => <span style={{ color: '#888' }}>{t} snapshots</span> }}
        locale={{ emptyText: 'No snapshots found.' }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
//  SYSTEM INFO TAB
// ─────────────────────────────────────────────
function SystemInfo() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    configApi.getSystem().then(r => setData(r.data)).catch(() => message.error('Failed to load system info')).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />

  return (
    <Card title="System Information" size="small">
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Java Version">{data?.javaVersion}</Descriptions.Item>
        <Descriptions.Item label="OS">{data?.osName}</Descriptions.Item>
        <Descriptions.Item label="Memory Used">{data?.usedMemoryMB} MB</Descriptions.Item>
        <Descriptions.Item label="Memory Max">{data?.maxMemoryMB} MB</Descriptions.Item>
        <Descriptions.Item label="Free Memory">{data?.freeMemoryMB} MB</Descriptions.Item>
        <Descriptions.Item label="CPU Cores">{data?.availableProcessors}</Descriptions.Item>
        <Descriptions.Item label="Base URL" span={2}>{data?.baseUrl}</Descriptions.Item>
        <Descriptions.Item label="Data Path" span={2}>{data?.dataPath}</Descriptions.Item>
      </Descriptions>
    </Card>
  )
}

// ─────────────────────────────────────────────
//  HELPER COMPONENT
// ─────────────────────────────────────────────
function StatusBadge({ active }: { active?: boolean }) {
  return active
    ? <Tag icon={<CheckCircleOutlined />} color="success">Enabled</Tag>
    : <Tag icon={<CloseCircleOutlined />} color="default">Disabled</Tag>
}
