import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Tag,
  Button,
  Descriptions,
  Table,
  Tooltip,
  Modal,
  Input,
  Select,
  message,
  Spin,
  Timeline,
} from 'antd'
import {
  ArrowLeftOutlined,
  SendOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FilePdfOutlined,
  HistoryOutlined,
  PaperClipOutlined,
  DownloadOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useSheetsStore, useAuthStore } from '../store'
import { projectsApi, sheetsApi } from '../api/client'
import dayjs from 'dayjs'

const { TextArea } = Input

export default function SheetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSheet, isLoading, fetchSheet, sendSheet, deleteSheet, overrideStatus } =
    useSheetsStore()
  const { user } = useAuthStore()
  const [overrideModal, setOverrideModal] = useState(false)
  const [overrideData, setOverrideData] = useState({ status: '', note: '' })
  const [responseLogModal, setResponseLogModal] = useState(false)
  const [attachmentsModal, setAttachmentsModal] = useState(false)
  const [attachments, setAttachments] = useState<string[]>([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)

  useEffect(() => {
    if (id) fetchSheet(id)
  }, [id, fetchSheet])

  const loadAttachments = async () => {
    if (!id) return
    setLoadingAttachments(true)
    try {
      const response = await sheetsApi.listAttachments(id)
      setAttachments(response.data.attachments || [])
    } catch (error) {
      message.error('Failed to load attachments')
      console.error(error)
    } finally {
      setLoadingAttachments(false)
    }
  }

  const handleViewAttachments = () => {
    setAttachmentsModal(true)
    loadAttachments()
  }

  if (isLoading || !currentSheet) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <Spin size="large" />
      </div>
    )
  }

  const sheet = currentSheet
  const isGM = user?.role?.toLowerCase() === 'gm' || user?.role?.toLowerCase() === 'general manager (gm)' || user?.role?.toLowerCase() === 'general manager'
  const isExm = user?.role?.toLowerCase() === "ex.m's"
  const isViewer = user?.role?.toLowerCase() === 'viewer'
  const isReadOnly = isExm || isViewer
  const isDraft = sheet.workflowState === 'DRAFT'
  const isLocked = !!sheet.overriddenBy
  const recipientCount = Object.keys(sheet.assignedTo || {}).length
  const responseCount = Object.keys(sheet.responses || {}).length

  // Helper: Check if all recipients are info-only
  const isInformationalOnly = () => {
    const types = sheet.recipientTypes || {}
    const typeValues = Object.values(types)
    return typeValues.length > 0 && typeValues.every(t => t === 'INFO')
  }

  // Helper: Get display status
  const getDisplayStatus = () => {
    if (isInformationalOnly() && sheet.status !== 'DRAFT') {
      return 'INFORMATIONAL ONLY'
    }
    return sheet.status
  }

  const handleSend = async () => {
    if (!id) return
    Modal.confirm({
      title: 'Send Action Sheet',
      content: `This will send the action sheet to ${recipientCount} recipient(s). Continue?`,
      okText: 'Send',
      onOk: async () => {
        await sendSheet(id)
        message.success('Action sheet sent to recipients')
        fetchSheet(id)
      },
    })
  }

  const handleDelete = () => {
    if (!id) return
    Modal.confirm({
      title: 'Delete Action Sheet',
      icon: <ExclamationCircleOutlined />,
      content: 'Are you sure? This can be restored from the admin panel.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        await deleteSheet(id, user?.email || 'unknown')
        message.success('Sheet deleted')
        navigate('/')
      },
    })
  }

  const handleOverride = async () => {
    if (!id || !overrideData.status) return
    await overrideStatus(id, overrideData.status, user?.email || '', overrideData.note)
    message.success('Status overridden by GM')
    setOverrideModal(false)
    setOverrideData({ status: '', note: '' })
    fetchSheet(id)
  }

  // Build recipients table
  const recipientData = Object.entries(sheet.assignedTo || {}).map(([email, name]) => ({
    key: email,
    email,
    name,
    type: sheet.recipientTypes?.[email] || 'ACTION',
    response: sheet.responses?.[email] || null,
    status: sheet.userStatuses?.[email] || null,
  }))

  const recipientColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (v: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {v}
        </span>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t: string) => (
        <Tag
          style={{
            color: t === 'INFO' ? '#8b5cf6' : '#f59e0b',
            background: t === 'INFO' ? 'rgba(139,92,246,0.12)' : 'rgba(245,158,11,0.12)',
            border: 'none',
            fontWeight: 600,
            fontSize: '0.7rem',
          }}
        >
          {t}
        </Tag>
      ),
    },
    {
      title: 'Response',
      dataIndex: 'response',
      key: 'response',
      width: 160,
      render: (r: string | null) => {
        if (!r)
          return (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <ClockCircleOutlined /> Awaiting
            </span>
          )
        const isPositive = ['ACTION TAKEN', 'APPROVED', 'NOTED', 'ACKNOWLEDGED'].includes(r)
        const isNegative = r.includes('REJECT')
        return (
          <Tag
            icon={isPositive ? <CheckCircleOutlined /> : isNegative ? <CloseCircleOutlined /> : undefined}
            style={{
              color: isPositive ? '#10b981' : isNegative ? '#ef4444' : '#3b82f6',
              background: isPositive
                ? 'rgba(16,185,129,0.12)'
                : isNegative
                ? 'rgba(239,68,68,0.12)'
                : 'rgba(59,130,246,0.12)',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          >
            {r}
          </Tag>
        )
      },
    },
  ]

  return (
    <div className="page-container fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
          style={{ color: 'var(--text-secondary)' }}
        />
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ fontSize: '1.4rem' }}>
            {sheet.title}
          </h1>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              color: 'var(--text-accent)',
            }}
          >
            {sheet.id}
          </span>
        </div>
        <div className="detail-header-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isDraft && !isReadOnly && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              size="large"
              onClick={handleSend}
              style={{ height: 40 }}
            >
              Send to Recipients
            </Button>
          )}
          <Button
            icon={<HistoryOutlined />}
            size="large"
            onClick={() => setResponseLogModal(true)}
            style={{ height: 40 }}
          >
            Response Log
          </Button>
          <Button
            icon={<PaperClipOutlined />}
            size="large"
            onClick={handleViewAttachments}
            style={{ height: 40 }}
          >
            View Attachments
          </Button>
          {sheet.pdfPath && (
            <Button
              icon={<FilePdfOutlined />}
              size="large"
              onClick={() => {
                sheetsApi.openPdf(sheet.pdfPath!)
              }}
              style={{ height: 40, color: '#fff', background: '#2563eb', borderColor: '#2563eb' }}
            >
              View PDF
            </Button>
          )}
          {isGM && !isLocked && !isReadOnly && (
            <Button
              icon={<LockOutlined />}
              size="large"
              onClick={() => setOverrideModal(true)}
              style={{ height: 40 }}
            >
              GM Override
            </Button>
          )}
          {!isReadOnly && (
            <Button
              icon={<EditOutlined />}
              size="large"
              onClick={() => navigate(`/sheet/${id}/edit`)}
              style={{ height: 40 }}
            >
              Edit
            </Button>
          )}
          {!isReadOnly && (
            <Button
              danger
              icon={<DeleteOutlined />}
              size="large"
              onClick={handleDelete}
              style={{ height: 40 }}
            />
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="responsive-grid-2col" style={{ marginBottom: 20 }}>
        <Card>
          <Descriptions column={2} labelStyle={{ color: 'var(--text-secondary)' }}>
            <Descriptions.Item label="Status">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag
                  style={{
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    padding: '2px 12px',
                    border: 'none',
                    background: getDisplayStatus() === 'DRAFT' ? 'rgba(100,116,139,0.15)' : 
                               getDisplayStatus() === 'INFORMATIONAL ONLY' ? 'rgba(156,163,175,0.15)' : 
                               'rgba(99,102,241,0.15)',
                    color: getDisplayStatus() === 'DRAFT' ? '#94a3b8' : 
                           getDisplayStatus() === 'INFORMATIONAL ONLY' ? '#6b7280' : 
                           '#818cf8',
                  }}
                >
                  {getDisplayStatus()}
                </Tag>
                {isGM && !isDraft && (
                  <Tooltip title="Change Status (GM)">
                    <Button 
                      type="text" 
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => setOverrideModal(true)}
                      style={{ padding: '0 4px', height: 24, fontSize: 12 }}
                    />
                  </Tooltip>
                )}
                {isLocked && (
                  <Tooltip title={`Locked by ${sheet.overriddenBy}: ${sheet.overrideNote || ''}`}>
                    <span style={{ cursor: 'help' }}>🔒</span>
                  </Tooltip>
                )}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Workflow">
              <Tag color="blue">{sheet.workflowState}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Created">
              {dayjs(sheet.createdDate).format('DD MMM YYYY, HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="Due Date">
              <span
                style={{
                  color: dayjs(sheet.dueDate).isBefore(dayjs()) ? 'var(--danger)' : 'inherit',
                  fontWeight: dayjs(sheet.dueDate).isBefore(dayjs()) ? 600 : 400,
                }}
              >
                {dayjs(sheet.dueDate).format('DD MMM YYYY, HH:mm')}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Project">
              {sheet.projectId || 'None'}
            </Descriptions.Item>
            <Descriptions.Item label="Conflict">
              {sheet.hasConflict ? (
                <Tag color={sheet.conflictSeverity === 'MAJOR' ? 'red' : 'orange'}>
                  ⚡ {sheet.conflictSeverity}
                </Tag>
              ) : (
                <span style={{ color: 'var(--success)' }}>None</span>
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '3rem',
                fontWeight: 800,
                color: responseCount === recipientCount && recipientCount > 0 ? 'var(--success)' : 'var(--accent-primary)',
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              {responseCount}/{recipientCount}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
              Responses received
            </div>
            <div
              style={{
                width: '100%',
                height: 8,
                borderRadius: 4,
                background: 'var(--bg-elevated)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: recipientCount > 0 ? `${(responseCount / recipientCount) * 100}%` : '0%',
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                  borderRadius: 4,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Recipients Table */}
      <Card
        title={
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            Recipients ({recipientCount})
          </span>
        }
        style={{ marginBottom: 20 }}
      >
        <Table
          columns={recipientColumns}
          dataSource={recipientData}
          pagination={false}
          size="small"
        />
      </Card>

      {/* Conflict Log */}
      {sheet.conflictLog && sheet.conflictLog.length > 0 && (
        <Card
          title={
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              ⚡ Conflict Resolution Log
            </span>
          }
        >
          <Timeline
            items={sheet.conflictLog.map((event: any, i: number) => ({
              key: i,
              color: event.severity === 'GM_OVERRIDE' ? 'red' : 'blue',
              children: (
                <div>
                  <div style={{ fontWeight: 500 }}>{event.description}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {dayjs(event.timestamp).format('DD MMM YYYY, HH:mm:ss')}
                    {event.resolvedBy && ` • by ${event.resolvedBy}`}
                  </div>
                </div>
              ),
            }))}
          />
        </Card>
      )}

      {/* GM Override Modal */}
      <Modal
        title="GM Status Override"
        open={overrideModal}
        onOk={handleOverride}
        onCancel={() => setOverrideModal(false)}
        okText="Override Status"
        okButtonProps={{ danger: true }}
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          This will lock the sheet status. New responses will not change it.
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
            New Status
          </label>
          <Select
            style={{ width: '100%' }}
            value={overrideData.status || undefined}
            onChange={(v) => setOverrideData((d) => ({ ...d, status: v }))}
            placeholder="Select status..."
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
        <div>
          <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
            Override Note
          </label>
          <TextArea
            rows={3}
            value={overrideData.note}
            onChange={(e) => setOverrideData((d) => ({ ...d, note: e.target.value }))}
            placeholder="Reason for override..."
          />
        </div>
      </Modal>

      {/* Response Log Modal */}
      <Modal
        title={<><HistoryOutlined /> Response Log</>}
        open={responseLogModal}
        onCancel={() => setResponseLogModal(false)}
        footer={null}
        width={600}
      >
        {sheet.responseHistory && sheet.responseHistory.length > 0 ? (
          <Timeline
            style={{ marginTop: 16 }}
            items={sheet.responseHistory.map((entry: any, i: number) => ({
              key: i,
              color: ['ACTION TAKEN', 'APPROVED', 'NOTED'].includes(entry.response) ? 'green'
                : entry.response?.includes('REJECT') ? 'red' : 'blue',
              children: (
                <div>
                  <div style={{ fontWeight: 500 }}>{entry.response}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {entry.email}
                    {entry.senderRole && <Tag style={{ marginLeft: 6, fontSize: '0.65rem' }}>{entry.senderRole}</Tag>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {entry.timestamp ? dayjs(entry.timestamp).format('DD MMM YYYY, HH:mm:ss') : '—'}
                  </div>
                  {entry.rawContent && (
                    <div style={{ marginTop: 4, fontSize: '0.78rem', color: '#555', padding: '4px 8px', background: '#f5f5f5', borderRadius: 4 }}>
                      {entry.rawContent}
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <ClockCircleOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
            No responses recorded yet
          </div>
        )}
      </Modal>

      {/* Attachments Modal */}
      <Modal
        title={<><PaperClipOutlined /> Attached Documents</>}
        open={attachmentsModal}
        onCancel={() => setAttachmentsModal(false)}
        footer={null}
        width={700}
      >
        {loadingAttachments ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin />
          </div>
        ) : attachments.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            {attachments.map((fileName, index) => {
              const displayName = fileName.includes('_') ? fileName.substring(fileName.indexOf('_') + 1) : fileName
              const downloadUrl = sheetsApi.downloadAttachment(id!, fileName)
              
              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    marginBottom: 8,
                    background: '#f9fafb',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PaperClipOutlined style={{ fontSize: 20, color: '#6b7280' }} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{displayName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        Attached document
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Tooltip title="View">
                      <Button
                        type="text"
                        icon={<EyeOutlined />}
                        onClick={() => window.open(downloadUrl, '_blank')}
                      />
                    </Tooltip>
                    <Tooltip title="Download">
                      <Button
                        type="text"
                        icon={<DownloadOutlined />}
                        onClick={() => {
                          const a = document.createElement('a')
                          a.href = downloadUrl
                          a.download = displayName
                          a.click()
                        }}
                      />
                    </Tooltip>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <PaperClipOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
            No attachments found for this action sheet
          </div>
        )}
      </Modal>
    </div>
  )
}
