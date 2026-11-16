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
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
};

// --- Drives & eligibility (M2) ---
export const drives = {
  list: (params) => api.get('/drives', { params }),
  get: (id) => api.get(`/drives/${id}`),
  create: (data) => api.post('/drives', data),
  applications: (id) => api.get(`/drives/${id}/applications`),
  apply: (id) => api.post(`/drives/${id}/apply`),
  previewEligibility: (criteria) => api.post('/drives/preview-eligibility', criteria),
  pipeline: (id) => api.get(`/drives/${id}/pipeline`),
  scheduleTests: (id) => api.post(`/drives/${id}/schedule-tests`),
  publishResults: (id) => api.post(`/drives/${id}/publish-results`),
  markSelected: (id, student_id) => api.post(`/drives/${id}/select`, { student_id }),
  // Interview notes (Phase 2, M2)
  feedback: (id) => api.get(`/drives/${id}/feedback`),
  saveFeedback: (id, data) => api.post(`/drives/${id}/feedback`, data),
  // Interview-note reminders (Wave 5)
  feedbackPending: (id) => api.get(`/drives/${id}/feedback/pending`),
  remindFeedback: (id) => api.post(`/drives/${id}/feedback/remind`),
  // Rounds (Phase 2, M2)
  rounds: (id) => api.get(`/drives/${id}/rounds`),
  addRound: (id, data) => api.post(`/drives/${id}/rounds`, data),
  setRoundStatus: (id, roundId, status) => api.patch(`/drives/${id}/rounds/${roundId}`, { status }),
  // Offer letters (Phase 2, M2)
  offers: (id) => api.get(`/drives/${id}/offers`),
  generateOffers: (id, data) => api.post(`/drives/${id}/offers/generate`, data),
  // Test questions (recruiter) — the question list plus what the test
  // includes: 'aptitude', 'coding' or 'both'.
  saveQuestions: (id, questions, testMode) => api.post(`/drives/${id}/questions`, { questions, test_mode: testMode }),
  // Test taking (student)
  getTest: (id) => api.get(`/drives/${id}/test`),
  submitTest: (id, answers, tabSwitches) => api.post(`/drives/${id}/test/submit`, { answers, tab_switches: tabSwitches ?? 0 }),
};

// --- Student journey ---
export const student = {
  journey: () => api.get('/student/journey'),
  profile: () => api.get('/student/profile'),
  updateProfile: (data) => api.put('/student/profile', data),
  resume: () => api.get('/student/profile/resume', { responseType: 'blob' }),
  deleteResume: () => api.delete('/student/profile/resume'),
  withdrawApplication: (id) => api.patch(`/student/applications/${id}/withdraw`),
};

// --- Recruiter workspace & applicants (merged from Ishika's repo 2026-11-16) ---
export const recruiter = {
  getCompany: () => api.get('/recruiter/company'),
  updateCompany: (data) => api.put('/recruiter/company', data),
  getApplicants: (driveId, params) => api.get(`/recruiter/drives/${driveId}/applicants`, { params }),
  bulkApplicants: (driveId, payload) => api.post(`/recruiter/drives/${driveId}/applicants/bulk`, payload),
  getOffers: (driveId) => api.get(`/recruiter/drives/${driveId}/offers`),
  createOffer: (driveId, data) => api.post(`/recruiter/drives/${driveId}/offers`, data),
  withdrawOffer: (id) => api.post(`/recruiter/offers/${id}/withdraw`),
};

