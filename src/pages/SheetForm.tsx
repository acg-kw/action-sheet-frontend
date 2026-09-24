import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, message, Modal, Input, Tag, Tooltip, Progress } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, EyeOutlined, SendOutlined, ClearOutlined, PaperClipOutlined, PlusOutlined, DeleteOutlined, CloseCircleOutlined, SwapOutlined, FileOutlined, DownloadOutlined } from '@ant-design/icons'
import { useSheetsStore, useAuthStore } from '../store'
import { employeesApi, sheetsApi, projectsApi, recipientShortcutsApi } from '../api/client'
import dayjs from 'dayjs'

/* ════════════════════════════════════════
   AUTO-SHRINK INPUT — Smart font sizing
   ════════════════════════════════════════ */
function AutoShrinkInput({
  value,
  onChange,
  maxFontSize = 13,
  minFontSize = 9,
  className,
  style,
  ...rest
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  maxFontSize?: number
  minFontSize?: number
  className?: string
  style?: React.CSSProperties
  [key: string]: any
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fontSize, setFontSize] = useState(maxFontSize)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // Reset to max to measure true overflow
    el.style.fontSize = `${maxFontSize}px`
    requestAnimationFrame(() => {
      if (!el) return
      const scrollW = el.scrollWidth
      const clientW = el.clientWidth
      if (scrollW > clientW && clientW > 0) {
        const ratio = clientW / scrollW
        const newSize = Math.max(minFontSize, Math.floor(maxFontSize * ratio))
        setFontSize(newSize)
        el.style.fontSize = `${newSize}px`
      } else {
        setFontSize(maxFontSize)
        el.style.fontSize = `${maxFontSize}px`
      }
    })
  }, [value, maxFontSize, minFontSize])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={onChange}
      className={className}
      style={{ ...style, fontSize: `${fontSize}px`, transition: 'font-size 0.15s ease' }}
      {...rest}
    />
  )
}

/* ════════════════════════════════════════
   TYPES
   ════════════════════════════════════════ */
interface Employee {
  name: string
  email: string
  department: string
  role: string
  activeDirectory?: string
}



/* ════════════════════════════════════════
   COPY-TO CONFIGURATION (from legacy)
   ════════════════════════════════════════ */
const COPY_TO_LABELS = [
  'G.M', 'D. GM (Deputy GM)', "EX. M's (Executive Managers)", 'ACC. (Accounts)',
  'PM / PE', 'M.C. (Mgt. Consultant)', 'L.A. (Legal Advisor)',
  'O.M. (Operation Manager)', 'E/M  (Electro Mechanical)',
  'PL. E (Planning Engineer)', 'Others',
]

const HEADER_NAMES = [
  'General\nManager', 'Deputy\nGM', 'Executive\nManagers', 'Accounts',
  'Project Managers /\nEngineers', 'Management\nConsultant', 'Legal\nAdvisor', 'Operations\nManager',
  'Electro\nMechanical', 'Planning\nEngineer', 'Others',
]

// Categories that show employee search dialog
const SEARCHABLE_CATEGORIES: Record<number, string> = {
  2: 'EX.MS', 3: 'Accounts', 4: 'Project Manager',
  7: 'Operations Manager', 9: 'Planning Engineer', 10: 'Others',
}

// Fixed recipients for the non-searchable categories, keyed by column index.
// Loaded from the server after login (see recipientShortcutsApi).
type RecipientShortcuts = Record<number, { email: string; name: string }>

// Server keys -> Copy-To column index
const SHORTCUT_COLUMNS: Record<string, number> = { GM: 0, DGM: 1, MC: 5, LA: 6, EM: 8 }

function toShortcutColumns(data: unknown): RecipientShortcuts {
  const result: RecipientShortcuts = {}
  if (!data || typeof data !== 'object') return result
  Object.entries(data as Record<string, any>).forEach(([key, value]) => {
    const idx = SHORTCUT_COLUMNS[key]
    if (idx === undefined || !value || typeof value.email !== 'string') return
    result[idx] = { email: value.email.trim(), name: typeof value.name === 'string' ? value.name : key }
  })
  return result
}



/* ════════════════════════════════════════
   EMPLOYEE SELECTION DIALOG
   ════════════════════════════════════════ */
