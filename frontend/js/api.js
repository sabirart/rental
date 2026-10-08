// js/api.js - FIXED: Properly sends auth token with all requests

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
        return localStorage.getItem('auth_token');
    },

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.getAuthToken();
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
            headers: {
                'Content-Type': 'application/json',
            }
        };

        // IMPORTANT: Always attach the auth token to every request
        const token = this.getAuthToken();
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        } else {
            console.warn('No auth token found for request:', endpoint);
            // If no token and not a public endpoint, redirect to login
            if (!endpoint.includes('/auth/') && !endpoint.includes('/health')) {
                throw new Error('Authentication required. Please login.');
            }
        }

        if (data) {
            options.body = JSON.stringify(data);
        }

        let lastError = null;
        let got401 = false;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                console.log(`API Request: ${method} ${url} (attempt ${attempt + 1})`);
                
                const response = await fetch(url, options);
                
                // Check if response is ok before parsing JSON
                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}`;
                    try {
                        const result = await response.json();
                        errorMessage = result.error || result.message || errorMessage;
                    } catch (e) {
                        errorMessage = response.statusText || errorMessage;
                    }
                    
                    // Handle authentication errors. A 401 right after a page
                    // load/refresh can be a transient false positive (server
                    // still waking up, brief DB hiccup) rather than a truly
                    // dead session, so we retry once before treating it as a
                    // real session expiry.
                    //
                    // Important: users must only ever be logged out when they
                    // explicitly choose to (Auth.logout()). A dead/expired
                    // token here must NOT clear the stored session or force
                    // any navigation - we just let the user know so they can
                    // log in again if/when they want to, while everything
                    // they already have on screen (including cached data)
                    // stays exactly as it was.
                    if (response.status === 401) {
                        if (!got401 && attempt < retries) {
                            got401 = true;
                            await new Promise(resolve => setTimeout(resolve, 800));
                            continue;
                        }

                        if (!this._sessionExpiredNotified) {
                            this._sessionExpiredNotified = true;
                            if (typeof showNotification === 'function') {
                                showNotification('Your session has expired. Log in again to keep saving changes.', 'warning');
                            }
                            // Give the API a fresh shot at re-notifying if the
                            // user does log back in and it expires again later.
                            setTimeout(() => { this._sessionExpiredNotified = false; }, 60000);
                        }
                        throw new Error('Session expired. Please login again.');
                    }
                    
                    throw new Error(errorMessage);
                }

                const result = await response.json();
                return result;
                
            } catch (error) {
                lastError = error;
                console.error(`API Error (attempt ${attempt + 1}/${retries + 1}):`, error.message);
                
                // Don't retry on authentication or validation errors
                if (error.message.includes('Authentication required') ||
                    error.message.includes('401') || 
                    error.message.includes('400') || 
                    error.message.includes('validation') || 
                    error.message.includes('required')) {
                    break;
                }
                
                // Retry for network errors
                if (attempt < retries) {
                    const delay = 1000 * (attempt + 1);
                    console.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
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

    // Clear all data endpoints
    async deleteAllTenants() {
        return this.request('/tenants/clear', 'DELETE');
    },

    async deleteAllProperties() {
        return this.request('/properties/clear', 'DELETE');
    },

    async deleteAllPayments() {
        return this.request('/payments/clear', 'DELETE');
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
    
    async getPropertyRooms(id) {
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
