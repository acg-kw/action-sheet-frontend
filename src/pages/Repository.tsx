import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Calendar, Button, Upload, Tooltip, message, Modal, Dropdown, Input, Tag, Select, Form, Badge, Space } from 'antd'
import {
  UploadOutlined, DeleteOutlined, EyeOutlined, FileOutlined,
  FilePdfOutlined, FileImageOutlined, FileWordOutlined, FileExcelOutlined,
  FileZipOutlined, InboxOutlined, UndoOutlined,
  FolderOpenOutlined, PlusOutlined, CloseOutlined,
  EllipsisOutlined, UnorderedListOutlined, AppstoreOutlined,
  TeamOutlined, FileTextOutlined, ProjectOutlined,
  SearchOutlined, DownloadOutlined, ShareAltOutlined, EditOutlined, 
  TagsOutlined, FilterOutlined, SortAscendingOutlined,
  WarningFilled, CheckCircleFilled
} from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { repositoryApi, openBlob, saveBlob } from '../api/client'

interface RepoDocument {
  id: string
  fileName: string
  originalName: string
  uploaderName: string
  uploadTimestamp: number
  fileSize: number
  deleted: boolean
  deletedBy?: string
  deletedTimestamp?: number
  documentType?: string
  documentNumber?: string
  customerName?: string
  status?: string
  tags?: string[]
  confidence?: number
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return <FilePdfOutlined style={{ color: '#e53e3e', fontSize: 24 }} />
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return <FileImageOutlined style={{ color: '#805ad5', fontSize: 24 }} />
  if (['doc', 'docx'].includes(ext)) return <FileWordOutlined style={{ color: '#2b6cb0', fontSize: 24 }} />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileExcelOutlined style={{ color: '#38a169', fontSize: 24 }} />
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileZipOutlined style={{ color: '#d69e2e', fontSize: 24 }} />
  return <FileOutlined style={{ color: '#718096', fontSize: 24 }} />
}

