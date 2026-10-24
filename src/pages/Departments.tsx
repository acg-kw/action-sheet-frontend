import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Table, Select, Tag, Input, Modal, Tooltip, message } from 'antd'
import {
  ArrowLeftOutlined, ApartmentOutlined, SaveOutlined, SearchOutlined, PushpinFilled, EyeInvisibleOutlined, EyeOutlined,
} from '@ant-design/icons'
import { departmentsApi, DEPARTMENTS_CHANGED } from '../api/client'
import dayjs from 'dayjs'

interface Person {
  name: string
  email: string
  jobTitle: string | null
  department: string | null
  category: string
  fromActiveDirectory: boolean
  pinned: boolean
  group: boolean
}

interface DepartmentRow {
  department: string
  category: string
  updatedAt: string | null
  updatedBy: string | null
  employees: Person[]
}

interface Change {
  id: number
  department: string
  employee: string | null
  fromCategory: string | null
  toCategory: string
  changedBy: string
  changedAt: string
}

// "Changed by" for the employee sync
const AUTOMATIC = 'automatic'
const by = (who: string | null) => (who === AUTOMATIC ? 'Automatic (sync)' : who || '—')
const when = (d: string | null) => (d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '—')

/**
 * Department -> Copy-To column, with the people in each department.
 * New departments come from the employee sync as Others; an admin changes the
 * column here. Saving applies at once and is logged with who and when.
 */
