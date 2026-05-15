/**
 * ZambiaPMS — auth.js
 * Step 5.4 — Authentication Module
 * Place this file in: frontend/js/auth.js
 *
 * Handles ALL token storage, retrieval, refresh, and logout.
 * Must be loaded BEFORE api.js in every HTML page.
 *
 * Load order in every HTML file:
 *   <script src="js/auth.js"></script>   ← first
 *   <script src="js/api.js"></script>    ← second
 *   <script src="js/dashboard.js"></script> ← page-specific last
 */

const auth = {

  // ── Token storage keys ─────────────────────────────────────────────────
  KEYS: {
    ACCESS:  'pms_access',
    REFRESH: 'pms_refresh',
    USER:    'pms_user',
  },

  // ── Getters ────────────────────────────────────────────────────────────
  getAccessToken()  { return localStorage.getItem(this.KEYS.ACCESS); },
  getRefreshToken() { return localStorage.getItem(this.KEYS.REFRESH); },

  getCurrentUser() {
    const raw = localStorage.getItem(this.KEYS.USER);
    try { return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  },

  isAuthenticated() { return !!this.getAccessToken(); },

  // ── Setters ────────────────────────────────────────────────────────────
  setTokens(access, refresh) {
    localStorage.setItem(this.KEYS.ACCESS,  access);
    localStorage.setItem(this.KEYS.REFRESH, refresh);
  },

  setUser(user) {
    localStorage.setItem(this.KEYS.USER, JSON.stringify(user));
  },

  // ── Login ──────────────────────────────────────────────────────────────
  async login(email, password) {
    // Step 1: get tokens
    const tokenData = await api.auth.login({ email, password });
    this.setTokens(tokenData.access, tokenData.refresh);

    // Step 2: fetch full user profile
    const user = await api.auth.me();
    this.setUser(user);

    return user;
  },

  // ── Silent token refresh ───────────────────────────────────────────────
  // Called automatically by api.js when a 401 response is received
  async refreshToken() {
    try {
      const refresh = this.getRefreshToken();
      if (!refresh) return false;

      const response = await fetch(`${API_BASE}/auth/token/refresh/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      if (data.access) {
        localStorage.setItem(this.KEYS.ACCESS, data.access);
        // If server rotates the refresh token too, update it
        if (data.refresh) {
          localStorage.setItem(this.KEYS.REFRESH, data.refresh);
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  // ── Logout ─────────────────────────────────────────────────────────────
  logout() {
    const refresh = this.getRefreshToken();

    // Blacklist the refresh token on the server (best effort — ignore errors)
    if (refresh) {
      api.auth.logout({ refresh }).catch(() => {});
    }

    // Clear all local storage
    localStorage.removeItem(this.KEYS.ACCESS);
    localStorage.removeItem(this.KEYS.REFRESH);
    localStorage.removeItem(this.KEYS.USER);

    // Redirect to login
    window.location.href = '/login.html';
  },

  // ── Guard — call at top of every protected page ────────────────────────
  // Redirects to login if not authenticated
  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },

  // ── Role helpers ───────────────────────────────────────────────────────
  isAdmin() {
    const user = this.getCurrentUser();
    return user?.role === 'admin';
  },

  isLandlord() {
    const user = this.getCurrentUser();
    return user?.role === 'landlord' || user?.role === 'admin';
  },

  isTenant() {
    const user = this.getCurrentUser();
    return user?.role === 'tenant';
  },

  // ── Populate UI with current user info ────────────────────────────────
  // Call this on DOMContentLoaded on every page to fill the sidebar
  populateSidebarUser() {
    const user = this.getCurrentUser();
    if (!user) return;

    const nameEl   = document.getElementById('userName');
    const roleEl   = document.getElementById('userRole');
    const avatarEl = document.getElementById('userAv');

    if (nameEl)   nameEl.textContent   = user.full_name || `${user.first_name} ${user.last_name}`;
    if (roleEl)   roleEl.textContent   = user.role?.charAt(0).toUpperCase() + user.role?.slice(1);
    if (avatarEl) avatarEl.textContent = (user.first_name?.[0] || '') + (user.last_name?.[0] || '');
  },
};