function getFileColor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return '#e53e3e'
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return '#805ad5'
  if (['doc', 'docx'].includes(ext)) return '#2b6cb0'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '#38a169'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '#d69e2e'
  return '#718096'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function Repository() {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [docs, setDocs] = useState<RepoDocument[]>([])
  const [deletedDocs, setDeletedDocs] = useState<RepoDocument[]>([])
  const [docDates, setDocDates] = useState<Set<number>>(new Set())
  const [showDeleted, setShowDeleted] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileList, setFileList] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [searchResults, setSearchResults] = useState<RepoDocument[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())

  // Modal State
  const [editingDoc, setEditingDoc] = useState<RepoDocument | null>(null)
  const [form] = Form.useForm()

  const dateKey = selectedDate.format('YYYY-MM-DD')

  const fetchDocs = useCallback(async () => {
    try {
      const res = await repositoryApi.getDocuments(dateKey, showDeleted)
      const allDocs: RepoDocument[] = res.data || []
      setDocs(allDocs.filter(d => !d.deleted))
      setDeletedDocs(allDocs.filter(d => d.deleted))
    } catch {
      setDocs([])
      setDeletedDocs([])
    }
  }, [dateKey, showDeleted])

  const fetchDocDates = useCallback(async () => {
    try {
      const year = selectedDate.year()
      const month = selectedDate.month() + 1
      const res = await repositoryApi.getDatesWithDocs(year, month)
      setDocDates(new Set(res.data || []))
    } catch {
      setDocDates(new Set())
    }
  }, [selectedDate])

  useEffect(() => { fetchDocs() }, [fetchDocs])
  useEffect(() => { fetchDocDates() }, [fetchDocDates])

  // Global search with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await repositoryApi.searchDocuments(searchQuery.trim())
        setSearchResults(res.data || [])
      } catch {
        // Fallback: filter local docs only
        setSearchResults(null)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleFileUpload = useCallback(async () => {
    if (fileList.length === 0) return
    setUploading(true)
    try {
      await repositoryApi.upload(dateKey, fileList)
      message.success(`${fileList.length} file(s) uploaded to ${selectedDate.format('DD MMM YYYY')}`)
      setFileList([])
      fetchDocs()
      fetchDocDates()
    } catch {
      message.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }, [fileList, dateKey, selectedDate, fetchDocs, fetchDocDates])

  const handleFileSelect = useCallback((files: File[]) => {
    setFileList(prev => {
      const existingMap = new Map(prev.map(f => [`${f.name}-${f.size}`, f]))
      files.forEach(f => {
        const key = `${f.name}-${f.size}`
        if (!existingMap.has(key)) {
          existingMap.set(key, f)
        }
      })
      return Array.from(existingMap.values())
    })
  }, [])

  const handleRemoveFile = useCallback((index: number) => {
    setFileList(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) handleFileSelect(files)
  }, [handleFileSelect])

  // --- Actions ---

  const handleDelete = (doc: RepoDocument) => {
    Modal.confirm({
      title: 'Delete Document',
      content: `Hide "${doc.originalName}" from the repository?`,
      okText: 'Delete', okType: 'danger',
      onOk: async () => {
        await repositoryApi.deleteDocument(dateKey, doc.id)
        fetchDocs()
        fetchDocDates()
        message.success('Document hidden')
      },
    })
  }

  const handleRestore = async (doc: RepoDocument) => {
    await repositoryApi.restoreDocument(dateKey, doc.id)
    fetchDocs()
    fetchDocDates()
    message.success(`${doc.originalName} restored`)
  }

  // Documents are fetched with the login token, then opened or saved from
  // memory. Opening the API address directly is refused without the token.
  const handleOpen = async (doc: RepoDocument) => {
    const hide = message.loading('Opening...', 0)
    try {
      const blob = await repositoryApi.fetchDocument(dateKey, doc.fileName)
      hide()
      openBlob(blob, () => message.error('Pop-up blocked. Please allow pop-ups for this site.'))
    } catch {
      hide()
      message.error('Could not open the document. Please try again.')
    }
  }

  const handleDownload = async (doc: RepoDocument) => {
    const hide = message.loading('Downloading...', 0)
    try {
      const blob = await repositoryApi.fetchDocument(dateKey, doc.fileName)
      hide()
      saveBlob(blob, doc.originalName)
    } catch {
      hide()
      message.error('Could not download the document. Please try again.')
    }
  }

  const handleShare = (doc: RepoDocument) => {
    const url = window.location.origin + repositoryApi.downloadUrl(dateKey, doc.fileName)
    navigator.clipboard.writeText(url)
    message.success('Link copied to clipboard')
  }

  const handleEditMetadata = (doc: RepoDocument) => {
    setEditingDoc(doc)
    form.setFieldsValue({
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      customerName: doc.customerName,
      status: doc.status,
      tags: doc.tags || []
    })
  }

  const saveMetadata = async (values: any) => {
    if (!editingDoc) return
    try {
      await repositoryApi.updateDocumentMetadata(dateKey, editingDoc.id, {
        ...editingDoc,
        ...values
      })
      message.success('Metadata & tags updated successfully. The AI has learned from this correction.')
      setEditingDoc(null)
      fetchDocs()
    } catch (e) {
      message.error('Failed to update metadata')
    }
  }

  // --- Filtering & Sorting ---

  const isSearchActive = searchQuery.trim().length >= 2;

  const filteredDocs = useMemo(() => {
    // If global search is active and we have results, use those
    let result = isSearchActive && searchResults ? searchResults : docs;
    
    if (sortBy === 'recent') {
      result = [...result].sort((a, b) => b.uploadTimestamp - a.uploadTimestamp);
    } else if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.originalName.localeCompare(b.originalName));
    }
    
    return result;
  }, [docs, searchResults, isSearchActive, sortBy]);

  const dateCellRender = (value: Dayjs) => {
    const day = value.date()
    const sameMonth = value.month() === selectedDate.month() && value.year() === selectedDate.year()
    const hasDocs = sameMonth && docDates.has(day)
    if (!hasDocs) return null
    return (
      <div style={{
        position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
        width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)',
      }} />
    )
  }

  const contributorsCount = new Set(docs.map(d => d.uploaderName)).size;
  const projectsCount = docs.length > 0 ? Math.min(3, docs.length) : 0; 

  return (
    <div className="premium-repo fade-in">
      <style>{`
        .premium-repo {
          background-color: var(--bg-primary);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          height: calc(100vh - 60px);
          overflow: hidden;
        }
        .repo-sticky-header {
          position: sticky;
          top: 0;
          z-index: 10;
          padding: 24px 40px;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(16px);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .repo-header-title-section h1 {
          font-size: 24px;
          font-weight: 700;
          color: #111827;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .repo-header-title-section p {
          font-size: 13px;
          color: #6B7280;
          margin: 4px 0 0 40px;
          font-weight: 400;
        }
        .repo-main-grid {
          padding: 32px 40px;
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 32px;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .repo-card {
          background: #FFFFFF;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.06);
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          overflow: hidden;
        }
        .doc-row {
          background: #FFFFFF;
          border-radius: 14px;
          border: 1px solid rgba(0,0,0,0.06);
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          padding: 16px 20px;
          cursor: pointer;
        }
        .doc-row:hover {
          box-shadow: 0 6px 16px rgba(0,0,0,0.06);
          transform: translateY(-1px);
          background: #FAFAFA;
        }
        .doc-accent {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
        }
        .doc-name {
          font-weight: 600;
          font-size: 15px;
          color: #111827;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 350px;
        }
        .doc-meta-row {
          font-size: 12px;
          color: #6B7280;
          display: flex;
          gap: 16px;
          align-items: center;
          flex-wrap: wrap;
        }
        .doc-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }
        .doc-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
          align-items: center;
        }
        .header-controls {
          display: flex;
          gap: 16px;
          align-items: center;
          flex-wrap: wrap;
        }
        .header-search-input {
          width: 320px;
          border-radius: 20px;
          background: #F3F4F6;
          border: 1px solid transparent;
          box-shadow: none;
          padding: 6px 16px;
        }
        /* Minimal Calendar Overrides */
        .premium-repo .ant-picker-calendar { background: transparent !important; }
        .premium-repo .ant-picker-calendar-header { padding: 4px 12px 12px 12px !important; }
        .premium-repo .ant-picker-calendar-header .ant-radio-group { display: none !important; }
        .premium-repo .ant-picker-cell { position: relative !important; }
        .premium-repo .ant-picker-cell-inner { min-width: 28px !important; height: 28px !important; line-height: 28px !important; border-radius: 50% !important; }
        .premium-repo .ant-picker-cell-selected .ant-picker-cell-inner { background: var(--accent) !important; color: #FFFFFF !important; font-weight: 700 !important; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35) !important; }
        .premium-repo .ant-picker-cell-today .ant-picker-cell-inner::before { border-color: var(--accent) !important; border-radius: 50% !important; }
        .upload-zone { border: 1px dashed rgba(0,0,0,0.15); border-radius: 12px; background: #FAFAFA; transition: all 0.2s ease; padding: 20px; text-align: center; }
        .upload-zone:hover { border-color: #3B82F6; background: #EFF6FF; }
        .controls-pill {
          background: #FFFFFF; border: 1px solid rgba(0,0,0,0.06); border-radius: 20px; padding: 6px 16px; font-size: 13px; color: #4B5563;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s;
          white-space: nowrap;
        }
        .controls-pill:hover { background: #F9FAFB; }
        
        .scrollable-feed::-webkit-scrollbar,
        .repo-sidebar::-webkit-scrollbar { width: 6px; }
        .scrollable-feed::-webkit-scrollbar-thumb,
        .repo-sidebar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }

        .repo-sidebar {
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: 100%;
          min-width: 0;
          overflow-y: auto;
          padding-right: 8px;
          padding-bottom: 32px;
        }

        /* ===== NARROW DESKTOP / TABLET (≤1100px) — sidebar shrinks ===== */
        @media (max-width: 1100px) {
          .repo-sticky-header {
            padding: 16px 20px;
          }
          .repo-main-grid {
            grid-template-columns: 250px 1fr;
            padding: 24px 20px;
            gap: 20px;
          }
          .header-search-input {
            width: 220px;
          }
          .doc-name {
            max-width: 200px;
          }
        }

        /* ===== TABLET (≤900px) — go single column, sidebar below ===== */
        @media (max-width: 900px) {
          .repo-sticky-header {
            flex-direction: column;
            align-items: stretch;
            padding: 14px 16px;
            gap: 10px;
          }
          .repo-header-title-section h1 {
            font-size: 20px !important;
          }
          .repo-header-title-section h1 .anticon {
            font-size: 22px !important;
          }
          .repo-header-title-section p {
            margin-left: 0 !important;
            font-size: 12px !important;
          }
          .header-controls {
            gap: 8px;
            width: 100%;
          }
          .header-search-input {
            width: 100% !important;
            flex: 1;
            min-width: 0;
          }
          .repo-main-grid {
            grid-template-columns: 1fr;
            padding: 16px;
            gap: 16px;
          }
          .repo-sidebar {
            order: 2;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 12px;
            height: auto;
          }
          .repo-sidebar > .repo-card:first-child {
            flex: 1 1 260px;
            min-width: 0;
          }
          .repo-sidebar > div:last-child {
            flex: 1 1 200px;
            min-width: 0;
          }
          .scrollable-feed {
            order: 1;
            overflow: visible !important;
          }
          .doc-row {
            padding: 12px 14px;
          }
          .doc-name {
            max-width: calc(100% - 40px);
            font-size: 14px;
          }
          .doc-meta-row {
            gap: 8px;
            font-size: 11px;
          }
          .doc-title-row {
            gap: 8px;
          }
        }

        /* ===== SMALL TABLET (≤650px) ===== */
        @media (max-width: 650px) {
          .repo-sticky-header {
            padding: 12px 12px;
          }
          .repo-header-title-section h1 {
            font-size: 18px !important;
            gap: 8px !important;
          }
          .repo-header-title-section h1 .anticon {
            font-size: 20px !important;
          }
          .header-controls {
            gap: 6px;
          }
          .controls-pill {
            padding: 5px 10px;
            font-size: 12px;
            gap: 4px;
          }
          .repo-main-grid {
            padding: 12px 10px;
            gap: 12px;
          }
          .repo-sidebar {
            flex-direction: column;
          }
          .doc-row {
            padding: 10px 12px;
            flex-wrap: wrap;
            gap: 6px;
          }
          .doc-name {
            max-width: calc(100vw - 100px);
            font-size: 13px;
          }
          .doc-meta-row {
            gap: 6px;
          }
          .doc-actions {
            width: 100%;
            justify-content: flex-end;
            border-top: 1px solid rgba(0,0,0,0.04);
            padding-top: 6px;
            margin-top: 2px;
          }
          .upload-zone {
            padding: 14px;
          }
        }

        /* ===== PHONE (≤420px) ===== */
        @media (max-width: 420px) {
          .repo-sticky-header {
            padding: 10px 8px;
          }
          .repo-header-title-section h1 {
            font-size: 16px !important;
          }
          .repo-header-title-section p {
            font-size: 11px !important;
          }
          .repo-main-grid {
            padding: 8px 6px;
            gap: 10px;
          }
          .header-search-input {
            font-size: 13px !important;
          }
          .controls-pill {
            padding: 4px 8px;
            font-size: 11px;
          }
          .doc-row {
            padding: 8px 10px;
          }
          .doc-name {
            max-width: calc(100vw - 80px);
            font-size: 12px;
          }
          .doc-meta-row {
            font-size: 10px;
            gap: 4px;
          }
        }
      `}</style>

      {/* STICKY REPOSITORY HEADER */}
      <div className="repo-sticky-header">
        <div className="repo-header-title-section">
          <h1>
            <FolderOpenOutlined style={{ color: '#111827' }} />
            Document Repository
          </h1>
          <p>
            {docs.length} documents • {projectsCount} projects • AI Tagging Enabled
          </p>
        </div>
        
        <div className="header-controls">
          <Input 
            className="header-search-input"
            prefix={<SearchOutlined style={{ color: '#9CA3AF' }} />} 
            placeholder="Search documents, tags, types..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ borderRadius: 20, background: '#F3F4F6', border: '1px solid transparent', boxShadow: 'none', padding: '6px 16px' }}
            allowClear
          />
          
          <Dropdown menu={{
            items: [
              { key: 'recent', label: 'Most Recent', onClick: () => setSortBy('recent') },
              { key: 'name', label: 'Alphabetical', onClick: () => setSortBy('name') }
            ]
          }}>
            <div className="controls-pill">
              <SortAscendingOutlined /> Sort
            </div>
          </Dropdown>

          <Dropdown menu={{
            items: [
              { key: 'download', label: 'Download All', icon: <DownloadOutlined /> },
              { key: 'delete', label: 'Delete Selected', icon: <DeleteOutlined />, danger: true }
            ]
          }}>
            <div className="controls-pill">
              <UnorderedListOutlined /> Bulk Actions
            </div>
          </Dropdown>
        </div>
      </div>

      <div className="repo-main-grid" style={{ flex: 1 }}>
        
        {/* LEFT SIDEBAR (Fixed/Non-Scrolling) */}
        <div className="repo-sidebar">
          
          <div className="repo-card" style={{ padding: '12px' }}>
            <Calendar
              fullscreen={false}
              value={selectedDate}
              onSelect={(date) => setSelectedDate(date)}
              onPanelChange={(date) => { setSelectedDate(date); }}
              cellRender={(current, info) => {
                if (info.type === 'date') return dateCellRender(current as Dayjs)
                return info.originNode
              }}
            />
            <div style={{ padding: '8px 12px 4px', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, textAlign: 'center', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ flex: 1 }}>{selectedDate.format('ddd, DD MMM YYYY')}</span>
              {!selectedDate.isSame(dayjs(), 'day') && (
                <Button type="link" size="small" style={{ fontSize: '11px', padding: 0 }} onClick={() => setSelectedDate(dayjs())}>Today</Button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ margin: '8px 0 0 0', fontSize: '13px', fontWeight: 600, color: '#111827' }}>Quick Upload</h4>
            <div className="repo-card upload-zone"
              ref={dropRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                borderColor: dragOver ? '#3B82F6' : undefined,
                background: dragOver ? '#EFF6FF' : undefined,
              }}
            >
              <InboxOutlined style={{ fontSize: 24, color: '#9CA3AF', marginBottom: 8 }} />
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#4B5563' }}>Drag & drop files</div>
              
              <Upload
                multiple 
                showUploadList={false}
                beforeUpload={(file, fileList) => {
                  if (fileList[fileList.length - 1] === file) {
                    handleFileSelect(fileList as unknown as File[])
                  }
                  return false
                }}
              >
                <Button shape="round" size="small" style={{ marginTop: 12, fontWeight: 500 }}>
                  Select Files
                </Button>
              </Upload>
            </div>
            
            {fileList.length > 0 && (
               <div style={{ marginTop: 4 }}>
                 <Button type="primary" block shape="round" onClick={handleFileUpload} loading={uploading}>
                   Upload {fileList.length} Files
                 </Button>
               </div>
            )}
          </div>
        </div>

        {/* CENTER / MAIN DOCUMENT FEED (Scrollable) */}
        <div className="scrollable-feed" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: 12 }}>
          
          {/* Queued files for upload list */}
          {fileList.length > 0 && (
            <div style={{ marginBottom: 24, padding: 16, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: 12, color: '#1E40AF' }}>
                Ready to Upload ({fileList.length})
              </div>
              {fileList.map((file, idx) => (
                <div key={idx} className="doc-row" style={{ padding: '12px 16px', marginBottom: 8, border: 'none' }}>
                  {getFileIcon(file.name)}
                  <div style={{ flex: 1, marginLeft: 16, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{file.name}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>{formatSize(file.size)}</div>
                  </div>
                  <Button type="text" size="small" danger icon={<CloseOutlined />} onClick={() => handleRemoveFile(idx)} disabled={uploading} />
                </div>
              ))}
            </div>
          )}

          {/* Search indicator */}
          {isSearchActive && (
            <div style={{ 
              padding: '10px 16px', marginBottom: 12, borderRadius: 10, 
              background: 'linear-gradient(135deg, #EFF6FF, #F0F9FF)', 
              border: '1px solid #BFDBFE',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' 
            }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#1E40AF' }}>
                {searching ? '🔍 Searching all dates...' : `🔍 Found ${filteredDocs.length} result${filteredDocs.length !== 1 ? 's' : ''} across all dates`}
              </span>
              <Button type="link" size="small" onClick={() => setSearchQuery('')} style={{ fontSize: '12px' }}>Clear</Button>
            </div>
          )}

          {filteredDocs.length === 0 && !showDeleted ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9CA3AF', background: '#FFFFFF', borderRadius: 16, border: '1px dashed rgba(0,0,0,0.1)' }}>
              <SearchOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block', color: '#D1D5DB' }} />
              <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: 8, color: '#4B5563' }}>
                {isSearchActive ? 'No matching documents found' : 'No documents for this date'}
              </div>
              <div style={{ fontSize: '13px' }}>
                {isSearchActive ? 'Try a different search term' : 'Upload files or select another date'}
              </div>
            </div>
          ) : (
            <>
              {filteredDocs.map(doc => (
                <div key={doc.id} className="doc-row" onDoubleClick={() => handleOpen(doc)}>
                  <div className="doc-accent" style={{ background: getFileColor(doc.fileName) }} />
                  <div style={{ paddingLeft: 8 }}>
                    {getFileIcon(doc.fileName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, marginLeft: 16 }}>
                    <div className="doc-title-row">
                      <Tooltip title={doc.originalName}>
                        <div className="doc-name">
                          {doc.originalName.replace(/\.[^/.]+$/, "")}
                        </div>
                      </Tooltip>
                      
                      {doc.documentType && (
                        <Tag color="blue" style={{ border: 'none', fontWeight: 600 }}>{doc.documentType}</Tag>
                      )}
                      
                      {(doc.confidence || 0) > 0 && (
                        <Tooltip title={`AI Confidence: ${doc.confidence}%`}>
                          <span style={{ fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                            color: (doc.confidence || 0) >= 85 ? '#059669' : '#D97706' 
                          }}>
                            {(doc.confidence || 0) >= 85 ? <CheckCircleFilled /> : <WarningFilled />}
                            {doc.confidence}%
                          </span>
                        </Tooltip>
                      )}
                    </div>
                    
                    {/* Tags */}
                    {doc.tags && doc.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        {doc.tags.map((tag, i) => (
                          <span key={i} style={{ background: '#F3F4F6', color: '#4B5563', fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '12px' }}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="doc-meta-row">
                      {doc.documentNumber && <span><strong style={{color:'#4B5563'}}>ID:</strong> {doc.documentNumber}</span>}
                      {doc.customerName && <span><strong style={{color:'#4B5563'}}>Cust:</strong> {doc.customerName}</span>}
                      <span>{formatSize(doc.fileSize)}</span>
                      <span>{doc.uploaderName}</span>
                      <span>{dayjs(doc.uploadTimestamp).format('hh:mm A')}</span>
                    </div>
                  </div>
                  <div className="doc-actions">
                    <Tooltip title="Preview">
                      <Button type="text" style={{ color: '#6B7280' }} icon={<EyeOutlined />} onClick={() => handleOpen(doc)} />
                    </Tooltip>
                    <Dropdown menu={{
                      items: [
                        { key: 'preview', icon: <EyeOutlined />, label: 'Preview', onClick: () => handleOpen(doc) },
                        { key: 'download', icon: <DownloadOutlined />, label: 'Download', onClick: () => handleDownload(doc) },
                        { key: 'share', icon: <ShareAltOutlined />, label: 'Share Link', onClick: () => handleShare(doc) },
                        { type: 'divider' },
                        { key: 'tags', icon: <TagsOutlined />, label: 'Edit Tags / Metadata', onClick: () => handleEditMetadata(doc) },
                        { type: 'divider' },
                        { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => handleDelete(doc) }
                      ]
                    }} trigger={['click']}>
                      <Button type="text" style={{ color: '#6B7280' }} icon={<EllipsisOutlined style={{ fontSize: 18 }} />} />
                    </Dropdown>
                  </div>
                </div>
              ))}

              {showDeleted && deletedDocs.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <DeleteOutlined /> Deleted Documents ({deletedDocs.length})
                  </div>
                  {deletedDocs.map(doc => (
                    <div key={doc.id} className="doc-row" style={{ opacity: 0.6, background: '#FAFAFA' }}>
                      <div className="doc-accent" style={{ background: '#9CA3AF' }} />
                      <div style={{ paddingLeft: 8, filter: 'grayscale(100%)' }}>
                        {getFileIcon(doc.fileName)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, marginLeft: 16 }}>
                        <div style={{ fontWeight: 500, fontSize: '14px', color: '#6B7280', textDecoration: 'line-through' }}>
                          {doc.originalName}
                        </div>
                        <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: 4 }}>
                          Deleted by {doc.deletedBy}
                        </div>
                      </div>
                      <Tooltip title="Restore">
                        <Button type="text" icon={<UndoOutlined style={{ color: '#059669' }} />} onClick={() => handleRestore(doc)}>Restore</Button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          
          <div style={{ marginTop: 24, paddingBottom: 40, display: 'flex', justifyContent: 'center' }}>
            <Button type="link" size="small" onClick={() => setShowDeleted(!showDeleted)} style={{ color: showDeleted ? '#E53E3E' : '#6B7280', fontSize: '12px' }}>
              {showDeleted ? 'Hide Deleted Documents' : 'Show Deleted Documents'}
            </Button>
          </div>
          
        </div>
      </div>

      {/* EDIT METADATA MODAL */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TagsOutlined style={{ color: '#3B82F6' }} /> Edit Metadata & Tags
          </div>
        }
        open={!!editingDoc}
        onCancel={() => setEditingDoc(null)}
        onOk={() => form.submit()}
        okText="Save & Train AI"
        okButtonProps={{ style: { background: '#111827' } }}
      >
        <div style={{ marginBottom: 16, padding: 12, background: '#EFF6FF', borderRadius: 8, fontSize: '13px', color: '#1E3A8A' }}>
          <strong>Learning System:</strong> Modifying the Document Type or Tags will automatically train the AI to better classify similar files in the future.
        </div>
        <Form form={form} layout="vertical" onFinish={saveMetadata}>
          <Form.Item name="documentType" label="Document Type">
            <Input placeholder="e.g. Invoice, Action Sheet, Contract" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="documentNumber" label="Document Number" style={{ flex: 1 }}>
              <Input placeholder="e.g. INV-2026-01" />
            </Form.Item>
            <Form.Item name="customerName" label="Customer Name" style={{ flex: 1 }}>
              <Input placeholder="e.g. Acme Corp" />
            </Form.Item>
          </div>
          <Form.Item name="status" label="Status">
            <Select placeholder="Select Status" options={[
              { value: 'Auto-Assigned', label: 'Auto-Assigned' },
              { value: 'Needs Review', label: 'Needs Review' },
              { value: 'Verified', label: 'Verified' },
              { value: 'Archived', label: 'Archived' }
            ]} />
          </Form.Item>
          <Form.Item name="tags" label="Tags">
            <Select mode="tags" placeholder="Press enter to add tags" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  )
}
