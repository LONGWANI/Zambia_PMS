/**
 * ZambiaPMS – Authentication Module
 * Handles JWT tokens, user storage, refresh, logout, RBAC filtering,
 * and tenant first‑login flow (password change & lease acceptance).
 */

const auth = {
    KEYS: {
        ACCESS:  'pms_access',
        REFRESH: 'pms_refresh',
        USER:    'pms_user',
    },

    getAccessToken()  { return localStorage.getItem(this.KEYS.ACCESS); },
    getRefreshToken() { return localStorage.getItem(this.KEYS.REFRESH); },

    getCurrentUser() {
        const raw = localStorage.getItem(this.KEYS.USER);
        try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    },

    me() { return this.getCurrentUser(); },

    isAuthenticated() { return !!this.getAccessToken(); },

    setTokens(access, refresh) {
        localStorage.setItem(this.KEYS.ACCESS, access);
        localStorage.setItem(this.KEYS.REFRESH, refresh);
    },

    setUser(user) {
        localStorage.setItem(this.KEYS.USER, JSON.stringify(user));
    },

    async login(email, password) {
        try {
            const response = await fetch(`${window.API_BASE}/auth/login/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || errorData.non_field_errors?.[0] || 'Invalid email or password.');
            }

            const data = await response.json();
            this.setTokens(data.access, data.refresh);

            if (data.user) {
                this.setUser(data.user);
                const user = data.user;

                // ─── Tenant post‑login checks ──────────────────────────
                if (user.role === 'tenant') {
                    try {
                        const tenantProfile = await api.tenants.current();
                        window._tenantProfile = tenantProfile;

                        if (!tenantProfile.password_changed) {
                            this.showPasswordChangeModal(tenantProfile);
                            return;
                        }
                        if (!tenantProfile.lease_accepted) {
                            this.showLeaseAgreementModal(tenantProfile);
                            return;
                        }
                    } catch (err) {
                        console.warn('Could not fetch tenant profile:', err);
                    }
                }

                window.location.href = '/';
                return user;
            }
        } catch (error) {
            if (error.message === 'Failed to fetch') {
                throw new Error('Network error: Unable to reach the API. Ensure you are using the correct URL.');
            }
            throw error;
        }
    },

    // ─── Password change modal ──────────────────────────────────────────
    showPasswordChangeModal(tenant) {
        const modalHtml = `
            <div class="modal-header border-0 pb-0">
                <h5 class="fw-bold">Change Temporary Password</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body">
                <p class="text-muted">You are using a temporary password. Please set a new password to continue.</p>
                <form id="passwordChangeForm">
                    <div class="mb-3">
                        <label class="form-label small fw-medium">New Password</label>
                        <input type="password" id="newPassword" class="form-control" minlength="8" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small fw-medium">Confirm New Password</label>
                        <input type="password" id="confirmPassword" class="form-control" minlength="8" required>
                    </div>
                    <div class="text-danger small" id="passwordError"></div>
                </form>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button type="button" class="btn btn-secondary" onclick="auth.logout()">Logout</button>
                <button type="button" class="btn btn-primary" onclick="auth.submitPasswordChange()">Update Password</button>
            </div>
        `;
        openModal(modalHtml);
        window._tenantId = tenant.id;
    },

    async submitPasswordChange() {
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;
        const errorEl = document.getElementById('passwordError');

        if (newPass.length < 8) {
            errorEl.textContent = 'Password must be at least 8 characters.';
            return;
        }
        if (newPass !== confirmPass) {
            errorEl.textContent = 'Passwords do not match.';
            return;
        }

        try {
            await api.auth.update({ password: newPass });
            await api.tenants.markPasswordChanged();
            closeModal();
            toast('Password updated successfully. Please log in again.', 'ok');
            auth.logout();
        } catch (err) {
            errorEl.textContent = err.message || 'Failed to update password.';
        }
    },

    // ─── Lease agreement modal ──────────────────────────────────────────
    showLeaseAgreementModal(tenant) {
        const leaseText = `
            <h5>General Lease Agreement</h5>
            <p>This is a generalised lease agreement that applies to all tenants.</p>
            <ul>
                <li>You agree to pay rent on or before the due date each month.</li>
                <li>You are responsible for maintaining the property in good condition.</li>
                <li>You must provide 30 days' notice before vacating.</li>
                <li>Late fees apply if rent is not received within 5 days of due date.</li>
                <li>You agree to comply with all property rules and regulations.</li>
            </ul>
            <p><strong>Please read the full terms and conditions.</strong></p>
        `;

        const modalHtml = `
            <div class="modal-header border-0 pb-0">
                <h5 class="fw-bold">Lease Agreement</h5>
            </div>
            <div class="modal-body" style="max-height: 400px; overflow-y: auto;">
                ${leaseText}
                <div class="form-check mt-3">
                    <input class="form-check-input" type="checkbox" id="leaseAgreeCheck">
                    <label class="form-check-label" for="leaseAgreeCheck">
                        I have read and agree to the terms and conditions.
                    </label>
                </div>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button type="button" class="btn btn-danger" onclick="auth.logout()">Decline & Logout</button>
                <button type="button" class="btn btn-primary" onclick="auth.acceptLease()" id="acceptLeaseBtn" disabled>Accept</button>
            </div>
        `;
        openModal(modalHtml);

        const checkbox = document.getElementById('leaseAgreeCheck');
        const acceptBtn = document.getElementById('acceptLeaseBtn');
        if (checkbox && acceptBtn) {
            checkbox.addEventListener('change', function() {
                acceptBtn.disabled = !this.checked;
            });
        }
    },

    async acceptLease() {
        try {
            await api.tenants.acceptLease();
            closeModal();
            toast('Lease accepted. Welcome!', 'ok');
            window.location.href = '/';
        } catch (err) {
            toast('Failed to accept lease: ' + err.message, 'err');
        }
    },

    // ─── Token refresh ──────────────────────────────────────────────────
    async refreshToken() {
        try {
            const refresh = this.getRefreshToken();
            if (!refresh) return false;
            const response = await fetch(`${window.API_BASE}/auth/token/refresh/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh }),
            });
            if (!response.ok) return false;
            const data = await response.json();
            if (data.access) {
                localStorage.setItem(this.KEYS.ACCESS, data.access);
                if (data.refresh) localStorage.setItem(this.KEYS.REFRESH, data.refresh);
                return true;
            }
            return false;
        } catch { return false; }
    },

    logout() {
        const refresh = this.getRefreshToken();
        if (refresh) {
            fetch(`${window.API_BASE}/auth/logout/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh }),
            }).catch(() => {});
        }
        localStorage.removeItem(this.KEYS.ACCESS);
        localStorage.removeItem(this.KEYS.REFRESH);
        localStorage.removeItem(this.KEYS.USER);
        window.location.href = '/login.html';
    },

    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/login.html';
            return false;
        }
        return true;
    },

    // ─── Role checks ────────────────────────────────────────────────────
    isAdmin()    { return this.getCurrentUser()?.role === 'admin'; },
    isLandlord() { const r = this.getCurrentUser()?.role; return r === 'landlord' || r === 'admin'; },
    isTenant()   { return this.getCurrentUser()?.role === 'tenant'; },

    // ─── UI Filtering ──────────────────────────────────────────────────
    enforceUI() {
        const user = this.getCurrentUser();
        const currentRole = user?.role?.toLowerCase() || 'guest';

        document.querySelectorAll('[data-allowed-roles]').forEach(el => {
            const allowed = el.getAttribute('data-allowed-roles').split(',');
            if (allowed.includes(currentRole)) {
                el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        });

        this.populateSidebarUser();
    },

    protectRoute(allowedRoles) {
        const user        = this.getCurrentUser();
        const currentRole = user?.role?.toLowerCase() || 'guest';
        if (!allowedRoles.includes(currentRole)) {
            window.location.replace('/');
        }
    },

    populateSidebarUser() {
        const user = this.getCurrentUser();
        if (!user) return;
        const nameEl   = document.getElementById('userName');
        const roleEl   = document.getElementById('userRole');
        const avatarEl = document.getElementById('userAv');
        if (nameEl)   nameEl.textContent   = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
        if (roleEl)   roleEl.textContent   = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '';
        if (avatarEl) avatarEl.textContent = (user.first_name?.[0] || 'U') + (user.last_name?.[0] || '');
    },
};