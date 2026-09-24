import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth
api.interceptors.request.use((config) => {
  // Identity now travels as a signed token the server verifies. The old
  // X-User-Email header is still sent for endpoints that read it for
  // display purposes, but it is no longer what grants access.
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  const user = localStorage.getItem('user');
  if (user) {
    const parsed = JSON.parse(user);
    config.headers['X-User-Email'] = parsed.email;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    // Sliding session: while someone is using the app the server hands back
    // a renewed token, so an active user is never sent to the login screen.
    const renewed = response.headers?.['x-auth-token'];
    if (renewed) {
      localStorage.setItem('authToken', renewed);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token missing, expired or rejected - clear it so the next sign-in
      // issues a fresh one rather than replaying a dead token.
      localStorage.removeItem('user');
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Files (PDFs, repository documents) are fetched through the same client as
// everything else, so the login token goes with them. A plain fetch() or a
// window.open() straight to the API cannot carry the token and is refused
// with "Authentication required".
const FILE_TIMEOUT_MS = 5 * 60 * 1000;

async function fetchFile(path: string, params?: Record<string, string>): Promise<Blob> {
  const res = await api.get(path, { params, responseType: 'blob', timeout: FILE_TIMEOUT_MS });
  return res.data as Blob;
}

/** Opens a downloaded file in the desktop app's PDF window or a new browser tab. */
export function openBlob(blob: Blob, onBlocked: () => void) {
  const blobUrl = URL.createObjectURL(blob);
  const newWindow = window.open(blobUrl, '_blank');
  // The desktop app catches blob URLs itself and opens its own PDF window,
  // so window.open() returns null there without anything being blocked.
  if (!newWindow && !navigator.userAgent.includes('Electron')) {
    onBlocked();
  }
  // Keep the file available long enough for the viewer to load it.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

export function saveBlob(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// ========== Action Sheet API ==========
export const sheetsApi = {
  getAll: (search?: string) =>
    api.get('/api/sheets', { params: search ? { search } : {} }),

  getById: (id: string) =>
    api.get(`/api/sheets/${id}`),

  create: (sheet: any) =>
    api.post('/api/sheets', sheet),

  update: (id: string, sheet: any) =>
    api.put(`/api/sheets/${id}`, sheet),

  patch: (id: string, updates: any) =>
    api.patch(`/api/sheets/${id}`, updates),

  delete: (id: string, deletedBy: string) =>
    api.delete(`/api/sheets/${id}`, { params: { deletedBy } }),

  restore: (id: string) =>
    api.post(`/api/sheets/${id}/restore`),

  getDrafts: () =>
    api.get('/api/sheets/drafts'),

  getDeleted: () =>
    api.get('/api/sheets/deleted'),

  send: (id: string) =>
    api.post(`/api/sheets/${id}/send`),

  // Completes a deferred send. Call only after the sheet body AND its
  // attachments have finished saving - this is what actually mails recipients.
  finalizeSend: (id: string) =>
    api.post(`/api/sheets/${id}/finalize-send`),

  respond: (id: string, data: {
    email: string;
    response: string;
    senderUserId?: string;
    senderRole?: string;
    hierarchyLevel?: number;
  }) => api.post(`/api/sheets/${id}/respond`, data),

  override: (id: string, data: {
    status: string;
    gmEmail: string;
    note: string;
  }) => api.post(`/api/sheets/${id}/override`, data),

  resend: (id: string) =>
    api.post(`/api/sheets/${id}/resend`),

  fileUrl: (fileName: string) =>
    `${API_BASE}/api/sheets/files/${encodeURIComponent(fileName)}`,

  /** Fetches a sheet's generated PDF with the login token. */
  fetchPdf: (pdfPath: string) =>
    fetchFile('/api/projects/serve-file', { path: pdfPath }),

  // Opens the PDF in the desktop app's PDF window, or a new browser tab.
  openPdf: async (pdfPath: string) => {
    const { message } = await import('antd')
    const hideLoading = message.loading('Opening PDF...', 0)

    try {
      const blob = await fetchFile('/api/projects/serve-file', { path: pdfPath })
      hideLoading()
      openBlob(blob, () => message.error('Pop-up blocked. Please allow pop-ups for this site.'))
    } catch (error) {
      hideLoading()
      console.error('Failed to open PDF:', error)
      // No fallback to opening the API address directly: a new window cannot
      // carry the login token, so it would only show "Authentication required".
      message.error('Could not open the PDF. Please try again.')
    }
  },

  downloadPdf: async (pdfPath: string, fileName?: string) => {
    // Dynamic import of message to avoid circular dependency
    const { message } = await import('antd')

    const hideLoading = message.loading('Downloading PDF...', 0)

    try {
      const blob = await fetchFile('/api/projects/serve-file', { path: pdfPath })
      hideLoading()
      message.success('PDF downloaded', 1.5)
      saveBlob(blob, fileName || pdfPath.split('/').pop() || pdfPath.split('\\').pop() || 'document.pdf')
    } catch (error) {
      hideLoading()
      console.error('Failed to download PDF:', error)
      message.error(`Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  },

  // Helper to get PDF URL from pdfPath
  pdfUrl: (pdfPath: string) => {
    return `${API_BASE}/api/projects/serve-file?path=${encodeURIComponent(pdfPath)}`
  },

  // Attachment management
  uploadAttachments: (sheetId: string, files: File[]) => {
    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    // IMPORTANT: Do NOT set Content-Type manually — axios auto-sets it
    // with the proper multipart boundary when FormData is passed.
    // Setting it explicitly strips the boundary and Spring can't parse files.
    return api.post(`/api/sheets/${sheetId}/attachments`, formData, {
      headers: { 'Content-Type': undefined },
      timeout: 120000, // 2 min timeout for file uploads
    })
  },

  listAttachments: (sheetId: string) =>
    api.get(`/api/sheets/${sheetId}/attachments`),

  downloadAttachment: (sheetId: string, fileName: string) =>
    `${API_BASE}/api/sheets/${sheetId}/attachments/${encodeURIComponent(fileName)}`,

  deleteAttachment: (sheetId: string, fileName: string) =>
    api.delete(`/api/sheets/${sheetId}/attachments/${encodeURIComponent(fileName)}`),
};

// ========== Auth API ==========
export const authApi = {
  login: (email: string, password?: string) =>
    api.post('/api/auth/login', { email, password }),

  logout: () =>
    api.post('/api/auth/logout'),

  me: (email: string) =>
    api.get('/api/auth/me', { params: { email } }),
};

// ========== Draft Recovery API (Admin) ==========
export const draftRecoveryApi = {
  list: () => api.get('/api/admin/draft-recovery'),
  restore: (fileName: string) => api.post(`/api/admin/draft-recovery/restore/${encodeURIComponent(fileName)}`),
  deleteSnapshot: (fileName: string) => api.delete(`/api/admin/draft-recovery/${encodeURIComponent(fileName)}`),
};

// ========== Admin Config API ==========
export const configApi = {
  getEmail: () => api.get('/api/admin/config/email'),
  getAd: () => api.get('/api/admin/config/ad'),
  getNotifications: () => api.get('/api/admin/config/notifications'),
  getSystem: () => api.get('/api/admin/config/system'),
};

// ========== Recipient Shortcuts API ==========
// The fixed people behind the non-searchable Copy-To columns (G.M, M.C., L.A., E/M ...).
// Kept on the server so staff names and addresses are not part of the published code.
export const recipientShortcutsApi = {
  get: () => api.get('/api/config/recipient-shortcuts'),
};

// ========== Admin Users API (users.json) ==========
export const usersApi = {
  list: () => api.get('/api/admin/users'),
  add: (data: { username: string; email: string; password: string; role: string }) => api.post('/api/admin/users', data),
  update: (email: string, data: { username?: string; role?: string; password?: string }) => api.put(`/api/admin/users/${encodeURIComponent(email)}`, data),
  remove: (email: string) => api.delete(`/api/admin/users/${encodeURIComponent(email)}`),
};

// ========== Project API ==========
export const projectsApi = {
  getAll: () => api.get('/api/projects'),
  create: (project: any) => api.post('/api/projects', project),
  delete: (id: string) => api.delete(`/api/projects/${id}`),
  getFiles: (id: string) => api.get(`/api/projects/${id}/files`),
  serveFileUrl: (path: string) =>
    `${API_BASE}/api/projects/serve-file?path=${encodeURIComponent(path)}`,
};

// ========== Employee API ==========
export const employeesApi = {
  getAll: () => api.get('/api/employees'),
  getByEmail: (email: string) => api.get(`/api/employees/${encodeURIComponent(email)}`),
  search: (query: string) =>
    api.get('/api/employees', { params: { search: query } }),
  create: (employee: any) => api.post('/api/employees', employee),
  delete: (email: string) => api.delete(`/api/employees/${encodeURIComponent(email)}`),
};

// ========== Repository API ==========
export const repositoryApi = {
  getDocuments: (dateKey: string, includeDeleted = false) =>
    api.get(`/api/repository/documents/${dateKey}`, { params: { includeDeleted } }),
  getDatesWithDocs: (year: number, month: number) =>
    api.get(`/api/repository/dates/${year}/${month}`),
  upload: (dateKey: string, files: File[], uploaderName = 'Current User') => {
    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    formData.append('uploaderName', uploaderName)
    return api.post(`/api/repository/upload/${dateKey}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  downloadUrl: (dateKey: string, fileName: string) =>
    `${API_BASE}/api/repository/download/${dateKey}/${encodeURIComponent(fileName)}`,
  /** Fetches a repository document with the login token. */
  fetchDocument: (dateKey: string, fileName: string) =>
    fetchFile(`/api/repository/download/${dateKey}/${encodeURIComponent(fileName)}`),
  deleteDocument: (dateKey: string, docId: string) =>
    api.delete(`/api/repository/documents/${dateKey}/${docId}`),
  restoreDocument: (dateKey: string, docId: string) =>
    api.post(`/api/repository/restore/${dateKey}/${docId}`),
  updateDocumentMetadata: (dateKey: string, docId: string, updates: any) =>
    api.put(`/api/repository/documents/${dateKey}/${docId}`, updates),
  searchDocuments: (query: string) =>
    api.get(`/api/repository/search`, { params: { q: query } }),
};

// ========== GM Review Hub API ==========
export const reviewHubApi = {
  getEscalatedSheets: () => api.get('/api/review-hub/sheets'),
  getEscalatedCount: () => api.get('/api/review-hub/count'),
  markStatus: (sheetId: string, status: string, note?: string) =>
    api.post(`/api/review-hub/sheets/${sheetId}/mark`, { status, note }),
};

export default api;
