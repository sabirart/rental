// js/payments.js - Professional Version

const Payments = {
    async render() {
        this.populateYearFilter();
        await this.renderPayments();
        this.setupEventListeners();
    },
    
    populateYearFilter() {
        const yearSelect = document.getElementById('paymentYearFilter');
        const currentYear = getCurrentYear();
        yearSelect.innerHTML = '<option value="all">All Years</option>';
        for (let year = currentYear; year >= currentYear - 4; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
    },
    
    async renderPayments() {
        const tbody = document.getElementById('paymentsList');
        const { payments, tenants, properties } = App.state;
        
        const monthFilter = document.getElementById('paymentMonthFilter').value;
        const yearFilter = document.getElementById('paymentYearFilter').value;
        
        let filteredPayments = payments.filter(p => {
            const matchMonth = monthFilter === 'all' || p.month === parseInt(monthFilter);
            const matchYear = yearFilter === 'all' || p.year === parseInt(yearFilter);
            return matchMonth && matchYear;
        });
        
        filteredPayments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        if (!filteredPayments.length) {
            tbody.innerHTML = `<tr><td colspan="11" class="empty-state">No payments recorded yet</td></tr>`;
            return;
        }
        
        let html = '';
        filteredPayments.forEach(payment => {
            const tenant = tenants.find(t => t.id === payment.tenant_id);
            const tenantName = tenant ? escapeHTML(tenant.name) : 'Unknown Tenant';
            const property = tenant ? properties.find(p => p.id === tenant.property_id) : null;
            const roomInfo = tenant && property ? `Room ${escapeHTML(String(tenant.room_number))}` : 'N/A';
            
            const statusMap = { paid: 'success', partial: 'warning', unpaid: 'danger' };
            const statusBadge = `<span class="badge badge-${statusMap[payment.status] || 'danger'}">${escapeHTML(payment.status)}</span>`;
            
            const total = (payment.monthly_rent || 0) + (payment.electricity || 0) + (payment.gas || 0) + (payment.previous_dues || 0);
            
            html += `
                <tr>
                    <td><strong>${tenantName}</strong></td>
                    <td>${roomInfo}</td>
                    <td>${escapeHTML(getMonthName(payment.month))}</td>
                    <td>${escapeHTML(String(payment.year))}</td>
                    <td>${formatCurrency(payment.monthly_rent)}</td>
                    <td>${formatCurrency(payment.electricity || 0)}</td>
                    <td>${formatCurrency(payment.gas || 0)}</td>
                    <td>${formatCurrency(payment.previous_dues || 0)}</td>
                    <td><strong>${formatCurrency(total)}</strong></td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" data-id="${escapeHTML(payment.id)}">Edit</button>
                            <button class="action-btn delete" data-id="${escapeHTML(payment.id)}">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
        tbody.querySelectorAll('.edit').forEach(btn => btn.addEventListener('click', () => this.editPayment(btn.dataset.id)));
        tbody.querySelectorAll('.delete').forEach(btn => btn.addEventListener('click', () => this.deletePayment(btn.dataset.id)));
    },
    
    setupEventListeners() {
        document.getElementById('addPaymentBtn').addEventListener('click', () => this.showAddForm());
        document.getElementById('paymentMonthFilter').addEventListener('change', () => this.renderPayments());
        document.getElementById('paymentYearFilter').addEventListener('change', () => this.renderPayments());
    },
    
    getFormFields() {
        return {
            tenantId: document.getElementById('paymentTenant')?.value,
            month: parseInt(document.getElementById('paymentMonth')?.value),
            year: parseInt(document.getElementById('paymentYear')?.value),
            rent: parseFloat(document.getElementById('paymentRent')?.value) || 0,
            electricity: parseFloat(document.getElementById('paymentElectricity')?.value) || 0,
            gas: parseFloat(document.getElementById('paymentGas')?.value) || 0,
            dues: parseFloat(document.getElementById('paymentDues')?.value) || 0,
            status: document.getElementById('paymentStatus')?.value || 'unpaid',
            notes: document.getElementById('paymentNotes')?.value.trim() || ''
        };
    },
    
    updateTotal() {
        const { rent, electricity, gas, dues } = this.getFormFields();
        const withoutDue = rent + electricity + gas;
        const totalWithDue = withoutDue + dues;
        
        const withoutDueDisplay = document.getElementById('paymentWithoutDueDisplay');
        const totalDisplay = document.getElementById('paymentTotalDisplay');
        
        if (withoutDueDisplay) withoutDueDisplay.textContent = formatCurrency(withoutDue);
        if (totalDisplay) totalDisplay.textContent = formatCurrency(totalWithDue);
    },
    
    getStatusHTML(selected = 'unpaid') {
        const statuses = [
            { value: 'paid', label: 'Paid', class: 'status-btn-paid' },
            { value: 'partial', label: 'Partial', class: 'status-btn-partial' },
            { value: 'unpaid', label: 'Unpaid', class: 'status-btn-unpaid' }
        ];
        
        return statuses.map(s => 
            `<button type="button" class="status-btn ${s.class} ${selected === s.value ? 'active' : ''}" data-status="${s.value}">${s.label}</button>`
        ).join('');
    },
    
    getTotalHTML(withoutDue = 0, totalWithDue = 0) {
        return `
            <div style="background: var(--bg); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <div><strong>Without Due:</strong> <span id="paymentWithoutDueDisplay" style="font-weight: 600; margin-left: 4px;">${formatCurrency(withoutDue)}</span></div>
                <div><strong>Total With Due:</strong> <span id="paymentTotalDisplay" style="font-weight: 600; margin-left: 4px;">${formatCurrency(totalWithDue)}</span></div>
            </div>
        `;
    },
    
    toggleNotes() {
        const container = document.getElementById('notesContainer');
        const icon = document.getElementById('notesToggleIcon');
        if (container) {
            if (container.style.display === 'none') {
                container.style.display = 'block';
                if (icon) icon.textContent = '▼';
            } else {
                container.style.display = 'none';
                if (icon) icon.textContent = '▶';
            }
        }
    },

    showAddForm() {
        const tenants = App.state.tenants.filter(t => t.status === 'active' && t.property_id);
        
        if (!tenants.length) {
            showNotification('No active tenants found. Please add a tenant first.', 'warning');
            return;
        }
        
        let tenantOptions = '<option value="">Select Tenant</option>';
        tenants.forEach(t => {
            const property = App.state.properties.find(p => p.id === t.property_id);
            tenantOptions += `<option value="${escapeHTML(t.id)}" data-rent="${property ? property.base_rent : 0}">${escapeHTML(t.name)} - ${property ? escapeHTML(property.name) : 'No Property'}</option>`;
        });
        
        const currentMonth = getCurrentMonth();
        const currentYear = getCurrentYear();
        
        const form = `
            <form id="paymentForm">
                <div class="form-group">
                    <label>Tenant <span class="required">*</span></label>
                    <select class="form-control" id="paymentTenant" required>${tenantOptions}</select>
                </div>
                <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>Month <span class="required">*</span></label>
                    <select class="form-control" id="paymentMonth" required>${this.getMonthOptions(currentMonth)}</select>
                </div>
                <div class="form-group">
                    <label>Year <span class="required">*</span></label>
                    <select class="form-control" id="paymentYear" required>${this.getYearOptions(currentYear)}</select>
                </div>
                <div class="form-group">
                    <label>Rent <span class="required">*</span></label>
                    <input type="number" class="form-control" id="paymentRent" min="0" required>
                </div>
            </div>
                <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>Electricity</label>
                    <input type="number" class="form-control" id="paymentElectricity" min="0" value="0">
                </div>
                <div class="form-group">
                    <label>Gas</label>
                    <input type="number" class="form-control" id="paymentGas" min="0" value="0">
                </div>
                <div class="form-group">
                    <label>Previous Dues</label>
                    <input type="number" class="form-control" id="paymentDues" min="0" value="0">
                </div>
            </div>
                <div class="form-group">
                    <label>Status</label>
                    <div class="status-group">${this.getStatusHTML('unpaid')}</div>
                    <input type="hidden" id="paymentStatus" value="unpaid">
                </div>
                <div class="form-group">
                    <label style="cursor: pointer; display: block; margin-bottom: 4px;" onclick="Payments.toggleNotes()">
                        <span id="notesToggleIcon">▶</span> Add Notes
                    </label>
                    <div id="notesContainer" style="display: none; margin-top: 4px;">
                        <textarea class="form-control" id="paymentNotes" rows="2" placeholder="Additional notes"></textarea>
                    </div>
                </div>
                ${this.getTotalHTML()}
                <div class="form-actions">
                    <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Payment</button>
                </div>
            </form>
        `;
        
        App.openModal('Record Payment', form);
        this.setupFormHandlers();
        
        // Ensure notes hidden by default
        setTimeout(() => {
            const container = document.getElementById('notesContainer');
            if (container) container.style.display = 'none';
            const icon = document.getElementById('notesToggleIcon');
            if (icon) icon.textContent = '▶';
        }, 50);
        
        const firstTenant = document.getElementById('paymentTenant');
        if (firstTenant.options.length > 1) {
            firstTenant.selectedIndex = 1;
            document.getElementById('paymentRent').value = parseFloat(firstTenant.options[1].dataset.rent) || 0;
            this.updateTotal();
        }
    },
    
    async editPayment(id, tenantId = null) {
        const payment = App.state.payments.find(p => p.id === id);
        if (!payment) {
            showNotification('Payment not found', 'error');
            return;
        }
        
        const fixedTenantId = tenantId || payment.tenant_id;
        const fixedTenant = App.state.tenants.find(t => t.id === fixedTenantId);
        
        let tenantDisplay = '';
        let tenantInfoHTML = '';
        if (fixedTenant) {
            const property = App.state.properties.find(p => p.id === fixedTenant.property_id);
            const propertyName = property ? escapeHTML(property.name) : 'No Property';
            const roomNum = fixedTenant.room_number || 'N/A';
            
            // Profile picture or placeholder
            const profilePic = fixedTenant.profile_pic 
                ? `<img src="${escapeHTML(fixedTenant.profile_pic)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">`
                : `<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 500; color: var(--text-light); flex-shrink: 0;">${escapeHTML(fixedTenant.name.charAt(0).toUpperCase())}</div>`;
            
            // Tenant info HTML to display at top of form
            tenantInfoHTML = `
                <div style="display: flex; align-items: center; gap: 14px; padding: 12px 16px; background: var(--bg); border-radius: var(--radius); margin-bottom: 16px; border: 1px solid var(--border-light);">
                    ${profilePic}
                    <div style="display: flex; flex-direction: column;">
                        <strong style="font-size: 1rem;">${escapeHTML(fixedTenant.name)}</strong>
                        <span style="color: var(--text-light); font-size: 0.85rem;">${propertyName} - Room ${roomNum}</span>
                    </div>
                </div>
                <input type="hidden" id="paymentTenant" value="${escapeHTML(fixedTenantId)}">
            `;
            
            tenantDisplay = tenantInfoHTML;
        } else {
            const tenants = App.state.tenants.filter(t => t.status === 'active' && t.property_id);
            let options = '<option value="">Select Tenant</option>';
            tenants.forEach(t => {
                const property = App.state.properties.find(p => p.id === t.property_id);
                const selected = t.id === payment.tenant_id ? 'selected' : '';
                options += `<option value="${escapeHTML(t.id)}" ${selected} data-rent="${property ? property.base_rent : 0}">${escapeHTML(t.name)} - ${property ? escapeHTML(property.name) : 'No Property'}</option>`;
            });
            tenantDisplay = `
                <div class="form-group">
                    <label>Tenant <span class="required">*</span></label>
                    <select class="form-control" id="paymentTenant" required>${options}</select>
                </div>
            `;
        }
        
        const withoutDue = (payment.monthly_rent || 0) + (payment.electricity || 0) + (payment.gas || 0);
        const totalWithDue = withoutDue + (payment.previous_dues || 0);
        
        const form = `
            <form id="paymentForm">
                <input type="hidden" id="paymentId" value="${escapeHTML(payment.id)}">
                ${tenantDisplay}
                <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>Month <span class="required">*</span></label>
                    <select class="form-control" id="paymentMonth" required>${this.getMonthOptions(payment.month)}</select>
                </div>
                <div class="form-group">
                    <label>Year <span class="required">*</span></label>
                    <select class="form-control" id="paymentYear" required>${this.getYearOptions(payment.year)}</select>
                </div>
                <div class="form-group">
                    <label>Rent <span class="required">*</span></label>
                    <input type="number" class="form-control" id="paymentRent" value="${payment.monthly_rent}" min="0" required>
                </div>
            </div>
                <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>Electricity</label>
                    <input type="number" class="form-control" id="paymentElectricity" value="${payment.electricity || 0}" min="0">
                </div>
                <div class="form-group">
                    <label>Gas</label>
                    <input type="number" class="form-control" id="paymentGas" value="${payment.gas || 0}" min="0">
                </div>
                <div class="form-group">
                    <label>Previous Dues</label>
                    <input type="number" class="form-control" id="paymentDues" value="${payment.previous_dues || 0}" min="0">
                </div>
            </div>
                <div class="form-group">
                    <label>Status</label>
                    <div class="status-group">${this.getStatusHTML(payment.status)}</div>
                    <input type="hidden" id="paymentStatus" value="${payment.status}">
                </div>
                <div class="form-group">
                    <label style="cursor: pointer; display: block; margin-bottom: 4px;" onclick="Payments.toggleNotes()">
                        <span id="notesToggleIcon">▶</span> Add Notes
                    </label>
                    <div id="notesContainer" style="display: none; margin-top: 4px;">
                        <textarea class="form-control" id="paymentNotes" rows="2">${escapeHTML(payment.notes || '')}</textarea>
                    </div>
                </div>
                ${this.getTotalHTML(withoutDue, totalWithDue)}
                <div class="form-actions">
                    <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Update Payment</button>
                </div>
            </form>
        `;
        
        App.openModal('Edit Payment', form);

        // Add tenant info to modal title
        setTimeout(() => {
            const modalTitle = document.getElementById('modalTitle');
            if (modalTitle && tenantNameDisplay) {
                modalTitle.innerHTML = '';
                const titleText = document.createTextNode('Edit Payment');
                modalTitle.appendChild(titleText);
                const titleSpan = document.createElement('span');
                titleSpan.style.cssText = 'font-size: 0.8rem; font-weight: 400; color: var(--text-light); margin-left: 12px;';
                titleSpan.textContent = tenantNameDisplay;
                titleSpan.className = 'tenant-title-info';
                modalTitle.appendChild(titleSpan);
            }
        }, 50);

        this.setupFormHandlers();
    },

    setupFormHandlers() {
        // Disable wheel on number inputs
        setTimeout(() => {
            document.querySelectorAll('#paymentForm input[type="number"]').forEach(input => {
                input.addEventListener('wheel', function(e) {
                    e.preventDefault();
                    const container = this.closest('.modal-body');
                    if (container) container.scrollTop += e.deltaY;
                }, { passive: false });
            });
        }, 100);
        
        // Status button handler
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                document.getElementById('paymentStatus').value = this.dataset.status;
            });
        });
        
        // Input handlers
        ['paymentRent', 'paymentElectricity', 'paymentGas', 'paymentDues'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => Payments.updateTotal());
        });
        
        // Tenant change handler
        const tenantSelect = document.getElementById('paymentTenant');
        if (tenantSelect && tenantSelect.tagName === 'SELECT') {
            tenantSelect.addEventListener('change', function() {
                const rent = parseFloat(this.options[this.selectedIndex]?.dataset.rent) || 0;
                document.getElementById('paymentRent').value = rent;
                Payments.updateTotal();
            });
        }
        
        // Form submit
        const form = document.getElementById('paymentForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const isEdit = !!document.getElementById('paymentId');
                if (isEdit) {
                    await this.updatePayment();
                } else {
                    await this.savePayment();
                }
            });
        }
    },
    
    getMonthOptions(selectedMonth) {
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return months.map((name, i) => {
            const value = i + 1;
            return `<option value="${value}" ${value === selectedMonth ? 'selected' : ''}>${escapeHTML(name)}</option>`;
        }).join('');
    },
    
    getYearOptions(selectedYear) {
        let options = '';
        for (let year = selectedYear + 1; year >= selectedYear - 4; year--) {
            options += `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}</option>`;
        }
        return options;
    },
    
    async savePayment() {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to record payments.',
                'Login',
                'primary',
                () => {
                    window.location.href = 'index.html?show=login';
                }
            );
            return;
        }
        const fields = this.getFormFields();
        const totalPayment = fields.rent + fields.electricity + fields.gas + fields.dues;
        
        if (!fields.tenantId) {
            showNotification('Please select a tenant', 'error');
            return;
        }
        if (fields.rent <= 0) {
            showNotification('Rent must be greater than 0', 'error');
            return;
        }
        
        try {
            await API.createPayment({
                tenantId: fields.tenantId,
                month: fields.month,
                year: fields.year,
                monthlyRent: fields.rent,
                electricity: fields.electricity,
                gas: fields.gas,
                previousDues: fields.dues,
                totalPayment,
                status: fields.status,
                notes: fields.notes,
                customCharges: []
            });
            
            await App.loadData();
            App.closeModal();
            await this.render();
            if (document.getElementById('tenants')?.classList.contains('active')) {
                await Tenants.render();
            }
            showNotification('Payment recorded successfully', 'success');
        } catch (error) {
            showNotification(error.message || 'Failed to save payment', 'error');
        }
    },
    
    async updatePayment() {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to update payments.',
                'Login',
                'primary',
                () => {
                    window.location.href = 'index.html?show=login';
                }
            );
            return;
        }
        const id = document.getElementById('paymentId').value;
        const fields = this.getFormFields();
        const totalPayment = fields.rent + fields.electricity + fields.gas + fields.dues;
        
        if (!fields.tenantId) {
            showNotification('Please select a tenant', 'error');
            return;
        }
        if (fields.rent <= 0) {
            showNotification('Rent must be greater than 0', 'error');
            return;
        }
        
        try {
            await API.updatePayment(id, {
                tenantId: fields.tenantId,
                month: fields.month,
                year: fields.year,
                monthlyRent: fields.rent,
                electricity: fields.electricity,
                gas: fields.gas,
                previousDues: fields.dues,
                totalPayment,
                status: fields.status,
                notes: fields.notes,
                customCharges: []
            });
            
            await App.loadData();
            App.closeModal();
            await this.render();
            if (document.getElementById('tenants')?.classList.contains('active')) {
                await Tenants.render();
            }
            showNotification('Payment updated successfully', 'success');
        } catch (error) {
            showNotification(error.message || 'Failed to update payment', 'error');
        }
    },
    
    async deletePayment(id) {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to delete payments.',
                'Login',
                'primary',
                () => {
                    window.location.href = 'index.html?show=login';
                }
            );
            return;
        }
        Components.showConfirm(
            'Delete Payment',
            'Are you sure you want to delete this payment record?',
            'Delete',
            'Cancel',
            'danger',
            async () => {
                try {
                    await API.deletePayment(id);
                    await App.loadData();
                    await this.render();
                    if (document.getElementById('tenants')?.classList.contains('active')) {
                        await Tenants.render();
                    }
                    Components.showSuccess('Payment deleted successfully');
                } catch (error) {
                    Components.showError(error.message || 'Failed to delete payment');
                }
            }
        );
    }
};

window.Payments = Payments;