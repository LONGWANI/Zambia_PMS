/**
 * ZambiaPMS – Notifications Module
 * Guaranteed visibility using inline !important and fallback.
 */

const notifications = {
    dropdown: null,

    async getUnreadCount() {
        try {
            const data = await api.notifications.list('?is_read=false');
            if (Array.isArray(data)) return data.length;
            if (data && typeof data === 'object' && 'count' in data) return data.count;
            return 0;
        } catch (err) {
            console.warn('getUnreadCount error:', err);
            return 0;
        }
    },

    async getList() {
        try {
            const data = await api.notifications.list('?limit=20');
            if (Array.isArray(data)) return data;
            if (data && typeof data === 'object' && 'results' in data) return data.results;
            return [];
        } catch (err) {
            console.warn('getList error:', err);
            return [{
                id: 'sample-1',
                title: 'Welcome to ZambiaPMS',
                message: 'Your notifications will appear here.',
                notification_type: 'general',
                is_read: false,
                created_at: new Date().toISOString()
            }];
        }
    },

    async markAsRead(id) {
        try {
            await api.notifications.markRead(id);
            await this.updateBadge();
            return true;
        } catch (err) {
            console.warn('markAsRead error:', err);
            if (id === 'sample-1') {
                await this.updateBadge();
                return true;
            }
            return false;
        }
    },

    async markAllRead() {
        try {
            await api.notifications.markAll();
            await this.updateBadge();
            return true;
        } catch (err) {
            console.warn('markAllRead error:', err);
            return false;
        }
    },

    async updateBadge() {
        const count = await this.getUnreadCount();
        const badge = document.querySelector('#notificationBell .indicator-pulse');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 9 ? '9+' : count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    },

    closeDropdown() {
        if (!this.dropdown) return;
        this.dropdown.style.setProperty('display', 'none', 'important');
        this.dropdown.classList.remove('force-visible');
        console.log('Dropdown closed');
    },

    async renderDropdown() {
        if (!this.dropdown) return;
        const list = await this.getList();
        console.log('Notifications list:', list);

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 12px 8px 12px; border-bottom: 1px solid #eee;">
                <span style="font-weight: 600; color: #0f172a;">Notifications</span>
                <span id="closeNotificationBtn" style="cursor: pointer; font-size: 22px; color: #94a3b8; line-height: 1; padding: 0 4px; font-weight: 300;">&times;</span>
            </div>
        `;

        if (list.length === 0) {
            html += `
                <div style="padding: 20px; text-align: center; color: #666;">
                    <i class="bi bi-inbox fs-2 d-block mb-2"></i>
                    No notifications yet.
                </div>`;
            this.dropdown.innerHTML = html;
            const closeBtn = document.getElementById('closeNotificationBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeDropdown();
                });
            }
            return;
        }

        let listHtml = `<div class="notification-list">`;
        list.forEach(n => {
            const isRead = n.is_read;
            const icon = this._getIcon(n.notification_type);
            const time = new Date(n.created_at).toLocaleString();
            listHtml += `
                <div class="notification-item ${isRead ? 'read' : 'unread'}" 
                     data-id="${n.id}" 
                     style="padding: 8px 12px; border-bottom: 1px solid #eee; background: ${isRead ? '#fff' : '#f0fdfa'};">
                    <div class="d-flex align-items-start gap-3">
                        <span class="notification-icon" style="font-size: 20px; width: 36px; text-align: center;">${icon}</span>
                        <div class="flex-grow-1">
                            <div style="font-weight: 600; color: #000;">${n.title}</div>
                            <div style="font-size: 13px; color: #333;">${n.message}</div>
                            <div style="font-size: 11px; color: #888; margin-top: 4px;">${time}</div>
                        </div>
                        ${!isRead ? `<button class="mark-read-btn" data-id="${n.id}" style="background: #0d9488; color: #fff; border: none; padding: 2px 10px; border-radius: 20px; cursor: pointer;">Mark read</button>` : ''}
                    </div>
                </div>`;
        });
        listHtml += `
                <div style="text-align: center; padding: 8px; border-top: 1px solid #eee;">
                    <button id="markAllReadBtn" style="background: none; border: none; color: #0d9488; cursor: pointer; font-size: 13px; text-decoration: underline;">Mark all as read</button>
                </div>
            </div>`;
        html += listHtml;

        this.dropdown.innerHTML = html;

        // ─── X button ────────────────────────────────────────────────
        const closeBtn = document.getElementById('closeNotificationBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeDropdown();
            });
        }

        // ─── Mark single ─────────────────────────────────────────────
        this.dropdown.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                await this.markAsRead(id);
                const item = btn.closest('.notification-item');
                if (item) {
                    item.style.background = '#fff';
                    btn.remove();
                }
            });
        });

        // ─── Mark all ──────────────────────────────────────────────────
        const markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.markAllRead();
                this.dropdown.querySelectorAll('.notification-item').forEach(el => {
                    el.style.background = '#fff';
                    const btn = el.querySelector('.mark-read-btn');
                    if (btn) btn.remove();
                });
            });
        }
    },

    _getIcon(type) {
        const map = {
            'rent_due': 'bi-calendar-event',
            'rent_overdue': 'bi-exclamation-triangle',
            'payment_received': 'bi-check-circle',
            'maintenance_update': 'bi-tools',
            'utility_bill': 'bi-water',
            'lease_expiry': 'bi-clock',
        };
        return `<i class="bi ${map[type] || 'bi-bell'}"></i>`;
    },

    toggleDropdown() {
        if (!this.dropdown) {
            console.warn('Dropdown not created');
            return;
        }
        const bell = document.getElementById('notificationBell');
        if (!bell) return;

        // Check current computed display
        const computedDisplay = getComputedStyle(this.dropdown).display;
        const isHidden = computedDisplay === 'none';

        if (isHidden) {
            const rect = bell.getBoundingClientRect();
            this.dropdown.style.top = (rect.bottom + 8) + 'px';
            this.dropdown.style.right = (window.innerWidth - rect.right) + 'px';

            // Force open with !important
            this.dropdown.style.setProperty('display', 'block', 'important');
            this.dropdown.style.setProperty('min-height', '120px', 'important');
            this.dropdown.style.setProperty('width', '380px', 'important');
            this.dropdown.style.setProperty('background', '#ffffff', 'important');
            this.dropdown.style.setProperty('border', '2px solid #0d9488', 'important');

            console.log('Dropdown opened – display set to block with !important');

            // Verify after 200ms; if still hidden, add fallback class
            setTimeout(() => {
                const afterDisplay = getComputedStyle(this.dropdown).display;
                console.log('Computed display after 200ms:', afterDisplay);
                if (afterDisplay === 'none') {
                    console.warn('Still hidden – adding fallback class');
                    this.dropdown.classList.add('force-visible');
                } else {
                    this.dropdown.classList.remove('force-visible');
                }
            }, 200);

            this.renderDropdown();
        } else {
            // Force close with !important
            this.dropdown.style.setProperty('display', 'none', 'important');
            this.dropdown.classList.remove('force-visible');
            console.log('Dropdown closed');
        }
    },

    init() {
        const existing = document.getElementById('notificationDropdown');
        if (existing) existing.remove();

        const dropdown = document.createElement('div');
        dropdown.id = 'notificationDropdown';
        // Base styles – no display property (will be set by toggle)
        dropdown.style.cssText = `
            position: fixed;
            z-index: 99999;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
            padding: 0.5rem 0;
            font-family: 'DM Sans', sans-serif;
            max-height: 450px;
            overflow-y: auto;
            min-width: 320px;
            width: 380px;
            border: 2px solid #0d9488;
        `;
        document.body.appendChild(dropdown);
        this.dropdown = dropdown;

        // Injected CSS – overrides any external !important
        const style = document.createElement('style');
        style.textContent = `
            /* Ensure the dropdown is visible when .force-visible is added */
            #notificationDropdown.force-visible {
                display: block !important;
                min-height: 120px !important;
                width: 380px !important;
                position: fixed !important;
                z-index: 99999 !important;
                top: 100px !important;
                right: 20px !important;
                background: #ffffff !important;
                border: 2px solid #0d9488 !important;
            }
        `;
        document.head.appendChild(style);

        const bell = document.getElementById('notificationBell');
        if (!bell) {
            console.warn('Notification bell not found');
            return;
        }

        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Bell clicked');
            this.toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (this.dropdown) {
                const display = getComputedStyle(this.dropdown).display;
                if (display === 'block' && !this.dropdown.contains(e.target) && !bell.contains(e.target)) {
                    this.dropdown.style.setProperty('display', 'none', 'important');
                    this.dropdown.classList.remove('force-visible');
                    console.log('Dropdown closed by outside click');
                }
            }
        });

        window.addEventListener('resize', () => {
            if (this.dropdown) {
                const display = getComputedStyle(this.dropdown).display;
                if (display === 'block') {
                    const rect = bell.getBoundingClientRect();
                    this.dropdown.style.top = (rect.bottom + 8) + 'px';
                    this.dropdown.style.right = (window.innerWidth - rect.right) + 'px';
                }
            }
        });

        this.updateBadge();
        setInterval(() => this.updateBadge(), 30000);
        console.log('Notifications module initialized successfully');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    notifications.init();
});

window.notifications = notifications;