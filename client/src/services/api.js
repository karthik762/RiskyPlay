/**
 * RiskyPlay API Client Service.
 * Centralizes authenticated HTTP requests to Express backend.
 */

const API_BASE = '/api/v1';

function getToken() {
  return localStorage.getItem('riskyplay_token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('riskyplay_token', token);
  } else {
    localStorage.removeItem('riskyplay_token');
  }
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, config);
  } catch (netErr) {
    const error = new Error('Cannot connect to backend server. Please ensure the backend is running on port 5000 (npm run dev in /server).');
    error.isNetworkError = true;
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let msg = data?.error?.message || data?.message;
    if (!msg) {
      if (response.status === 502 || response.status === 504) {
        msg = 'Backend server is offline (Port 5000 unreachable). Start the backend with "npm run dev:server".';
      } else if (response.status === 401) {
        msg = 'Invalid credentials. Click "Auto-Fill" to use the demo merchant account.';
      } else {
        msg = `Request failed (${response.status}: ${response.statusText || 'Server Error'})`;
      }
    }
    const error = new Error(msg);
    error.status = response.status;
    error.data = data;
    throw error;
  }


  return data;
}

export const api = {
  // Authentication
  auth: {
    login: async (email, password) => {
      const res = await request('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res?.data?.token) {
        setToken(res.data.token);
      }
      return res;
    },
    register: async (name, email, password) => {
      const res = await request('/auth/register', {
        method: 'POST',
        body: { name, email, password },
      });
      if (res?.data?.token) {
        setToken(res.data.token);
      }
      return res;
    },
    me: async () => request('/auth/me'),
  },

  // Dashboard Stats
  dashboard: {
    getStats: async () => request('/dashboard/stats'),
  },

  // Transactions
  transactions: {
    list: async (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/transactions${qs ? `?${qs}` : ''}`);
    },
    getById: async (id) => request(`/transactions/${id}`),
    assessRisk: async (id) => request(`/transactions/${id}/risk`, { method: 'POST' }),
    orchestrateRisk: async (id) =>
      request(`/transactions/${id}/risk/orchestrate`, { method: 'POST' }),
    getTraces: async (id) => request(`/transactions/${id}/traces`),
  },

  // Chargeback Defense
  chargebacks: {
    list: async (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/chargebacks${qs ? `?${qs}` : ''}`);
    },
    getById: async (id) => request(`/chargebacks/${id}`),
    getEvidence: async (chargebackId) =>
      request(`/chargebacks/${chargebackId}/evidence`),
    addEvidence: async (chargebackId, evidenceData) =>
      request(`/chargebacks/${chargebackId}/evidence`, {
        method: 'POST',
        body: evidenceData,
      }),
    getResponse: async (chargebackId) =>
      request(`/chargebacks/${chargebackId}/response`),
    generateResponse: async (chargebackId) =>
      request(`/chargebacks/${chargebackId}/response/generate`, {
        method: 'POST',
      }),
    verifyResponse: async (chargebackId, payload = {}) =>
      request(`/chargebacks/${chargebackId}/response/verify`, {
        method: 'POST',
        body: payload,
      }),
    getTraces: async (id) => request(`/chargebacks/${id}/traces`),
  },

  // Agent Observability Traces
  traces: {
    list: async (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/traces${qs ? `?${qs}` : ''}`);
    },
    getEntityTraces: async (entityId) =>
      request(`/traces/entity/${entityId}`),
  },
};