export default function Departments() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<DepartmentRow[]>([])
  const [otherPeople, setOtherPeople] = useState<Person[]>([])
  const [hiddenPeople, setHiddenPeople] = useState<Person[]>([])
  const [newEmployees, setNewEmployees] = useState<Person[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const show = (data: any) => {
    setRows(data.departments || [])
    setOtherPeople(data.otherPeople || [])
    setHiddenPeople(data.hiddenPeople || [])
    setNewEmployees(data.newEmployees || [])
    setChanges(data.changes || [])
    setCategories(data.categories || [])
  }

  const load = async () => {
    setLoading(true)
    try {
      show((await departmentsApi.overview()).data)
    } catch {
      message.error('Failed to load the departments')
    } finally {
      setLoading(false)
    }
  }

  const categoryOf = (r: DepartmentRow) => edits[r.department] ?? r.category
  const unsaved = Object.keys(edits).length

  const choose = (r: DepartmentRow, category: string) => {
    setEdits(prev => {
      const next = { ...prev }
      if (category === r.category) delete next[r.department]
      else next[r.department] = category
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await departmentsApi.save(Object.entries(edits).map(([department, category]) => ({ department, category })))
      show(res.data)
      setEdits({})
      message.success(`Saved. ${res.data.employeesMoved} employee(s) moved to their new column.`)
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // One person: pin a column, unpin, hide or show. Applied at once and logged.
  const personChange = async (change: { email: string; column?: string; pinned?: boolean; hidden?: boolean; reviewed?: boolean }, done: string) => {
    try {
      show((await departmentsApi.person(change)).data)
      window.dispatchEvent(new Event(DEPARTMENTS_CHANGED))
      message.success(done)
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to save')
    }
  }

  const pin = (p: Person, column: string) => Modal.confirm({
    title: `Put ${p.name} in ${column}?`,
    content: 'The column is pinned: the employee sync and department changes will not move this person. You can unpin later.',
    okText: 'Pin',
    onOk: () => personChange({ email: p.email, column, pinned: true }, `${p.name}: ${column} (pinned)`),
  })

  const unpin = (p: Person) => Modal.confirm({
    title: `Unpin ${p.name}?`,
    content: 'The person follows their department again: a department with a real column moves them to it at once.',
    okText: 'Unpin',
    onOk: () => personChange({ email: p.email, pinned: false }, `${p.name}: unpinned`),
  })

  const hide = (p: Person) => Modal.confirm({
    title: `Hide "${p.name}" from the Copy-To lists?`,
    content: 'For entries that are not from Active Directory, such as system groups. You can show it again below.',
    okText: 'Hide',
    okType: 'danger',
    onOk: () => personChange({ email: p.email, hidden: true }, `${p.name}: hidden from the lists`),
  })

  // A search matches a department's name, or any of its people.
  const q = search.trim().toLowerCase()
  const matches = (p: Person) =>
    [p.name, p.email, p.jobTitle].some(v => v?.toLowerCase().includes(q))
  const visible = useMemo(() => !q ? rows : rows.filter(r =>
    r.department.toLowerCase().includes(q) || r.employees.some(matches)), [rows, q])
  const visibleOthers = useMemo(() => !q ? otherPeople : otherPeople.filter(matches), [otherPeople, q])
  // While searching for a person, open the departments they are in.
  const open = q ? visible.filter(r => r.employees.some(matches)).map(r => r.department) : expanded

  const people = rows.reduce((n, r) => n + r.employees.length, 0)
  const inOthers = rows.filter(r => categoryOf(r) === 'Others').length

  const columns = [
    {
      title: 'Department (Active Directory)',
      dataIndex: 'department',
      key: 'department',
      render: (d: string) => <strong>{d}</strong>,
    },
    {
      title: 'Employees',
      key: 'employees',
      width: 110,
      render: (_: unknown, r: DepartmentRow) => r.employees.length,
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
      width: 260,
      render: (_: unknown, r: DepartmentRow) => (
        <span style={{ fontSize: 12, color: '#888' }}>{when(r.updatedAt)} · {by(r.updatedBy)}</span>
      ),
    },
  ]

  const personColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (n: string) => <span style={{ fontWeight: 500 }}>{n}</span> },
    { title: 'E-mail', dataIndex: 'email', key: 'email', render: (e: string) => <span style={{ color: '#555' }}>{e}</span> },
    { title: 'Job title', dataIndex: 'jobTitle', key: 'jobTitle', render: (t: string | null) => t || <span style={{ color: '#ccc' }}>—</span> },
    {
      title: 'Copy-To column', key: 'category', width: 300,
      render: (_: unknown, p: Person) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Select
            size="small"
            value={p.category}
            onChange={(v) => pin(p, v)}
            options={(categories.includes(p.category) ? categories : [p.category, ...categories]).map(c => ({ value: c, label: c }))}
            style={{ width: 170 }}
          />
          {p.pinned && (
            <Tooltip title="Pinned by an admin: the sync and department changes do not move this person. Click to unpin.">
              <Tag color="purple" icon={<PushpinFilled />} style={{ cursor: 'pointer' }} onClick={() => unpin(p)}>Pinned</Tag>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      title: 'Source', key: 'source', width: 150,
      render: (_: unknown, p: Person) => p.fromActiveDirectory ? <Tag color="blue">Active Directory</Tag>
        : p.group ? <Tag color="gold">Group</Tag> : <Tag>Added by hand</Tag>,
    },
    {
      title: '', key: 'hide', width: 60,
      render: (_: unknown, p: Person) => !p.fromActiveDirectory && (
        <Tooltip title="Hide from the Copy-To lists (e.g. a system group)">
          <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => hide(p)} />
        </Tooltip>
      ),
    },
  ]

  const newColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (n: string) => <span style={{ fontWeight: 500 }}>{n}</span> },
    { title: 'E-mail', dataIndex: 'email', key: 'email', render: (e: string) => <span style={{ color: '#555' }}>{e}</span> },
    { title: 'Department', dataIndex: 'department', key: 'department' },
    { title: 'Job title', dataIndex: 'jobTitle', key: 'jobTitle', render: (t: string | null) => t || <span style={{ color: '#ccc' }}>—</span> },
    { title: 'Now in', dataIndex: 'category', key: 'now', width: 150, render: (c: string) => <Tag>{c}</Tag> },
    {
      title: 'Copy-To column', key: 'choose', width: 330,
      render: (_: unknown, p: Person) => (
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <Select
            size="small"
            placeholder="Choose a column"
            onChange={(v) => pin(p, v)}
            options={categories.map(c => ({ value: c, label: c }))}
            style={{ width: 170 }}
          />
          <Tooltip title={`Leave ${p.name} in ${p.category}, following the department`}>
            <Button size="small" onClick={() => personChange({ email: p.email, reviewed: true }, `${p.name}: stays ${p.category}`)}>
              Keep as is
            </Button>
          </Tooltip>
        </span>
      ),
    },
  ]

  const hiddenColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'E-mail', dataIndex: 'email', key: 'email', render: (e: string) => <span style={{ color: '#555' }}>{e}</span> },
    {
      title: '', key: 'show', width: 140,
      render: (_: unknown, p: Person) => (
        <Button size="small" icon={<EyeOutlined />}
          onClick={() => personChange({ email: p.email, hidden: false }, `${p.name}: shown in the lists again`)}>
          Show again
        </Button>
      ),
    },
  ]

  const changeColumns = [
    { title: 'When', dataIndex: 'changedAt', key: 'when', width: 170, render: when },
    { title: 'Department', dataIndex: 'department', key: 'department' },
    { title: 'Person', dataIndex: 'employee', key: 'employee', render: (e: string | null) => e || <span style={{ color: '#ccc' }}>—</span> },
    {
      title: 'Change', key: 'change', width: 300,
      render: (_: unknown, c: Change) => c.fromCategory
        ? <span>{c.fromCategory} → <strong>{c.toCategory}</strong></span>
        : <span>New department → <strong>{c.toCategory}</strong></span>,
    },
    { title: 'By', dataIndex: 'changedBy', key: 'by', width: 240, render: by },
  ]

  const heading = { margin: '28px 0 10px', fontSize: '1rem', fontWeight: 700, color: '#1a1a1a' }

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
            Which Copy-To column each department's employees appear in. New departments from Active Directory
            appear here automatically as Others. Open a department to see its employees; choosing a column for one
            person pins it, so the sync does not move them.
          </p>
        </div>
      </div>

      {newEmployees.length > 0 && (
        <div style={{
          background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '14px 18px', marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, color: '#5b21b6', marginBottom: 4 }}>
            New employees from Active Directory ({newEmployees.length})
          </div>
          <p style={{ margin: '0 0 10px', color: '#6b7280', fontSize: 13 }}>
            The employee sync added these people. Choose their Copy-To column, or keep the one they are in now
            (their department's column, or Others).
          </p>
          <Table rowKey="email" columns={newColumns} dataSource={newEmployees} pagination={false} size="small" />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#aaa' }} />}
          placeholder="Search a department or an employee"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 320 }}
        />
        <span style={{ color: '#888', fontSize: 13 }}>
          {rows.length} departments · {people} employees · {inOthers} department{inOthers !== 1 ? 's' : ''} in Others
        </span>
        <div style={{ flex: 1 }} />
        <Button size="small" onClick={() => setExpanded(expanded.length ? [] : rows.map(r => r.department))} disabled={!!q}>
          {expanded.length ? 'Close all' : 'Open all'}
        </Button>
        {unsaved > 0 && <span style={{ color: '#d48806', fontSize: 13 }}>{unsaved} unsaved change{unsaved !== 1 ? 's' : ''}</span>}
        <Button type="primary" icon={<SaveOutlined />} disabled={unsaved === 0} loading={saving} onClick={save}
          style={unsaved > 0 ? { background: '#7c3aed', borderColor: '#7c3aed' } : undefined}>
          Save
        </Button>
      </div>

      <Table
        rowKey="department"
        columns={columns}
        dataSource={visible}
        loading={loading}
        pagination={false}
        size="middle"
        expandable={{
          expandedRowKeys: open,
          onExpandedRowsChange: (keys) => { if (!q) setExpanded(keys as string[]) },
          rowExpandable: (r: DepartmentRow) => r.employees.length > 0,
          expandedRowRender: (r: DepartmentRow) => (
            <Table
              rowKey="email"
              columns={personColumns}
              dataSource={q ? r.employees.filter(p => r.department.toLowerCase().includes(q) || matches(p)) : r.employees}
              pagination={false}
              size="small"
            />
          ),
        }}
        locale={{ emptyText: 'No departments yet. They appear after the first employee sync.' }}
      />

      {visibleOthers.length > 0 && (
        <>
          <h3 style={heading}>Other people in the Copy-To lists ({visibleOthers.length})</h3>
          <p style={{ margin: '-4px 0 10px', color: '#888', fontSize: 13 }}>
            Not under a department above, for example distribution groups. Their column is set on each person.
          </p>
          <Table rowKey="email" columns={personColumns} dataSource={visibleOthers} pagination={false} size="small" />
        </>
      )}

      {hiddenPeople.length > 0 && (
        <>
          <h3 style={heading}>Hidden from the Copy-To lists ({hiddenPeople.length})</h3>
          <p style={{ margin: '-4px 0 10px', color: '#888', fontSize: 13 }}>
            Entries an admin hid, such as system groups. The employee sync does not bring them back.
          </p>
          <Table rowKey="email" columns={hiddenColumns} dataSource={hiddenPeople} pagination={false} size="small" />
        </>
      )}

      <h3 style={heading}>Change log</h3>
      <Table
        rowKey="id"
        columns={changeColumns}
        dataSource={changes}
        pagination={{ pageSize: 15, hideOnSinglePage: true }}
        size="small"
        locale={{ emptyText: 'No changes yet' }}
      />
    </div>
  )
}
