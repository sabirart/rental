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
    
    async init() {
        Auth.init();
        AuthUI.init();
        this.setupNavigation();
        this.setupModal();
        this.setupNetworkListeners();
        this.setupAuthListener();
        await this.loadData();
        this.renderCurrentView();
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
    // Replace the loadData method
    async loadData() {
        this.showLoading();
        try {
            // Check if in demo mode
            if (isDemoMode()) {
                // Use sample data
                const sampleData = getSampleData();
                this.state.tenants = sampleData.tenants || [];
                this.state.properties = sampleData.properties || [];
                this.state.payments = sampleData.payments || [];
                this.saveToLocalStorage();
                this.hideLoading();
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
        } catch (error) {
            console.error('Failed to load data:', error);
            this.loadFromLocalStorage();
            showNotification('Please Login to make your Own Data', 'warning');
        } finally {
            this.hideLoading();
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
        
        navLinks.forEach(link => {
            const clickHandler = (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                this.navigateTo(view);
                if (window.innerWidth <= 768) { sidebar.classList.remove('open'); navToggle.classList.remove('active'); }
            };
            link.addEventListener('click', clickHandler);
            this._eventListeners.push({ target: link, event: 'click', handler: clickHandler });
        });
        
        const toggleHandler = () => { sidebar.classList.toggle('open'); navToggle.classList.toggle('active'); };
        navToggle.addEventListener('click', toggleHandler);
        this._eventListeners.push({ target: navToggle, event: 'click', handler: toggleHandler });
        
        const outsideClickHandler = (e) => {
            if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !navToggle.contains(e.target)) {
                sidebar.classList.remove('open');
                navToggle.classList.remove('active');
            }
        };
        document.addEventListener('click', outsideClickHandler);
        this._eventListeners.push({ target: document, event: 'click', handler: outsideClickHandler });
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
            showNotification('Please Login to make your Own Data', 'warning');
        } finally {
            this.hideLoading();
            this.renderCurrentView();
        }
    },
    
    destroy() {
        this._eventListeners.forEach(({ target, event, handler }) => target.removeEventListener(event, handler));
        this._eventListeners = [];
        if (this._refreshTimeout) { clearTimeout(this._refreshTimeout); this._refreshTimeout = null; }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
    const hashHandler = () => {
        const hash = window.location.hash.replace('#', '');
        if (hash && ['dashboard','tenants','properties','payments','settings'].includes(hash)) {
            App.navigateTo(hash);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };
    window.addEventListener('hashchange', hashHandler);
    App._eventListeners.push({ target: window, event: 'hashchange', handler: hashHandler });
    if (window.location.hash) {
        const hash = window.location.hash.replace('#', '');
        if (['dashboard','tenants','properties','payments','settings'].includes(hash)) App.navigateTo(hash);
    }
});

window.addEventListener('beforeunload', () => App.destroy());
window.App = App;