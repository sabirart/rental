// js/recycle.js - COMPLETE FIXED VERSION

const Recycle = {
    currentTab: 'tenants',
    items: [],
    _isLoading: false,
    
    async render() {
        await this.loadItems();
        this.renderContent();
    },
    
    async loadItems() {
        if (this._isLoading) return this.items;
        if (isDemoMode()) {
            this.items = [];
            return this.items;
        }
        this._isLoading = true;
        try {
            const response = await API.request('/recycle');
            console.log('Recycle items loaded:', response);
            this.items = response.data || [];
            return this.items;
        } catch (error) {
            console.error('Failed to load recycle items:', error);
            this.items = [];
            return this.items;
        } finally {
            this._isLoading = false;
        }
    },
    
    getTypeForFilter(tab) {
        // Convert tab name to singular for filtering
        if (tab === 'tenants') return 'tenant';
        if (tab === 'properties') return 'property';
        return tab;
    },
    
    renderContent() {
        const container = document.getElementById('recycleContent');
        if (!container) return;
        
        // Debug log to check items
        console.log('Current items:', this.items);
        console.log('Current tab:', this.currentTab);
        
        // Get the singular type for filtering
        const filterType = this.getTypeForFilter(this.currentTab);
        
        // Get items for current tab
        const filtered = this.items.filter(item => item.type === filterType);
        console.log('Filtered items:', filtered);
        console.log('Filter type used:', filterType);
        
        let html = `
            <div class="recycle-tabs">
                <button class="recycle-tab ${this.currentTab === 'tenants' ? 'active' : ''}" onclick="Recycle.switchTab('tenants')">
                    Tenants (${this.getCount('tenant')})
                </button>
                <button class="recycle-tab ${this.currentTab === 'properties' ? 'active' : ''}" onclick="Recycle.switchTab('properties')">
                    Properties (${this.getCount('property')})
                </button>
            </div>
            <div class="recycle-list">
        `;
        
        if (filtered.length === 0) {
            html += `
                <div class="empty-state-full">
                    <p>No ${this.currentTab} in recycle bin</p>
                </div>
            `;
        } else {
            filtered.forEach(item => {
                const data = item.data;
                const name = data.name || 'Unknown';
                const deletedAt = new Date(item.deleted_at).toLocaleDateString();
                
                html += `
                    <div class="recycle-item">
                        <div class="recycle-item-info">
                            <span class="recycle-item-name">${escapeHTML(name)}</span>
                            <span class="recycle-item-date">Deleted: ${deletedAt}</span>
                            ${item.type === 'tenant' ? `<span class="recycle-item-detail">CNIC: ${escapeHTML(data.cnic || 'N/A')}</span>` : ''}
                            ${item.type === 'property' ? `<span class="recycle-item-detail">Address: ${escapeHTML(data.address || 'N/A')}</span>` : ''}
                        </div>
                        <div class="recycle-item-actions">
                            <button class="btn btn-sm btn-primary" onclick="Recycle.recoverItem('${item.id}')">Recover</button>
                            <button class="btn btn-sm btn-danger" onclick="Recycle.deletePermanently('${item.id}')">Delete</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
            </div>
            <div class="recycle-footer">
                <div></div>
                <button class="btn btn-danger" onclick="Recycle.clearAll()">Clear All</button>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Update the settings badge count
        this.updateSettingsBadge();
    },
    
    getCount(type) {
        // type is singular: 'tenant' or 'property'
        return this.items.filter(item => item.type === type).length;
    },
    
    switchTab(tab) {
        this.currentTab = tab;
        this.renderContent();
    },
    
    async recoverItem(id) {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to recover items.',
                'Login',
                'primary',
                () => { SiteController.openAuthModal('login'); }
            , { showCancel: true });
            return;
        }
        try {
            const response = await API.request(`/recycle/recover/${id}`, 'POST');
            const warnings = response && response.warnings;
            if (warnings && warnings.length > 0) {
                showNotification(response.message || 'Item recovered with changes - see recycle bin details.', 'warning');
            } else {
                showNotification((response && response.message) || 'Item recovered successfully', 'success');
            }
            
            // Reload recycle items
            await this.loadItems();
            this.renderContent();
            this.updateSettingsBadge();
            
            // Refresh the main data (tenants/properties)
            await App.loadData();
            
            // Re-render the current view if it's tenants or properties
            const currentView = App.state.currentView;
            if (currentView === 'tenants' && typeof Tenants !== 'undefined') {
                await Tenants.render();
            } else if (currentView === 'properties' && typeof Properties !== 'undefined') {
                await Properties.render();
            } else if (currentView === 'dashboard' && typeof Dashboard !== 'undefined') {
                await Dashboard.render();
            }
            
        } catch (error) {
            showNotification(error.message || 'Failed to recover item', 'error');
        }
    },
    
    async deletePermanently(id) {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to delete items.',
                'Login',
                'primary',
                () => { SiteController.openAuthModal('login'); }
            , { showCancel: true });
            return;
        }
        Components.showConfirm(
            'Delete Permanently',
            'Are you sure you want to permanently delete this item? This cannot be undone.',
            'Delete',
            'Cancel',
            'danger',
            async () => {
                try {
                    await API.request(`/recycle/${id}`, 'DELETE');
                    showNotification('Item permanently deleted', 'success');
                    
                    // Reload recycle items
                    await this.loadItems();
                    this.renderContent();
                    this.updateSettingsBadge();
                    
                    // Refresh the main data (tenants/properties)
                    await App.loadData();
                    
                    // Re-render the current view if it's tenants or properties
                    const currentView = App.state.currentView;
                    if (currentView === 'tenants' && typeof Tenants !== 'undefined') {
                        await Tenants.render();
                    } else if (currentView === 'properties' && typeof Properties !== 'undefined') {
                        await Properties.render();
                    } else if (currentView === 'dashboard' && typeof Dashboard !== 'undefined') {
                        await Dashboard.render();
                    }
                    
                } catch (error) {
                    showNotification(error.message || 'Failed to delete item', 'error');
                }
            }
        );
    },
    
    async clearAll() {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to clear items.',
                'Login',
                'primary',
                () => { SiteController.openAuthModal('login'); }
            , { showCancel: true });
            return;
        }
        Components.showConfirm(
            'Clear All',
            `Are you sure you want to permanently delete all ${this.currentTab}s in recycle bin? This cannot be undone.`,
            'Clear All',
            'Cancel',
            'danger',
            async () => {
                try {
                    const filterType = this.getTypeForFilter(this.currentTab);
                    await API.request(`/recycle/clear/all?type=${filterType}`, 'DELETE');
                    showNotification(`All ${this.currentTab}s cleared`, 'success');
                    await this.loadItems();
                    this.renderContent();
                } catch (error) {
                    showNotification(error.message || 'Failed to clear items', 'error');
                }
            }
        );
    },
    
    updateSettingsBadge() {
        if (typeof Settings !== 'undefined') {
            Settings.updateRecycleCount();
        }
    },
    
    showOverlay() {
        // Remove any existing overlay
        this.closeOverlay();
        if (window.closeAllOverlays) window.closeAllOverlays('recycleOverlay');
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'recycle-overlay';
        overlay.id = 'recycleOverlay';
        
        // Create content box
        const box = document.createElement('div');
        box.className = 'recycle-box';
        
        // Header
        const header = document.createElement('div');
        header.className = 'recycle-box-header';
        header.innerHTML = `
            <h3>Recycle Bin</h3>
            <button class="recycle-close" onclick="Recycle.closeOverlay()">&times;</button>
        `;
        
        // Body
        const body = document.createElement('div');
        body.className = 'recycle-box-body';
        body.id = 'recycleContent';
        body.innerHTML = '<div class="recycle-loading">Loading...</div>';
        
        box.appendChild(header);
        box.appendChild(body);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        
        // Load content and render
        this.loadItems().then(() => {
            this.renderContent();
        });
    },
    
    closeOverlay() {
        const overlay = document.getElementById('recycleOverlay');
        if (overlay) {
            overlay.remove();
        }
        document.body.style.overflow = '';
        this.updateSettingsBadge();
    }
};

window.Recycle = Recycle;