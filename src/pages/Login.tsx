import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Form, Input, Button, message } from 'antd'
import { ArrowRightOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { useAuthStore } from '../store'
import MaintenanceBanner from '../components/MaintenanceBanner'

export default function Login() {
  const [loading, setLoading] = useState(false)
  // Set when the password was correct but a new one must be chosen first.
  // The current password is kept only in memory, to confirm the change.
  const [mustChange, setMustChange] = useState<{ email: string; currentPassword: string } | null>(null)
  const navigate = useNavigate()
  const { login, changePassword, sessionEnded } = useAuthStore()

  const onFinish = async (values: { email: string; password?: string }) => {
    setLoading(true)
    try {
      const result = await login(values.email, values.password)
      if (result === 'ok') {
        message.success('Welcome back!')
        navigate('/')
      } else if (result === 'change') {
        setMustChange({ email: values.email, currentPassword: values.password || '' })
      } else {
        message.error('Invalid email or password')
      }
    } catch (error: any) {
      console.error('Login error:', error)
      if (error.response?.status === 500) {
        message.error('Server error. Please check if the backend is properly configured.')
      } else if (error.response?.status === 401) {
        message.error('Invalid email or password')
      } else if (error.response?.data?.message) {
        message.error(error.response.data.message)
      } else {
        message.error('Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const onChangePassword = async (values: { newPassword: string }) => {
    if (!mustChange) return
    setLoading(true)
    try {
      const problem = await changePassword(mustChange.email, mustChange.currentPassword, values.newPassword)
      if (problem) {
        message.error(problem)
      } else {
        setMustChange(null)
        message.success('Password changed. Welcome back!')
        navigate('/')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #faf8f5 0%, #f0ebe4 50%, #e8e0d4 100%)',
      }}
    >
      <MaintenanceBanner floating />
      <div
        className="fade-in login-card"
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'white',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '44px 36px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
          margin: '0 16px',
        }}
      >
        {/* Logo + Branding */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img
            src="/acg_logo.jpg"
            alt="ACG Logo"
            style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 16 }}
          />
          <h1 style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: '#800000',
            marginBottom: 4,
          }}>
            AL-AHLIA CONTRACTING GROUP
          </h1>
          <p style={{ color: '#800000', fontSize: '0.85rem', fontWeight: 600 }}>
            المجموعة الاهلية للمقاولات
          </p>
          <p style={{ color: '#888', fontSize: '0.78rem', marginTop: 8 }}>
            Action Sheet System v3.0
          </p>
        </div>

        {sessionEnded && !mustChange && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 20 }}
            message="Your session has ended. Please sign in again."
          />
        )}

        {mustChange ? (
          <Form name="change-password" onFinish={onChangePassword} layout="vertical" size="large">
            <p style={{ color: '#555', fontSize: '0.88rem', marginBottom: 20, textAlign: 'center' }}>
              For security, please choose a new password before continuing.
              You only need to do this once.
            </p>
            <Form.Item
              name="newPassword"
              rules={[
                { required: true, message: 'Please enter a new password' },
                { min: 8, message: 'At least 8 characters' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#aaa' }} />}
                placeholder="New password (at least 8 characters)"
                autoComplete="new-password"
                style={{ height: 48, fontSize: '0.95rem', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Please confirm the new password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    return !value || getFieldValue('newPassword') === value
                      ? Promise.resolve()
                      : Promise.reject(new Error('The two passwords do not match'))
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#aaa' }} />}
                placeholder="Confirm new password"
                autoComplete="new-password"
                style={{ height: 48, fontSize: '0.95rem', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, marginTop: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                icon={<ArrowRightOutlined />}
                style={{ height: 48, fontSize: '0.95rem', fontWeight: 600, borderRadius: 8, background: '#800000', borderColor: '#800000' }}
              >
                Save new password
              </Button>
            </Form.Item>
            <Button type="link" block style={{ marginTop: 8, color: '#888' }} onClick={() => setMustChange(null)}>
              Back to sign in
            </Button>
          </Form>
        ) : (
        <Form name="login" onFinish={onFinish} layout="vertical" size="large">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email or username' },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#aaa' }} />}
              placeholder="Email or Username"
              style={{
                height: 48,
                fontSize: '0.95rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: 'Please enter your password' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#aaa' }} />}
              placeholder="Enter your password"
              style={{
                height: 48,
                fontSize: '0.95rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              icon={<ArrowRightOutlined />}
              style={{
                height: 48,
                fontSize: '0.95rem',
                fontWeight: 600,
                borderRadius: 8,
                background: '#800000',
                borderColor: '#800000',
              }}
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>
        )}

        <div style={{
          textAlign: 'center', marginTop: 28, paddingTop: 16,
          borderTop: '1px solid var(--border)',
          color: '#bbb', fontSize: '0.72rem',
        }}>
          v3.0 · Modern Web Edition
        </div>
      </div>
    </div>
  )
}