function EmployeeSelectionDialog({
  title, employees, currentAction, currentInfo,
  onApply, onClose, onAddEmployee, onDeleteEmployee,
  searchMode = false,
}: {
  title: string
  employees: Employee[]
  currentAction: Employee[]
  currentInfo: Employee[]
  onApply: (action: Employee[], info: Employee[]) => void
  onClose: () => void
  onAddEmployee: () => void
  onDeleteEmployee: () => void
  searchMode?: boolean
}) {
  const [selections, setSelections] = useState<Map<string, { forAction: boolean; forInfo: boolean }>>(new Map())
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    const m = new Map<string, { forAction: boolean; forInfo: boolean }>()
    // Initialize from all known employees
    employees.forEach(e => {
      m.set(e.email, {
        forAction: currentAction.some(a => a.email === e.email),
        forInfo: currentInfo.some(a => a.email === e.email),
      })
    })
    // Also ensure previously selected employees are in the map even if not in the list
    currentAction.forEach(e => {
      if (!m.has(e.email)) {
        m.set(e.email, { forAction: true, forInfo: false })
      }
    })
    currentInfo.forEach(e => {
      if (!m.has(e.email)) {
        m.set(e.email, { forAction: false, forInfo: true })
      }
    })
    setSelections(m)
  }, [employees, currentAction, currentInfo])

  const toggle = (email: string, type: 'forAction' | 'forInfo') => {
    setSelections(prev => {
      const next = new Map(prev)
      const cur = next.get(email) || { forAction: false, forInfo: false }
      if (type === 'forAction') {
        next.set(email, { forAction: !cur.forAction, forInfo: !cur.forAction ? false : cur.forInfo })
      } else {
        next.set(email, { forInfo: !cur.forInfo, forAction: !cur.forInfo ? false : cur.forAction })
      }
      return next
    })
  }

  // Build a merged employee list: previously selected + all available employees
  const allEmployeesMap = new Map<string, Employee>()
  // Add previously selected first
  currentAction.forEach(e => allEmployeesMap.set(e.email, e))
  currentInfo.forEach(e => allEmployeesMap.set(e.email, e))
  // Add from API list
  employees.forEach(e => allEmployeesMap.set(e.email, e))
  const allEmployees = Array.from(allEmployeesMap.values())

  const handleApply = () => {
    const action: Employee[] = []
    const info: Employee[] = []
    allEmployees.forEach(e => {
      const s = selections.get(e.email)
      if (s?.forAction) action.push(e)
      if (s?.forInfo) info.push(e)
    })
    onApply(action, info)
  }

  // Count selected
  const selectedCount = Array.from(selections.values()).filter(s => s.forAction || s.forInfo).length

  // Get previously selected employees (to show at top)
  const previouslySelected = allEmployees.filter(e => {
    return currentAction.some(a => a.email === e.email) || currentInfo.some(a => a.email === e.email)
  })

  // Filter: in searchMode start empty (except selected), show results only when 2+ chars typed
  const query = searchText.trim().toLowerCase()
  const searchedEmployees = searchMode
    ? (query.length >= 2
      ? allEmployees.filter(e =>
        (e.name?.toLowerCase().includes(query) || e.email?.toLowerCase().includes(query)) &&
        !previouslySelected.some(p => p.email === e.email))
      : [])
    : (query
      ? allEmployees.filter(e =>
        (e.name?.toLowerCase().includes(query) || e.email?.toLowerCase().includes(query)) &&
        !previouslySelected.some(p => p.email === e.email))
      : allEmployees.filter(e => !previouslySelected.some(p => p.email === e.email)))

  const renderEmployeeRow = (emp: Employee) => {
    const s = selections.get(emp.email) || { forAction: false, forInfo: false }
    return (
      <div className="employee-row" key={emp.email}>
        <div>
          <div className="employee-name">{emp.name}</div>
          <div className="employee-email">{emp.email}</div>
        </div>
        <div className="employee-checks">
          <label className="action">
            <input type="checkbox" checked={s.forAction} onChange={() => toggle(emp.email, 'forAction')} />
            For Action
          </label>
          <label className="info">
            <input type="checkbox" checked={s.forInfo} onChange={() => toggle(emp.email, 'forInfo')} />
            Info Copy
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="employee-dialog-overlay" onClick={onClose}>
      <div className="employee-dialog" onClick={e => e.stopPropagation()} style={{ maxHeight: 600 }}>
        <div className="employee-dialog-header">
          <span>{title} ({selectedCount} selected)</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button size="small" type="primary" icon={<PlusOutlined />}
              style={{ background: '#16a34a', borderColor: '#16a34a', fontSize: 11 }}
              onClick={onAddEmployee}>ADD</Button>
            <Button size="small" danger icon={<DeleteOutlined />}
              style={{ fontSize: 11 }}
              onClick={onDeleteEmployee}>DELETE</Button>
          </div>
        </div>

        {/* Previously selected section */}
        {previouslySelected.length > 0 && (
          <div style={{ borderBottom: '2px solid #2563eb' }}>
            <div style={{ padding: '6px 12px', background: '#eff6ff', fontSize: 11, fontWeight: 700, color: '#2563eb' }}>
              ✓ Currently Selected ({previouslySelected.length})
            </div>
            <div style={{ maxHeight: 150, overflowY: 'auto' }}>
              {previouslySelected.map(renderEmployeeRow)}
            </div>
          </div>
        )}

        {/* Search bar */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e5e5' }}>
          <Input
            placeholder={searchMode ? "Type to search employees..." : "Filter employees..."}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            autoFocus
            style={{ borderRadius: 6 }}
          />
        </div>
        <div className="employee-dialog-body">
          {searchMode && query.length < 2 && previouslySelected.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
              🔍 Type at least 2 characters to search employees
            </div>
          ) : searchedEmployees.length === 0 && previouslySelected.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
              {query ? `No employees matching "${searchText}"` : 'No employees stored yet. Click ADD to add employees.'}
            </div>
          ) : searchMode && query.length < 2 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#888', fontStyle: 'italic', fontSize: 12 }}>
              🔍 Type at least 2 characters to search for more employees
            </div>
          ) : searchedEmployees.map(renderEmployeeRow)}
        </div>
        <div className="employee-dialog-footer">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={handleApply}>Apply</Button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   ADD EMPLOYEE DIALOG
   ════════════════════════════════════════ */
