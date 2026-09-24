import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import { useAuthStore } from './store'
import { useWebSocket } from './hooks/useWebSocket'
import AppLayout from './components/AppLayout'
import WelcomePanel from './components/WelcomePanel'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import SheetDetail from './pages/SheetDetail'
import SheetForm from './pages/SheetForm'
import Employees from './pages/Employees'
import Repository from './pages/Repository'
import PrintView from './pages/PrintView'
import DraftRecovery from './pages/DraftRecovery'
import Settings from './pages/Settings'
import Projects from './pages/Projects'
import Trash from './pages/Trash'
import MonthlyInsights from './pages/MonthlyInsights'
import ConflictsView from './pages/ConflictsView'
import ReviewHub from './pages/ReviewHub'
import EmailResponse from './pages/EmailResponse'
import './index.css'

function AuthenticatedApp() {
  const { user } = useAuthStore()
  useWebSocket()
  const isReadOnly = user?.role?.toLowerCase() === 'viewer' || user?.role?.toLowerCase() === "ex.m's"
  if (!user) return <Navigate to="/login" replace />
  return (
    <Routes>
      <Route path="/print" element={<PrintView />} />
      <Route path="/*" element={
        <AppLayout>
          <WelcomePanel />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sheet/new" element={isReadOnly ? <Navigate to="/" replace /> : <SheetForm />} />
            <Route path="/sheet/:id" element={<SheetDetail />} />
            <Route path="/sheet/:id/edit" element={isReadOnly ? <Navigate to="/" replace /> : <SheetForm />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<Projects />} />
            <Route path="/repository" element={<Repository />} />
            <Route path="/insights" element={<MonthlyInsights />} />
            <Route path="/conflicts" element={<ConflictsView />} />
            <Route path="/review-hub" element={<ReviewHub />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin/trash" element={<Trash />} />
            <Route path="/admin/draft-recovery" element={<DraftRecovery />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      } />
    </Routes>
  )
}

import { Component, type ReactNode } from 'react'
interface EBState { hasError: boolean; error?: Error }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', minHeight:'100vh', background:'#faf8f5',
          color:'#1a1a1a', fontFamily:'Inter,sans-serif' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
          <h2 style={{ fontSize:'1.1rem', fontWeight:600, marginBottom:8 }}>Something went wrong</h2>
          <p style={{ color:'#888', fontSize:'0.85rem', marginBottom:24 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button onClick={() => window.location.reload()}
            style={{ padding:'10px 24px', background:'#2563eb', color:'white',
              border:'none', borderRadius:6, cursor:'pointer', fontWeight:500 }}>
            Reload Application
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#2563eb',
            borderRadius: 6,
            fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif",
            colorBgContainer: '#ffffff',
            colorBgElevated: '#ffffff',
            colorBorder: '#e5e0d8',
            colorText: '#1a1a1a',
            colorTextSecondary: '#5a5a5a',
            fontSize: 14,
          },
        }}
      >
        <AntApp>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/respond" element={<EmailResponse />} />
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </ErrorBoundary>
  )
}
