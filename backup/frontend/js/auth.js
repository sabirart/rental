// js/auth.js - Simplified Working Version

const Auth = {
    _token: null,
    _user: null,
    _listeners: [],
    
    init() {
        const token = localStorage.getItem('auth_token');
        const userStr = localStorage.getItem('auth_user');
        
        if (token && userStr) {
            try {
                this._token = token;
                this._user = JSON.parse(userStr);
                this._notifyListeners();
                return true;
            } catch (e) {
                this.clear();
            }
        }
        return false;
    },
    
    get token() { return this._token; },
    get user() { return this._user; },
    get isAuthenticated() { return !!this._token && !!this._user; },
    
    setUser(user, token) {
        this._token = token;
        this._user = user;
        if (token && user) {
            localStorage.setItem('auth_token', token);
            localStorage.setItem('auth_user', JSON.stringify(user));
        }
        this._notifyListeners();
    },
    
    clear() {
        this._token = null;
        this._user = null;
        localStorage.removeItem('auth_token');
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
    
    async googleLogin(googleToken) {
        const response = await fetch(`${API.baseURL}/auth/google-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: googleToken })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Google login failed');
        this.setUser(data.data.user, data.data.token);
        return data.data;
    },
    
    async forgotPassword(email) {
        const response = await fetch(`${API.baseURL}/auth/forgot-password`, {
            method: 'POST',
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, newPassword })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || data.message || 'Password reset failed');
        return data;
    },
    
    async logout() {
        if (this._token) {
            try {
                await fetch(`${API.baseURL}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this._token}` }
                });
            } catch (e) {}
        }
        this.clear();
        window.location.reload();
    },
    
    isDemoMode() {
        return !this.isAuthenticated && localStorage.getItem('demo_mode') === 'true';
    },
    
    enableDemoMode() {
        localStorage.setItem('demo_mode', 'true');
        this._notifyListeners();
    },
    
    disableDemoMode() {
        localStorage.removeItem('demo_mode');
        this._notifyListeners();
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});

window.Auth = Auth;