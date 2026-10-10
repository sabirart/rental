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
            const store = getDemoStore();
            this.items = Array.isArray(store.recycle) ? store.recycle : [];
            return this.items;
        }
        this._isLoading = true;
        try {
            const response = await API.request('/recycle');
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
        
        // Get the singular type for filtering
        const filterType = this.getTypeForFilter(this.currentTab);
        
        // Get items for current tab
        const filtered = this.items.filter(item => item.type === filterType);
        
        let html = `
            <div class="recycle-tabs">
                <button class="recycle-tab ${this.currentTab === 'tenants' ? 'active' : ''}" data-recycle-tab="tenants">
                    Tenants (${this.getCount('tenant')})
                </button>
                <button class="recycle-tab ${this.currentTab === 'properties' ? 'active' : ''}" data-recycle-tab="properties">
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
                            <button class="btn btn-sm btn-primary" data-recycle-action="recover" data-id="${escapeHTML(item.id)}">Recover</button>
                            <button class="btn btn-sm btn-danger" data-recycle-action="delete" data-id="${escapeHTML(item.id)}">Delete</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
            </div>
            <div class="recycle-footer">
                <button class="btn btn-danger" data-recycle-action="clear">Clear All</button>
            </div>
        `;
        
        container.innerHTML = html;

        // Recycle content is rebuilt every time the tab changes. Bind through
        // the stable container so both tabs always work after re-rendering.
        if (!container.dataset.tabsBound) {
            container.dataset.tabsBound = '1';
            container.addEventListener('click', (event) => {
                const tab = event.target.closest('[data-recycle-tab]');
                if (tab && container.contains(tab)) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.switchTab(tab.dataset.recycleTab);
                    return;
                }
                const action = event.target.closest('[data-recycle-action]');
                if (!action || !container.contains(action)) return;
                event.preventDefault();
                event.stopPropagation();
                const type = action.dataset.recycleAction;
                if (type === 'recover') this.recoverItem(action.dataset.id);
                else if (type === 'delete') this.deletePermanently(action.dataset.id);
                else if (type === 'clear') this.clearAll();
            });
        }
        
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
            const store = getDemoStore();
            const itemIndex = (store.recycle || []).findIndex(item => item.id === id);
            if (itemIndex < 0) { showNotification('Item not found', 'error'); return; }
            const item = store.recycle[itemIndex];
            const collection = item.type === 'tenant' ? 'tenants' : 'properties';
            if (!Array.isArray(store[collection])) store[collection] = [];
            const exists = store[collection].some(record => record.id === item.original_id || record.id === item.data?.id);
            if (!exists) {
                const restored = { ...item.data, id: item.original_id || item.data?.id };
                store[collection].push(restored);
            }
            store.recycle.splice(itemIndex, 1);
            await App.loadData();
            await this.loadItems();
            this.renderContent();
            this.updateSettingsBadge();
            if (App.state.currentView === 'tenants' && window.Tenants) await Tenants.render();
            if (App.state.currentView === 'properties' && window.Properties) await Properties.render();
            showNotification(item.type === 'tenant' ? 'Tenant restored' : 'Property restored', 'success');
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
            const store = getDemoStore();
            const index = (store.recycle || []).findIndex(item => item.id === id);
            if (index >= 0) store.recycle.splice(index, 1);
            await this.loadItems();
            this.renderContent();
            this.updateSettingsBadge();
            showNotification('Item deleted', 'success');
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
            const store = getDemoStore();
            const filterType = this.getTypeForFilter(this.currentTab);
            store.recycle = (store.recycle || []).filter(item => item.type !== filterType);
            await this.loadItems();
            this.renderContent();
            this.updateSettingsBadge();
            showNotification('Items cleared', 'success');
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
            <button type="button" class="recycle-close" data-rm-action="close-recycle" aria-label="Close recycle bin">&times;</button>
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