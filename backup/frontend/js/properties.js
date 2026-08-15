// properties.js - Complete Fixed Version with Backend Sync

const Properties = {
    async render() {
        await this.renderProperties();
        this.setupEventListeners();
    },
    
    async renderProperties() {
        const container = document.getElementById('propertiesList');
        const properties = App.state.properties;
        const tenants = App.state.tenants;
        
        if (!properties || properties.length === 0) {
            container.innerHTML = `
                <div class="empty-state-full">
                    <p>No properties added yet</p>
                    <button class="btn btn-primary" id="addPropertyEmptyBtn">Add Your First Property</button>
                </div>
            `;
            const emptyBtn = document.getElementById('addPropertyEmptyBtn');
            if (emptyBtn) emptyBtn.addEventListener('click', () => this.showAddForm());
            return;
        }
        
        let html = '';
        for (const property of properties) {
            let rooms = [];
            try {
                const roomsData = await API.getPropertyRooms(property.id);
                rooms = roomsData.data || [];
            } catch (e) {
                console.error('Failed to load rooms for property:', property.id, e);
            }
            
            const propertyTenants = tenants.filter(t => t.property_id === property.id && t.status === 'active');
            const occupiedRooms = propertyTenants.length;
            const totalRooms = property.total_rooms || 0;
            
            const tenantNames = propertyTenants.map(t => escapeHTML(t.name));
            const tenantList = tenantNames.length > 0 
                ? tenantNames.map(name => `<span class="tenant-tag">${name}</span>`).join('')
                : '<span style="color: var(--text-lighter); font-size: 0.8rem;">No tenants</span>';
            
            const statusClass = property.status === 'active' ? 'badge-success' : 
                               property.status === 'maintenance' ? 'badge-warning' : 'badge-danger';
            
            html += `
                <div class="property-card">
                    <div class="card-header">
                        <h4>${escapeHTML(property.name)}</h4>
                        <span class="badge ${statusClass} property-status">${escapeHTML(property.status || 'Active')}</span>
                    </div>
                    <div class="card-body">
                        <div class="property-details">
                            <div class="property-detail">
                                <span class="label">Address</span>
                                <span class="value">${escapeHTML(property.address || 'Not specified')}</span>
                            </div>
                            <div class="property-detail">
                                <span class="label">Rooms</span>
                                <span class="value">${occupiedRooms} / ${totalRooms}</span>
                            </div>
                            <div class="property-detail">
                                <span class="label">Base Rent</span>
                                <span class="value">${formatCurrency(property.base_rent)}</span>
                            </div>
                        </div>
                        <div class="tenant-list">
                            <div class="tenant-label">Tenants</div>
                            <div class="tenant-names">${tenantList}</div>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-edit edit-property" data-id="${escapeHTML(property.id)}">Edit</button>
                        <button class="btn btn-sm btn-delete delete-property" data-id="${escapeHTML(property.id)}">Delete</button>
                        <button class="btn btn-sm btn-rooms view-rooms" data-id="${escapeHTML(property.id)}">Rooms</button>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        container.querySelectorAll('.edit-property').forEach(btn => {
            btn.addEventListener('click', () => this.editProperty(btn.dataset.id));
        });
        container.querySelectorAll('.delete-property').forEach(btn => {
            btn.addEventListener('click', () => this.deleteProperty(btn.dataset.id));
        });
        container.querySelectorAll('.view-rooms').forEach(btn => {
            btn.addEventListener('click', () => this.showRoomManagement(btn.dataset.id));
        });
    },
    
    setupEventListeners() {
        document.getElementById('addPropertyBtn').addEventListener('click', () => this.showAddForm());
    },
    
    showAddForm() {
        const form = `
            <form id="propertyForm">
                <div class="form-group">
                    <label>Property Name <span class="required">*</span></label>
                    <input type="text" class="form-control" id="propertyName" placeholder="e.g., Green Valley Apartments" required>
                </div>
                <div class="form-group">
                    <label>Address <span class="required">*</span></label>
                    <input type="text" class="form-control" id="propertyAddress" placeholder="Full address" required>
                </div>
                <div class="form-group">
                    <label>Total Rooms <span class="required">*</span></label>
                    <input type="number" class="form-control" id="propertyRooms" min="1" required>
                </div>
                
                <div class="form-group">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 150px;">
                            <label>Base Rent per Room <span class="required">*</span></label>
                            <input type="number" class="form-control" id="propertyRent" min="0" required>
                        </div>
                        <div style="flex-shrink: 0; padding-top: 18px;">
                            <button type="button" class="btn btn-outline btn-sm" id="differentRentToggle" style="min-height: 36px;">
                                Different Rent per Room
                            </button>
                        </div>
                    </div>
                </div>
                
                <div id="differentRentSection" style="display: none; margin-bottom: 16px; padding: 16px; background: var(--bg); border-radius: var(--radius); border: 1px solid var(--border-light);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <strong style="font-size: 0.9rem;">Room Rent Configuration</strong>
                        <span style="font-size: 0.75rem; color: var(--text-light);">Set individual rent for each room</span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 12px; padding: 8px 4px; border-bottom: 2px solid var(--border); margin-bottom: 8px; font-weight: 500; font-size: 0.8rem; color: var(--text-light);">
                        <div>Room</div>
                        <div>Rent Amount</div>
                    </div>
                    
                    <div id="roomRentContainer">
                    </div>
                    
                    <div style="margin-top: 12px; font-size: 0.75rem; color: var(--text-light);">
                        <span id="roomCountDisplay">0 rooms configured</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Status</label>
                    <select class="form-control" id="propertyStatus">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="maintenance">Under Maintenance</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea class="form-control" id="propertyDescription" rows="3"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        `;
        
        App.openModal('Add Property', form);
        
        setTimeout(() => {
            this.setupDifferentRentHandlers();
            
            document.querySelectorAll('#propertyForm input[type="number"]').forEach(input => {
                input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
            });
            
            const roomsInput = document.getElementById('propertyRooms');
            if (roomsInput) {
                roomsInput.addEventListener('input', () => {
                    const diffRentSection = document.getElementById('differentRentSection');
                    if (diffRentSection && diffRentSection.style.display !== 'none') {
                        this.generateRoomRentInputs();
                    }
                });
                roomsInput.addEventListener('change', () => {
                    const diffRentSection = document.getElementById('differentRentSection');
                    if (diffRentSection && diffRentSection.style.display !== 'none') {
                        this.generateRoomRentInputs();
                    }
                });
            }
        }, 100);
        
        document.getElementById('propertyForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveProperty();
        });
    },
    
    setupDifferentRentHandlers() {
        const toggleBtn = document.getElementById('differentRentToggle');
        const diffSection = document.getElementById('differentRentSection');
        const baseRentInput = document.getElementById('propertyRent');
        
        if (toggleBtn && diffSection) {
            const newToggleBtn = toggleBtn.cloneNode(true);
            toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
            
            newToggleBtn.addEventListener('click', function() {
                const isVisible = diffSection.style.display !== 'none';
                if (isVisible) {
                    diffSection.style.display = 'none';
                    this.textContent = 'Different Rent per Room';
                    this.classList.remove('btn-primary');
                    this.classList.add('btn-outline');
                    if (baseRentInput) baseRentInput.disabled = false;
                } else {
                    diffSection.style.display = 'block';
                    this.textContent = 'Use Same Rent for All';
                    this.classList.remove('btn-outline');
                    this.classList.add('btn-primary');
                    if (baseRentInput) baseRentInput.disabled = true;
                    // Preserve existing values when showing
                    const container = document.getElementById('roomRentContainer');
                    if (container) {
                        const inputs = container.querySelectorAll('.room-rent-input');
                        const values = {};
                        inputs.forEach(input => {
                            values[input.dataset.room] = input.value;
                        });
                        Properties._roomRentValues = values;
                    }
                    Properties.generateRoomRentInputs();
                }
            });
        }
    },
    
    generateRoomRentInputs() {
        const container = document.getElementById('roomRentContainer');
        const roomsInput = document.getElementById('propertyRooms');
        const countDisplay = document.getElementById('roomCountDisplay');
        
        if (!container || !roomsInput) return;
        
        const totalRooms = parseInt(roomsInput.value) || 0;
        
        if (totalRooms < 1) {
            container.innerHTML = '<div style="color: var(--text-lighter); font-size: 0.85rem; padding: 8px 4px;">Please enter total rooms first</div>';
            if (countDisplay) countDisplay.textContent = '0 rooms configured';
            return;
        }
        
        // Get existing values from current DOM inputs before recreating
        const existingValues = {};
        const currentInputs = container.querySelectorAll('.room-rent-input');
        currentInputs.forEach(input => {
            const roomNum = input.dataset.room;
            const rentVal = input.value;
            if (rentVal !== '') {
                existingValues[roomNum] = rentVal;
            }
        });
        
        // Also check if we have stored values from property data
        const storedValues = this._roomRentValues || {};
        
        let html = '';
        for (let i = 1; i <= totalRooms; i++) {
            // Priority: existing DOM value > stored values > empty
            let rentValue = '';
            if (existingValues[i] !== undefined) {
                rentValue = existingValues[i];
            } else if (storedValues[i] !== undefined) {
                rentValue = storedValues[i];
            }
            
            html += `
                <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 12px; margin-bottom: 6px; align-items: center;">
                    <div>
                        <span style="font-size: 0.9rem; font-weight: 500;">Room ${i}</span>
                        <input type="hidden" class="room-number-hidden" value="${i}">
                    </div>
                    <div>
                        <input type="number" class="form-control room-rent-input" data-room="${i}" 
                            placeholder="Enter rent" min="0" step="0.01" value="${rentValue}" 
                            style="min-height: 36px; padding: 6px 10px; font-size: 0.85rem;">
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        if (countDisplay) {
            countDisplay.textContent = `${totalRooms} rooms configured`;
        }
        
        container.querySelectorAll('.room-rent-input').forEach(input => {
            input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
            // Save values on change
            input.addEventListener('input', () => {
                this._roomRentValues = this._roomRentValues || {};
                this._roomRentValues[input.dataset.room] = input.value;
            });
        });
    },
    
    async saveProperty() {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to add properties.',
                'Login',
                'primary',
                () => {
                    window.location.href = 'index.html?show=login';
                }
            );
            return;
        }
        const name = document.getElementById('propertyName').value.trim();
        const address = document.getElementById('propertyAddress').value.trim();
        const totalRooms = parseInt(document.getElementById('propertyRooms').value);
        const status = document.getElementById('propertyStatus').value;
        const description = document.getElementById('propertyDescription').value.trim();
        
        const diffSection = document.getElementById('differentRentSection');
        const isDifferentRent = diffSection && diffSection.style.display !== 'none';
        
        let baseRent = 0;
        let roomRents = {};
        
        if (isDifferentRent) {
            const rentInputs = document.querySelectorAll('.room-rent-input');
            let allFilled = true;
            
            rentInputs.forEach(input => {
                const roomNum = input.dataset.room;
                const value = parseFloat(input.value);
                if (isNaN(value) || value < 0) {
                    allFilled = false;
                } else {
                    roomRents[roomNum] = value;
                }
            });
            
            if (!allFilled || Object.keys(roomRents).length === 0) {
                showNotification('Please enter valid rent for all rooms', 'error');
                return;
            }
            
            baseRent = Object.values(roomRents)[0] || 0;
            
        } else {
            baseRent = parseFloat(document.getElementById('propertyRent').value);
            if (baseRent < 0) {
                showNotification('Base rent cannot be negative', 'error');
                return;
            }
        }
        
        if (!name || !address || !totalRooms) {
            showNotification('Please fill all required fields', 'error');
            return;
        }
        if (totalRooms < 1) {
            showNotification('Total rooms must be at least 1', 'error');
            return;
        }
        if (baseRent < 0) {
            showNotification('Base rent cannot be negative', 'error');
            return;
        }
        
        try {
            const propertyData = {
                name,
                address,
                totalRooms,
                baseRent,
                status,
                description,
                roomRents: isDifferentRent ? roomRents : null
            };
            
            const response = await API.createProperty(propertyData);
            
            if (isDifferentRent && response.data && response.data.id) {
                const propertyId = response.data.id;
                for (const [roomNum, rent] of Object.entries(roomRents)) {
                    await API.updateRoom(propertyId, parseInt(roomNum), {
                        rentAmount: rent,
                        roomName: `Room ${roomNum}`
                    });
                }
            }
            
            await App.loadData();
            App.closeModal();
            await this.render();
            showNotification('Property added successfully', 'success');
        } catch (error) {
            showNotification(error.message || 'Failed to add property', 'error');
        }
    },
    
    async editProperty(id) {
        const property = App.state.properties.find(p => p.id === id);
        if (!property) { showNotification('Property not found', 'error'); return; }
        
        // Fetch fresh room data from backend
        let roomRents = {};
        let roomsList = [];
        try {
            const roomsData = await API.getPropertyRooms(id);
            roomsList = roomsData.data || [];
            roomsList.forEach(room => {
                roomRents[room.room_number] = room.rent_amount || property.base_rent;
            });
        } catch (e) {
            console.error('Failed to load rooms:', e);
        }
        
        // Store room rents for persistence
        this._roomRentValues = {};
        for (let i = 1; i <= property.total_rooms; i++) {
            this._roomRentValues[i] = roomRents[i] || property.base_rent;
        }
        
        const hasDifferentRents = Object.keys(roomRents).length > 0 && 
            Object.values(roomRents).some(r => r !== property.base_rent);
        
        // Pre-fill room rents for display
        let roomRentsHtml = '';
        for (let i = 1; i <= property.total_rooms; i++) {
            const rentValue = roomRents[i] || property.base_rent;
            roomRentsHtml += `
                <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 12px; margin-bottom: 6px; align-items: center;">
                    <div>
                        <span style="font-size: 0.9rem; font-weight: 500;">Room ${i}</span>
                        <input type="hidden" class="room-number-hidden" value="${i}">
                    </div>
                    <div>
                        <input type="number" class="form-control room-rent-input" data-room="${i}" 
                            placeholder="Enter rent" min="0" step="0.01" value="${rentValue}" 
                            style="min-height: 36px; padding: 6px 10px; font-size: 0.85rem;">
                    </div>
                </div>
            `;
        }
        
        const form = `
            <form id="propertyForm">
                <input type="hidden" id="propertyId" value="${escapeHTML(property.id)}">
                <div class="form-group">
                    <label>Property Name <span class="required">*</span></label>
                    <input type="text" class="form-control" id="propertyName" value="${escapeHTML(property.name)}" required>
                </div>
                <div class="form-group">
                    <label>Address <span class="required">*</span></label>
                    <input type="text" class="form-control" id="propertyAddress" value="${escapeHTML(property.address)}" required>
                </div>
                <div class="form-group">
                    <label>Total Rooms <span class="required">*</span></label>
                    <input type="number" class="form-control" id="propertyRooms" value="${escapeHTML(String(property.total_rooms))}" min="1" required>
                </div>
                
                <div class="form-group">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 150px;">
                            <label>Base Rent per Room <span class="required">*</span></label>
                            <input type="number" class="form-control" id="propertyRent" value="${property.base_rent}" min="0" required>
                        </div>
                        <div style="flex-shrink: 0; padding-top: 18px;">
                            <button type="button" class="btn ${hasDifferentRents ? 'btn-primary' : 'btn-outline'} btn-sm" id="differentRentToggle" style="min-height: 36px;">
                                ${hasDifferentRents ? 'Use Same Rent for All' : 'Different Rent per Room'}
                            </button>
                        </div>
                    </div>
                </div>
                
                <div id="differentRentSection" style="display: ${hasDifferentRents ? 'block' : 'none'}; margin-bottom: 16px; padding: 16px; background: var(--bg); border-radius: var(--radius); border: 1px solid var(--border-light);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <strong style="font-size: 0.9rem;">Room Rent Configuration</strong>
                        <span style="font-size: 0.75rem; color: var(--text-light);">Set individual rent for each room</span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 12px; padding: 8px 4px; border-bottom: 2px solid var(--border); margin-bottom: 8px; font-weight: 500; font-size: 0.8rem; color: var(--text-light);">
                        <div>Room</div>
                        <div>Rent Amount</div>
                    </div>
                    
                    <div id="roomRentContainer">
                        ${roomRentsHtml}
                    </div>
                    
                    <div style="margin-top: 12px; font-size: 0.75rem; color: var(--text-light);">
                        <span id="roomCountDisplay">${property.total_rooms} rooms configured</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Status</label>
                    <select class="form-control" id="propertyStatus">
                        <option value="active" ${property.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${property.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        <option value="maintenance" ${property.status === 'maintenance' ? 'selected' : ''}>Under Maintenance</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea class="form-control" id="propertyDescription" rows="3">${escapeHTML(property.description || '')}</textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Update</button>
                </div>
            </form>
        `;
        
        App.openModal('Edit Property', form);
        
        setTimeout(() => {
            this.setupDifferentRentHandlers();
            
            document.querySelectorAll('#propertyForm input[type="number"]').forEach(input => {
                input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
            });
            
            const roomsInput = document.getElementById('propertyRooms');
            if (roomsInput) {
                roomsInput.addEventListener('input', () => {
                    const diffSection = document.getElementById('differentRentSection');
                    if (diffSection && diffSection.style.display !== 'none') {
                        this.generateRoomRentInputs();
                    }
                });
                roomsInput.addEventListener('change', () => {
                    const diffSection = document.getElementById('differentRentSection');
                    if (diffSection && diffSection.style.display !== 'none') {
                        this.generateRoomRentInputs();
                    }
                });
            }
            
            // Save room rent values on input change
            const container = document.getElementById('roomRentContainer');
            if (container) {
                container.addEventListener('input', (e) => {
                    if (e.target.classList.contains('room-rent-input')) {
                        this._roomRentValues = this._roomRentValues || {};
                        this._roomRentValues[e.target.dataset.room] = e.target.value;
                    }
                });
            }
            
            const diffSection = document.getElementById('differentRentSection');
            const baseRentInput = document.getElementById('propertyRent');
            if (diffSection && diffSection.style.display !== 'none' && baseRentInput) {
                baseRentInput.disabled = true;
            }
        }, 100);
        
        document.getElementById('propertyForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updateProperty();
        });
    },
    
    async updateProperty() {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to update properties.',
                'Login',
                'primary',
                () => {
                    window.location.href = 'index.html?show=login';
                }
            );
            return;
        }
        const id = document.getElementById('propertyId').value;
        const name = document.getElementById('propertyName').value.trim();
        const address = document.getElementById('propertyAddress').value.trim();
        const totalRooms = parseInt(document.getElementById('propertyRooms').value);
        const status = document.getElementById('propertyStatus').value;
        const description = document.getElementById('propertyDescription').value.trim();
        
        const diffSection = document.getElementById('differentRentSection');
        const isDifferentRent = diffSection && diffSection.style.display !== 'none';
        
        let baseRent = 0;
        let roomRents = {};
        
        if (isDifferentRent) {
            const rentInputs = document.querySelectorAll('.room-rent-input');
            let allFilled = true;
            
            rentInputs.forEach(input => {
                const roomNum = input.dataset.room;
                const value = parseFloat(input.value);
                if (isNaN(value) || value < 0) {
                    allFilled = false;
                } else {
                    roomRents[roomNum] = value;
                }
            });
            
            if (!allFilled || Object.keys(roomRents).length === 0) {
                showNotification('Please enter valid rent for all rooms', 'error');
                return;
            }
            
            baseRent = Object.values(roomRents)[0] || 0;
        } else {
            baseRent = parseFloat(document.getElementById('propertyRent').value);
            if (baseRent < 0) {
                showNotification('Base rent cannot be negative', 'error');
                return;
            }
        }
        
        if (!name || !address || !totalRooms) {
            showNotification('Please fill all required fields', 'error');
            return;
        }
        if (totalRooms < 1) {
            showNotification('Total rooms must be at least 1', 'error');
            return;
        }
        if (baseRent < 0) {
            showNotification('Base rent cannot be negative', 'error');
            return;
        }
        
        try {
            // Update property first (this will create new rooms if totalRooms increased)
            await API.updateProperty(id, { name, address, totalRooms, baseRent, status, description });
            
            // Update individual room rents if in different rent mode
            if (isDifferentRent) {
                for (const [roomNum, rent] of Object.entries(roomRents)) {
                    await API.updateRoom(id, parseInt(roomNum), {
                        rentAmount: rent
                    });
                }
            }
            
            // Force reload data from backend
            await App.loadData();
            App.closeModal();
            await this.render();
            showNotification('Property updated successfully', 'success');
        } catch (error) {
            showNotification(error.message || 'Failed to update property', 'error');
        }
    },
    
    async deleteProperty(id) {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to delete properties.',
                'Login',
                'primary',
                () => {
                    window.location.href = 'index.html?show=login';
                }
            );
            return;
        }
        const hasTenants = App.state.tenants.some(t => t.property_id === id);
        if (hasTenants) {
            if (!confirm('This property has tenants. Deleting it will remove their property assignment. Continue?')) return;
        }
        
        Components.showConfirm('Delete Property', 'Are you sure you want to delete this property?', 'Delete', 'Cancel', 'danger', async () => {
            try {
                await API.deleteProperty(id);
                await App.loadData();
                await this.render();
                Components.showSuccess('Property deleted successfully');
            } catch (error) {
                Components.showError(error.message || 'Failed to delete property');
            }
        });
    },
    
    async showRoomManagement(propertyId) {
        try {
            const roomsData = await API.getPropertyRooms(propertyId);
            const rooms = roomsData.data || [];
            const property = App.state.properties.find(p => p.id === propertyId);
            if (!property) { showNotification('Property not found', 'error'); return; }
            
            const tenants = App.state.tenants.filter(t => t.property_id === propertyId);
            
            let roomsHtml = '';
            if (rooms.length === 0) {
                roomsHtml = '<p style="color: var(--text-light);">No rooms found</p>';
            } else {
                rooms.forEach(room => {
                    const tenant = tenants.find(t => t.room_number === room.room_number);
                    const statusBadge = room.status === 'occupied' 
                        ? '<span class="badge badge-success">Occupied</span>' 
                        : '<span class="badge badge-info">Available</span>';
                    
                    roomsHtml += `
                        <div class="room-item">
                            <div class="room-info">
                                <strong>${escapeHTML(room.room_name || 'Room ' + room.room_number)}</strong>
                                <span style="margin-left: 12px;">${statusBadge}</span>
                                ${room.tenant_id ? `<span style="margin-left: 12px; font-size: 0.875rem; color: var(--text-light);">${tenant ? escapeHTML(tenant.name) : 'Unknown'}</span>` : ''}
                                <span style="margin-left: 12px; font-size: 0.8rem; color: var(--text-light);">${formatCurrency(room.rent_amount || property.base_rent)}</span>
                            </div>
                            <div class="room-actions">
                                <button class="btn btn-sm btn-outline" onclick="Properties.editRoom('${propertyId}', ${room.room_number})">Edit</button>
                                ${room.status !== 'occupied' ? `<button class="btn btn-sm btn-danger" onclick="Properties.removeRoom('${propertyId}', ${room.room_number})">Remove</button>` : ''}
                            </div>
                        </div>
                    `;
                });
            }
            
            const form = `
                <div style="margin-bottom: 16px;">
                    <h4>${escapeHTML(property.name)}</h4>
                    <p style="color: var(--text-light); font-size: 0.875rem;">Total Rooms: ${escapeHTML(String(property.total_rooms))} | Base Rent: ${formatCurrency(property.base_rent)}</p>
                </div>
                <div class="form-group">
                    <label>Add New Room</label>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <input type="number" class="form-control" id="newRoomNumber" placeholder="Room Number" min="1" style="flex: 1; min-width: 100px;">
                        <input type="text" class="form-control" id="newRoomName" placeholder="Room Name" style="flex: 1; min-width: 120px;">
                        <input type="number" class="form-control" id="newRoomRent" placeholder="Rent" style="width: 120px;">
                        <button class="btn btn-primary" onclick="Properties.addRoom('${propertyId}')">Add</button>
                    </div>
                </div>
                <div style="margin-top: 16px;">
                    <h4 style="margin-bottom: 12px;">Room List</h4>
                    ${roomsHtml}
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-primary" onclick="App.closeModal()">Close</button>
                </div>
            `;
            
            App.openModal('Manage Rooms', form);
            setTimeout(() => {
                document.querySelectorAll('#newRoomNumber, #newRoomRent, #editRoomRent').forEach(input => {
                    if (input) {
                        input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
                    }
                });
            }, 100);
        } catch (error) {
            showNotification(error.message || 'Failed to load rooms', 'error');
        }
    },
    
    editRoom(propertyId, roomNumber) {
        (async () => {
            try {
                const roomsData = await API.getPropertyRooms(propertyId);
                const rooms = roomsData.data || [];
                const room = rooms.find(r => r.room_number === roomNumber);
                if (!room) { showNotification('Room not found', 'error'); return; }
                
                const form = `
                    <div class="form-group">
                        <label>Room Name</label>
                        <input type="text" class="form-control" id="editRoomName" value="${escapeHTML(room.room_name || '')}">
                    </div>
                    <div class="form-group">
                        <label>Rent Amount</label>
                        <input type="number" class="form-control" id="editRoomRent" value="${room.rent_amount || 0}" min="0">
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="Properties.updateRoom('${propertyId}', ${roomNumber})">Update</button>
                    </div>
                `;
                App.openModal('Edit Room', form);
                
                document.querySelectorAll('#editRoomRent').forEach(input => {
                    if (input) {
                        input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
                    }
                });
            } catch (error) {
                showNotification(error.message || 'Failed to load room data', 'error');
            }
        })();
    },
    
    async updateRoom(propertyId, roomNumber) {
        const roomName = document.getElementById('editRoomName').value.trim();
        const rentAmount = parseFloat(document.getElementById('editRoomRent').value);
        if (rentAmount < 0) { showNotification('Rent cannot be negative', 'error'); return; }
        
        try {
            await API.updateRoom(propertyId, roomNumber, { roomName, rentAmount });
            await App.loadData();
            App.closeModal();
            this.showRoomManagement(propertyId);
            showNotification('Room updated successfully', 'success');
        } catch (error) {
            showNotification(error.message || 'Failed to update room', 'error');
        }
    },
    
    async removeRoom(propertyId, roomNumber) {
        Components.showConfirm('Remove Room', 'Are you sure you want to remove this room?', 'Remove', 'Cancel', 'danger', async () => {
            try {
                await API.removeRoom(propertyId, roomNumber);
                await App.loadData();
                this.showRoomManagement(propertyId);
                Components.showSuccess('Room removed successfully');
            } catch (error) {
                Components.showError(error.message || 'Failed to remove room');
            }
        });
    },
    
    async addRoom(propertyId) {
        const roomNumber = parseInt(document.getElementById('newRoomNumber').value);
        const roomName = document.getElementById('newRoomName').value.trim();
        const rentAmount = parseFloat(document.getElementById('newRoomRent').value) || null;
        
        if (!roomNumber || roomNumber < 1) {
            showNotification('Please enter a valid room number', 'error');
            return;
        }
        
        try {
            await API.addRoom(propertyId, { roomNumber, roomName: roomName || `Room ${roomNumber}`, rentAmount });
            await App.loadData();
            this.showRoomManagement(propertyId);
            showNotification('Room added successfully', 'success');
        } catch (error) {
            showNotification(error.message || 'Failed to add room', 'error');
        }
    }
};

window.Properties = Properties;