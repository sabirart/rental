// js/settings.js (FIXED - Theme persistence on page load)

const Settings = {
    init() {
        this.loadSettings();
        this.setupAuthSettings();
        this.setupEventListeners();
        this.loadOwnerInfo();
        this.injectRecycleCard();
        this.loadNotificationSettings();
    },

    // Populate the reset-day dropdown (1-28 + "Last day of month") and pull
    // the user's current notifications/reset-day preferences.
    async loadNotificationSettings() {
        const daySelect = document.getElementById('monthlyResetDaySelect');
        if (daySelect && daySelect.options.length <= 1) {
            for (let d = 1; d <= 28; d++) {
                const opt = document.createElement('option');
                opt.value = String(d);
                opt.textContent = `Day ${d}`;
                daySelect.insertBefore(opt, daySelect.firstChild);
            }
        }

        let notificationsEnabled = true;
        let monthlyResetDay = 31;

        try {
            if (isDemoMode()) {
                notificationsEnabled = localStorage.getItem('notifications_enabled') !== 'false';
                monthlyResetDay = parseInt(localStorage.getItem('monthly_reset_day') || '31');
            } else {
                const res = await API.getSettings();
                if (res.data) {
                    notificationsEnabled = res.data.notificationsEnabled;
                    monthlyResetDay = res.data.monthlyResetDay;
                }
            }
        } catch (e) {
            console.error('Failed to load notification settings:', e.message);
        }

        const toggle = document.getElementById('notificationsToggle');
        if (toggle) toggle.checked = notificationsEnabled;
        if (daySelect) daySelect.value = String(monthlyResetDay);

        if (typeof Notifications !== 'undefined') {
            Notifications._enabled = notificationsEnabled;
            Notifications.refresh();
        }
    },

    loadSettings() {
        // Dark mode - FIXED: Apply immediately with proper check
        const darkMode = localStorage.getItem('darkMode') === 'true';
        const toggle = document.getElementById('darkModeToggle');
        
        if (toggle) {
            toggle.checked = darkMode;
        }
        
        // FIXED: Apply dark mode class immediately
        if (darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        // Currency
        const currency = localStorage.getItem('currencySymbol') || '$';
        const currencySelect = document.getElementById('currencySelect');
        if (currencySelect) {
            currencySelect.value = currency;
        }
    },

    setupEventListeners() {
        // Dark mode toggle - FIXED: Use change event properly
        const toggle = document.getElementById('darkModeToggle');
        if (toggle) {
            // Remove any existing listeners to prevent duplicates
            toggle.removeEventListener('change', this._darkModeHandler);
            
            this._darkModeHandler = (e) => {
                const isDark = e.target.checked;
                localStorage.setItem('darkMode', isDark);
                
                // FIXED: Apply class immediately with smooth transition
                if (isDark) {
                    document.body.classList.add('dark-mode');
                } else {
                    document.body.classList.remove('dark-mode');
                }
                
                showNotification(`Dark mode ${isDark ? 'enabled' : 'disabled'}`, 'success');
            };
            
            toggle.addEventListener('change', this._darkModeHandler);
        }

        // Currency change
        const currencySelect = document.getElementById('currencySelect');
        if (currencySelect) {
            currencySelect.removeEventListener('change', this._currencyHandler);
            
            this._currencyHandler = (e) => {
                const currency = e.target.value;
                localStorage.setItem('currencySymbol', currency);
                showNotification(`Currency changed to ${currency}`, 'success');
                // Refresh current view to update currency display
                App.renderCurrentView();
            };
            
            currencySelect.addEventListener('change', this._currencyHandler);
        }   

        // Owner form
        const ownerForm = document.getElementById('ownerForm');
        if (ownerForm) {
            ownerForm.removeEventListener('submit', this._ownerHandler);
            
            this._ownerHandler = (e) => {
                e.preventDefault();
                this.saveOwnerInfo();
            };
            
            ownerForm.addEventListener('submit', this._ownerHandler);
        }

        // Export data
        const exportBtn = document.getElementById('exportDataBtn');
        if (exportBtn) {
            exportBtn.removeEventListener('click', this._exportHandler);
            
            this._exportHandler = () => {
                this.exportData();
            };
            
            exportBtn.addEventListener('click', this._exportHandler);
        }

        // Clear all data
        const clearBtn = document.getElementById('clearAllDataBtn');
        if (clearBtn) {
            clearBtn.removeEventListener('click', this._clearHandler);
            
            this._clearHandler = () => {
                Components.showConfirm(
                    'Clear All Data',
                    'Are you sure you want to clear all data? This cannot be undone!',
                    'Clear All',
                    'Cancel',
                    'danger',
                    () => this.clearAllData()
                );
            };
            
            clearBtn.addEventListener('click', this._clearHandler);
        }

        // Notifications on/off
        const notifToggle = document.getElementById('notificationsToggle');
        if (notifToggle) {
            notifToggle.removeEventListener('change', this._notifHandler);

            this._notifHandler = async (e) => {
                const enabled = e.target.checked;
                try {
                    if (isDemoMode()) {
                        localStorage.setItem('notifications_enabled', enabled ? 'true' : 'false');
                    } else {
                        await API.updateSettings({ notificationsEnabled: enabled });
                    }
                    if (typeof Notifications !== 'undefined') Notifications.setEnabled(enabled);
                    showNotification(`Notifications ${enabled ? 'enabled' : 'disabled'}`, 'success');
                } catch (err) {
                    e.target.checked = !enabled;
                    showNotification(err.message || 'Failed to update notification setting', 'error');
                }
            };

            notifToggle.addEventListener('change', this._notifHandler);
        }

        // Monthly reset day
        const resetDaySelect = document.getElementById('monthlyResetDaySelect');
        if (resetDaySelect) {
            resetDaySelect.removeEventListener('change', this._resetDayHandler);

            this._resetDayHandler = async (e) => {
                const day = parseInt(e.target.value);
                try {
                    if (isDemoMode()) {
                        localStorage.setItem('monthly_reset_day', String(day));
                    } else {
                        await API.updateSettings({ monthlyResetDay: day });
                    }
                    const label = day >= 29 ? 'the last day of the month' : `day ${day}`;
                    showNotification(`Monthly reset day set to ${label}`, 'success');
                } catch (err) {
                    showNotification(err.message || 'Failed to update reset day', 'error');
                }
            };

            resetDaySelect.addEventListener('change', this._resetDayHandler);
        }
    },

    loadOwnerInfo() {
        const owner = JSON.parse(localStorage.getItem('ownerInfo') || '{}');
        const nameInput = document.getElementById('ownerName');
        const emailInput = document.getElementById('ownerEmail');
        const phoneInput = document.getElementById('ownerPhone');
        const addressInput = document.getElementById('ownerAddress');
        
        if (nameInput) nameInput.value = owner.name || '';
        if (emailInput) emailInput.value = owner.email || '';
        if (phoneInput) phoneInput.value = owner.phone || '';
        if (addressInput) addressInput.value = owner.address || '';
    },

    setupAuthSettings() {
        const authSection = document.querySelector('.settings-card-account');
        if (!authSection) {
            this.injectAccountCard();
        }
        this.updateAccountCard();
    },

    injectAccountCard() {
        const settingsGrid = document.querySelector('.settings-grid');
        if (!settingsGrid) return;
        
        const card = document.createElement('div');
        card.className = 'settings-card settings-card-full settings-card-account';
        card.innerHTML = `
            <div class="settings-card-header">
                <svg class="settings-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
                <h3>Account</h3>
            </div>
            <div class="settings-card-body" id="accountCardBody">
                <!-- Dynamic content -->
            </div>
        `;
        
        const ownerCard = settingsGrid.querySelector('.settings-card-full:first-child');
        if (ownerCard) {
            ownerCard.parentNode.insertBefore(card, ownerCard.nextSibling);
        } else {
            settingsGrid.prepend(card);
        }
        
        this.updateAccountCard();
    },

    updateAccountCard() {
        const body = document.getElementById('accountCardBody');
        if (!body) return;
        
        if (Auth.isAuthenticated && Auth.user) {
            const user = Auth.user;
            
            body.innerHTML = `
                <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 500; overflow: hidden; flex-shrink: 0;">
                        ${user.profilePic ? `<img src="${user.profilePic}" style="width: 100%; height: 100%; object-fit: cover;">` : (user.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 500; font-size: 1.05rem;">${user.name || 'User'}</div>
                        <div style="color: var(--text-light); font-size: 0.85rem;">${user.email || ''}</div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-outline" onclick="DashboardAuthBar.showProfile()">Manage Account</button>
                        <button class="btn btn-sm btn-danger" onclick="Auth.logout()">Logout</button>
                    </div>
                </div>
            `;
        } else {
            body.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <div style="font-weight: 500;">Not Logged In</div>
                        <div style="color: var(--text-light); font-size: 0.85rem;">Create an account to save your data permanently</div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-primary" onclick="DashboardAuthBar.showLogin()">Login</button>
                        <button class="btn btn-sm btn-outline" onclick="DashboardAuthBar.showRegister()">Sign Up</button>
                    </div>
                </div>
            `;
        }
    },

    saveOwnerInfo() {
        const owner = {
            name: document.getElementById('ownerName').value.trim(),
            email: document.getElementById('ownerEmail').value.trim(),
            phone: document.getElementById('ownerPhone').value.trim(),
            address: document.getElementById('ownerAddress').value.trim()
        };
        
        // Validate email
        if (owner.email && !validateEmail(owner.email)) {
            showNotification('Please enter a valid email address', 'error');
            return;
        }
        
        // Validate phone
        if (owner.phone && !validatePhone(owner.phone)) {
            showNotification('Please enter a valid phone number', 'error');
            return;
        }
        
        localStorage.setItem('ownerInfo', JSON.stringify(owner));
        showNotification('Owner information saved successfully', 'success');
    },

    exportData() {
        const data = {
            tenants: App.state.tenants,
            properties: App.state.properties,
            payments: App.state.payments,
            owner: JSON.parse(localStorage.getItem('ownerInfo') || '{}'),
            exportedAt: new Date().toISOString(),
            version: '1.0.0'
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rental_data_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Data exported successfully', 'success');
    },

    async clearAllData() {
        if (isDemoMode()) {
            Components.showConfirm(
                'Clear All Data',
                'This will reset the demo back to its original sample data. Continue?',
                'Clear',
                'Cancel',
                'danger',
                async () => {
                    resetDemoStore();
                    await App.loadData();
                    App.renderCurrentView();
                    Components.showSuccess('Demo data reset successfully');
                }
            );
            return;
        }
        Components.showLoading('Clearing all data...');
        
        try {
            await API.deleteAllTenants();
            await API.deleteAllProperties();
            await API.deleteAllPayments();
            
            localStorage.removeItem('tenants_cache');
            localStorage.removeItem('properties_cache');
            localStorage.removeItem('payments_cache');
            localStorage.removeItem('last_cache_update');
            
            App.state.tenants = [];
            App.state.properties = [];
            App.state.payments = [];
            
            await App.loadData();
            App.renderCurrentView();
            
            Components.hideLoading();
            Components.showSuccess('All data cleared successfully');
        } catch (error) {
            Components.hideLoading();
            Components.showError(error.message || 'Failed to clear data');
            
            try {
                await App.loadData();
                App.renderCurrentView();
            } catch (reloadError) {
                console.error('Failed to reload after error:', reloadError);
            }
        }
    },
    
    importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (!data.tenants || !data.properties || !data.payments) {
                        reject(new Error('Invalid data format. Missing required collections.'));
                        return;
                    }
                    
                    resolve(data);
                } catch (error) {
                    reject(new Error('Failed to parse JSON file: ' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    },
    
    resetSettings() {
        Components.showConfirm(
            'Reset Settings',
            'Are you sure you want to reset all settings to default?',
            'Reset',
            'Cancel',
            'warning',
            () => {
                localStorage.removeItem('darkMode');
                localStorage.removeItem('language');
                localStorage.removeItem('ownerInfo');
                localStorage.removeItem('api_url');
                
                window.location.reload();
            }
        );
    },

    injectRecycleCard() {
        const settingsGrid = document.querySelector('.settings-grid');
        if (!settingsGrid) return;
        
        if (document.querySelector('.settings-card-recycle')) return;
        
        const recycleCard = document.createElement('div');
        recycleCard.className = 'settings-card settings-card-full settings-card-recycle';
        recycleCard.innerHTML = `
            <div class="settings-card-header">
                <svg class="settings-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                    <path d="M10 11v4"/>
                    <path d="M14 11v4"/>
                </svg>
                <h3>Recycle Bin</h3>
                <span class="badge badge-info" id="recycleCount">0</span>
            </div>
            <div class="settings-card-body">
                <div class="settings-actions">
                    <button class="btn btn-outline" id="openRecycleBtn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9"/>
                        </svg>
                        Open Recycle Bin
                    </button>
                    <button class="btn btn-outline" id="autoCleanBtn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2v4"/>
                            <path d="M12 18v4"/>
                            <path d="M4 12H2"/>
                            <path d="M22 12h-2"/>
                            <path d="M19.07 4.93l-2.83 2.83"/>
                            <path d="M7.76 16.24l-2.83 2.83"/>
                            <path d="M16.24 7.76l2.83-2.83"/>
                            <path d="M4.93 19.07l2.83-2.83"/>
                        </svg>
                        Auto Clean (15 days)
                    </button>
                </div>
                <p class="settings-hint">Deleted tenants and properties are stored here for 15 days before auto-deletion. You can recover or permanently delete them.</p>
            </div>
        `;
        
        const dataManagementCard = settingsGrid.querySelector('.settings-card-full:last-child');
        if (dataManagementCard) {
            dataManagementCard.parentNode.insertBefore(recycleCard, dataManagementCard.nextSibling);
        } else {
            settingsGrid.appendChild(recycleCard);
        }
        
        const openBtn = document.getElementById('openRecycleBtn');
        if (openBtn) {
            openBtn.removeEventListener('click', this._openRecycleHandler);
            this._openRecycleHandler = () => {
                if (typeof Recycle !== 'undefined') {
                    Recycle.showOverlay();
                    this.updateRecycleCount();
                } else {
                    showNotification('Recycle module not loaded', 'error');
                }
            };
            openBtn.addEventListener('click', this._openRecycleHandler);
        }
        
        const cleanBtn = document.getElementById('autoCleanBtn');
        if (cleanBtn) {
            cleanBtn.removeEventListener('click', this._cleanHandler);
            this._cleanHandler = async () => {
                if (isDemoMode()) {
                    Components.showAlert(
                        'Demo Mode',
                        'Please create an account or login to manage the recycle bin.',
                        'Login',
                        'primary',
                        () => { SiteController.openAuthModal('login'); }
                    , { showCancel: true });
                    return;
                }
                try {
                    await API.cleanRecycleBin(15);
                    showNotification('Items older than 15 days cleared', 'success');
                    this.updateRecycleCount();
                } catch (error) {
                    showNotification(error.message || 'Failed to clean recycle bin', 'error');
                }
            };
            cleanBtn.addEventListener('click', this._cleanHandler);
        }
        
        this.updateRecycleCount();
    },

    async updateRecycleCount() {
        try {
            const response = await API.getRecycleCount();
            const count = response.data ? response.data.total : 0;
            const badge = document.getElementById('recycleCount');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            }
        } catch (error) {
            // Ignore
        }
    }
};

// FIXED: Apply dark mode immediately before DOM content loads
(function applyThemeImmediately() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    if (darkMode) {
        document.documentElement.classList.add('dark-mode');
        // Also add to body when it's available
        if (document.body) {
            document.body.classList.add('dark-mode');
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                document.body.classList.add('dark-mode');
            });
        }
    }
})();

// Initialize settings when view is rendered
document.addEventListener('DOMContentLoaded', () => {
    // Apply theme again to ensure it's set
    const darkMode = localStorage.getItem('darkMode') === 'true';
    if (darkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    // Update toggle state if it exists
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) {
        toggle.checked = darkMode;
    }
    
    if (window.location.hash === '#settings') {
        setTimeout(() => Settings.init(), 150);
    }
    
    const settingsLink = document.querySelector('[data-view="settings"]');
    if (settingsLink) {
        settingsLink.addEventListener('click', () => {
            setTimeout(() => Settings.init(), 150);
        });
    }
});

window.Settings = Settings;
