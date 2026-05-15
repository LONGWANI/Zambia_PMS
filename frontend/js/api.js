/**
 * ZambiaPMS — api.js
 * Step 5.3 — Central API Client
 * Place this file in: frontend/js/api.js
 *
 * ALL fetch() calls in the entire project go through this file.
 * No other JS file ever calls fetch() directly.
 * WHY: change the base URL or auth header once here — every page inherits it.
 */

const API_BASE = 'http://localhost:8000/api';

const api = {

  // ── Core request method ────────────────────────────────────────────────
  async request(method, endpoint, data = null) {
    const token   = auth.getAccessToken();
    const headers = { 'Content-Type': 'application/json' };

    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (data) config.body = JSON.stringify(data);

    try {
      let response = await fetch(`${API_BASE}${endpoint}`, config);

      // Token expired → attempt silent refresh
      if (response.status === 401) {
        const refreshed = await auth.refreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${auth.getAccessToken()}`;
          response = await fetch(`${API_BASE}${endpoint}`, { ...config, headers });
        } else {
          auth.logout();
          return;
        }
      }

      const json = await response.json();

      if (!response.ok) {
        throw new APIError(
          json.message || json.detail || 'Request failed',
          response.status,
          json
        );
      }

      return json;

    } catch (err) {
      if (err instanceof APIError) throw err;
      throw new APIError('Network error — check your connection.', 0);
    }
  },

  // ── Shorthand methods ──────────────────────────────────────────────────
  get:    (endpoint)        => api.request('GET',    endpoint),
  post:   (endpoint, data)  => api.request('POST',   endpoint, data),
  put:    (endpoint, data)  => api.request('PUT',    endpoint, data),
  patch:  (endpoint, data)  => api.request('PATCH',  endpoint, data),
  delete: (endpoint)        => api.request('DELETE', endpoint),

  // ── Auth endpoints ─────────────────────────────────────────────────────
  auth: {
    login:          (d) => api.post('/auth/login/',           d),
    register:       (d) => api.post('/auth/register/',        d),
    logout:         (d) => api.post('/auth/logout/',          d),
    me:             ()  => api.get('/auth/me/'),
    changePassword: (d) => api.post('/auth/change-password/', d),
    refreshToken:   (d) => api.post('/auth/token/refresh/',   d),
  },

  // ── Properties & Units ─────────────────────────────────────────────────
  properties: {
    list:      (params = '') => api.get(`/properties/${params}`),
    get:       (id)          => api.get(`/properties/${id}/`),
    create:    (d)           => api.post('/properties/', d),
    update:    (id, d)       => api.patch(`/properties/${id}/`, d),
    delete:    (id)          => api.delete(`/properties/${id}/`),
    occupancy: (id)          => api.get(`/properties/${id}/occupancy/`),
  },

  units: {
    list:   (params = '') => api.get(`/units/${params}`),
    get:    (id)          => api.get(`/units/${id}/`),
    create: (d)           => api.post('/units/', d),
    update: (id, d)       => api.patch(`/units/${id}/`, d),
    delete: (id)          => api.delete(`/units/${id}/`),
  },

  // ── Tenants & Leases ───────────────────────────────────────────────────
  tenants: {
    list:   (params = '') => api.get(`/tenants/${params}`),
    get:    (id)          => api.get(`/tenants/${id}/`),
    create: (d)           => api.post('/tenants/', d),
    update: (id, d)       => api.patch(`/tenants/${id}/`, d),
  },

  leases: {
    list:      (params = '') => api.get(`/leases/${params}`),
    get:       (id)          => api.get(`/leases/${id}/`),
    create:    (d)           => api.post('/leases/', d),
    terminate: (id, d)       => api.post(`/leases/${id}/terminate/`, d),
    statement: (id)          => api.get(`/leases/${id}/statement/`),
  },

  // ── Billing ────────────────────────────────────────────────────────────
  payments: {
    list:    (params = '') => api.get(`/payments/${params}`),
    get:     (id)          => api.get(`/payments/${id}/`),
    create:  (d)           => api.post('/payments/', d),
    receipt: (id)          => api.get(`/payments/${id}/receipt/`),
  },

  utilityBills: {
    list:   (params = '') => api.get(`/utility-bills/${params}`),
    get:    (id)          => api.get(`/utility-bills/${id}/`),
    create: (d)           => api.post('/utility-bills/', d),
    split:  (id)          => api.post(`/utility-bills/${id}/split/`),
  },

  // ── Maintenance ────────────────────────────────────────────────────────
  maintenance: {
    list:    (params = '') => api.get(`/maintenance/${params}`),
    get:     (id)          => api.get(`/maintenance/${id}/`),
    create:  (d)           => api.post('/maintenance/', d),
    update:  (id, d)       => api.patch(`/maintenance/${id}/`, d),
    resolve: (id, d)       => api.post(`/maintenance/${id}/resolve/`, d),
  },

  // ── Reports & Dashboard ────────────────────────────────────────────────
  reports: {
    dashboard: ()            => api.get('/reports/dashboard/'),
    financial: (params = '') => api.get(`/reports/financial/${params}`),
    arrears:   ()            => api.get('/reports/arrears/'),
  },

  // ── Notifications ──────────────────────────────────────────────────────
  notifications: {
    list:     ()    => api.get('/notifications/'),
    markRead: (id)  => api.post(`/notifications/${id}/read/`),
    markAll:  ()    => api.post('/notifications/mark-all-read/'),
  },

  // ── Expenses ───────────────────────────────────────────────────────────
  expenses: {
    list:   (params = '') => api.get(`/expenses/${params}`),
    create: (d)           => api.post('/expenses/', d),
    update: (id, d)       => api.patch(`/expenses/${id}/`, d),
    delete: (id)          => api.delete(`/expenses/${id}/`),
  },
};

// ── Custom error class ─────────────────────────────────────────────────────
class APIError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name   = 'APIError';
    this.status = status;
    this.data   = data;
  }
}
