import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Table, Select, Tag, Modal, Collapse, message, Tooltip } from 'antd'
import {
  ArrowLeftOutlined, ApartmentOutlined, CloudDownloadOutlined, SaveOutlined,
  SyncOutlined, DeleteOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons'
import { departmentsApi } from '../api/client'
import dayjs from 'dayjs'

interface DepartmentRow {
  department: string
  category: string | null
  people: number | null
  updatedAt: string | null
  updatedBy: string | null
}

interface SyncRun {
  status?: string
  at?: string
  fullRun?: boolean
  dryRun?: boolean
  kept?: number
  added?: number
  linkedExisting?: number
  updated?: number
  hidden?: number
  reactivated?: number
  leftOut?: Record<string, number>
  changes?: string[]
}

interface SyncStatus {
  enabled: boolean
  dryRunSetting: boolean
  lastRun: SyncRun
}

const OTHERS = 'Others'

/**
 * Department -> Copy-To column, for the employee list from Microsoft 365.
 * Departments are not hard-coded: they come from Microsoft 365 ("Read from
 * Microsoft 365", and every sync adds new ones). Saving applies at once.
 */
export default function Departments() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<DepartmentRow[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'read' | 'save' | 'sync' | null>(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [table, sync] = await Promise.all([departmentsApi.list(), departmentsApi.syncStatus()])
      setRows(table.data.departments || [])
      setCategories(table.data.categories || [])
      setStatus(sync.data)
    } catch {
      message.error('Failed to load the departments')
    } finally {
      setLoading(false)
    }
  }

  const categoryOf = (r: DepartmentRow) => edits[r.department] ?? r.category ?? OTHERS
  const unsaved = Object.keys(edits).length
  const unmapped = useMemo(() => rows.filter(r => (edits[r.department] ?? r.category ?? OTHERS) === OTHERS).length, [rows, edits])

  const choose = (r: DepartmentRow, category: string) => {
    setEdits(prev => {
      const next = { ...prev }
      if (category === (r.category ?? OTHERS)) delete next[r.department]
      else next[r.department] = category
      return next
    })
  }

  const save = async () => {
    setBusy('save')
    try {
      const res = await departmentsApi.save(Object.entries(edits).map(([department, category]) => ({ department, category })))
      setRows(res.data.departments || [])
      setEdits({})
      message.success(`Saved. ${res.data.employeesMoved} employee(s) moved to their new column.`)
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to save')
    } finally {
      setBusy(null)
    }
  }

  const readFromDirectory = async () => {
    setBusy('read')
    try {
      const res = await departmentsApi.readFromDirectory()
      message.success(`Read ${res.data.departments} departments (${res.data.people} people) from Microsoft 365; ${res.data.newDepartments} new.`)
      await load()
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Microsoft 365 could not be read')
    } finally {
      setBusy(null)
    }
  }

  const syncNow = () => {
    Modal.confirm({
      title: 'Sync the employee list now?',
      icon: <ExclamationCircleOutlined />,
      content: status?.dryRunSetting
        ? 'Dry run is on: the list of changes is shown, nothing is written.'
        : 'Employees are added, updated and hidden from Microsoft 365 now, as the hourly run would.',
      okText: 'Sync now',
      onOk: async () => {
        setBusy('sync')
        try {
          await departmentsApi.syncNow()
          await load()
          message.success('Sync finished')
        } catch {
          message.error('Sync failed')
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const remove = (r: DepartmentRow) => {
    Modal.confirm({
      title: `Remove "${r.department}"?`,
      icon: <ExclamationCircleOutlined />,
      content: 'Its people go to Others. If the department is still in Microsoft 365, the next sync lists it again.',
      okText: 'Remove',
      okType: 'danger',
      onOk: async () => {
        try {
          const res = await departmentsApi.remove(r.department)
          setRows(res.data.departments || [])
          setEdits(prev => { const next = { ...prev }; delete next[r.department]; return next })
          message.success('Removed')
        } catch {
          message.error('Failed to remove')
        }
      },
    })
  }

  const columns = [
    {
      title: 'Department (Active Directory)',
      dataIndex: 'department',
      key: 'department',
      render: (d: string) => <strong>{d}</strong>,
    },
    {
      title: 'People',
      dataIndex: 'people',
      key: 'people',
      width: 90,
      render: (n: number | null) => n ?? '—',
    },
    {
      title: 'Copy-To column',
      key: 'category',
      width: 230,
      render: (_: unknown, r: DepartmentRow) => (
        <Select
          value={categoryOf(r)}
          onChange={(v) => choose(r, v)}
          options={categories.map(c => ({ value: c, label: c }))}
          style={{ width: 200 }}
          status={edits[r.department] !== undefined ? 'warning' : undefined}
        />
      ),
    },
    {
      title: 'Last changed',
      key: 'updated',
      width: 220,
      render: (_: unknown, r: DepartmentRow) => r.updatedAt
        ? <span style={{ fontSize: 12, color: '#888' }}>{dayjs(r.updatedAt).format('DD MMM YYYY, HH:mm')} · {r.updatedBy}</span>
        : <span style={{ fontSize: 12, color: '#ccc' }}>Not mapped yet</span>,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, r: DepartmentRow) => (
        <Tooltip title="Remove this department">
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(r)} />
        </Tooltip>
      ),
    },
  ]

  const run = status?.lastRun
  const ran = run && run.at

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>Dashboard</Button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#1a1a1a' }}>
            <ApartmentOutlined style={{ color: '#7c3aed', marginRight: 8 }} />
            Departments
          </h2>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>
            Which Copy-To column each department's employees appear in. A department that is not mapped goes to Others.
          </p>
        </div>
      </div>

      <div style={{
        background: '#faf8f5', border: '1px solid #ece6dc', borderRadius: 10,
        padding: '14px 18px', marginBottom: 16, fontSize: 13,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong>Employee sync from Microsoft 365</strong>
          {status?.enabled ? <Tag color="green">Hourly: on</Tag> : <Tag>Hourly: off</Tag>}
          {status?.dryRunSetting && <Tag color="orange">Dry run</Tag>}
          <span style={{ color: '#888' }}>
            {ran
              ? <>Last run {dayjs(run!.at).format('DD MMM YYYY, HH:mm')} — {run!.status}{run!.dryRun ? ' (dry run, nothing written)' : ''}</>
              : 'Not run since the server started'}
          </span>
          <div style={{ flex: 1 }} />
          <Button icon={<SyncOutlined />} loading={busy === 'sync'} onClick={syncNow}>Sync now</Button>
        </div>
        {ran && (
          <div style={{ marginTop: 8, color: '#555' }}>
            {run!.fullRun ? 'Full read' : 'Changes only'}: {run!.kept ?? 0} current employee{run!.kept === 1 ? '' : 's'} seen
            {' '}· added {run!.added ?? 0} · linked {run!.linkedExisting ?? 0} · updated {run!.updated ?? 0}
            {' '}· hidden {run!.hidden ?? 0} · shown again {run!.reactivated ?? 0}
            {run!.leftOut && Object.keys(run!.leftOut).length > 0 && (
              <> · left out: {Object.entries(run!.leftOut).map(([why, n]) => `${n} ${why}`).join(', ')}</>
            )}
            {run!.changes && run!.changes.length > 0 && (
              <Collapse
                size="small"
                style={{ marginTop: 8, background: '#fff' }}
                items={[{
                  key: 'changes',
                  label: `Changes (${run!.changes.length})`,
                  children: (
                    <div style={{ maxHeight: 260, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
                      {run!.changes.map((c, i) => <div key={i}>{c}</div>)}
                    </div>
                  ),
                }]}
              />
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Button icon={<CloudDownloadOutlined />} loading={busy === 'read'} onClick={readFromDirectory}>
          Read from Microsoft 365
        </Button>
        <span style={{ color: '#888', fontSize: 13 }}>
          {rows.length} departments · {unmapped} in Others
        </span>
        <div style={{ flex: 1 }} />
        {unsaved > 0 && <span style={{ color: '#d48806', fontSize: 13 }}>{unsaved} unsaved change{unsaved !== 1 ? 's' : ''}</span>}
        <Button type="primary" icon={<SaveOutlined />} disabled={unsaved === 0} loading={busy === 'save'} onClick={save}
          style={unsaved > 0 ? { background: '#7c3aed', borderColor: '#7c3aed' } : undefined}>
          Save
        </Button>
      </div>

      <Table
        rowKey="department"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        size="middle"
        locale={{ emptyText: 'No departments yet. Use "Read from Microsoft 365" to list them.' }}
      />
    </div>
  )
}
