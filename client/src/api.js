// CampusFlow OS — API layer (M1 owns the client foundation; every module reuses this)
// Follows docs/05_API_CONTRACT.md exactly. All errors come back as { error: "..." }.

import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('campusflow_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Turn an axios failure into a human sentence — never show raw JSON. */
export function errMsg(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  const data = err?.response?.data;
  if (data?.error) return data.error;
  if (err?.response?.status === 401) return 'Your session expired. Please log in again.';
  if (err?.response?.status === 403) return "You don't have permission to do that.";
  if (err?.message === 'Network Error') return 'Cannot reach the server. Is the backend running?';
  return fallback;
}

export default api;

// --- Auth (M1) ---
export const auth = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
};

// --- Drives & eligibility (M2) ---
export const drives = {
  list: (params) => api.get('/drives', { params }),
  get: (id) => api.get(`/drives/${id}`),
  create: (data) => api.post('/drives', data),
  shortlist: (id) => api.post(`/drives/${id}/shortlist`),
  applications: (id) => api.get(`/drives/${id}/applications`),
  apply: (id) => api.post(`/drives/${id}/apply`),
};

// --- Slots & bookings (M3) ---
export const slots = {
  list: (drive_id) => api.get('/slots', { params: drive_id ? { drive_id } : {} }),
  create: (data) => api.post('/slots', data),
};
export const bookings = {
  create: (slot_id) => api.post('/bookings', { slot_id }),
  mine: () => api.get('/bookings/me'),
  cancel: (id) => api.delete(`/bookings/${id}`),
};

// --- Resources & allocations (M4) ---
export const resources = {
  list: () => api.get('/resources'),
  create: (data) => api.post('/resources', data),
};
export const allocations = {
  list: () => api.get('/allocations'),
  create: (data) => api.post('/allocations', data),
};

// --- Scheduling lab (M2) ---
export const schedule = {
  simulate: (payload) => api.post('/schedule/simulate', payload),
};

// --- Kernel monitor (M3) ---
export const monitor = {
  locks: (limit = 50) => api.get('/monitor/locks', { params: { limit } }),
  stats: () => api.get('/monitor/stats'),
  activity: (limit = 50) => api.get('/monitor/activity', { params: { limit } }),
  stress: (slot_id, count) => api.post('/monitor/stress', { slot_id, count }),
};

// --- Reports (M4) ---
export const reports = {
  placement: () => api.get('/reports/placement'),
};

// --- Companies (M2, used by the drive wizard) ---
export const companies = {
  list: () => api.get('/companies'),
  create: (data) => api.post('/companies', data),
};

// --- Users (M1) — admin directory (backend may expose /users) ---
export const users = {
  list: () => api.get('/users'),
};
