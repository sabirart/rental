// js/auth.js - Simplified Working Version

const Auth = {
    _token: null,
    _user: null,
    _listeners: [],
    
    init() {
        const userStr = localStorage.getItem('auth_user');
        
        if (userStr) {
            try {
                this._token = null;
                this._user = JSON.parse(userStr);
                return true;
            } catch (e) {
                console.warn('Failed to parse user data, will try to refresh');
                return false;
            }
        }
        return false;
    },
    
    get token() { return this._token; },
    get user() { return this._user; },
    get isAuthenticated() { return !!this._user; },
    
    setUser(user, token) {
        this._token = token;
        this._user = user;
        if (user) {
            localStorage.setItem('auth_user', JSON.stringify(user));
        }
        this._notifyListeners();
    },
    
    clear() {
        this._token = null;
        this._user = null;
        localStorage.removeItem('auth_user');
        this._notifyListeners();
    },
    
    addListener(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(cb => cb !== callback);
        };
    },
    
    _notifyListeners() {
        this._listeners.forEach(callback => {
            try { callback(this.isAuthenticated, this._user); } catch (e) {}
        });
    },
    
    // ===== API METHODS =====
    async register(name, email, password) {
        const response = await fetch(`${API.baseURL}/auth/register`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Registration failed');
        return data.data;
    },
    
    async verifyEmail(email, otp) {
        const response = await fetch(`${API.baseURL}/auth/verify-email`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Verification failed');
        this.setUser(data.data.user, data.data.token);
        return data.data;
    },
    
    async resendVerification(email) {
        const response = await fetch(`${API.baseURL}/auth/resend-verification`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Failed to resend OTP');
        return data;
    },
    
    async login(email, password) {
        const response = await fetch(`${API.baseURL}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!data.success) {
            if (data.error && data.error.toLowerCase().includes('verify')) {
                throw new Error('VERIFY_REQUIRED');
            }
            throw new Error(data.error || data.message || 'Login failed');
        }
        this.setUser(data.data.user, data.data.token);
        return data.data;
    },
    
    // accessToken = web popup flow (google.accounts.oauth2), idToken = native
    // app flow (Capacitor SocialLogin via Credential Manager). Only one is sent.
    async googleLogin({ accessToken, idToken } = {}) {
        const response = await fetch(`${API.baseURL}/auth/google-login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(idToken ? { idToken } : { token: accessToken })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Google login failed');
        this.setUser(data.data.user, data.data.token);
        return data.data;
    },
    

    async setGoogleDriveToken(accessToken) {
        const response = await fetch(`${API.baseURL}/auth/google-drive-token`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: accessToken })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Google Drive connection failed');
        return data.data;
    },

    async forgotPassword(email) {
        const response = await fetch(`${API.baseURL}/auth/forgot-password`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Failed to send OTP');
        return data;
    },
    
    async resetPassword(email, otp, newPassword) {
        const response = await fetch(`${API.baseURL}/auth/reset-password`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, newPassword })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Password reset failed');
        return data;
    },
    
    async fetchMe() {
        const response = await fetch(`${API.baseURL}/auth/me`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Failed to load account');
        this.setUser({ ...this._user, ...data.data.user }, this._token);
        return data.data.user;
    },

    async updateProfile(profileData) {
        const response = await fetch(`${API.baseURL}/auth/profile`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(profileData)
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Failed to update account details');
        if (data.data && data.data.user) {
            this.setUser(data.data.user, this._token);
        } else if (data.data) {
            this.setUser({ ...this._user, ...data.data }, this._token);
        }
        return data.data;
    },

    // Accepts either { currentPassword, newPassword } or just { newPassword }
    // for accounts without an existing password (Google-only accounts).
    async changePassword(options) {
        const payload = {};
        if (options.currentPassword !== undefined) {
            payload.currentPassword = options.currentPassword;
        }
        payload.newPassword = options.newPassword;
        
        const response = await fetch(`${API.baseURL}/auth/change-password`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Failed to change password');
        // If password was created, update hasPassword flag on the cached user
        if (data.data && data.data.user) {
            this.setUser(data.data.user, this._token);
        } else if (this._user) {
            this.setUser({ ...this._user, hasPassword: true }, this._token);
        }
        return data;
    },

    async deleteAccount(password) {
        const response = await fetch(`${API.baseURL}/auth/account`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Failed to delete account');
        this.clear();
        return data;
    },

    async logout() {
        try {
            await fetch(`${API.baseURL}/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (e) {}
        this.clear();
        window.location.reload();
    },
    
    isDemoMode() {
        return !this.isAuthenticated && localStorage.getItem('demo_mode') === 'true';
    },
    
    enableDemoMode() {
        this.clear();
        localStorage.setItem('demo_mode', 'true');
        this._notifyListeners();
    },
    
    disableDemoMode() {
        localStorage.removeItem('demo_mode');
        this._notifyListeners();
    }
};

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    Auth.init();
});

window.Auth = Auth;
