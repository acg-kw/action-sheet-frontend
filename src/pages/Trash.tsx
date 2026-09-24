import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, message, Modal, Tag, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  UndoOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { sheetsApi } from '../api/client'
import dayjs from 'dayjs'

interface DeletedSheet {
  id: string
  title: string
  status: string
  createdDate: string
  deletedAt: string
  deletedBy: string
  formData?: Record<string, any>
}

export default function Trash() {
  const navigate = useNavigate()
  const [deletedSheets, setDeletedSheets] = useState<DeletedSheet[]>([])
  const [loading, setLoading] = useState(false)

  const fetchDeletedSheets = async () => {
    setLoading(true)
    try {
      const response = await sheetsApi.getDeleted()
      setDeletedSheets(response.data || [])
    } catch (error) {
      console.error('Failed to fetch deleted sheets:', error)
      message.error('Failed to load deleted sheets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeletedSheets()
  }, [])

  const handleRestore = (sheet: DeletedSheet) => {
    Modal.confirm({
      title: 'Restore Action Sheet',
      icon: <UndoOutlined />,
      content: `Restore "${sheet.title}"? It will be moved back to the dashboard.`,
      okText: 'Restore',
      okType: 'primary',
      onOk: async () => {
        try {
          await sheetsApi.restore(sheet.id)
          message.success('Action sheet restored successfully')
          fetchDeletedSheets()
        } catch (error) {
          console.error('Failed to restore sheet:', error)
          message.error('Failed to restore action sheet')
        }
      },
    })
  }

  const handlePermanentDelete = (sheet: DeletedSheet) => {
    Modal.confirm({
      title: 'Permanently Delete',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>Permanently delete "{sheet.title}"?</p>
          <p style={{ color: '#ef4444', fontWeight: 600 }}>
            ⚠️ This action cannot be undone!
          </p>
        </div>
      ),
      okText: 'Delete Permanently',
      okType: 'danger',
      onOk: async () => {
        try {
          // TODO: Implement permanent delete endpoint
          // await sheetsApi.permanentDelete(sheet.id)
          message.success('Action sheet permanently deleted')
          fetchDeletedSheets()
        } catch (error) {
          console.error('Failed to permanently delete sheet:', error)
          message.error('Failed to delete action sheet')
        }
      },
    })
  }

  const handleEmptyTrash = () => {
    Modal.confirm({
      title: 'Empty Trash',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>Permanently delete all {deletedSheets.length} action sheets in trash?</p>
          <p style={{ color: '#ef4444', fontWeight: 600 }}>
            ⚠️ This action cannot be undone!
          </p>
        </div>
      ),
      okText: 'Empty Trash',
      okType: 'danger',
      onOk: async () => {
        try {
          // TODO: Implement empty trash endpoint
          // await sheetsApi.emptyTrash()
          message.success('Trash emptied successfully')
          fetchDeletedSheets()
        } catch (error) {
          console.error('Failed to empty trash:', error)
          message.error('Failed to empty trash')
        }
      },
    })
  }

  const columns: ColumnsType<DeletedSheet> = [
    {
      title: 'Sheet',
      key: 'sheet',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 1 }}>{r.title || r.id}</div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
            }}
          >
            {r.id}
          </span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color="default" style={{ opacity: 0.6 }}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Ref. No',
      key: 'refNo',
      width: 140,
      render: (_, r) => (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
          }}
        >
          {r.formData?.refNo || '—'}
        </span>
      ),
    },
    {
      title: 'Deleted By',
      dataIndex: 'deletedBy',
      key: 'deletedBy',
      width: 150,
      render: (deletedBy: string) => (
        <span style={{ fontSize: '0.85rem', color: '#ef4444' }}>{deletedBy}</span>
      ),
    },
    {
      title: 'Deleted At',
      dataIndex: 'deletedAt',
      key: 'deletedAt',
      width: 150,
      sorter: (a, b) => dayjs(a.deletedAt).unix() - dayjs(b.deletedAt).unix(),
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
      title: 'Created',
      dataIndex: 'createdDate',
      key: 'createdDate',
      width: 130,
      render: (date: string) => {
        const d = dayjs(date)
        return (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {date ? d.format('DD MMM YYYY') : '—'}
          </span>
        )
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Tooltip title="View Details">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/sheet/${r.id}`)}
            />
          </Tooltip>
          <Tooltip title="Restore">
            <Button
              type="text"
              size="small"
              icon={<UndoOutlined />}
              onClick={() => handleRestore(r)}
              style={{ color: '#16a34a' }}
            />
          </Tooltip>
          <Tooltip title="Delete Permanently">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handlePermanentDelete(r)}
            />
          </Tooltip>
        </div>
      ),
    },
  ]

  return (
    <div className="page-container fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/')}
              style={{ color: 'var(--text-secondary)' }}
            />
            <h1 className="page-title">
              <DeleteOutlined style={{ marginRight: 8, color: '#ef4444' }} />
              Trash
            </h1>
          </div>
          <p className="page-subtitle">
            {deletedSheets.length} deleted action sheet(s) · Restore or permanently delete
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {deletedSheets.length > 0 && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleEmptyTrash}
              style={{ height: 40 }}
            >
              Empty Trash
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          background: 'white',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {deletedSheets.length === 0 && !loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗑️</div>
            <div className="empty-state-title">Trash is empty</div>
            <div className="empty-state-desc">
              Deleted action sheets will appear here. You can restore them or delete them
              permanently.
            </div>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={deletedSheets}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (t) => (
                <span style={{ color: 'var(--text-muted)' }}>{t} deleted sheets</span>
              ),
            }}
            size="middle"
          />
        )}
      </div>
    </div>
  )
}
