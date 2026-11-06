/* Typed API surface. Every UI action goes through one of these functions. */
import client, { API_BASE } from './client';

export { API_BASE };

/* ── System ─────────────────────────────────────────────────────────────── */
export const getSystemStatus = () => client.get('/system/status').then((r) => r.data);

/* ── Candidates / resume ────────────────────────────────────────────────── */
export const uploadResume = ({ name, email, targetRole, file, onProgress }) => {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('email', email);
  fd.append('target_role', targetRole);
  fd.append('resume', file);
  return client.post('/candidates/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
  }).then((r) => r.data);
};
export const getMyCandidates = () => client.get('/candidates/me').then((r) => r.data);
export const getCandidate = (id) => client.get(`/candidates/${id}`).then((r) => r.data);
export const getCandidateProfile = (id) => client.get(`/candidates/${id}/profile`).then((r) => r.data);
export const getCandidateChunks = (id) => client.get(`/candidates/${id}/chunks`).then((r) => r.data);
export const retrieveContext = (id, query, k = 4) => client.post(`/candidates/${id}/retrieve`, { query, k }).then((r) => r.data);
export const updateCandidate = (id, body) => client.patch(`/candidates/${id}`, body).then((r) => r.data);
export const deleteCandidate = (id) => client.delete(`/candidates/${id}`).then((r) => r.data);

/* ── Interviews ─────────────────────────────────────────────────────────── */
export const getInterviewOptions = () => client.get('/interviews/config/options').then((r) => r.data);
export const getEngineGraph = () => client.get('/interviews/engine/graph').then((r) => r.data);
export const startInterview = (candidateId, config) => client.post(`/interviews/start/${candidateId}`, config).then((r) => r.data);
export const listInterviews = (params) => client.get('/interviews', { params }).then((r) => r.data);
export const getInterview = (sessionId) => client.get(`/interviews/${sessionId}`).then((r) => r.data);
export const getInterviewQuestions = (sessionId) => client.get(`/interviews/${sessionId}/questions`).then((r) => r.data);
export const cancelInterview = (sessionId) => client.post(`/interviews/${sessionId}/cancel`).then((r) => r.data);

/* ── DSA round ──────────────────────────────────────────────────────────── */
export const getDsaProblem = (sessionId) => client.get(`/interviews/${sessionId}/dsa/problem`).then((r) => r.data);
export const getDsaHint = (sessionId, body) => client.post(`/interviews/${sessionId}/dsa/hint`, body).then((r) => r.data);
export const submitDsa = (sessionId, body) => client.post(`/interviews/${sessionId}/dsa/submit`, body).then((r) => r.data);

/* ── Reports / analytics ────────────────────────────────────────────────── */
export const getSessionReport = (sessionId, regenerate = false) =>
  client.get(`/reports/session/${sessionId}/data`, { params: regenerate ? { regenerate: true } : {} }).then((r) => r.data);
export const sessionReportPdfUrl = (sessionId) => {
  const token = localStorage.getItem('access_token') || '';
  return `${API_BASE}/reports/session/${sessionId}/pdf?token=${encodeURIComponent(token)}`;
};
export const downloadSessionReportPdf = async (sessionId) => {
  const r = await client.get(`/reports/session/${sessionId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  const cd = r.headers['content-disposition'] || '';
  const m = /filename="?([^";]+)"?/.exec(cd);
  a.href = url;
  a.download = m ? m[1] : `interview_report_${sessionId.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
export const getOverview = () => client.get('/dashboard/overview').then((r) => r.data);
export const getCandidateDashboard = (candidateId) => client.get(`/dashboard/${candidateId}`).then((r) => r.data);

/* ── Debrief / practice ─────────────────────────────────────────────────── */
export const getDebriefContext = (candidateId) => client.get(`/debrief/${candidateId}/context`).then((r) => r.data);
export const debriefChat = (candidateId, message) => client.post('/debrief/chat', { candidate_id: candidateId, message }).then((r) => r.data);
export const clearDebrief = (candidateId) => client.delete(`/debrief/${candidateId}/conversation`).then((r) => r.data);
export const startPractice = (body) => client.post('/practice/start', body).then((r) => r.data);
export const answerPractice = (body) => client.post('/practice/answer', body).then((r) => r.data);
export const savePractice = (body) => client.post('/practice/save', body).then((r) => r.data);

/* ── Account ────────────────────────────────────────────────────────────── */
export const updateProfile = (body) => client.patch('/auth/me', body).then((r) => r.data);
export const changePassword = (body) => client.post('/auth/change-password', body).then((r) => r.data);
export const getPreferences = () => client.get('/auth/me/preferences').then((r) => r.data);
export const updatePreferences = (body) => client.patch('/auth/me/preferences', body).then((r) => r.data);
export const deleteAccount = () => client.delete('/auth/me').then((r) => r.data);
export const logoutAll = () => client.post('/auth/logout-all').then((r) => r.data);
