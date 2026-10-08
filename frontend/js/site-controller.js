// js/site-controller.js
// Orchestrates the three top-level states of the single-page app:
//   1. Site overlay   (#siteOverlay)   - marketing site, shown by default
//   2. Welcome overlay (#welcomeOverlay) - shown to a returning logged-in user
//   3. Dashboard        (#dashboardRoot)  - the actual app, unlocked via
//                                           Login / Sign Up / Get Demo / Continue
//
// Auth modals (#authModalsRoot) can be opened on top of either the site
// overlay or the dashboard.

const SiteController = {
    _dashboardUnlocked: false,

    init() {
        Auth.init();

        const authenticated = Auth.isAuthenticated;

        if (authenticated) {
            this._showWelcome();
        } else {
            // Default state on every fresh visit/refresh: #siteOverlay
            // (the login/sign up/try-demo gate) is already visible via CSS.
            // Demo mode is only entered by clicking "Try Demo" - it does not
            // auto-resume on a later visit, so a signed-out visitor always
            // sees the login gate first, exactly as an authenticated visitor
            // always sees the Welcome pop first.
        }

        this._wireWelcomeOverlay();

        // Support the existing ?show=login / ?show=register deep link,
        // e.g. from an old bookmark or shared link.
        const params = new URLSearchParams(window.location.search);
        const show = params.get('show');
        if (show === 'login' || show === 'register') {
            setTimeout(() => this.openAuthModal(show), 400);
        }
    },

    _showWelcome() {
        const user = Auth.user || {};
        const nameEl = document.getElementById('welcomeUserName');
        const avatarEl = document.getElementById('welcomeAvatar');
        if (nameEl) nameEl.textContent = user.name || 'there';
        if (avatarEl) avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
        document.body.classList.add('welcome-active');
    },

    _wireWelcomeOverlay() {
        const continueBtn = document.getElementById('welcomeContinueBtn');
        const logoutLink = document.getElementById('welcomeLogoutLink');

        continueBtn?.addEventListener('click', () => this.unlockDashboard());

        logoutLink?.addEventListener('click', async (e) => {
            e.preventDefault();
            document.body.classList.remove('welcome-active');
            await Auth.logout();
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

        document.body.classList.remove('welcome-active');
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
