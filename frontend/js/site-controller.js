// js/site-controller.js
// Orchestrates the two top-level states of the single-page app:
//   1. Site overlay (#siteOverlay) - marketing site, shown by default to
//      every visitor. A returning, already-authenticated visitor sees the
//      exact same overlay, just with Login / Sign Up / Try Demo swapped
//      out for a single "My Dashboard" button - there is no separate
//      welcome screen.
//   2. Dashboard    (#dashboardRoot) - the actual app, unlocked via
//                                       Login / Sign Up / Get Demo / My Dashboard
//
// Auth modals (#authModalsRoot) can be opened on top of either the site
// overlay or the dashboard.

const SiteController = {
    _Unlocked: false,

    init() {
        Auth.init();

        this._applyAuthState();
        this._wireReturningUserButtons();

        // Support the existing ?show=login / ?show=register deep link,
        // e.g. from an old bookmark or shared link.
        const params = new URLSearchParams(window.location.search);
        const show = params.get('show');
        if (show === 'login' || show === 'register') {
            setTimeout(() => this.openAuthModal(show), 400);
        }
    },

    // Toggles the `returning-user` class on <body>, which is what swaps
    // Login/Sign Up/Try Demo for a single "My Dashboard" button on the
    // (unchanged) site overlay. Safe to call again after login/logout.
    _applyAuthState() {
        const isAuth = !!Auth.isAuthenticated;
        document.body.classList.toggle('returning-user', isAuth);
        this._updateButtons(isAuth);
    },

    _updateButtons(isAuthenticated) {
        // Topbar buttons - Login and Sign Up
        const loginBtn = document.getElementById('loginTrigger');
        const signupBtn = document.getElementById('registerTrigger');
        const logoutBtn = document.getElementById('myDashboardTrigger');
        
        if (isAuthenticated) {
            // Hide Login & Sign Up, show Logout
            if (loginBtn) loginBtn.style.display = 'none';
            if (signupBtn) signupBtn.style.display = 'none';
            if (logoutBtn) {
                logoutBtn.style.display = 'inline-flex';
                logoutBtn.textContent = 'Logout';
                logoutBtn.className = 'btn btn-outline btn-sm';
                // Remove old listeners
                const newBtn = logoutBtn.cloneNode(true);
                logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
                newBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await Auth.logout();
                });
            }
        } else {
            // Show Login & Sign Up, hide Logout
            if (loginBtn) loginBtn.style.display = 'inline-flex';
            if (signupBtn) signupBtn.style.display = 'inline-flex';
            if (logoutBtn) {
                logoutBtn.style.display = 'none';
                logoutBtn.textContent = 'My Dashboard';
                logoutBtn.className = 'btn btn-primary btn-sm';
            }
        }
        
        // Hero section - Try Demo button
        const heroTryDemo = document.getElementById('heroRegister');
        const heroMyDashboard = document.getElementById('heroMyDashboard');
        
        if (isAuthenticated) {
            if (heroTryDemo) heroTryDemo.style.display = 'none';
            if (heroMyDashboard) {
                heroMyDashboard.style.display = 'inline-flex';
                heroMyDashboard.textContent = 'My Dashboard';
                heroMyDashboard.className = 'btn btn-primary';
                const newBtn = heroMyDashboard.cloneNode(true);
                heroMyDashboard.parentNode.replaceChild(newBtn, heroMyDashboard);
                newBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    SiteController.unlockDashboard();
                });
            }
        } else {
            if (heroTryDemo) heroTryDemo.style.display = 'inline-flex';
            if (heroMyDashboard) heroMyDashboard.style.display = 'none';
        }
    },

    _wireReturningUserButtons() {
        // Hero My Dashboard button
        document.getElementById('heroMyDashboard')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.unlockDashboard();
        });
    },

    // Opens one of the auth modals (login/register/verify/forgot/reset/demo)
    // on top of whatever is currently showing (site overlay or dashboard).
    openAuthModal(type) {
        const modalMap = {
            login: 'loginModal',
            register: 'registerModal',
            verify: 'verifyModal',
            forgot: 'forgotModal',
            reset: 'resetModal',
            demo: 'demoModal',
            manageAccount: 'manageAccountModal'
        };
        const id = modalMap[type] || type;
        const modal = document.getElementById(id);
        if (modal) {
            document.querySelectorAll('.modal-overlay.active').forEach((other) => {
                if (other !== modal) other.classList.remove('active');
            });
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },

    closeAuthModal(type) {
        const modalMap = {
            login: 'loginModal',
            register: 'registerModal',
            verify: 'verifyModal',
            forgot: 'forgotModal',
            reset: 'resetModal',
            demo: 'demoModal',
            manageAccount: 'manageAccountModal'
        };
        const id = modalMap[type] || type;
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    },

    // The single entry point into the dashboard. Called after a successful
    // login, registration + verification, Google login, Get Demo, or when
    // a returning logged-in user clicks "Continue to Dashboard".
    unlockDashboard() {
        // Close any open auth modals.
        document.querySelectorAll('#authModalsRoot .modal-overlay.active').forEach(m => {
            m.classList.remove('active');
        });

        document.body.classList.remove('returning-user');
        document.body.classList.add('dashboard-active');
        document.body.style.overflow = '';

        if (!this._dashboardUnlocked) {
            this._dashboardUnlocked = true;
            App.init();
        } else {
            // Already initialized once this page load (e.g. user bounced
            // between overlays) - just refresh data and re-render.
            App.loadData().then(() => App.renderCurrentView());
        }

        // Respect a view deep-linked via hash, otherwise land on dashboard.
        const hash = window.location.hash.replace('#', '');
        const validViews = ['dashboard', 'tenants', 'properties', 'payments', 'settings'];
        if (hash && validViews.includes(hash)) {
            App.navigateTo(hash);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    SiteController.init();
});

window.SiteController = SiteController;
