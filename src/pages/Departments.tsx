import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Table, Select, Tag, Input, message } from 'antd'
import { ArrowLeftOutlined, ApartmentOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons'
import { departmentsApi } from '../api/client'
import dayjs from 'dayjs'

interface Person {
  name: string
  email: string
  jobTitle: string | null
  department: string | null
  category: string
  fromActiveDirectory: boolean
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
    { title: 'Copy-To column', dataIndex: 'category', key: 'category', width: 170, render: (c: string) => <Tag>{c}</Tag> },
    {
      title: 'Source', dataIndex: 'fromActiveDirectory', key: 'source', width: 150,
      render: (ad: boolean) => ad ? <Tag color="blue">Active Directory</Tag> : <Tag>Added by hand</Tag>,
    },
  ]

  const changeColumns = [
    { title: 'When', dataIndex: 'changedAt', key: 'when', width: 170, render: when },
    { title: 'Department', dataIndex: 'department', key: 'department' },
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
            appear here automatically as Others. Open a department to see its employees.
          </p>
        </div>
      </div>

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
