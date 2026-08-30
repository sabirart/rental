// properties.js - Complete Fixed Version with Loading Indicators

const Properties = {
    _isProcessing: false,

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
                        <span style="font-size: 0.75rem; color: var(--text-light);">Set individual name &amp; rent for each room</span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 12px; padding: 8px 4px; border-bottom: 2px solid var(--border); margin-bottom: 8px; font-weight: 500; font-size: 0.8rem; color: var(--text-light);">
                        <div>Room #</div>
                        <div>Room Name</div>
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
                    <button type="submit" class="btn btn-primary" id="propertySubmitBtn">Save</button>
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
                    const container = document.getElementById('roomRentContainer');
                    if (container) {
                        const inputs = container.querySelectorAll('.room-rent-input');
                        const values = {};
                        inputs.forEach(input => {
                            values[input.dataset.room] = input.value;
                        });
                        Properties._roomRentValues = values;
                        
                        const nameInputs = container.querySelectorAll('.room-name-input');
                        const names = {};
                        nameInputs.forEach(input => {
                            names[input.dataset.room] = input.value;
                        });
                        Properties._roomNameValues = names;
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
        
        const existingValues = {};
        const existingNames = {};
        const currentInputs = container.querySelectorAll('.room-rent-input');
        currentInputs.forEach(input => {
            const roomNum = input.dataset.room;
            const rentVal = input.value;
            if (rentVal !== '') {
                existingValues[roomNum] = rentVal;
            }
        });
        container.querySelectorAll('.room-name-input').forEach(input => {
            const roomNum = input.dataset.room;
            if (input.value.trim() !== '') {
                existingNames[roomNum] = input.value.trim();
            }
        });
        
        const storedValues = this._roomRentValues || {};
        const storedNames = this._roomNameValues || {};
        
        let html = '';
        for (let i = 1; i <= totalRooms; i++) {
            let rentValue = '';
            if (existingValues[i] !== undefined) {
                rentValue = existingValues[i];
            } else if (storedValues[i] !== undefined) {
                rentValue = storedValues[i];
            }
            
            let nameValue = `Room ${i}`;
            if (existingNames[i] !== undefined) {
                nameValue = existingNames[i];
            } else if (storedNames[i] !== undefined) {
                nameValue = storedNames[i];
            }
            
            html += `
                <div style="display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 12px; margin-bottom: 6px; align-items: center;">
                    <div>
                        <span style="font-size: 0.9rem; font-weight: 500;">Room ${i}</span>
                        <input type="hidden" class="room-number-hidden" value="${i}">
                    </div>
                    <div>
                        <input type="text" class="form-control room-name-input" data-room="${i}"
                            placeholder="Room ${i}" value="${escapeHTML(nameValue)}"
                            style="min-height: 36px; padding: 6px 10px; font-size: 0.85rem;">
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
            input.addEventListener('input', () => {
                this._roomRentValues = this._roomRentValues || {};
                this._roomRentValues[input.dataset.room] = input.value;
            });
        });
        
        container.querySelectorAll('.room-name-input').forEach(input => {
            input.addEventListener('input', () => {
                this._roomNameValues = this._roomNameValues || {};
                this._roomNameValues[input.dataset.room] = input.value;
            });
        });
    },
    
    async saveProperty() {
        if (this._isProcessing) return;
        
        const submitBtn = document.getElementById('propertySubmitBtn');
        const name = document.getElementById('propertyName').value.trim();
        const address = document.getElementById('propertyAddress').value.trim();
        const totalRooms = parseInt(document.getElementById('propertyRooms').value);
        const status = document.getElementById('propertyStatus').value;
        const description = document.getElementById('propertyDescription').value.trim();
        
        const diffSection = document.getElementById('differentRentSection');
        const isDifferentRent = diffSection && diffSection.style.display !== 'none';
        
        let baseRent = 0;
        let roomRents = {};
        let roomNames = {};
        
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
            
            document.querySelectorAll('.room-name-input').forEach(input => {
                const roomNum = input.dataset.room;
                roomNames[roomNum] = input.value.trim() || `Room ${roomNum}`;
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
        
        this._isProcessing = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
        }
        Components.showLoading('Adding property...');
        
        try {
            if (isDemoMode()) {
                const newProperty = {
                    id: generateDemoId('prop'),
                    name,
                    address,
                    total_rooms: totalRooms,
                    base_rent: baseRent,
                    status,
                    description,
                    created_at: new Date().toISOString()
                };
                addDemoRecord('properties', newProperty);
                await App.loadData();
                App.closeModal();
                await this.render();
                Components.hideLoading();
                showNotification('Property added', 'success');
                return;
            }

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
                        roomName: roomNames[roomNum] || `Room ${roomNum}`
                    });
                }
            }
            
            await App.loadData();
            App.closeModal();
            await this.render();
            Components.hideLoading();
            showNotification('Property added', 'success');
        } catch (error) {
            Components.hideLoading();
            showNotification(error.message || 'Failed to add property', 'error');
        } finally {
            this._isProcessing = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save';
            }
        }
    },
    
    async editProperty(id) {
        if (this._isProcessing) return;
        
        const property = App.state.properties.find(p => p.id === id);
        if (!property) { showNotification('Property not found', 'error'); return; }
        
        let roomRents = {};
        let roomNames = {};
        let roomsList = [];
        try {
            const roomsData = await API.getPropertyRooms(id);
            roomsList = roomsData.data || [];
            roomsList.forEach(room => {
                roomRents[room.room_number] = room.rent_amount || property.base_rent;
                roomNames[room.room_number] = room.room_name || `Room ${room.room_number}`;
            });
        } catch (e) {
            console.error('Failed to load rooms:', e);
        }
        
        this._roomRentValues = {};
        this._roomNameValues = {};
        for (let i = 1; i <= property.total_rooms; i++) {
            this._roomRentValues[i] = roomRents[i] || property.base_rent;
            this._roomNameValues[i] = roomNames[i] || `Room ${i}`;
        }
        
        // Remember original rent values so we can detect a rent change on submit
        this._originalBaseRent = property.base_rent;
        this._originalRoomRents = { ...roomRents };
        
        // Remember original rent values so we can detect a rent change on submit
        this._originalBaseRent = property.base_rent;
        this._originalRoomRents = { ...roomRents };
        this._editingPropertyId = id;
        
        const hasDifferentRents = Object.keys(roomRents).length > 0 && 
            Object.values(roomRents).some(r => r !== property.base_rent);
        
        let roomRentsHtml = '';
        for (let i = 1; i <= property.total_rooms; i++) {
            const rentValue = roomRents[i] || property.base_rent;
            const nameValue = roomNames[i] || `Room ${i}`;
            roomRentsHtml += `
                <div style="display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 12px; margin-bottom: 6px; align-items: center;">
                    <div>
                        <span style="font-size: 0.9rem; font-weight: 500;">Room ${i}</span>
                        <input type="hidden" class="room-number-hidden" value="${i}">
                    </div>
                    <div>
                        <input type="text" class="form-control room-name-input" data-room="${i}"
                            placeholder="Room ${i}" value="${escapeHTML(nameValue)}"
                            style="min-height: 36px; padding: 6px 10px; font-size: 0.85rem;">
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
                        <span style="font-size: 0.75rem; color: var(--text-light);">Set individual name &amp; rent for each room</span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 12px; padding: 8px 4px; border-bottom: 2px solid var(--border); margin-bottom: 8px; font-weight: 500; font-size: 0.8rem; color: var(--text-light);">
                        <div>Room #</div>
                        <div>Room Name</div>
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
                    <button type="submit" class="btn btn-primary" id="propertySubmitBtn">Update</button>
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
            
            const container = document.getElementById('roomRentContainer');
            if (container) {
                container.addEventListener('input', (e) => {
                    if (e.target.classList.contains('room-rent-input')) {
                        this._roomRentValues = this._roomRentValues || {};
                        this._roomRentValues[e.target.dataset.room] = e.target.value;
                    }
                    if (e.target.classList.contains('room-name-input')) {
                        this._roomNameValues = this._roomNameValues || {};
                        this._roomNameValues[e.target.dataset.room] = e.target.value;
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
        if (this._isProcessing) return;
        
        const submitBtn = document.getElementById('propertySubmitBtn');
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
        let roomNames = {};
        
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
            
            document.querySelectorAll('.room-name-input').forEach(input => {
                const roomNum = input.dataset.room;
                roomNames[roomNum] = input.value.trim() || `Room ${roomNum}`;
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
        
        const payload = { id, name, address, totalRooms, baseRent, status, description, isDifferentRent, roomRents, roomNames };
        
        // Detect whether the rent actually changed compared to the values
        // loaded when the edit form was opened.
        let rentChanged = false;
        if (isDifferentRent) {
            const originalRoomRents = this._originalRoomRents || {};
            rentChanged = Object.keys(roomRents).some(roomNum => {
                const original = originalRoomRents[roomNum] !== undefined ? originalRoomRents[roomNum] : this._originalBaseRent;
                return parseFloat(roomRents[roomNum]) !== parseFloat(original);
            });
        } else {
            rentChanged = parseFloat(baseRent) !== parseFloat(this._originalBaseRent);
        }
        
        if (!isDemoMode() && rentChanged) {
            const assignedTenants = (App.state.tenants || []).filter(t => t.property_id === id);
            if (assignedTenants.length > 0) {
                Components.showConfirm(
                    'Update Tenant Rent?',
                    `You changed the rent for this property. Do you also want to update the rent for the ${assignedTenants.length} tenant${assignedTenants.length > 1 ? 's' : ''} currently assigned to it? This updates any of their unpaid or partially paid records to the new rent amount.`,
                    'Yes, Update Tenants',
                    'No, Keep As Is',
                    'primary',
                    () => this._finalizePropertyUpdate({ ...payload, updateTenantRents: true }),
                    () => this._finalizePropertyUpdate({ ...payload, updateTenantRents: false })
                );
                return;
            }
        }
        
        await this._finalizePropertyUpdate({ ...payload, updateTenantRents: false });
    },
    
    async _finalizePropertyUpdate(payload) {
        const { id, name, address, totalRooms, baseRent, status, description, isDifferentRent, roomRents, roomNames, updateTenantRents } = payload;
        const submitBtn = document.getElementById('propertySubmitBtn');
        
        this._isProcessing = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating...';
        }
        Components.showLoading('Updating property...');
        
        try {
            if (isDemoMode()) {
                updateDemoRecord('properties', id, {
                    name,
                    address,
                    total_rooms: totalRooms,
                    base_rent: baseRent,
                    status,
                    description
                });
                await App.loadData();
                App.closeModal();
                await this.render();
                Components.hideLoading();
                showNotification('Property updated successfully', 'success');
                return;
            }

            await API.updateProperty(id, { name, address, totalRooms, baseRent, status, description });
            
            if (isDifferentRent) {
                for (const [roomNum, rent] of Object.entries(roomRents)) {
                    await API.updateRoom(id, parseInt(roomNum), {
                        rentAmount: rent,
                        roomName: (roomNames && roomNames[roomNum]) || `Room ${roomNum}`
                    });
                }
            }
            
            if (updateTenantRents) {
                const assignedTenants = (App.state.tenants || []).filter(t => t.property_id === id);
                await this._applyRentUpdateToTenants(assignedTenants, isDifferentRent, roomRents, baseRent);
            }
            
            await App.loadData();
            App.closeModal();
            await this.render();
            Components.hideLoading();
            showNotification('Property updated successfully', 'success');
        } catch (error) {
            Components.hideLoading();
            showNotification(error.message || 'Failed to update property', 'error');
        } finally {
            this._isProcessing = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update';
            }
        }
    },
    
    // Updates the monthly rent on each assigned tenant's outstanding
    // (unpaid/partial) payment records. Paid records are left untouched.
    async _applyRentUpdateToTenants(tenants, isDifferentRent, roomRents, baseRent) {
        for (const tenant of tenants) {
            const roomKey = String(tenant.room_number);
            const newRent = isDifferentRent && roomRents[roomKey] !== undefined
                ? parseFloat(roomRents[roomKey])
                : parseFloat(baseRent);
            
            const tenantPayments = (App.state.payments || []).filter(p => p.tenant_id === tenant.id && p.status !== 'paid');
            
            for (const payment of tenantPayments) {
                const totalPayment = newRent + (payment.electricity || 0) + (payment.gas || 0) + (payment.previous_dues || 0);
                try {
                    await API.updatePayment(payment.id, {
                        tenantId: payment.tenant_id,
                        month: payment.month,
                        year: payment.year,
                        monthlyRent: newRent,
                        electricity: payment.electricity || 0,
                        gas: payment.gas || 0,
                        previousDues: payment.previous_dues || 0,
                        totalPayment,
                        status: payment.status,
                        notes: payment.notes || '',
                        customCharges: payment.custom_charges || []
                    });
                } catch (error) {
                    console.error(`Failed to update rent for payment ${payment.id}:`, error.message);
                }
            }
        }
    },
    async deleteProperty(id) {
        if (this._isProcessing) return;
        
        const hasTenants = App.state.tenants.some(t => t.property_id === id);
        if (hasTenants) {
            if (!confirm('This property has tenants. Deleting it will remove their property assignment. Continue?')) return;
        }
        
        Components.showConfirm('Delete Property', 'Are you sure you want to delete this property?', 'Delete', 'Cancel', 'danger', async () => {
            this._isProcessing = true;
            Components.showLoading('Deleting property...');
            
            try {
                if (isDemoMode()) {
                    deleteDemoRecord('properties', id);
                    await App.loadData();
                    await this.render();
                    Components.hideLoading();
                    Components.showSuccess('Property deleted successfully');
                    return;
                }
                await API.deleteProperty(id);
                await App.loadData();
                await this.render();
                Components.hideLoading();
                Components.showSuccess('Property deleted successfully');
            } catch (error) {
                Components.hideLoading();
                Components.showError(error.message || 'Failed to delete property');
            } finally {
                this._isProcessing = false;
            }
        });
    },
    
    async showRoomManagement(propertyId) {
        if (this._isProcessing) return;
        
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
        if (this._isProcessing) return;
        
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
                        <button class="btn btn-primary" onclick="Properties.updateRoom('${propertyId}', ${roomNumber})" id="roomSubmitBtn">Update</button>
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
        if (this._isProcessing) return;
        
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to update rooms.',
                'Login',
                'primary',
                () => { SiteController.openAuthModal('login'); }
            , { showCancel: true });
            return;
        }
        
        const submitBtn = document.getElementById('roomSubmitBtn');
        const roomName = document.getElementById('editRoomName').value.trim();
        const rentAmount = parseFloat(document.getElementById('editRoomRent').value);
        if (rentAmount < 0) { showNotification('Rent cannot be negative', 'error'); return; }
        
        this._isProcessing = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating...';
        }
        Components.showLoading('Updating room...');
        
        try {
            await API.updateRoom(propertyId, roomNumber, { roomName, rentAmount });
            await App.loadData();
            App.closeModal();
            this.showRoomManagement(propertyId);
            Components.hideLoading();
            showNotification('Room updated successfully', 'success');
        } catch (error) {
            Components.hideLoading();
            showNotification(error.message || 'Failed to update room', 'error');
        } finally {
            this._isProcessing = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update';
            }
        }
    },
    
    async removeRoom(propertyId, roomNumber) {
        if (this._isProcessing) return;
        
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to remove rooms.',
                'Login',
                'primary',
                () => { SiteController.openAuthModal('login'); }
            , { showCancel: true });
            return;
        }
        
        Components.showConfirm('Remove Room', 'Are you sure you want to remove this room?', 'Remove', 'Cancel', 'danger', async () => {
            this._isProcessing = true;
            Components.showLoading('Removing room...');
            
            try {
                await API.removeRoom(propertyId, roomNumber);
                await App.loadData();
                this.showRoomManagement(propertyId);
                Components.hideLoading();
                Components.showSuccess('Room removed successfully');
            } catch (error) {
                Components.hideLoading();
                Components.showError(error.message || 'Failed to remove room');
            } finally {
                this._isProcessing = false;
            }
        });
    },
    
    async addRoom(propertyId) {
        if (this._isProcessing) return;
        
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to add rooms.',
                'Login',
                'primary',
                () => { SiteController.openAuthModal('login'); }
            , { showCancel: true });
            return;
        }
        
        const roomNumber = parseInt(document.getElementById('newRoomNumber').value);
        const roomName = document.getElementById('newRoomName').value.trim();
        const rentAmount = parseFloat(document.getElementById('newRoomRent').value) || null;
        
        if (!roomNumber || roomNumber < 1) {
            showNotification('Please enter a valid room number', 'error');
            return;
        }
        
        this._isProcessing = true;
        Components.showLoading('Adding room...');
        
        try {
            await API.addRoom(propertyId, { roomNumber, roomName: roomName || `Room ${roomNumber}`, rentAmount });
            await App.loadData();
            this.showRoomManagement(propertyId);
            Components.hideLoading();
            showNotification('Room added', 'success');
        } catch (error) {
            Components.hideLoading();
            showNotification(error.message || 'Failed to add room', 'error');
        } finally {
            this._isProcessing = false;
        }
    }
};

window.Properties = Properties;
