// js/auth-ui.js - Dashboard auth bar (avatar, name, login/signup/logout buttons)
// Renamed from the old global `AuthUI` to `DashboardAuthBar` to avoid colliding
// with the marketing site's own auth-modal manager, which also used to be
// exposed as `window.AuthUI` back when index.html and dashboard.html were
// separate pages. Both now live in the same document.

const DashboardAuthBar = {
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
            if (avatar) {
                if (user.profilePic) {
                    avatar.innerHTML = `<img src="${escapeHTML(user.profilePic)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                } else {
                    avatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
                }
            }
            if (nameEl) nameEl.textContent = user.name || 'User';
            if (emailEl) emailEl.textContent = ''; // REMOVED: email hidden
            if (statusBadge) {
                statusBadge.style.display = 'none'; // REMOVED: badge hidden
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
                statusBadge.textContent = 'Demo Mode';
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
            SiteController.openAuthModal('login');
        });
        
        document.getElementById('authRegisterBtn')?.addEventListener('click', () => {
            SiteController.openAuthModal('register');
        });
        
        document.getElementById('authLogoutBtn')?.addEventListener('click', async () => {
            await Auth.logout();
        });
        
        document.getElementById('authProfileBtn')?.addEventListener('click', () => {
            this.showProfile();
        });
    },
    
    showLogin() {
        SiteController.openAuthModal('login');
    },
    
    showRegister() {
        SiteController.openAuthModal('register');
    },
    
    // Opens the Manage Account overlay (details, password, delete account).
    showProfile() {
        if (typeof ManageAccount !== 'undefined') {
            ManageAccount.open();
        } else if (typeof App !== 'undefined' && App.navigateTo) {
            App.navigateTo('settings');
        }
    },
    
    closeModal() {
        // Not needed in dashboard
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Listener wiring only - DashboardAuthBar.init() (which also runs
    // _updateAuthBar) is triggered by App.init(), itself triggered once the
    // dashboard is actually unlocked.
});

window.DashboardAuthBar = DashboardAuthBar;
