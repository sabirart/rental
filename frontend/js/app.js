// js/app.js - Memory leak fixed, with modal cleanup

const App = {
    state: {
        tenants: [],
        properties: [],
        payments: [],
        currentView: 'dashboard',
        isLoading: false,
        isOnline: navigator.onLine
    },
    
    _eventListeners: [],
    _refreshTimeout: null,
    
    _initialized: false,

    _keepAliveInterval: null,

    async init() {
        if (this._initialized) return;
        this._initialized = true;
        Auth.init();
        DashboardAuthBar.init();
        this.setupNavigation();
        this.setupModal();
        this.setupNetworkListeners();
        this.setupAuthListener();
        this.setupVisibilityRefresh();
        this.startKeepAlive();

        // Show whatever's cached instantly, then go fetch the latest data
        // in the background without blocking the first render or showing
        // a loading spinner over data the user can already see.
        this.loadFromLocalStorage();
        this.renderCurrentView();
        this.loadData({ silent: true });

        if (typeof Notifications !== 'undefined') {
            await Notifications.init();
        }
    },
    
    setupAuthListener() {
        // Listen to auth changes
        Auth.addListener((isAuthenticated, user) => {
            // Update UI elements that depend on auth state
            this.updateUIForAuth(isAuthenticated, user);
            
            // If user just logged in, refresh data
            if (isAuthenticated) {
                this.loadData();
            }
        });
    },

    updateUIForAuth(isAuthenticated, user) {
        // Update any UI elements that depend on auth state
        const loginBtn = document.querySelector('[data-action="login"]');
        const registerBtn = document.querySelector('[data-action="register"]');
        
        if (loginBtn) loginBtn.style.display = isAuthenticated ? 'none' : '';
        if (registerBtn) registerBtn.style.display = isAuthenticated ? 'none' : '';
        
        // Update owner info from user if authenticated
        if (isAuthenticated && user) {
            const ownerInfo = {
                name: user.name || '',
                email: user.email || '',
            };
            localStorage.setItem('ownerInfo', JSON.stringify(ownerInfo));
            
            // Update settings form if visible
            if (document.getElementById('ownerName')) {
                document.getElementById('ownerName').value = user.name || '';
                document.getElementById('ownerEmail').value = user.email || '';
            }
        }
    },
    // options.silent = true: used for background refreshes (initial load,
    // tab-focus refresh, keep-alive-triggered refresh) - cached data is
    // already on screen, so no loading spinner and no "please login" toast
    // on failure; the user simply keeps seeing whatever was last cached.
    async loadData(options = {}) {
        const silent = options.silent === true;
        if (!silent) this.showLoading();
        try {
            // Check if in demo mode
            if (isDemoMode()) {
                // Use sample data
                const sampleData = getSampleData();
                this.state.tenants = sampleData.tenants || [];
                this.state.properties = sampleData.properties || [];
                this.state.payments = sampleData.payments || [];
                this.saveToLocalStorage();
                if (!silent) this.hideLoading();
                if (silent) this.renderCurrentView();
                return;
            }
            
            // Normal API calls for authenticated users
            const [tenantsRes, propertiesRes, paymentsRes] = await Promise.all([
                API.getTenants(),
                API.getProperties(),
                API.getPayments()
            ]);
            this.state.tenants = tenantsRes.data || [];
            this.state.properties = propertiesRes.data || [];
            this.state.payments = paymentsRes.data || [];
            this.saveToLocalStorage();
            // Silent refreshes still need to update the screen once the
            // fresher data arrives - just without the loading spinner/toast
            // that a foreground load would show.
            if (silent) this.renderCurrentView();
        } catch (error) {
            console.error('Failed to load data:', error);
            this.loadFromLocalStorage();
            if (!silent) showNotification('Please login to save your data permanently', 'info');
        } finally {
            if (!silent) this.hideLoading();
            if (typeof Notifications !== 'undefined' && Notifications._enabled !== undefined) {
                Notifications.refresh();
            }
        }
    },

    // Refreshes automatically the moment the user switches back to this
    // tab (rather than waiting for a manual refresh), same silent
    // cached-first behavior as the initial load.
    setupVisibilityRefresh() {
        const handler = () => {
            if (document.visibilityState === 'visible' && document.body.classList.contains('dashboard-active')) {
                this.loadData({ silent: true });
            }
        };
        document.addEventListener('visibilitychange', handler);
        this._eventListeners.push({ target: document, event: 'visibilitychange', handler });
    },

    // Pings the backend every 10 minutes while the app is open so the
    // server/session stays warm instead of going cold and forcing a slow
    // (or failed) request the next time the user actually does something.
    startKeepAlive() {
        if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
        this._keepAliveInterval = setInterval(() => {
            if (typeof API !== 'undefined' && typeof API.keepAlive === 'function') {
                API.keepAlive();
            }
        }, 10 * 60 * 1000);
    },

    saveToLocalStorage() {
        try {
            localStorage.setItem('tenants_cache', JSON.stringify(this.state.tenants));
            localStorage.setItem('properties_cache', JSON.stringify(this.state.properties));
            localStorage.setItem('payments_cache', JSON.stringify(this.state.payments));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    },

    // Replace the loadFromLocalStorage method
    loadFromLocalStorage() {
        try {
            // Check if in demo mode
            if (isDemoMode()) {
                const sampleData = getSampleData();
                this.state.tenants = sampleData.tenants || [];
                this.state.properties = sampleData.properties || [];
                this.state.payments = sampleData.payments || [];
                return;
            }
            
            const tenants = localStorage.getItem('tenants_cache');
            const properties = localStorage.getItem('properties_cache');
            const payments = localStorage.getItem('payments_cache');
            if (tenants) this.state.tenants = JSON.parse(tenants);
            if (properties) this.state.properties = JSON.parse(properties);
            if (payments) this.state.payments = JSON.parse(payments);
        } catch (e) {
            this.state.tenants = [];
            this.state.properties = [];
            this.state.payments = [];
        }
    },
    
    showLoading() { this.state.isLoading = true; document.body.classList.add('loading'); },
    hideLoading() { this.state.isLoading = false; document.body.classList.remove('loading'); },
    
    setupNetworkListeners() {
        const onlineHandler = () => { this.state.isOnline = true; showNotification('Connection restored', 'success'); this.loadData(); };
        const offlineHandler = () => { this.state.isOnline = false; showNotification('You are offline. Using cached data.', 'warning'); };
        window.addEventListener('online', onlineHandler);
        window.addEventListener('offline', offlineHandler);
        this._eventListeners.push({ target: window, event: 'online', handler: onlineHandler });
        this._eventListeners.push({ target: window, event: 'offline', handler: offlineHandler });
    },
    
    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const navToggle = document.getElementById('navToggle');
        const sidebar = document.getElementById('sidebar');

        // Opening/closing the drawer itself (the hamburger toggle, the
        // backdrop, tap-outside-to-close) is owned entirely by Mobile
        // (js/mobile.js) so there's a single source of truth for the drawer
        // + backdrop overlay state. This handler only reacts to a nav link
        // being clicked and, on mobile, asks Mobile to close the drawer
        // afterwards rather than touching the sidebar/navToggle classes
        // directly (Mobile.patchNavigation() already does this via its
        // App.navigateTo wrapper, but the fallback below keeps this working
        // even if mobile.js hasn't loaded for some reason).
        navLinks.forEach(link => {
            const clickHandler = (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                this.navigateTo(view);
                if (window.innerWidth <= 768) {
                    if (window.Mobile && typeof Mobile.closeDrawer === 'function') {
                        Mobile.closeDrawer();
                    } else {
                        sidebar.classList.remove('open');
                        navToggle.classList.remove('active');
                    }
                }
            };
            link.addEventListener('click', clickHandler);
            this._eventListeners.push({ target: link, event: 'click', handler: clickHandler });
        });
    },
    
    navigateTo(view) {
        // Close all open overlays/modals
        this.closeModal();
        if (typeof Tenants !== 'undefined' && Tenants.closeDetails) Tenants.closeDetails();
        const recycleOverlay = document.getElementById('recycleOverlay');
        if (recycleOverlay) { recycleOverlay.remove(); document.body.style.overflow = ''; }
        if (typeof Components !== 'undefined' && Components.closePopup) Components.closePopup();
        document.getElementById('documentModal')?.classList.remove('active');
        
        this.state.currentView = view;
        window.location.hash = view;
        document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('data-view') === view));
        document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.id === view));
        this.renderCurrentView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const mainContent = document.getElementById('mainContent');
        if (mainContent) mainContent.scrollTop = 0;
    },
    
    renderCurrentView() {
        const view = this.state.currentView;
        if (view === 'dashboard' && typeof Dashboard !== 'undefined') Dashboard.render();
        else if (view === 'tenants' && typeof Tenants !== 'undefined') Tenants.render();
        else if (view === 'properties' && typeof Properties !== 'undefined') Properties.render();
        else if (view === 'payments' && typeof Payments !== 'undefined') Payments.render();
        else if (view === 'settings' && typeof Settings !== 'undefined') Settings.init();
    },
    
    setupModal() {
        const modal = document.getElementById('modal');
        const closeBtn = document.getElementById('modalClose');
        const closeHandler = () => this.closeModal();
        closeBtn.addEventListener('click', closeHandler);
        this._eventListeners.push({ target: closeBtn, event: 'click', handler: closeHandler });
        
        const escapeHandler = (e) => { 
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                this.closeModal();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        this._eventListeners.push({ target: document, event: 'keydown', handler: escapeHandler });
        
        // Close on overlay click
        const overlayHandler = (e) => {
            if (e.target === modal && modal.classList.contains('active')) {
                this.closeModal();
            }
        };
        modal.addEventListener('click', overlayHandler);
        this._eventListeners.push({ target: modal, event: 'click', handler: overlayHandler });
    },
    
    openModal(title, content) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = content;
        document.getElementById('modal').classList.add('active');
        document.body.style.overflow = 'hidden';
        // Reset scroll to top
        const modalBody = document.getElementById('modalBody');
        if (modalBody) {
            modalBody.scrollTop = 0;
        }
    },
    
    closeModal() {
        const modal = document.getElementById('modal');
        if (modal && modal._paymentNavigationCleanup) {
            modal._paymentNavigationCleanup();
            delete modal._paymentNavigationCleanup;
        }
        modal.classList.remove('active');
        document.body.style.overflow = '';
    },
    
    async refreshData() {
        if (this._refreshTimeout) { clearTimeout(this._refreshTimeout); this._refreshTimeout = null; }
        this._refreshTimeout = setTimeout(async () => {
            await this.loadData();
            this.renderCurrentView();
            showNotification('Data refreshed', 'success');
            this._refreshTimeout = null;
        }, 300);
    },
    
    async refreshProperties() {
        try {
            const response = await API.getProperties();
            this.state.properties = response.data || [];
            this.saveToLocalStorage();
            this.renderCurrentView();
            showNotification('Properties refreshed', 'success');
            return this.state.properties;
        } catch (error) {
            showNotification('Failed to refresh properties', 'error');
            return [];
        }
    },
    
    async forceRefreshData() {
        this.showLoading();
        try {
            const [tenantsRes, propertiesRes, paymentsRes] = await Promise.all([
                API.getTenants(),
                API.getProperties(),
                API.getPayments()
            ]);
            this.state.tenants = tenantsRes.data || [];
            this.state.properties = propertiesRes.data || [];
            this.state.payments = paymentsRes.data || [];
            this.saveToLocalStorage();
        } catch (error) {
            console.error('Failed to refresh data:', error);
            this.loadFromLocalStorage();
            showNotification('Please login to save your data permanently', 'info');
        } finally {
            this.hideLoading();
            this.renderCurrentView();
        }
    },
    
    destroy() {
        this._eventListeners.forEach(({ target, event, handler }) => target.removeEventListener(event, handler));
        this._eventListeners = [];
        if (this._refreshTimeout) { clearTimeout(this._refreshTimeout); this._refreshTimeout = null; }
        if (this._keepAliveInterval) { clearInterval(this._keepAliveInterval); this._keepAliveInterval = null; }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const hashHandler = () => {
        const hash = window.location.hash.replace('#', '');
        if (hash && ['dashboard','tenants','properties','payments','settings'].includes(hash) && document.body.classList.contains('dashboard-active')) {
            App.navigateTo(hash);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };
    window.addEventListener('hashchange', hashHandler);
    App._eventListeners.push({ target: window, event: 'hashchange', handler: hashHandler });
    // Note: App.init() itself is now triggered by SiteController.unlockDashboard()
    // once the user actually enters the dashboard (via Login/Sign Up/Get Demo, or
    // "Continue to Dashboard" on the Welcome overlay) rather than unconditionally
    // on every page load, since this page also serves the marketing site overlay.
});

