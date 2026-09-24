import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, Select, message, Tag, Tooltip } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, EditOutlined, UserOutlined } from '@ant-design/icons'
import { usersApi } from '../api/client'
import { useAuthStore } from '../store'
import dayjs from 'dayjs'

interface UserRecord {
  username: string
  email: string
  role: string
  createdTimestamp: number
  lastLogin: number
}

export default function Employees() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [editModal, setEditModal] = useState<UserRecord | null>(null)
  const [addForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await usersApi.list()
      setUsers(res.data || [])
    } catch { message.error('Failed to load users') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleAdd = async () => {
    try {
      const v = await addForm.validateFields()
      await usersApi.add(v)
      message.success(`User "${v.username}" added`)
      setAddModal(false)
      addForm.resetFields()
      fetchUsers()
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to add user')
    }
  }

  const handleEdit = async () => {
    if (!editModal) return
    try {
      const v = await editForm.validateFields()
      const payload: any = { username: v.username, role: v.role }
      if (v.password) payload.password = v.password
      await usersApi.update(editModal.email, payload)
      message.success('User updated')
      setEditModal(null)
      fetchUsers()
    } catch { message.error('Failed to update user') }
  }

  const handleDelete = (email: string, username: string) => {
    if (email === user?.email) { message.warning("You can't delete yourself"); return }
    Modal.confirm({
      title: 'Delete User',
      content: `Remove "${username}" (${email})? This cannot be undone.`,
      okText: 'Delete', okType: 'danger',
      onOk: async () => {
        await usersApi.remove(email)
        message.success('User deleted')
        fetchUsers()
      },
    })
  }

  const openEdit = (record: UserRecord) => {
    setEditModal(record)
    editForm.setFieldsValue({ username: record.username, role: record.role, password: '' })
  }

  const roleColor = (role: string) => {
    const map: Record<string, string> = { admin: 'red', gm: 'gold', user: 'blue', manager: 'green', "ex.m's": 'purple' }
    return map[role?.toLowerCase()] || 'default'
  }

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (t: string) => <strong>{t}</strong> },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Role', dataIndex: 'role', key: 'role', width: 100,
      render: (r: string) => <Tag color={roleColor(r)}>{r}</Tag> },
    { title: 'Created', dataIndex: 'createdTimestamp', key: 'created', width: 150,
      render: (t: number) => t ? dayjs(t).format('DD MMM YYYY') : '—' },
    { title: 'Last Login', dataIndex: 'lastLogin', key: 'login', width: 160,
      render: (t: number) => t ? dayjs(t).format('DD MMM YYYY, HH:mm') : 'Never' },
    { title: 'Actions', key: 'actions', width: 120,
      render: (_: unknown, r: UserRecord) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Tooltip title="Delete"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.email, r.username)} /></Tooltip>
        </div>
      ),
    },
  ]

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>Dashboard</Button>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
            <UserOutlined style={{ color: '#2563eb', marginRight: 8 }} />
            Manage Users
          </h2>
          <Tag>{users.length} users</Tag>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>Add User</Button>
      </div>

      <Table dataSource={users} columns={columns} rowKey="email" loading={loading} size="middle"
        pagination={{ pageSize: 20 }} />

      {/* Add User Modal */}
      <Modal title="Add User" open={addModal} onOk={handleAdd} onCancel={() => setAddModal(false)} okText="Add">
        <Form form={addForm} layout="vertical">
          <Form.Item name="username" label="Username" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}><Input.Password /></Form.Item>
          <Form.Item name="role" label="Role" initialValue="user">
            <Select options={[
              { value: 'admin', label: 'Admin' },
              { value: 'gm', label: 'General Manager (GM)' },
              { value: 'manager', label: 'Manager' },
              { value: 'user', label: 'User' },
              { value: "EX.M's", label: "EX.M's (View Only)" },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal title={`Edit — ${editModal?.username}`} open={!!editModal} onOk={handleEdit}
        onCancel={() => setEditModal(null)} okText="Save">
        <Form form={editForm} layout="vertical">
          <Form.Item name="username" label="Username" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="role" label="Role">
            <Select options={[
              { value: 'admin', label: 'Admin' },
              { value: 'gm', label: 'General Manager (GM)' },
              { value: 'manager', label: 'Manager' },
              { value: 'user', label: 'User' },
              { value: "EX.M's", label: "EX.M's (View Only)" },
            ]} />
          </Form.Item>
          <Form.Item name="password" label="New Password (leave blank to keep current)"><Input.Password /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
