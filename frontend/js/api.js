// js/api.js - API client (cookie based session; see Auth)

const API = {
    get baseURL() {
        if (window.API_URL) {
            return window.API_URL;
        }
        const storedURL = localStorage.getItem('api_url');
        if (storedURL) {
            return storedURL;
        }
        // Same-origin by default so this works both on localhost and once deployed
        // (backend serves the frontend and the API from the same domain).
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:5000/api';
        }
        return `${window.location.origin}/api`;
    },

    setBaseURL(url) {
        localStorage.setItem('api_url', url);
        window.API_URL = url;
    },

    // Get auth token from localStorage
    getAuthToken() {
        return null;
    },

    // Check if user is authenticated
    isAuthenticated() {
        return window.Auth?.isAuthenticated === true;
    },

    // Guards against the 3 parallel loadData() calls (getTenants/getProperties/
    // getPayments) each independently wiping storage and redirecting when a
    // 401 comes back - without this, a single flaky/transient 401 (e.g. the
    // backend waking up from a cold start) was enough to force a full logout
    // on every page refresh, even with a perfectly valid session.
    _loggingOut: false,

    async request(endpoint, method = 'GET', data = null, retries = 2) {
        const url = `${this.baseURL}${endpoint}`;
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };

        const authenticated = window.Auth?.isAuthenticated === true;
        if (!authenticated && !endpoint.includes('/auth/') && !endpoint.includes('/health')) {
            throw new Error('Please continue with Google to access your saved data.');
        }
        if (data) options.body = JSON.stringify(data);

        // Only reads are retried automatically. Replaying a create/update/delete after a
        // lost response could duplicate or double-apply it, so writes fail fast instead.
        if (method !== 'GET') retries = 0;

        let lastError = null;
        let got401 = false;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, options);

                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}`;
                    try {
                        const result = await response.json();
                        errorMessage = result.error || result.message || errorMessage;
                    } catch (e) {
                        errorMessage = response.statusText || errorMessage;
                    }

                    // A 401 right after load can be a transient false positive (server waking
                    // from a cold start), so a read is retried once before the session is
                    // treated as expired. Users are only ever logged out by Auth.logout():
                    // an expired session just prompts them, and their on-screen data stays.
                    if (response.status === 401) {
                        if (!got401 && attempt < retries) {
                            got401 = true;
                            await new Promise(resolve => setTimeout(resolve, 800));
                            continue;
                        }
                        if (!this._sessionExpiredNotified) {
                            this._sessionExpiredNotified = true;
                            this._showSessionExpiredAlert();
                            setTimeout(() => { this._sessionExpiredNotified = false; }, 60000);
                        }
                        const expired = new Error('Your Google session expired. Please continue with Google again.');
                        expired.status = 401;
                        throw expired;
                    }

                    const httpError = new Error(errorMessage);
                    httpError.status = response.status;
                    // 503/504 usually mean the backend is cold-starting: back off and retry reads.
                    if ((response.status === 503 || response.status === 504) && attempt < retries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                        continue;
                    }
                    throw httpError;
                }

                return await response.json();
            } catch (error) {
                lastError = error;
                // Client errors (4xx) are final; only network failures / 5xx are worth retrying.
                if (error.status && error.status < 500) break;
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                }
            }
        }

        throw lastError || new Error('API request failed after multiple attempts');
    },

    async healthCheck() {
        try {
            const response = await fetch(`${this.baseURL}/health`);
            return response.ok;
        } catch (error) {
            return false;
        }
    },

    // Lightweight ping used purely to keep the backend/session warm while
    // the app is open (see App._startKeepAlive in app.js, called every 10
    // minutes). Deliberately swallows all errors - a failed keep-alive
    // ping should never surface to the user.
    async keepAlive() {
        try {
            await this.healthCheck();
        } catch (e) {}
    },

    // A blocking, dismiss-free alert shown once a session is confirmed
    // expired (after the 401 retry above). Gives the user two explicit
    // ways forward: refresh the page (in case it was a transient blip) or
    // continue directly to Google sign-in - all their cached data stays on
    // screen either way.
    _showSessionExpiredAlert() {
        if (document.getElementById('sessionExpiredAlert')) return;

        if (!document.getElementById('sessionExpiredAlertStyles')) {
            const style = document.createElement('style');
            style.id = 'sessionExpiredAlertStyles';
            style.textContent = `
                #sessionExpiredAlert { position:fixed; inset:0; z-index:999999; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; padding:20px; }
                #sessionExpiredAlert .session-expired-box { background:#fff; border-radius:12px; max-width:360px; width:100%; padding:24px; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,.2); }
                #sessionExpiredAlert h3 { margin:0 0 8px; font-size:1.1rem; }
                #sessionExpiredAlert p { margin:0 0 18px; color:#666; font-size:.9rem; }
                #sessionExpiredAlert .session-expired-actions { display:flex; gap:10px; }
                #sessionExpiredAlert .session-expired-actions button { flex:1; padding:10px; border-radius:6px; border:none; font-size:.9rem; cursor:pointer; }
                #sessionExpiredAlert .session-refresh-btn { background:#f1f1f1; color:#1a1a1a; }
                #sessionExpiredAlert .session-login-btn { background:var(--primary, #1a1a1a); color:#fff; }
            `;
            document.head.appendChild(style);
        }

        const box = document.createElement('div');
        box.id = 'sessionExpiredAlert';
        box.innerHTML = `
            <div class="session-expired-box">
                <h3>Session expired</h3>
                <p>Your session has expired. Your data is saved in your Google Drive - refresh to reconnect, or sign in with Google again.</p>
                <div class="session-expired-actions">
                    <button type="button" class="session-refresh-btn">Refresh</button>
                    <button type="button" class="session-login-btn">Continue with Google</button>
                </div>
            </div>
        `;
        document.body.appendChild(box);

        box.querySelector('.session-refresh-btn').addEventListener('click', () => {
            window.location.reload();
        });
        box.querySelector('.session-login-btn').addEventListener('click', () => {
            box.remove();
            if (window.Auth && typeof Auth.clear === 'function') Auth.clear();
            document.body.classList.remove('dashboard-active', 'returning-user');
            if (window.SiteController && typeof SiteController.openAuthModal === 'function') {
                SiteController.openAuthModal('login');
            }
        });
    },

    // Single atomic "clear everything" (server takes a recovery snapshot first)
    async clearAllData() {
        return this.request('/settings/data', 'DELETE');
    },

    // Creates this period's rows for active tenants (idempotent; replaces writes that used to happen inside GETs)
    async rolloverPayments() {
        return this.request('/payments/rollover', 'POST');
    },

    // Clear all data endpoints
    async deleteAllTenants() {
        return this.request('/tenants/clear', 'DELETE');
    },

    async deleteAllProperties() {
        return this.request('/properties/clear', 'DELETE');
    },

    async deleteAllPayments() {
        return this.request('/payments/clear?confirm=yes', 'DELETE');
    },
    
    // Tenant endpoints
    async getTenants() {
        return this.request('/tenants');
    },
    
    async getTenant(id) {
        return this.request(`/tenants/${id}`);
    },
    
    async createTenant(data) {
        return this.request('/tenants', 'POST', data);
    },
    
    async updateTenant(id, data) {
        return this.request(`/tenants/${id}`, 'PUT', data);
    },
    
    async deleteTenant(id) {
        return this.request(`/tenants/${id}`, 'DELETE');
    },
    
    async getTenantsByProperty(propertyId) {
        return this.request(`/tenants/property/${propertyId}`);
    },
    
    // Property endpoints
    async getProperties() {
        return this.request('/properties');
    },
    
    async getProperty(id) {
        return this.request(`/properties/${id}`);
    },
    
    async createProperty(data) {
        if (data.roomRents) {
            delete data.roomRents;
        }
        return this.request('/properties', 'POST', data);
    },

    async updateProperty(id, data) {
        return this.request(`/properties/${id}`, 'PUT', data);
    },
    
    async deleteProperty(id) {
        return this.request(`/properties/${id}`, 'DELETE');
    },
    
    // Demo mode has no server: derive the room list from the sample properties/tenants.
    _demoRooms(propertyId) {
        const property = (window.App?.state?.properties || []).find(p => p.id === propertyId);
        if (!property) return [];
        const tenants = (window.App?.state?.tenants || []).filter(t => t.property_id === propertyId && t.status === 'active');
        const rooms = [];
        for (let n = 1; n <= (property.total_rooms || 0); n++) {
            const tenant = tenants.find(t => Number(t.room_number) === n);
            rooms.push({ id: `${propertyId}-room-${n}`, property_id: propertyId, room_number: n, room_name: `Room ${n}`,
                status: tenant ? 'occupied' : 'available', tenant_id: tenant ? tenant.id : null, rent_amount: property.base_rent || 0 });
        }
        return rooms;
    },

    async getPropertyRooms(id) {
        if (typeof isDemoMode === 'function' && isDemoMode()) return { success: true, data: this._demoRooms(id) };
        return this.request(`/properties/${id}/rooms`);
    },
    
    async updateRoom(propertyId, roomNumber, data) {
        return this.request(`/properties/${propertyId}/rooms/${roomNumber}`, 'PUT', data);
    },
    
    async addRoom(propertyId, data) {
        return this.request(`/properties/${propertyId}/rooms`, 'POST', data);
    },
    
    // Payment endpoints
    async getPayments(filters = {}) {
        const queryString = new URLSearchParams(filters).toString();
        const endpoint = queryString ? `/payments?${queryString}` : '/payments';
        return this.request(endpoint);
    },
    
    async getPayment(id) {
        return this.request(`/payments/${id}`);
    },
    
    async createPayment(data) {
        return this.request('/payments', 'POST', data);
    },
    
    async updatePayment(id, data) {
        return this.request(`/payments/${id}`, 'PUT', data);
    },
    
    async deletePayment(id) {
        return this.request(`/payments/${id}`, 'DELETE');
    },
    
    async getPaymentsByTenant(tenantId) {
        return this.request(`/payments/tenant/${tenantId}`);
    },
    
    async getDashboardStats() {
        return this.request('/payments/dashboard-stats');
    },
    
    async getMonthlySummary(year, month) {
        return this.request(`/payments/monthly-summary?year=${year}&month=${month}`);
    },

    // Recycle Bin endpoints
    async getRecycleItems(type = null) {
        const endpoint = type ? `/recycle?type=${type}` : '/recycle';
        return this.request(endpoint);
    },

    async getRecycleCount() {
        return this.request('/recycle/count');
    },

    async recoverRecycleItem(id) {
        return this.request(`/recycle/recover/${id}`, 'POST');
    },

    async deleteRecycleItem(id) {
        return this.request(`/recycle/${id}`, 'DELETE');
    },

    async clearRecycleBin(type = null) {
        const endpoint = type ? `/recycle/clear/all?type=${type}` : '/recycle/clear/all';
        return this.request(endpoint, 'DELETE');
    },

    async cleanRecycleBin(days = 15) {
        return this.request(`/recycle/clear/old?days=${days}`, 'DELETE');
    },

    async removeRoom(propertyId, roomNumber) {
        return this.request(`/properties/${propertyId}/rooms/${roomNumber}`, 'DELETE');
    },

    async getSettings() {
        return this.request('/settings');
    },

    async updateSettings(data) {
        return this.request('/settings', 'PUT', data);
    },
};

window.API = API;
