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
    _dashboardUnlocked: false,

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
        // Also control visibility of the dashboard trigger buttons
        this._updateDashboardButtons(isAuth);
    },

    // Show/hide the "My Dashboard" button based on auth state
    _updateDashboardButtons(isAuthenticated) {
        const myDashboardTriggers = document.querySelectorAll('#myDashboardTrigger, #heroMyDashboard');
        myDashboardTriggers.forEach(el => {
            el.style.display = isAuthenticated ? 'inline-flex' : 'none';
        });
    },

    _wireReturningUserButtons() {
        const goToDashboard = (e) => {
            e.preventDefault();
            this.unlockDashboard();
        };
        document.getElementById('myDashboardTrigger')?.addEventListener('click', goToDashboard);
        document.getElementById('heroMyDashboard')?.addEventListener('click', goToDashboard);
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