window.addEventListener('beforeunload', () => App.destroy());
window.App = App;

// Shared by every overlay/panel in the app (auth modals in web_script.js,
// the notifications panel, the recycle bin, the data import/export panel)
// so opening one always closes whatever else happens to be open first -
// two overlays should never be visible on top of each other at once.
window.closeAllOverlays = function (exceptId) {
    document.querySelectorAll('.modal-overlay.active').forEach((modal) => {
        if (modal.id !== exceptId) modal.classList.remove('active');
    });

    if (exceptId !== 'notifPanel') {
        const notifPanel = document.getElementById('notifPanel');
        const notifOverlay = document.getElementById('notifPanelOverlay');
        if (notifPanel && notifPanel.style.display !== 'none') notifPanel.style.display = 'none';
        if (notifOverlay && notifOverlay.style.display !== 'none') notifOverlay.style.display = 'none';
    }

    if (exceptId !== 'dataExportPanel') {
        const dataPanel = document.getElementById('dataExportPanel');
        const dataOverlay = document.getElementById('dataExportOverlay');
        if (dataPanel && dataPanel.style.display !== 'none') dataPanel.style.display = 'none';
        if (dataOverlay && dataOverlay.style.display !== 'none') dataOverlay.style.display = 'none';
    }

    if (exceptId !== 'recycleOverlay' && window.Recycle) {
        Recycle.closeOverlay();
    }

    // Any of the above may have set body scroll-lock; only the still-open
    // overlay (if any) should be allowed to keep it locked, so recompute
    // from what's actually visible rather than blindly clearing it.
    const stillOpen = document.querySelector('.modal-overlay.active')
        || (document.getElementById('notifPanel')?.style.display === 'flex')
        || (document.getElementById('dataExportPanel')?.style.display === 'flex')
        || document.getElementById('recycleOverlay');
    if (!stillOpen) {
        document.body.style.overflow = '';
    }
};
