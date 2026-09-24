import { create } from 'zustand';
import { sheetsApi, authApi } from '../api/client';

// ========== Types ==========
export interface ActionSheet {
  id: string;
  title: string;
  status: string;
  createdDate: string;
  dueDate: string;
  workflowState: string;
  deleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  lastModified: number;
  hasConflict: boolean;
  conflictSeverity?: string;
  overriddenBy?: string;
  overrideNote?: string;
  projectId?: string;
  pdfPath?: string;
  assignedTo: Record<string, string>;
  responses: Record<string, string>;
  othersEmails: Record<string, string>;
  formData: Record<string, any>;
  recipientTypes: Record<string, string>;
  userStatuses: Record<string, string>;
  responseHistory: any[];
  conflictLog: any[];
  conflictThreads: any[];
  recipientCount: number;
  responseCount: number;
  sentDate?: string;
  firstReminderSentAt?: string;
  secondReminderSentAt?: string;
  escalatedAt?: string;
}

export interface User {
  email: string;
  name: string;
  role: string;
  department: string;
  hierarchyLevel: number;
}

// ========== Auth Store ==========
interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => void;
  loadUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,

  login: async (email: string, password?: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(email, password);
      const data = response.data;
      const user: User = {
        email: data.email,
        name: data.name,
        role: data.role || 'User',
        department: data.department || '',
        hierarchyLevel: data.hierarchyLevel || 5,
      };
      // The token is what authorises every later API call. Without it the
      // backend rejects requests with 401, so store it before marking the
      // user as signed in.
      if (data.token) {
        localStorage.setItem('authToken', data.token);
      }
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isLoading: false });
      return true;
    } catch (error: any) {
      set({ isLoading: false });
      console.error('Login error:', error.response?.status, error.response?.data || error.message);
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    set({ user: null });
  },

  loadUser: () => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        set({ user: JSON.parse(stored) });
      } catch {
        localStorage.removeItem('user');
      }
    }
  },
}));

// ========== Sheets Store ==========
interface SheetsState {
  sheets: ActionSheet[];
  currentSheet: ActionSheet | null;
  isLoading: boolean;
  error: string | null;

  fetchSheets: (search?: string) => Promise<void>;
  fetchSheet: (id: string) => Promise<void>;
  createSheet: (sheet: Partial<ActionSheet>) => Promise<ActionSheet>;
  updateSheet: (id: string, sheet: Partial<ActionSheet>) => Promise<void>;
  deleteSheet: (id: string, deletedBy: string) => Promise<void>;
  restoreSheet: (id: string) => Promise<void>;
  sendSheet: (id: string) => Promise<void>;
  respondToSheet: (id: string, email: string, response: string) => Promise<void>;
  overrideStatus: (id: string, status: string, gmEmail: string, note: string) => Promise<void>;
  clearError: () => void;
}

export const useSheetsStore = create<SheetsState>((set, get) => ({
  sheets: [],
  currentSheet: null,
  isLoading: false,
  error: null,

  fetchSheets: async (search?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await sheetsApi.getAll(search);
      set({ sheets: response.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false, sheets: [] });
    }
  },

  fetchSheet: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await sheetsApi.getById(id);
      set({ currentSheet: response.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  createSheet: async (sheet: Partial<ActionSheet>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await sheetsApi.create(sheet);
      const newSheet = response.data;
      set((state) => ({
        sheets: [newSheet, ...state.sheets],
        isLoading: false,
      }));
      return newSheet;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  updateSheet: async (id: string, sheet: Partial<ActionSheet>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await sheetsApi.update(id, sheet);
      set((state) => ({
        sheets: state.sheets.map((s) => (s.id === id ? response.data : s)),
        currentSheet: response.data,
        isLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  deleteSheet: async (id: string, deletedBy: string) => {
    try {
      await sheetsApi.delete(id, deletedBy);
      set((state) => ({
        sheets: state.sheets.filter((s) => s.id !== id),
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  restoreSheet: async (id: string) => {
    try {
      await sheetsApi.restore(id);
      get().fetchSheets();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  sendSheet: async (id: string) => {
    try {
      const response = await sheetsApi.send(id);
      set((state) => ({
        sheets: state.sheets.map((s) => (s.id === id ? response.data : s)),
        currentSheet: response.data,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  respondToSheet: async (id: string, email: string, response: string) => {
    try {
      const res = await sheetsApi.respond(id, { email, response });
      set((state) => ({
        sheets: state.sheets.map((s) => (s.id === id ? res.data : s)),
        currentSheet: res.data,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  overrideStatus: async (id: string, status: string, gmEmail: string, note: string) => {
    try {
      const response = await sheetsApi.override(id, { status, gmEmail, note });
      set((state) => ({
        sheets: state.sheets.map((s) => (s.id === id ? response.data : s)),
        currentSheet: response.data,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  clearError: () => set({ error: null }),
}));
