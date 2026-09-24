import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Table, message, Modal, Tag, Tooltip } from 'antd'
import { ArrowLeftOutlined, UndoOutlined, DeleteOutlined, FileTextOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { draftRecoveryApi } from '../api/client'
import { useAuthStore } from '../store'
import dayjs from 'dayjs'

interface DraftSnapshot {
  sheetId: string
  title: string
  status: string
  workflowState: string
  createdDate: string
  snapshotTimestamp: string
  projectId: string
  fileName: string
  assignedTo: Record<string, string>
  attachmentFiles?: string[]
  legacyAttachmentFiles?: string[]
}

export default function DraftRecovery() {
  const [snapshots, setSnapshots] = useState<DraftSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Admin guard
  if (user?.role?.toLowerCase() !== 'admin') {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>
        <h2>Access Denied</h2>
        <p>Only administrators can access the Draft Recovery tool.</p>
        <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
      </div>
    )
  }

  useEffect(() => {
    loadSnapshots()
  }, [])

  const loadSnapshots = async () => {
    setLoading(true)
    try {
      const res = await draftRecoveryApi.list()
      setSnapshots(res.data || [])
    } catch {
      message.error('Failed to load draft snapshots')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = (fileName: string, title: string) => {
    Modal.confirm({
      title: 'Restore Draft?',
      icon: <ExclamationCircleOutlined />,
      content: `This will re-create the draft "${title}" in the system. If the sheet still exists, it will be overwritten with this snapshot.`,
      okText: 'Restore',
      okType: 'primary',
      onOk: async () => {
        setRestoring(fileName)
        try {
          const res = await draftRecoveryApi.restore(fileName)
          if (res.data.success) {
            message.success(`Draft "${title}" restored successfully!`)
            navigate(`/sheet/${res.data.sheetId}/edit`)
          } else {
            message.error(res.data.error || 'Restore failed')
          }
        } catch {
          message.error('Failed to restore draft')
        } finally {
          setRestoring(null)
        }
      },
    })
  }

  const handleDelete = (fileName: string) => {
    Modal.confirm({
      title: 'Delete Snapshot?',
      icon: <ExclamationCircleOutlined />,
      content: 'This saved draft will be permanently removed. This cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await draftRecoveryApi.deleteSnapshot(fileName)
          message.success('Draft removed')
          loadSnapshots()
        } catch {
          message.error('Failed to delete snapshot')
        }
      },
    })
  }

  const columns = [
    {
      title: 'Sheet ID',
      dataIndex: 'sheetId',
      key: 'sheetId',
      width: 200,
      render: (id: string) => <code style={{ fontSize: 11, color: '#7c3aed' }}>{id}</code>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (t: string) => <strong>{t}</strong>,
    },
    {
      title: 'State',
      dataIndex: 'workflowState',
      key: 'state',
      width: 110,
      render: (s: string) => (
        <Tag color={s === 'DRAFT' ? 'orange' : s === 'IN_PROGRESS' ? 'blue' : 'green'}>
          {s || 'DRAFT'}
        </Tag>
      ),
    },
    {
      title: 'Recipients',
      key: 'recipients',
      width: 100,
      render: (_: unknown, r: DraftSnapshot) => {
        const count = r.assignedTo ? Object.keys(r.assignedTo).length : 0
        return <span>{count} recipient{count !== 1 ? 's' : ''}</span>
      },
    },
    {
      title: 'Attachments',
      key: 'attachments',
      width: 100,
      render: (_: unknown, r: DraftSnapshot) => {
        const count = (r.attachmentFiles?.length || 0) + (r.legacyAttachmentFiles?.length || 0)
        return count > 0 ? <Tag color="purple">{count} file(s)</Tag> : <span style={{ color: '#ccc' }}>None</span>
      },
    },
    {
      title: 'Saved Date',
      dataIndex: 'snapshotTimestamp',
      key: 'saved',
      width: 170,
      render: (d: string) => d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_: unknown, r: DraftSnapshot) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Tooltip title="Restore this draft">
            <Button
              type="primary"
              size="small"
              icon={<UndoOutlined />}
              loading={restoring === r.fileName}
              onClick={() => handleRestore(r.fileName, r.title)}
              style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
            >
              Restore
            </Button>
          </Tooltip>
          <Tooltip title="Delete this saved draft permanently">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(r.fileName)}
            />
          </Tooltip>
        </div>
      ),
    },
  ]

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>Dashboard</Button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#1a1a1a' }}>
            <FileTextOutlined style={{ color: '#7c3aed', marginRight: 8 }} />
            Draft Recovery
          </h2>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>
            Recover previously saved draft action sheets. Drafts are stored automatically and cleared once sent.
          </p>
        </div>
      </div>

      <div style={{
        background: '#faf8f5',
        border: '1px solid #e8e3dc',
        borderRadius: 8,
        padding: 4,
      }}>
        <Table
          dataSource={snapshots}
          columns={columns}
          rowKey="fileName"
          loading={loading}
          pagination={{ pageSize: 20, showTotal: t => <span style={{ color: '#888' }}>{t} saved drafts</span> }}
          size="middle"
          locale={{ emptyText: 'No saved drafts found.' }}
        />
      </div>
    </div>
  )
}
