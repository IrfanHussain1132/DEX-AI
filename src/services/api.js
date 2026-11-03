import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 60000,
});

export async function askDatabase(question) {
  const { data } = await api.post('/api/query', { question });
  return data;
}

export async function fetchSchema() {
  const { data } = await api.get('/api/schema');
  return data;
}

export async function fetchHealth() {
  const { data } = await api.get('/api/health');
  return data;
}

export async function fetchSampleQueries() {
  const { data } = await api.get('/api/sample-queries');
  return data;
}

export function readableApiError(error) {
  if (error?.response?.data) {
    const data = error.response.data;
    return data.detail || data.error || data.message || `Server returned error ${error.response.status}`;
  }
  if (error?.code === 'ECONNABORTED') {
    return 'The request timed out. Groq or the database took too long to respond.';
  }
  if (error?.request) {
    return 'Could not connect to the backend server. Ensure FastAPI is running on http://localhost:8000.';
  }
  return error?.message || 'An unexpected error occurred.';
}
