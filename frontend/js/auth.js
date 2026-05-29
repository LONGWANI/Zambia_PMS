/**
 * ZambiaPMS – Authentication Module
 * Handles JWT tokens, user storage, refresh, logout.
 * Must be loaded AFTER config.js and BEFORE api.js
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

  isAuthenticated() { return !!this.getAccessToken(); },

  setTokens(access, refresh) {
    localStorage.setItem(this.KEYS.ACCESS, access);
    localStorage.setItem(this.KEYS.REFRESH, refresh);
  },

  setUser(user) {
    localStorage.setItem(this.KEYS.USER, JSON.stringify(user));
  },

  async login(email, password) {
    const response = await fetch(`${window.API_BASE}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || error.message || 'Login failed');
    }
    const data = await response.json();
    this.setTokens(data.access, data.refresh);

    const userRes = await fetch(`${window.API_BASE}/auth/me/`, {
      headers: { 'Authorization': `Bearer ${data.access}` }
    });
    if (!userRes.ok) throw new Error('Failed to fetch user profile');
    const user = await userRes.json();
    this.setUser(user);
    return user;
  },

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

  isAdmin()    { return this.getCurrentUser()?.role === 'admin'; },
  isLandlord() { const r = this.getCurrentUser()?.role; return r === 'landlord' || r === 'admin'; },
  isTenant()   { return this.getCurrentUser()?.role === 'tenant'; },

  populateSidebarUser() {
    const user = this.getCurrentUser();
    if (!user) return;
    const nameEl   = document.getElementById('userName');
    const roleEl   = document.getElementById('userRole');
    const avatarEl = document.getElementById('userAv');
    if (nameEl) nameEl.textContent = user.full_name || `${user.first_name} ${user.last_name}`;
    if (roleEl) roleEl.textContent = user.role?.charAt(0).toUpperCase() + user.role?.slice(1);
    if (avatarEl) avatarEl.textContent = (user.first_name?.[0] || '') + (user.last_name?.[0] || '');
  }
};