// js/auth-ui.js - Simplified for dashboard

const AuthUI = {
    init() {
        this._updateAuthBar();
        
        Auth.addListener(() => {
            this._updateAuthBar();
        });
        
        this._setupListeners();
    },
    
    _updateAuthBar() {
        const isAuthenticated = Auth.isAuthenticated;
        const user = Auth.user;
        
        const avatar = document.getElementById('authUserAvatar');
        const nameEl = document.getElementById('authUserName');
        const emailEl = document.getElementById('authUserEmail');
        const statusBadge = document.getElementById('authStatusBadge');
        const loginBtn = document.getElementById('authLoginBtn');
        const registerBtn = document.getElementById('authRegisterBtn');
        const profileBtn = document.getElementById('authProfileBtn');
        const logoutBtn = document.getElementById('authLogoutBtn');
        
        if (isAuthenticated && user) {
            if (avatar) avatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
            if (nameEl) nameEl.textContent = user.name || 'User';
            if (emailEl) emailEl.textContent = user.email || '';
            if (statusBadge) {
                statusBadge.textContent = user.isVerified ? '✓ Verified' : '⚠️ Unverified';
                statusBadge.className = 'badge ' + (user.isVerified ? 'badge-success' : 'badge-warning');
            }
            if (loginBtn) loginBtn.style.display = 'none';
            if (registerBtn) registerBtn.style.display = 'none';
            if (profileBtn) profileBtn.style.display = 'inline-flex';
            if (logoutBtn) logoutBtn.style.display = 'inline-flex';
        } else {
            if (avatar) avatar.textContent = '?';
            if (nameEl) nameEl.textContent = 'Guest';
            if (emailEl) emailEl.textContent = '';
            if (statusBadge) {
                statusBadge.textContent = 'Guest';
                statusBadge.className = 'badge badge-warning';
            }
            if (loginBtn) loginBtn.style.display = 'inline-flex';
            if (registerBtn) registerBtn.style.display = 'inline-flex';
            if (profileBtn) profileBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
        }
    },
    
    _setupListeners() {
        document.getElementById('authLoginBtn')?.addEventListener('click', () => {
            window.location.href = 'index.html?show=login';
        });
        
        document.getElementById('authRegisterBtn')?.addEventListener('click', () => {
            window.location.href = 'index.html?show=register';
        });
        
        document.getElementById('authLogoutBtn')?.addEventListener('click', async () => {
            await Auth.logout();
        });
        
        document.getElementById('authProfileBtn')?.addEventListener('click', () => {
            document.querySelector('[data-view="settings"]')?.click();
        });
    },
    
    showLogin() {
        window.location.href = 'index.html?show=login';
    },
    
    showRegister() {
        window.location.href = 'index.html?show=register';
    },
    
    closeModal() {
        // Not needed in dashboard
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AuthUI.init();
});

window.AuthUI = AuthUI;