/**
 * ZambiaPMS – Central API Client (Enhanced Error Handling)
 */

class APIError extends Error {
    constructor(message, status, data = null, raw = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
        this.raw = raw; // stores raw response text if non‑JSON
    }
}

const api = {
    async request(method, endpoint, data = null) {
        const token = auth.getAccessToken();
        const headers = {};

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = { method, headers };

        if (data !== null && data !== undefined) {
            if (data instanceof FormData) {
                config.body = data;
            } else {
                headers['Content-Type'] = 'application/json';
                config.body = JSON.stringify(data);
            }
        }

        try {
            let response = await fetch(`${window.API_BASE}${endpoint}`, config);

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

            if (response.status === 204) {
                return null;
            }

            // Check content type
            const contentType = response.headers.get('content-type');
            let json = null;
            let rawText = null;

            if (contentType && contentType.includes('application/json')) {
                json = await response.json();
            } else {
                rawText = await response.text();
                console.error('Server responded with non-JSON:', rawText);
                // Try to parse if it looks like JSON anyway
                try {
                    json = JSON.parse(rawText);
                } catch (e) {
                    json = null;
                }
            }

            if (!response.ok) {
                // FIX: also surface Django/DRF payloads shaped as {'error': ...}
                const errorMsg = json?.message || json?.detail || json?.error || 'Request failed';
                // DRF field-error dicts ({'field': ['msg']}) → readable string
                const friendly = (typeof errorMsg === 'string')
                    ? errorMsg
                    : Object.values(errorMsg).flat().join('; ');
                throw new APIError(friendly, response.status, json, rawText);
            }

            return json ?? rawText ?? null;
        } catch (err) {
            if (err instanceof APIError) throw err;
            // Network errors or other
            throw new APIError('Network error — check your connection.', 0, null, null);
        }
    },

    /**
     * Binary download (PDF / CSV / ZIP) with the same auth + 401-refresh
     * behaviour as request(). Returns a Blob.
     * If the server answers with a JSON error body (e.g. the WeasyPrint 503
     * fallback), throws APIError carrying its message instead of returning
     * a corrupt file.
     */
    async download(method, endpoint, data = null) {
        const token = auth.getAccessToken();
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const config = { method, headers };
        if (data !== null && data !== undefined) {
            headers['Content-Type'] = 'application/json';
            config.body = JSON.stringify(data);
        }

        let response = await fetch(`${window.API_BASE}${endpoint}`, config);

        if (response.status === 401) {
            const refreshed = await auth.refreshToken();
            if (refreshed) {
                headers['Authorization'] = `Bearer ${auth.getAccessToken()}`;
                response = await fetch(`${window.API_BASE}${endpoint}`, { ...config, headers });
            } else {
                auth.logout();
                throw new APIError('Session expired. Please sign in again.', 401);
            }
        }

        const contentType = response.headers.get('content-type') || '';

        if (!response.ok || contentType.includes('application/json')) {
            let payload = {};
            try { payload = await response.json(); } catch (_) { /* not JSON */ }
            throw new APIError(
                payload.error || payload.detail || payload.message ||
                    `Download failed (${response.status})`,
                response.status,
                payload
            );
        }

        return await response.blob();
    },

    get:    (endpoint)       => api.request('GET',    endpoint),
    post:   (endpoint, data) => api.request('POST',   endpoint, data),
    patch:  (endpoint, data) => api.request('PATCH',  endpoint, data),
    put:    (endpoint, data) => api.request('PUT',    endpoint, data),
    delete: (endpoint)       => api.request('DELETE', endpoint),

    auth: {
        register: (data) => api.post('/auth/register/', data),
        login:    (data) => api.post('/auth/login/', data),
        refresh:  (data) => api.post('/auth/token/refresh/', data),
        logout:   (data) => api.post('/auth/logout/', data),
        me:       ()     => api.get('/auth/me/'),
        update:   (data) => api.patch('/auth/me/', data),
    },

    properties: {
        list:   (params = '') => api.get(`/properties/${params}`),
        get:    (id)          => api.get(`/properties/${id}/`),
        create: (d)           => api.post('/properties/', d),
        update: (id, d)       => api.patch(`/properties/${id}/`, d),
        delete: (id)          => api.delete(`/properties/${id}/`),
    },

    units: {
        list:           (params = '') => api.get(`/units/${params}`),
        listByProperty: (propId)     => api.get(`/properties/${propId}/units/`),
        assignTenant:   (unitId, d)  => api.post(`/units/${unitId}/assign-tenant/`, d),
        vacateTenant:   (unitId)     => api.post(`/units/${unitId}/vacate/`),
    },

    tenants: {
        list:   (params = '') => api.get(`/tenants/${params}`),
        get:    (id)          => api.get(`/tenants/${id}/`),
        create: (d)           => api.post('/tenants/', d),
        update: (id, d)       => api.patch(`/tenants/${id}/`, d),
        current: ()           => api.get('/tenants/current/'),
        acceptLease: ()       => api.post('/tenants/accept-lease/'),
        markPasswordChanged: () => api.post('/tenants/mark-password-changed/'),
        assignUnit: (id, d)   => api.post(`/tenants/${id}/assign-unit/`, d),
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
        list:    (params = '') => api.get(`/payments/${params}`),
        get:     (id)          => api.get(`/payments/${id}/`),
        record:  (d)           => api.post('/payments/', d),
        create:  (d)           => api.post('/payments/', d), // alias of record (legacy callers)
        receipt: (id)          => api.get(`/payments/${id}/receipt/`),
        processOnline: (d)     => api.post('/payments/process_online_payment/', d),

        // ─── New workflow endpoints ───
        approve:        (id)             => api.post(`/payments/${id}/approve/`),
        receiptPdf:     (id)             => api.download('GET', `/payments/${id}/receipt/?format=pdf`),
        batchReceipts:  (paymentIds)     => api.download('POST', '/payments/batch_receipts/', { payment_ids: paymentIds }),
        exportCsv:      (params = '')    => api.download('GET', `/payments/export_csv/${params}`),
        arrearsSummary: ()               => api.get('/payments/arrears_summary/'),
        sendReceipt:    (id)             => api.post(`/payments/${id}/send_receipt/`),   // ✅ NEW – resend email
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

    utility: {
        allocations: () => api.get('/utility-allocations/'),
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

    profile: {
        get:    ()         => api.get('/auth/me/'),
        update: (formData) => api.patch('/auth/me/', formData),
    },
};