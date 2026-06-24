/**
 * ZambiaPMS – Authentication Module
 * Handles JWT tokens, user storage, refresh, logout, and RBAC filtering.
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
    try {
      const response = await fetch(`${window.API_BASE}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Catch specific Django/SimpleJWT error messages
        throw new Error(errorData.detail || errorData.non_field_errors?.[0] || 'Invalid email or password.');
      }

      const data = await response.json();
      
      // 1. Store the JWT tokens
      this.setTokens(data.access, data.refresh);
      
      // 2. Store the user object (now returned directly from our CustomTokenObtainPairSerializer)
      if (data.user) {
        this.setUser(data.user);
        return data.user;
      }
      
    } catch (error) {
      // Translate cryptic browser errors into developer-friendly messages
      if (error.message === 'Failed to fetch') {
        throw new Error('Network error: Unable to reach the API. Ensure you are using the correct URL (127.0.0.1 vs localhost).');
      }
      throw error;
    }
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
    window.location.href = '/login.html'; // Send back to login
  },

  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },

  // Role Checks
  isAdmin()    { return this.getCurrentUser()?.role === 'admin'; },
  isLandlord() { const r = this.getCurrentUser()?.role; return r === 'landlord' || r === 'admin'; },
  isTenant()   { return this.getCurrentUser()?.role === 'tenant'; },

  // --- UI Role Filtering ---
  enforceUI() {
    const user = this.getCurrentUser();
    const currentRole = user && user.role ? user.role.toLowerCase() : 'guest';
    const restrictedElements = document.querySelectorAll('[data-allowed-roles]');

    restrictedElements.forEach(element => {
        const allowedRoles = element.getAttribute('data-allowed-roles').split(',');
        if (!allowedRoles.includes(currentRole)) {
            element.remove(); // Removes the element entirely from the DOM
        }
    });
  },

  // --- Route Protection ---
  protectRoute(allowedRoles) {
    const user = this.getCurrentUser();
    const currentRole = user && user.role ? user.role.toLowerCase() : 'guest';
    
    if (!allowedRoles.includes(currentRole)) {
        // Kick unauthorized users back to the dashboard
        window.location.replace('/'); 
    }
  },

  populateSidebarUser() {
    const user = this.getCurrentUser();
    if (!user) return;
    const nameEl   = document.getElementById('userName');
    const roleEl   = document.getElementById('userRole');
    const avatarEl = document.getElementById('userAv');
    if (nameEl) nameEl.textContent = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
    if (roleEl) roleEl.textContent = user.role?.charAt(0).toUpperCase() + user.role?.slice(1);
    if (avatarEl) avatarEl.textContent = (user.first_name?.[0] || 'U') + (user.last_name?.[0] || '');
  }
};