function AddEmployeeDialog({ role, onClose, onAdded }: { role: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [dept, setDept] = useState('')
  const [ad, setAd] = useState('')

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) { message.error('Name and Email are required.'); return }
    try {
      // POST to backend — create employee
      await employeesApi.create({ name, email, department: dept || 'General', role, activeDirectory: ad })
      message.success('Employee added')
      onAdded()
      onClose()
    } catch {
      message.error('Failed to add employee')
    }
  }

  return (
    <div className="employee-dialog-overlay" onClick={onClose}>
      <div className="employee-dialog" style={{ maxHeight: 360 }} onClick={e => e.stopPropagation()}>
        <div className="employee-dialog-header" style={{ background: '#16a34a' }}>
          <span>Add Employee — {role}</span>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Name *</label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Email *</label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Department</label><Input value={dept} onChange={e => setDept(e.target.value)} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Active Directory</label><Input value={ad} onChange={e => setAd(e.target.value)} /></div>
        </div>
        <div className="employee-dialog-footer">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={handleSave} style={{ background: '#16a34a', borderColor: '#16a34a' }}>Save</Button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   SELECTED RECIPIENTS LIST
   ════════════════════════════════════════ */
function SelectedRecipientsList({
  empSelections,
  shortcuts,
  forAction,
  sendCopy,
  onRemove,
  onToggleRole,
}: {
  empSelections: Record<string, { action: Employee[]; info: Employee[] }>
  shortcuts: RecipientShortcuts
  forAction: boolean[]
  sendCopy: boolean[]
  onRemove: (role: string, email: string) => void
  onToggleRole: (role: string, email: string, currentType: 'action' | 'info') => void
}) {
  const allEntries: { role: string; emp: Employee; type: 'action' | 'info'; isHardcoded?: boolean }[] = []
  
  // Add employee selections from searchable categories
  Object.entries(empSelections).forEach(([role, sel]) => {
    sel.action.forEach(e => allEntries.push({ role, emp: e, type: 'action' }))
    sel.info.forEach(e => allEntries.push({ role, emp: e, type: 'info' }))
  })
  
  // Add hardcoded email recipients when checkboxes are checked
  Object.entries(shortcuts).forEach(([idxStr, mapping]) => {
    const idx = Number(idxStr)
    if (mapping.email) { // Skip empty emails
      const role = HEADER_NAMES[idx].replace('\n', ' ') // Get display name
      if (forAction[idx]) {
        allEntries.push({ 
          role, 
          emp: { email: mapping.email, name: mapping.name, department: '', role: '' }, 
          type: 'action',
          isHardcoded: true
        })
      } else if (sendCopy[idx]) {
        allEntries.push({ 
          role, 
          emp: { email: mapping.email, name: mapping.name, department: '', role: '' }, 
          type: 'info',
          isHardcoded: true
        })
      }
    }
  })

  if (allEntries.length === 0) return null

  return (
    <div className="selected-recipients-section">
      <div className="selected-recipients-header">
        <span>📋 Selected Recipients ({allEntries.length})</span>
      </div>
      <div className="selected-recipients-list">
        {allEntries.map(({ role, emp, type, isHardcoded }) => (
          <div className="selected-recipient-chip" key={`${role}-${emp.email}-${type}`}>
            <div className="selected-recipient-info">
              <span className="selected-recipient-name">{emp.name}</span>
              <span className="selected-recipient-role-label">{role}</span>
              {isHardcoded && (
                <span style={{ fontSize: 8, background: '#f3f4f6', color: '#6b7280', padding: '0 4px', borderRadius: 3, marginLeft: 4 }}>
                  Fixed
                </span>
              )}
            </div>
            <div className="selected-recipient-actions">
              <Tag color={type === 'action' ? 'red' : 'blue'} style={{ margin: 0, fontSize: 10 }}>
                {type === 'action' ? '⚡ For Action' : 'ℹ️ For Info'}
              </Tag>
              {!isHardcoded && (
                <>
                  <Tooltip title={`Switch to ${type === 'action' ? 'Info' : 'Action'}`}>
                    <Button
                      type="text" size="small"
                      icon={<SwapOutlined />}
                      onClick={() => onToggleRole(role, emp.email, type)}
                      style={{ fontSize: 11, color: '#666' }}
                    />
                  </Tooltip>
                  <Tooltip title="Remove">
                    <Button
                      type="text" size="small" danger
                      icon={<CloseCircleOutlined />}
                      onClick={() => onRemove(role, emp.email)}
                      style={{ fontSize: 11 }}
                    />
                  </Tooltip>
                </>
              )}
              {isHardcoded && (
                <Tooltip title="Uncheck the checkbox to remove">
                  <Button
                    type="text" size="small" disabled
                    icon={<CloseCircleOutlined />}
                    style={{ fontSize: 11, color: '#d1d5db' }}
                  />
                </Tooltip>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   MAIN FORM
   ════════════════════════════════════════ */
export default function SheetForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { } = useAuthStore()
  const { currentSheet, fetchSheet, createSheet, updateSheet } = useSheetsStore()
  const isEdit = !!id
  const projectFromUrl = searchParams.get('project') || ''

  // ── Optimistic UI State Management ──
  const pendingUpdatesRef = useRef<Record<string, any>>({})
  const updateTimerRef = useRef<number | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // ── Form Fields (matching legacy exactly) ──
  const [originalTo, setOriginalTo] = useState('')
  const [dateReceived, setDateReceived] = useState(dayjs().format('DD/MM/YYYY'))
  const [refNo, setRefNo] = useState('')
  const [documentDate, setDocumentDate] = useState(dayjs().format('DD/MM/YYYY'))
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('')
  const [response, setResponse] = useState('')
  const [createdBy, setCreatedBy] = useState('Ex.Sec')

  // Document type checkboxes
  const [isLetter, setIsLetter] = useState(false)
  const [isFax, setIsFax] = useState(false)
  const [isCopy, setIsCopy] = useState(false)
  const [isEmail, setIsEmail] = useState(true)

  // Informational Only
  const [informationalOnly, setInformationalOnly] = useState(false)

  // Copy-to checkboxes (11 columns × 2 rows)
  const [forAction, setForAction] = useState<boolean[]>(new Array(11).fill(false))
  const [sendCopy, setSendCopy] = useState<boolean[]>(new Array(11).fill(false))

  // Employee selections per category
  const [empSelections, setEmpSelections] = useState<Record<string, { action: Employee[]; info: Employee[] }>>({})

  // Fixed recipients for G.M / D.GM / M.C. / L.A. / E/M
  const [recipientShortcuts, setRecipientShortcuts] = useState<RecipientShortcuts>({})

  // Attachments
  const [attachments, setAttachments] = useState<File[]>([])
  const [legacyAttachments, setLegacyAttachments] = useState<string[]>([])
  const [isSending, setIsSending] = useState(false)
  
  // Upload progress tracking
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map())
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  // Dialogs
  const [employeeDialog, setEmployeeDialog] = useState<{ idx: number; role: string; type: 'action'|'info' } | null>(null)
  const [addEmployeeDialog, setAddEmployeeDialog] = useState<string | null>(null)
  const [categoryEmployees, setCategoryEmployees] = useState<Employee[]>([])

  // ── Optimistic UI: Debounced Auto-Save Function ──
  const debouncedAutoSave = useCallback(() => {
    if (!isEdit || !id) return // Only auto-save for existing drafts

    // Clear existing timer
    if (updateTimerRef.current) {
      window.clearTimeout(updateTimerRef.current)
    }

    // Set new timer to batch send after 500ms of inactivity
    updateTimerRef.current = window.setTimeout(async () => {
      if (Object.keys(pendingUpdatesRef.current).length === 0) return

      const updates = { ...pendingUpdatesRef.current }
      pendingUpdatesRef.current = {} // Clear pending updates

      try {
        setIsSyncing(true)
        await sheetsApi.patch(id, { formData: updates })
        console.log('Auto-saved:', updates)
      } catch (error) {
        console.error('Auto-save failed:', error)
        // Optionally show a subtle error indicator
      } finally {
        setIsSyncing(false)
      }
    }, 500)
  }, [isEdit, id])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current)
      }
    }
  }, [])

  // ── Optimistic Update Helper ──
  const optimisticUpdate = useCallback((field: string, value: any) => {
    // Accumulate changes
    pendingUpdatesRef.current[field] = value
    // Trigger debounced save
    debouncedAutoSave()
  }, [debouncedAutoSave])

  // Load existing sheet
  useEffect(() => {
    if (id) fetchSheet(id)
  }, [id, fetchSheet])

  // Load fixed recipients from the server
  useEffect(() => {
    recipientShortcutsApi.get()
      .then(r => setRecipientShortcuts(toShortcutColumns(r.data)))
      .catch(() => message.warning('Could not load the fixed recipients (G.M, M.C., L.A., E/M). Ticking those boxes will not email anyone until this is fixed.', 8))
  }, [])

  // Load attachments when sheet is loaded
  useEffect(() => {
    const loadAttachments = async () => {
      if (isEdit && id) {
        try {
          const result = await sheetsApi.listAttachments(id)
          if (result.data.attachments && result.data.attachments.length > 0) {
            setLegacyAttachments(result.data.attachments)
          }
        } catch (error) {
          console.error('Failed to load attachments:', error)
        }
      }
    }
    
    loadAttachments()
  }, [isEdit, id])

  useEffect(() => {
    if (isEdit && currentSheet) {
      const fd = currentSheet.formData || {}
      setOriginalTo(fd.originalTo || '')
      setDateReceived(fd.dateReceived || dayjs().format('DD/MM/YYYY'))
      setRefNo(fd.refNo || '')
      setDocumentDate(fd.documentDate || dayjs().format('DD/MM/YYYY'))
      setFrom(fd.from || '')
      setSubject(fd.subject || currentSheet.title || '')
      setResponse(fd.response || '')
      setCreatedBy(fd.createdBy || 'Ex.Sec')
      setIsLetter(!!fd.isLetter)
      setIsFax(!!fd.isFax)
      setIsCopy(!!fd.isCopy)
      setIsEmail(fd.isEmail !== false)
      setInformationalOnly(!!fd.informationalOnly)
      // Load checkboxes
      const fa = new Array(11).fill(false)
      const sc = new Array(11).fill(false)
      for (let i = 0; i < 11; i++) {
        if (fd[`forAction_${i}`]) fa[i] = true
        if (fd[`sendCopy_${i}`]) sc[i] = true
      }
      setForAction(fa)
      setSendCopy(sc)

      // Restore employee selections from formData
      const restored: Record<string, { action: Employee[]; info: Employee[] }> = {}
      Object.keys(SEARCHABLE_CATEGORIES).forEach(idxStr => {
        const role = SEARCHABLE_CATEGORIES[Number(idxStr)]
        const actionKey = `selected_${role}_action`
        const infoKey = `selected_${role}_info`
        if (fd[actionKey] || fd[infoKey]) {
          restored[role] = {
            action: Array.isArray(fd[actionKey]) ? fd[actionKey] : [],
            info: Array.isArray(fd[infoKey]) ? fd[infoKey] : [],
          }
        }
      })
      setEmpSelections(restored)

      // Note: Attachments are now loaded separately via API in useEffect
    }
  }, [isEdit, currentSheet])

  // Fetch employees for a category
  const loadCategoryEmployees = useCallback(async (role: string) => {
    try {
      const res = await employeesApi.getAll()
      const all: Employee[] = res.data
      // For 'Others', show ALL employees (like legacy AD search dialog)
      const filtered = role === 'Others' ? all : all.filter((e: Employee) => e.role === role)
      setCategoryEmployees(filtered)
    } catch {
      setCategoryEmployees([])
    }
  }, [])

  // Handle checkbox click
  const handleCheckboxClick = (idx: number, row: 'action' | 'info') => {
    if (informationalOnly && row === 'action') return

    const role = SEARCHABLE_CATEGORIES[idx]
    if (role) {
      // Open employee dialog
      loadCategoryEmployees(role)
      setEmployeeDialog({ idx, role, type: row })
    } else {
      // Direct toggle with optimistic update
      if (row === 'action') {
        const next = [...forAction]
        next[idx] = !next[idx]
        setForAction(next)
        optimisticUpdate(`forAction_${idx}`, next[idx])
      } else {
        const next = [...sendCopy]
        next[idx] = !next[idx]
        setSendCopy(next)
        optimisticUpdate(`sendCopy_${idx}`, next[idx])
      }
    }
  }

  // Employee dialog apply
  const handleEmployeeDialogApply = (action: Employee[], info: Employee[]) => {
    if (!employeeDialog) return
    const { idx, role } = employeeDialog
    setEmpSelections(prev => ({ ...prev, [role]: { action, info } }))
    const fa = [...forAction]; fa[idx] = action.length > 0; setForAction(fa)
    const sc = [...sendCopy]; sc[idx] = info.length > 0; setSendCopy(sc)
    setEmployeeDialog(null)
  }

  // Remove a selected recipient
  const handleRemoveRecipient = (role: string, email: string) => {
    setEmpSelections(prev => {
      const sel = prev[role]
      if (!sel) return prev
      const newAction = sel.action.filter(e => e.email !== email)
      const newInfo = sel.info.filter(e => e.email !== email)
      const updated = { ...prev, [role]: { action: newAction, info: newInfo } }
      // Update checkbox states
      const catIdx = Object.entries(SEARCHABLE_CATEGORIES).find(([, r]) => r === role)?.[0]
      if (catIdx !== undefined) {
        const idx = Number(catIdx)
        const fa = [...forAction]; fa[idx] = newAction.length > 0; setForAction(fa)
        const sc = [...sendCopy]; sc[idx] = newInfo.length > 0; setSendCopy(sc)
      }
      return updated
    })
  }

  // Toggle between action and info
  const handleToggleRecipientRole = (role: string, email: string, currentType: 'action' | 'info') => {
    setEmpSelections(prev => {
      const sel = prev[role]
      if (!sel) return prev
      const emp = currentType === 'action'
        ? sel.action.find(e => e.email === email)
        : sel.info.find(e => e.email === email)
      if (!emp) return prev

      let newAction = [...sel.action]
      let newInfo = [...sel.info]
      if (currentType === 'action') {
        newAction = newAction.filter(e => e.email !== email)
        newInfo = [...newInfo, emp]
      } else {
        newInfo = newInfo.filter(e => e.email !== email)
        newAction = [...newAction, emp]
      }
      const updated = { ...prev, [role]: { action: newAction, info: newInfo } }
      const catIdx = Object.entries(SEARCHABLE_CATEGORIES).find(([, r]) => r === role)?.[0]
      if (catIdx !== undefined) {
        const idx = Number(catIdx)
        const fa = [...forAction]; fa[idx] = newAction.length > 0; setForAction(fa)
        const sc = [...sendCopy]; sc[idx] = newInfo.length > 0; setSendCopy(sc)
      }
      return updated
    })
  }

  // Build form data map
  const getFormData = () => {
    const fd: Record<string, any> = {
      originalTo, dateReceived, refNo, documentDate, from, subject, response, createdBy,
      isLetter, isFax, isCopy, isEmail, informationalOnly,
    }
    forAction.forEach((v, i) => { fd[`forAction_${i}`] = v })
    sendCopy.forEach((v, i) => { fd[`sendCopy_${i}`] = v })
    // Employee selections
    Object.entries(empSelections).forEach(([role, sel]) => {
      fd[`selected_${role}_action`] = sel.action
      fd[`selected_${role}_info`] = sel.info
    })
    // Note: Attachments are now stored separately via AttachmentService
    // No need to save filenames in formData anymore
    return fd
  }

  // Build assignedTo map (email → name) and recipientTypes (email → ACTION/INFO)
  // from the empSelections state — this is what the backend uses for email sending
  const buildRecipientMaps = () => {
    const assignedTo: Record<string, string> = {}
    const recipientTypes: Record<string, string> = {}
    
    // Add employee selections from searchable categories
    Object.values(empSelections).forEach(sel => {
      sel.action.forEach(e => {
        assignedTo[e.email] = e.name
        recipientTypes[e.email] = 'ACTION'
      })
      sel.info.forEach(e => {
        assignedTo[e.email] = e.name
        recipientTypes[e.email] = 'INFO'
      })
    })
    
    // Add hardcoded emails for non-searchable categories
    Object.entries(recipientShortcuts).forEach(([idxStr, mapping]) => {
      const idx = Number(idxStr)
      if (mapping.email) { // Skip empty emails (like Deputy GM)
        // Check if "For Action" checkbox is checked
        if (forAction[idx]) {
          assignedTo[mapping.email] = mapping.name
          recipientTypes[mapping.email] = 'ACTION'
        }
        // Check if "For Information" checkbox is checked
        else if (sendCopy[idx]) {
          assignedTo[mapping.email] = mapping.name
          recipientTypes[mapping.email] = 'INFO'
        }
      }
    })
    
    return { assignedTo, recipientTypes }
  }

  // ── Actions ──
  const handleSaveDraft = async () => {
    try {
      const { assignedTo, recipientTypes } = buildRecipientMaps()
      let sheetId = id
      
      // Step 1: Create or update the sheet
      if (isEdit && id) {
        await updateSheet(id, { title: subject || 'Untitled', formData: getFormData(), status: 'DRAFT', projectId: projectFromUrl || undefined, assignedTo, recipientTypes })
      } else {
        const result = await createSheet({ title: subject || 'Untitled', formData: getFormData(), status: 'DRAFT', projectId: projectFromUrl || undefined, assignedTo, recipientTypes })
        sheetId = result.id // Get the newly created sheet ID
      }
      
      // Step 2: Upload new attachments if any
      if (attachments.length > 0 && sheetId) {
        try {
          const uploadResult = await sheetsApi.uploadAttachments(sheetId, attachments)
          console.log('Uploaded attachments:', uploadResult.data)
          message.success(`Draft saved with ${uploadResult.data.count} attachment(s)!`)
        } catch (uploadError) {
          console.error('Failed to upload attachments:', uploadError)
          message.warning('Draft saved but some attachments failed to upload')
        }
      } else {
        message.success('Draft saved!')
      }
      
      navigate('/')
    } catch (error) {
      console.error('Failed to save draft:', error)
      message.error('Failed to save draft')
    }
  }

  const handleSend = async () => {
    if (!subject.trim()) { message.warning('Please enter a subject'); return }
    const { assignedTo, recipientTypes } = buildRecipientMaps()
    if (Object.keys(assignedTo).length === 0) {
      message.warning('Please select at least one recipient before sending')
      return
    }
    
    setIsSending(true)
    message.loading({ content: 'Sending Action Sheet & Notifying Recipients...', key: 'send-progress', duration: 0 })
    
    try {
      let sheetId = id
      const isResend = isEdit && id && currentSheet && currentSheet.status !== 'DRAFT'
      
      // Step 1: Create or update the sheet
      if (isEdit && id) {
        await updateSheet(id, { title: subject, formData: getFormData(), status: 'PENDING', projectId: projectFromUrl || undefined, assignedTo, recipientTypes })
        sheetId = id
      } else {
        const result = await createSheet({ title: subject, formData: getFormData(), status: 'PENDING', projectId: projectFromUrl || undefined, assignedTo, recipientTypes })
        sheetId = result.id
      }
      
      // Step 2: Upload attachments if any
      if (attachments.length > 0 && sheetId) {
        try {
          await sheetsApi.uploadAttachments(sheetId, attachments)
        } catch (uploadError) {
          console.error('Failed to upload attachments:', uploadError)
          // Don't fail the send, just log it
        }
      }

      // Step 3: Everything is saved - release the email.
      // Idempotent: if the attachment upload already released it, this is a
      // no-op rather than a second email to every recipient.
      if (sheetId && !isResend) {
        await sheetsApi.finalizeSend(sheetId)
      }

      // Step 4: If editing an already-sent sheet, trigger resend to re-notify recipients
      if (isResend && sheetId) {
        try {
          await sheetsApi.resend(sheetId)
        } catch (resendError) {
          console.error('Resend notification failed:', resendError)
          // Sheet was saved — warn but don't fail
          message.warning({ content: 'Sheet updated but email re-notification failed. Recipients may need manual notification.', key: 'send-progress', duration: 4 })
          navigate('/')
          return
        }
      }
      
      message.success({ content: isResend ? 'Action Sheet re-sent successfully!' : 'Action Sheet sent successfully!', key: 'send-progress' })
      navigate('/')
    } catch (error) {
      console.error('Failed to send:', error)
      message.error({ content: 'Failed to send Action Sheet', key: 'send-progress' })
    } finally {
      setIsSending(false)
    }
  }

  const handleClear = () => {
    Modal.confirm({
      title: 'Clear Form?',
      content: 'All entered data will be lost.',
      okText: 'Clear', okType: 'danger',
      onOk: () => {
        setOriginalTo(''); setDateReceived(dayjs().format('DD/MM/YYYY')); setRefNo('')
        setDocumentDate(dayjs().format('DD/MM/YYYY')); setFrom(''); setSubject('')
        setResponse(''); setCreatedBy('Ex.Sec')
        setIsLetter(false); setIsFax(false); setIsCopy(false); setIsEmail(true)
        setInformationalOnly(false)
        setForAction(new Array(11).fill(false)); setSendCopy(new Array(11).fill(false))
        setEmpSelections({}); setAttachments([])
      },
    })
  }

  const handleRemoveAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  // Handle file selection with progress simulation
  const handleFileSelect = async (files: FileList) => {
    const fileArray = Array.from(files)
    setIsUploading(true)
    
    // Add files to attachments immediately (optimistic UI)
    setAttachments(prev => [...prev, ...fileArray])
    
    // Simulate upload progress for each file
    for (const file of fileArray) {
      const fileKey = `${file.name}-${file.size}-${Date.now()}`
      
      // Simulate progress from 0 to 100
      for (let progress = 0; progress <= 100; progress += 10) {
        setUploadingFiles(prev => new Map(prev).set(fileKey, progress))
        await new Promise(resolve => setTimeout(resolve, 50)) // 50ms delay per step
      }
      
      // Remove from uploading map when complete
      setUploadingFiles(prev => {
        const newMap = new Map(prev)
        newMap.delete(fileKey)
        return newMap
      })
    }
    
    setIsUploading(false)
    message.success(`${fileArray.length} file(s) attached successfully!`)
  }

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files)
    }
  }, [])

  // Add drag and drop to the attachment panel
  const attachmentPanelProps = {
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  }

  return (
    <div className="page-container fade-in" style={{ paddingTop: 16 }}>
      {/* Nav */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}
          style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
          ← Dashboard
        </Button>
        {isEdit && isSyncing && (
          <span style={{ fontSize: '0.75rem', color: '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              background: '#3b82f6',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
            Saving...
          </span>
        )}
      </div>

      <div className="sheet-form">
        {/* ═══ ROW 1: Company Header ═══ */}
        <div className="sheet-header">
          <span className="sheet-header-company">AL-AHLIA CONTRACTING GROUP</span>
          <img src="/acg_logo.jpg" alt="ACG" className="sheet-header-logo" />
          <span className="sheet-header-arabic">المجموعة الاهلية للمقاولات</span>
        </div>

        {/* ═══ ROW 2: Title Bar ═══ */}
        <div className="sheet-title-bar">
          <span className="sheet-title-label">ACTION SHEET</span>
        </div>

        {/* ═══ ROW 3: Document Type ═══ */}
        <div className="doc-type-row">
          {[
            { label: 'LETTER', val: isLetter, set: setIsLetter, field: 'isLetter' },
            { label: 'FAX', val: isFax, set: setIsFax, field: 'isFax' },
            { label: 'COPY', val: isCopy, set: setIsCopy, field: 'isCopy' },
            { label: 'E.MAIL', val: isEmail, set: setIsEmail, field: 'isEmail' },
          ].map(dt => (
            <div className="doc-type-cell" key={dt.label}>
              <label>{dt.label}</label>
              <input 
                type="checkbox" 
                checked={dt.val} 
                onChange={() => {
                  dt.set(!dt.val)
                  optimisticUpdate(dt.field, !dt.val)
                }}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} 
              />
            </div>
          ))}
        </div>

        {/* ═══ Document Info ═══ */}
        {/* Row: Original To | Date Received */}
        <div className="bi-field-row">
          <div className="bi-field">
            <span className="bi-field-label">Original To:</span>
            <AutoShrinkInput 
              value={originalTo} 
              onChange={e => {
                setOriginalTo(e.target.value)
                optimisticUpdate('originalTo', e.target.value)
              }} 
            />
            <span className="bi-field-label-ar">:الأصل إلى</span>
          </div>
          <div className="bi-field">
            <span className="bi-field-label">Date Received:</span>
            <AutoShrinkInput 
              value={dateReceived} 
              onChange={e => {
                setDateReceived(e.target.value)
                optimisticUpdate('dateReceived', e.target.value)
              }} 
            />
            <span className="bi-field-label-ar">:تاريخ الاستلام</span>
          </div>
        </div>

        {/* Row: Ref. No. | Document Date */}
        <div className="bi-field-row">
          <div className="bi-field">
            <span className="bi-field-label">Ref. No.:</span>
            <AutoShrinkInput 
              value={refNo} 
              onChange={e => {
                setRefNo(e.target.value)
                optimisticUpdate('refNo', e.target.value)
              }} 
            />
            <span className="bi-field-label-ar">:رقم الكتاب</span>
          </div>
          <div className="bi-field">
            <span className="bi-field-label">Document Date:</span>
            <AutoShrinkInput 
              value={documentDate} 
              onChange={e => {
                setDocumentDate(e.target.value)
                optimisticUpdate('documentDate', e.target.value)
              }} 
            />
            <span className="bi-field-label-ar">:تاريخ الكتاب</span>
          </div>
        </div>

        <div style={{ height: 10 }} />

        {/* Row: From (full width) */}
        <div className="bi-field-row full">
          <div className="bi-field">
            <span className="bi-field-label">From:</span>
            <AutoShrinkInput 
              value={from} 
              onChange={e => {
                setFrom(e.target.value)
                optimisticUpdate('from', e.target.value)
              }} 
            />
            <span className="bi-field-label-ar">:من</span>
          </div>
        </div>

        {/* Row: Subject (full width) */}
        <div className="bi-field-row full">
          <div className="bi-field">
            <span className="bi-field-label">Subject:</span>
            <AutoShrinkInput 
              value={subject} 
              onChange={e => {
                setSubject(e.target.value)
                optimisticUpdate('subject', e.target.value)
              }} 
              minFontSize={10}
            />
            <span className="bi-field-label-ar">:الموضوع</span>
          </div>
        </div>

        {/* Created By */}
        <div className="created-by-row">
          <label>Created By:</label>
          {['Ex.Sec', 'GM'].map(name => (
            <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="createdBy" 
                checked={createdBy === name}
                onChange={() => {
                  setCreatedBy(name)
                  optimisticUpdate('createdBy', name)
                }} 
                style={{ accentColor: 'var(--accent)' }} 
              />
              {name}
            </label>
          ))}
        </div>

        {/* ═══ Attachments ═══ */}
        <div 
          className="attachment-panel"
          {...attachmentPanelProps}
          style={{
            border: isDragOver ? '2px dashed #3b82f6' : '1px solid #e5e7eb',
            backgroundColor: isDragOver ? '#eff6ff' : 'transparent',
            borderRadius: 8,
            padding: isDragOver ? '16px' : '12px',
            transition: 'all 0.2s ease',
            position: 'relative',
          }}
        >
          {isDragOver && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderRadius: 8,
              zIndex: 10,
              pointerEvents: 'none',
            }}>
              <div style={{ textAlign: 'center', color: '#3b82f6' }}>
                <PaperClipOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Drop files here to attach</div>
              </div>
            </div>
          )}
          
          <Button 
            size="small" 
            icon={<PaperClipOutlined />}
            loading={isUploading}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            {isUploading ? 'Attaching...' : 'Add Document'}
          </Button>
          <Button size="small" danger onClick={() => { setAttachments([]); setLegacyAttachments([]) }}>Clear All</Button>
          <span className="label">
            {(attachments.length + legacyAttachments.length) === 0
              ? 'No files attached'
              : `${attachments.length + legacyAttachments.length} file(s) attached`}
          </span>
          <input id="file-input" type="file" multiple style={{ display: 'none' }}
            onChange={e => { 
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files)
                e.target.value = '' // Reset input
              }
            }} />
        </div>

        {/* ═══ Upload Progress ═══ */}
        {uploadingFiles.size > 0 && (
          <div style={{ 
            padding: '12px 16px', 
            background: '#f8fafc', 
            border: '1px solid #e2e8f0', 
            borderRadius: 8, 
            marginBottom: 12 
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: '#475569' }}>
              📎 Attaching Files...
            </div>
            {Array.from(uploadingFiles.entries()).map(([fileKey, progress]) => (
              <div key={fileKey} style={{ marginBottom: 8 }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: 4 
                }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {fileKey.split('-')[0]} {/* Extract filename */}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {progress}%
                  </span>
                </div>
                <Progress 
                  percent={progress} 
                  size="small" 
                  strokeColor="#3b82f6"
                  showInfo={false}
                />
              </div>
            ))}
          </div>
        )}

        {/* ═══ Legacy Attached Documents (from saved attachments) ═══ */}
        {legacyAttachments.length > 0 && (
          <div className="attached-files-list">
            {legacyAttachments.map((fileName, idx) => (
              <div className="attached-file-item" key={`legacy-${idx}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileOutlined style={{ color: '#7c3aed', fontSize: 14 }} />
                  <a href={id ? sheetsApi.downloadAttachment(id, fileName) : '#'} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, fontWeight: 500, color: '#7c3aed', textDecoration: 'none', cursor: 'pointer' }}
                    onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}>
                    {fileName.includes('_') ? fileName.substring(fileName.indexOf('_') + 1) : fileName}
                  </a>
                  <Tag color="purple" style={{ fontSize: 9, lineHeight: '16px', padding: '0 4px' }}>Saved</Tag>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Tooltip title="Preview document">
                    <Button type="text" size="small" icon={<EyeOutlined />}
                      onClick={() => id && window.open(sheetsApi.downloadAttachment(id, fileName), '_blank')}
                      style={{ fontSize: 11, color: '#7c3aed' }}
                    />
                  </Tooltip>
                  <Tooltip title="Download">
                    <a href={id ? sheetsApi.downloadAttachment(id, fileName) : '#'} download={fileName.includes('_') ? fileName.substring(fileName.indexOf('_') + 1) : fileName} style={{ display: 'inline-flex' }}>
                      <Button type="text" size="small" icon={<DownloadOutlined />}
                        style={{ fontSize: 11, color: '#2563eb' }}
                      />
                    </a>
                  </Tooltip>
                  <Tooltip title="Remove">
                    <Button type="text" size="small" danger icon={<CloseCircleOutlined />}
                      onClick={async () => {
                        if (id) {
                          try {
                            await sheetsApi.deleteAttachment(id, fileName)
                            setLegacyAttachments(prev => prev.filter((_, i) => i !== idx))
                            message.success('Attachment removed')
                          } catch {
                            message.error('Failed to remove attachment')
                          }
                        } else {
                          setLegacyAttachments(prev => prev.filter((_, i) => i !== idx))
                        }
                      }}
                      style={{ fontSize: 11 }}
                    />
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ New Attached Files List ═══ */}
        {attachments.length > 0 && (
          <div className="attached-files-list">
            {attachments.map((file, idx) => {
              const fileKey = `${file.name}-${file.size}`
              const isCurrentlyUploading = Array.from(uploadingFiles.keys()).some(key => key.startsWith(fileKey))
              
              return (
                <div className="attached-file-item" key={`${file.name}-${idx}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileOutlined style={{ 
                      color: isCurrentlyUploading ? '#f59e0b' : '#2563eb', 
                      fontSize: 14 
                    }} />
                    <a href="#" onClick={(e) => { e.preventDefault(); window.open(URL.createObjectURL(file), '_blank') }}
                      style={{ 
                        fontSize: 12, 
                        fontWeight: 500, 
                        color: isCurrentlyUploading ? '#f59e0b' : '#2563eb', 
                        textDecoration: 'none', 
                        cursor: 'pointer' 
                      }}
                      onMouseOver={ev => (ev.currentTarget.style.textDecoration = 'underline')}
                      onMouseOut={ev => (ev.currentTarget.style.textDecoration = 'none')}>
                      {file.name}
                    </a>
                    <span style={{ fontSize: 10, color: '#888' }}>
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                    {isCurrentlyUploading && (
                      <Tag color="orange" style={{ fontSize: 9, lineHeight: '16px', padding: '0 4px' }}>
                        Attaching...
                      </Tag>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Tooltip title="View file">
                      <Button type="text" size="small" icon={<EyeOutlined />}
                        onClick={() => {
                          const url = URL.createObjectURL(file)
                          window.open(url, '_blank')
                        }}
                        style={{ fontSize: 11, color: '#2563eb' }}
                      />
                    </Tooltip>
                    <Tooltip title="Remove">
                      <Button 
                        type="text" 
                        size="small" 
                        danger 
                        icon={<CloseCircleOutlined />}
                        onClick={() => handleRemoveAttachment(idx)}
                        style={{ fontSize: 11 }}
                        disabled={isCurrentlyUploading}
                      />
                    </Tooltip>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ Existing PDF/Attachment View (for edit mode) ═══ */}
        {isEdit && currentSheet?.pdfPath && (
          <div className="attached-files-list" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="attached-file-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileOutlined style={{ color: '#800000', fontSize: 14 }} />
                <a 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault()
                    sheetsApi.openPdf(currentSheet.pdfPath!)
                  }}
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, fontWeight: 600, color: '#800000', textDecoration: 'none', cursor: 'pointer' }}
                  onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}>
                  {currentSheet.pdfPath.split('/').pop() || currentSheet.pdfPath.split('\\').pop()}
                </a>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Tooltip title="Open PDF">
                  <Button type="primary" size="small" icon={<EyeOutlined />}
                    onClick={() => sheetsApi.openPdf(currentSheet.pdfPath!)}
                    style={{ fontSize: 11, background: '#800000', borderColor: '#800000' }}
                  >
                    View
                  </Button>
                </Tooltip>
                <Tooltip title="Download PDF">
                  <Button size="small" icon={<DownloadOutlined />}
                    onClick={() => sheetsApi.downloadPdf(currentSheet.pdfPath!)}
                    style={{ fontSize: 11 }}
                  >
                    Download
                  </Button>
                </Tooltip>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Copy To Grid ═══ */}
        <div className="copy-to-section" style={{ marginTop: 16 }}>
          <div className="copy-to-header">
            <span>Copy to:</span>
            <span style={{ direction: 'rtl' }}>:صورة إلى</span>
          </div>

          {/* Informational Only toggle */}


          <div className="copy-to-scroll-wrapper">
          <div className="copy-to-grid">
            {/* Header row */}
            <div className="header-cell" style={{ background: 'transparent' }} />
            {HEADER_NAMES.map((name, i) => (
              <div className="header-cell" key={i}>
                {name.split('\n').map((line, j) => <div key={j}>{line}</div>)}
                {/* Show chip count if employees selected */}
                {empSelections[SEARCHABLE_CATEGORIES[i]]?.action.length > 0 && (
                  <span style={{ fontSize: 8, background: 'var(--danger-muted)', color: 'var(--danger)',
                    padding: '0 4px', borderRadius: 3, marginTop: 2 }}>
                    {empSelections[SEARCHABLE_CATEGORIES[i]].action.length}A
                  </span>
                )}
                {empSelections[SEARCHABLE_CATEGORIES[i]]?.info.length > 0 && (
                  <span style={{ fontSize: 8, background: 'var(--info-muted)', color: 'var(--info)',
                    padding: '0 4px', borderRadius: 3, marginTop: 1 }}>
                    {empSelections[SEARCHABLE_CATEGORIES[i]].info.length}I
                  </span>
                )}
              </div>
            ))}

            {/* For Action row */}
            <div className="row-label">
              <span>For Action:</span>
              <span className="arabic">الإجراء اللازم</span>
            </div>
            {forAction.map((checked, i) => (
              <div className="check-cell" key={`action-${i}`}
                style={{ opacity: informationalOnly ? 0.4 : 1 }}>
                <input type="checkbox" checked={checked}
                  disabled={informationalOnly}
                  onChange={() => handleCheckboxClick(i, 'action')} />
              </div>
            ))}

            {/* For Information row */}
            <div className="row-label">
              <span>For Information:</span>
              <span className="arabic">للعلم</span>
            </div>
            {sendCopy.map((checked, i) => (
              <div className="check-cell" key={`info-${i}`}>
                <input type="checkbox" checked={checked}
                  onChange={() => handleCheckboxClick(i, 'info')} />
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* ═══ Selected Recipients Display ═══ */}
        <SelectedRecipientsList
          empSelections={empSelections}
          shortcuts={recipientShortcuts}
          forAction={forAction}
          sendCopy={sendCopy}
          onRemove={handleRemoveRecipient}
          onToggleRole={handleToggleRecipientRole}
        />

        {/* ═══ Response Section ═══ */}
        <div className="response-section" style={{ marginTop: 16 }}>
          <div className="response-header">
            <span>Response:</span>
            <span style={{ direction: 'rtl' }}>:الرد</span>
          </div>
          <textarea
            value={response}
            onChange={e => {
              setResponse(e.target.value)
              optimisticUpdate('response', e.target.value)
            }}
            placeholder="Enter response..."
          />
        </div>

        {/* ═══ Action Bar (bottom) ═══ */}
        <div className="form-action-bar">
          <Button icon={<SaveOutlined />} onClick={handleSaveDraft}
            style={{ background: '#f59e0b', borderColor: '#f59e0b', color: 'white', fontWeight: 600 }}>
            Save as Draft
          </Button>
          <Button icon={<EyeOutlined />}
            onClick={async () => {
              // Save first (as draft if new, update if existing) then open preview
              try {
                const { assignedTo, recipientTypes } = buildRecipientMaps()
                let sheetId = id
                if (isEdit && id) {
                  await updateSheet(id, { title: subject || 'Untitled', formData: getFormData(), status: currentSheet?.status || 'DRAFT', projectId: projectFromUrl || undefined, assignedTo, recipientTypes })
                } else {
                  const result = await createSheet({ title: subject || 'Untitled', formData: getFormData(), status: 'DRAFT', projectId: projectFromUrl || undefined, assignedTo, recipientTypes })
                  sheetId = result.id
                }
                if (sheetId) {
                  window.open(`/print?ids=${sheetId}`, '_blank')
                }
              } catch (err) {
                console.error('Preview failed:', err)
                message.error('Failed to generate preview. Please try saving first.')
              }
            }}
            style={{ background: '#3b82f6', borderColor: '#3b82f6', color: 'white', fontWeight: 600 }}>
            Preview
          </Button>
            <Button type="primary" size="large" icon={<SendOutlined />}
              onClick={handleSend} style={{ background: '#2563eb', fontWeight: 600, paddingInline: 24 }}
              loading={isSending}>
              {isSending ? 'Sending...' : (isEdit && currentSheet && currentSheet.status !== 'DRAFT' ? 'Resend Action Sheet' : 'Send Action Sheet')}
            </Button>
          <Button icon={<ClearOutlined />} onClick={handleClear}
            style={{ background: '#94a3b8', borderColor: '#94a3b8', color: 'white', fontWeight: 600 }}>
            Clear Form
          </Button>
        </div>
      </div>

      {/* ═══ Employee Dialog ═══ */}
      {employeeDialog && (
        <EmployeeSelectionDialog
          title={`Select ${COPY_TO_LABELS[employeeDialog.idx]}`}
          employees={categoryEmployees}
          currentAction={empSelections[employeeDialog.role]?.action || []}
          currentInfo={empSelections[employeeDialog.role]?.info || []}
          onApply={handleEmployeeDialogApply}
          onClose={() => setEmployeeDialog(null)}
          onAddEmployee={() => setAddEmployeeDialog(employeeDialog.role)}
          onDeleteEmployee={() => message.info('Delete employees from Settings > Employees')}
          searchMode={employeeDialog.role === 'Others'}
        />
      )}

      {/* ═══ Add Employee Dialog ═══ */}
      {addEmployeeDialog && (
        <AddEmployeeDialog
          role={addEmployeeDialog}
          onClose={() => setAddEmployeeDialog(null)}
          onAdded={() => {
            if (employeeDialog) loadCategoryEmployees(employeeDialog.role)
          }}
        />
      )}
    </div>
  )
}
