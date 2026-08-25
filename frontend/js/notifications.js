// js/notifications.js - Notification bell + panel:
// tenant lease-ending-soon and pending-payment alerts.

const Notifications = {
    _enabled: true,
    _items: [],

    async init() {
        await this.loadSettings();
        this.wireUI();
        this.refresh();
    },

    async loadSettings() {
        try {
            if (isDemoMode()) {
                this._enabled = localStorage.getItem('notifications_enabled') !== 'false';
                return;
            }
            const res = await API.getSettings();
            this._enabled = res.data ? res.data.notificationsEnabled : true;
        } catch (e) {
            this._enabled = true; // default on, per spec, even if the settings call fails
        }
    },

    setEnabled(enabled) {
        this._enabled = enabled;
        if (isDemoMode()) {
            localStorage.setItem('notifications_enabled', enabled ? 'true' : 'false');
        }
        this.refresh();
    },

    wireUI() {
        const openPanel = () => this.showPanel();
        document.getElementById('notifBellBtn')?.addEventListener('click', openPanel);
        document.getElementById('notifBellBtnMobile')?.addEventListener('click', openPanel);
        document.getElementById('notifPanelClose')?.addEventListener('click', () => this.hidePanel());
        document.getElementById('notifPanelOverlay')?.addEventListener('click', () => this.hidePanel());
        
        // "Mark all as read" - clears all notifications and hides the badge
        document.getElementById('notifMarkAllRead')?.addEventListener('click', () => this.markAllRead());
    },

    showPanel() {
        if (window.closeAllOverlays) window.closeAllOverlays('notifPanel');
        this.refresh();
        document.getElementById('notifPanel').style.display = 'flex';
        document.getElementById('notifPanelOverlay').style.display = 'block';
        this._positionPanel();
        if (!this._resizeHandlerBound) {
            this._resizeHandlerBound = true;
            window.addEventListener('resize', () => {
                if (document.getElementById('notifPanel').style.display === 'flex') {
                    this._positionPanel();
                }
            });
        }
    },

    // Anchors the popover just below whichever bell icon is currently
    // visible (the desktop one in the auth-bar, or the mobile one in the
    // topbar), clamped so it never runs off the edge of the screen.
    _positionPanel() {
        const isMobile = window.innerWidth <= 768;
        const bell = document.getElementById(isMobile ? 'notifBellBtnMobile' : 'notifBellBtn');
        const panel = document.getElementById('notifPanel');
        if (!bell || !panel) return;

        const rect = bell.getBoundingClientRect();
        const width = Math.min(360, window.innerWidth - 24);
        let left = rect.right - width;
        left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
        const top = Math.min(rect.bottom + 8, window.innerHeight - 60);

        panel.style.width = width + 'px';
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.maxHeight = Math.max(200, window.innerHeight - top - 16) + 'px';
    },

    hidePanel() {
        document.getElementById('notifPanel').style.display = 'none';
        document.getElementById('notifPanelOverlay').style.display = 'none';
    },

    // Mark all notifications as read - clears the list and hides the badge
    markAllRead() {
        this._items = [];
        this._renderBadge();
        this._renderPanel();
        // Also hide the panel if it's open (optional - user might want to see empty state)
        // We keep it open showing "You're all caught up"
    },

    // Recompute the notification list from current App state and re-render
    // the bell badge + (if open) the panel body.
    refresh() {
        this._items = this._enabled ? this._computeNotifications() : [];
        this._renderBadge();
        this._renderPanel();
    },

    _computeNotifications() {
        const items = [];
        const tenants = (App.state && App.state.tenants) || [];
        const payments = (App.state && App.state.payments) || [];
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        tenants.filter(t => t.status === 'active').forEach(tenant => {
            // Lease/closing date approaching or passed
            if (tenant.lease_end_date) {
                const endDate = new Date(tenant.lease_end_date);
                if (!isNaN(endDate.getTime()) && endDate <= in7Days) {
                    const overdue = endDate < now;
                    items.push({
                        type: 'lease',
                        urgent: overdue,
                        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
                        title: overdue ? 'Lease has ended' : 'Lease ending soon',
                        detail: `${tenant.name} — ${overdue ? 'ended' : 'ends'} ${formatDate(tenant.lease_end_date)}`,
                        date: endDate
                    });
                }
            }

            // Pending payment for this tenant (most recent unpaid/partial record)
            const tenantPayments = payments.filter(p => p.tenant_id === tenant.id);
            const pending = tenantPayments.find(p => p.status === 'unpaid' || p.status === 'partial');
            if (pending) {
                items.push({
                    type: 'payment',
                    urgent: pending.status === 'unpaid',
                    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5"/></svg>',
                    title: pending.status === 'partial' ? 'Partial payment pending' : 'Payment pending',
                    detail: `${tenant.name} — ${formatCurrency(pending.total_payment)} for ${monthName(pending.month)} ${pending.year}`,
                    date: new Date(pending.year, pending.month - 1, 1)
                });
            }
        });

        items.sort((a, b) => a.date - b.date);
        return items;
    },

    _renderBadge() {
        const count = this._items.length;
        [document.getElementById('notifBellBadge'), document.getElementById('notifBellBadgeMobile')].forEach(badge => {
            if (!badge) return;
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.style.display = count > 0 ? 'flex' : 'none';
        });
    },

    _renderPanel() {
        const body = document.getElementById('notifPanelBody');
        if (!body) return;

        if (!this._enabled) {
            body.innerHTML = `<div class="notif-empty">Notifications are turned off.<br>Enable them in Settings.</div>`;
            return;
        }
        if (this._items.length === 0) {
            body.innerHTML = `<div class="notif-empty">You're all caught up.<br>No alerts right now.</div>`;
            return;
        }

        body.innerHTML = this._items.map(item => `
            <div class="notif-item ${item.urgent ? 'notif-urgent' : ''}">
                <div class="notif-item-icon">${item.icon}</div>
                <div class="notif-item-body">
                    <div class="notif-item-title">${escapeHTML(item.title)}</div>
                    <div class="notif-item-detail">${escapeHTML(item.detail)}</div>
                </div>
            </div>
        `).join('');
    }
};

function monthName(m) {
    const names = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return names[m] || '';
}

window.Notifications = Notifications;
