/**
 * ZambiaPMS – Central API Client
 * All fetch() calls go through this module.
 */

class APIError extends Error {
    constructor(message, status, data = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }
}

const api = {
    /**
     * Core request wrapper. Automatically attaches Bearer token,
     * handles token refresh on 401, and safely formats JSON or FormData payloads.
     */
    async request(method, endpoint, data = null) {
        const token = auth.getAccessToken();
        const headers = {};

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = { method, headers };

        if (data !== null && data !== undefined) {
            if (data instanceof FormData) {
                // Do NOT set Content-Type header so the browser automatically
                // sets 'multipart/form-data' with the correct boundary.
                config.body = data;
            } else {
                headers['Content-Type'] = 'application/json';
                config.body = JSON.stringify(data);
            }
        }

        try {
            let response = await fetch(`${window.API_BASE}${endpoint}`, config);

            // Handle token expiration & automatic refresh
            if (response.status === 401) {
                const refreshed = await auth.refreshToken();
                if (refreshed) {
                    headers['Authorization'] = `Bearer ${auth.getAccessToken()}`;
                    response = await fetch(`${window.API_BASE}${endpoint}`, { ...config, headers });
                } else {
                    auth.logout();
                    return;
                }
            }

            // Handle 204 No Content
            if (response.status === 204) {
                return null;
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

    get:    (endpoint)       => api.request('GET',    endpoint),
    post:   (endpoint, data) => api.request('POST',   endpoint, data),
    patch:  (endpoint, data) => api.request('PATCH',  endpoint, data),
    put:    (endpoint, data) => api.request('PUT',    endpoint, data),
    delete: (endpoint)       => api.request('DELETE', endpoint),

    // ==========================================
    // Authentication Module (NEW)
    // ==========================================
    auth: {
        register: (data) => api.post('/auth/register/', data),
        login:    (data) => api.post('/auth/login/', data),
        refresh:  (data) => api.post('/auth/token/refresh/', data),
        logout:   (data) => api.post('/auth/logout/', data),
        me:       ()     => api.get('/auth/me/'),
        update:   (data) => api.patch('/auth/me/', data), // for profile updates
    },

    // ==========================================
    // Core Modules
    // ==========================================

    properties: {
        list:   (params = '') => api.get(`/properties/${params}`),
        get:    (id)          => api.get(`/properties/${id}/`),
        create: (d)           => api.post('/properties/', d),
        update: (id, d)       => api.patch(`/properties/${id}/`, d),
        delete: (id)          => api.delete(`/properties/${id}/`),
    },

    units: {
        listByProperty: (propId)     => api.get(`/properties/${propId}/units/`),
        assignTenant:   (unitId, d)  => api.post(`/units/${unitId}/assign-tenant/`, d),
        vacateTenant:   (unitId)     => api.post(`/units/${unitId}/vacate/`),
    },

    tenants: {
        list:   (params = '') => api.get(`/tenants/${params}`),
        get:    (id)          => api.get(`/tenants/${id}/`),
        create: (d)           => api.post('/tenants/', d),
        update: (id, d)       => api.patch(`/tenants/${id}/`, d),
    },

    leases: {
        list:   (params = '') => api.get(`/leases/${params}`),
        get:    (id)          => api.get(`/leases/${id}/`),
        create: (d)           => api.post('/leases/', d),
        update: (id, d)       => api.patch(`/leases/${id}/`, d),
    },

    leaseAgreements: {
        create:      (d)      => api.post('/lease-agreements/', d),
        getByUnit:   (unitId) => api.get(`/lease-agreements/unit/${unitId}/`),
        downloadPDF: (id)     => `${window.API_BASE}/lease-agreements/${id}/pdf/`,
    },

    payments: {
        list:          (params = '') => api.get(`/payments/${params}`),
        get:           (id)          => api.get(`/payments/${id}/`),
        record:        (d)           => api.post('/payments/', d),
        receipt:       (id)          => api.get(`/payments/${id}/receipt/`),
        processOnline: (d)           => api.post('/payments/process_online_payment/', d),
    },

    gateway: {
        getSettings:    ()     => api.get('/gateway/settings/'),
        saveSettings:   (d)    => api.post('/gateway/settings/', d),
        processPayment: (d)    => api.post('/gateway/process-payment/', d),
    },

    utilityBills: {
        list:           (propId = '') => api.get(`/utility-bills/${propId ? '?property_id=' + propId : ''}`),
        get:            (id)          => api.get(`/utility-bills/${id}/`),
        create:         (d)           => api.post('/utility-bills/', d),
        split:          (id)          => api.post(`/utility-bills/${id}/split/`),
        createAndSplit: (d)           => api.post('/utility-bills/split/', d),
    },

    maintenance: {
        list:    (params = '') => api.get(`/maintenance/${params}`),
        get:     (id)          => api.get(`/maintenance/${id}/`),
        create:  (d)           => api.post('/maintenance/', d),
        update:  (id, d)       => api.patch(`/maintenance/${id}/`, d),
        resolve: (id, d)       => api.post(`/maintenance/${id}/resolve/`, d),
    },

    reports: {
        dashboard: ()            => api.get('/reports/dashboard/'),
        financial: (params = '') => api.get(`/reports/financial/${params}`),
        arrears:   ()            => api.get('/reports/arrears/'),
    },

    notifications: {
        list:     ()   => api.get('/notifications/'),
        markRead: (id) => api.post(`/notifications/${id}/read/`),
        markAll:  ()   => api.post('/notifications/mark-all-read/'),
    },

    expenses: {
        list:   (params = '') => api.get(`/expenses/${params}`),
        create: (d)           => api.post('/expenses/', d),
        update: (id, d)       => api.patch(`/expenses/${id}/`, d),
        delete: (id)          => api.delete(`/expenses/${id}/`),
    },

    // The profile module is now deprecated – use api.auth.me and api.auth.update instead,
    // but we keep it for backward compatibility.
    profile: {
        get:    ()         => api.get('/auth/me/'),
        update: (formData) => api.patch('/auth/me/', formData),
    },
};