// --- Notifications ---
export const notifications = {
  list: () => api.get('/notifications'),
  readAll: () => api.post('/notifications/read-all'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
};

// --- Admin control center ---
export const admin = {
  overview: () => api.get('/admin/overview'),
  schedule: () => api.get('/admin/schedule'),
  roster: (driveId) => api.get(`/admin/drive/${driveId}/roster`),
  // OS Lab scheduling (merged from Ishika's repo 2026-11-16)
  osScheduleRun: (payload) => api.post('/os/schedule/run', payload),
  osScheduleCompare: (payload) => api.post('/os/schedule/compare', payload),
  // OS Lab race demo
  raceDemo: (payload) => api.post('/os/race-demo', payload),
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
  calendar: (from, to) => api.get('/resources/calendar', { params: { from, to } }),
};
export const manualEvents = {
  create: (data) => api.post('/resources/manual-events', data),
  update: (id, data) => api.patch(`/resources/manual-events/${id}`, data),
  remove: (id) => api.delete(`/resources/manual-events/${id}`),
};
export const allocations = {
  list: () => api.get('/allocations'),
  create: (data) => api.post('/allocations', data),
};

// --- Interview scheduler (M2) ---
export const schedule = {
  simulate: (payload) => api.post('/schedule/simulate', payload),
  auto: (data) => api.post('/schedule/auto', data),
  getAuto: (driveId) => api.get(`/schedule/auto/${driveId}`),
  clearAuto: (driveId) => api.delete(`/schedule/auto/${driveId}`),
};

// --- Lab agent (Phase 2, M3) ---
export const labAgent = {
  status: () => api.get('/lab-agent/status'),
};

// --- Audit log viewer (Phase 2, M3) ---
export const audit = {
  search: (params) => api.get('/admin/audit', { params }),
  summary: (days = 7) => api.get('/admin/audit/summary', { params: { days } }),
  history: (entity, entityId) => api.get(`/admin/audit/${entity}/${entityId}`),
};

// --- Kernel monitor (M3) ---
export const monitor = {
  locks: (limit = 50) => api.get('/monitor/locks', { params: { limit } }),
  stats: () => api.get('/monitor/stats'),
  activity: (limit = 50) => api.get('/monitor/activity', { params: { limit } }),
  stress: (slot_id, count) => api.post('/monitor/stress', { slot_id, count }),
  deadlockDemo: () => api.post('/monitor/deadlock-demo'),
};

// --- Reports (M4) ---
export const reports = {
  placement: () => api.get('/reports/placement'),
  driveAnalytics: (driveId) => api.get(`/reports/drives/${driveId}/analytics`),
  // CSV downloads (Phase 2, M4) — blob responses, saved by the page.
  exportPlacementCsv: () => api.get('/reports/export.csv', { responseType: 'blob' }),
  exportRosterCsv: (driveId) => api.get(`/reports/drives/${driveId}/roster.csv`, { responseType: 'blob' }),
  exportDrivePdf: (driveId) => api.get(`/reports/drives/${driveId}/report.pdf`, { responseType: 'blob' }),
  placementStats: () => api.get('/reports/placement-stats'),
  // Extra OS-lab reports (merged from Ishika's repo 2026-11-16)
  branches: () => api.get('/reports/branches'),
  companies: () => api.get('/reports/companies'),
  packages: () => api.get('/reports/packages'),
  branchesCsv: () => api.get('/reports/branches.csv', { responseType: 'blob' }),
  companiesCsv: () => api.get('/reports/companies.csv', { responseType: 'blob' }),
  packagesCsv: () => api.get('/reports/packages.csv', { responseType: 'blob' }),
};

// --- Exam PC Monitoring & Supervision (merged from Ishika's repo 2026-11-16) ---
export const examMonitoring = {
  pcs: () => api.get('/admin/monitoring/pcs'),
  events: (params) => api.get('/admin/monitoring/events', { params }),
  reviewEvent: (id, data) => api.patch(`/admin/monitoring/events/${id}`, data),
  allocateSession: (data) => api.post('/admin/exam-sessions', data),
  startSession: (id) => api.post(`/admin/exam-sessions/${id}/start`),
  endSession: (id) => api.post(`/admin/exam-sessions/${id}/end`),
  computers: () => api.get('/admin/computers'),
  createComputer: (data) => api.post('/admin/computers', data),
  regenerateEnrollment: (id) => api.post(`/admin/computers/${id}/regenerate-enrollment`),
  prohibitedProcesses: () => api.get('/admin/prohibited-processes'),
  addProhibitedProcess: (data) => api.post('/admin/prohibited-processes', data),
  removeProhibitedProcess: (id) => api.delete(`/admin/prohibited-processes/${id}`),
};

// --- Offer letters (Phase 2, M2) ---
export const offers = {
  get: (id) => api.get(`/offers/${id}`),
  // Student answers their own offer (Wave 5): 'accepted' or 'declined'.
  respond: (id, decision) => api.post(`/offers/${id}/respond`, { decision }),
};

// --- Companies (M2, used by the drive wizard) ---
export const companies = {
  list: () => api.get('/companies'),
  create: (data) => api.post('/companies', data),
};

// --- Users (M1) — admin directory ---
export const users = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  setActive: (id, isActive) => api.patch(`/users/${id}/active`, { is_active: isActive }),
  resetPassword: (id) => api.post(`/users/${id}/reset-password`),
};
