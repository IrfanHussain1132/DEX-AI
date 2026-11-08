import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 120000,
});

const endpoint = (key, fallback) => import.meta.env[key] || fallback;

export async function askDatabase(question) {
  const { data } = await api.post(endpoint('VITE_QUERY_ENDPOINT', '/api/query'), { question });
  return data;
}

export async function uploadDocument(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post(endpoint('VITE_DOCUMENT_UPLOAD_ENDPOINT', '/api/documents/upload'), form);
  return data;
}

export async function askDocument(question, documentId) {
  const { data } = await api.post(endpoint('VITE_DOCUMENT_ASK_ENDPOINT', '/api/documents/ask'), { question, document_id: documentId });
  return data;
}

export function readableApiError(error) {
  if (error?.response) {
    const detail = error.response.data?.detail || error.response.data?.error || error.response.data?.message;
    return detail || `The service returned an error (${error.response.status}).`;
  }
  if (error?.code === 'ECONNABORTED') return 'The request took too long. Please try again.';
  if (error?.request) return 'Could not reach the DEX AI API. Check that the backend is running and VITE_API_BASE_URL is correct.';
  return error?.message || 'Something went wrong. Please try again.';
}
