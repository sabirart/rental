// js/payments.js - Professional Version with Loading Indicators

const Payments = {
    _isProcessing: false,

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
            const remainingNote = payment.status === 'partial'
                ? `Received ${formatCurrency(payment.amount_paid || 0)} · Owes ${formatCurrency(Math.max(0, (payment.total_payment || 0) - (payment.amount_paid || 0)))}`
                : '';
            
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
                    <td>${remainingNote ? `<span class="payment-status-hover" data-tooltip="${escapeHTML(remainingNote)}">${statusBadge}</span>` : statusBadge}</td>
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
        if (!this._toggleListenerBound) {
            this._toggleListenerBound = true;
            document.addEventListener('click', (e) => {
                const trigger = e.target.closest('[data-action="toggle-payment-notes"]');
                if (trigger) { e.preventDefault(); e.stopPropagation(); this.toggleNotes(trigger); }
            });
        }
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
            electricityEnabled: document.getElementById('paymentElectricityEnabled') ? document.getElementById('paymentElectricityEnabled').checked : true,
            gas: parseFloat(document.getElementById('paymentGas')?.value) || 0,
            gasEnabled: document.getElementById('paymentGasEnabled') ? document.getElementById('paymentGasEnabled').checked : true,
            dues: parseFloat(document.getElementById('paymentDues')?.value) || 0,
            duesEnabled: document.getElementById('paymentDuesEnabled') ? document.getElementById('paymentDuesEnabled').checked : true,
            status: document.getElementById('paymentStatus')?.value || 'unpaid',
            amountPaid: parseFloat(document.getElementById('paymentAmountPaid')?.value) || 0,
            notes: document.getElementById('paymentNotes')?.value.trim() || ''
        };
    },

    // Works out the amount actually received given the current status: a
    // 'paid' record always means the full total was received, 'unpaid'
    // always means nothing was received, and only 'partial' uses whatever
    // the user typed into the Amount Received field. Mirrors
    // Payment._resolveAmountPaid on the backend so the UI and the server
    // never disagree about what a given status implies.
    resolveAmountPaid(status, total, amountPaidRaw) {
        if (status === 'paid') return Number.isFinite(Number(amountPaidRaw)) ? Math.max(0, Number(amountPaidRaw)) : total;
        if (status === 'unpaid') return 0;
        return amountPaidRaw || 0;
    },
    
    updateTotal() {
        const { rent, electricity, electricityEnabled, gas, gasEnabled, dues, duesEnabled, status, amountPaid } = this.getFormFields();

        // Display totals always show the complete bill. The check controls do
        // not change these two headline totals; they only determine what has
        // actually been received/paid.
        const withoutDue = rent + electricity + gas;
        const totalWithDue = withoutDue + dues;

        const withoutDueDisplay = document.getElementById('paymentWithoutDueDisplay');
        const totalDisplay = document.getElementById('paymentTotalDisplay');

        if (withoutDueDisplay) withoutDueDisplay.textContent = formatCurrency(withoutDue);
        if (totalDisplay) totalDisplay.textContent = formatCurrency(totalWithDue);

        this.syncAmountPaidUI(
            rent, electricity, electricityEnabled,
            gas, gasEnabled, dues, duesEnabled,
            totalWithDue, status, amountPaid
        );
    },

    // The overview has four separate meanings:
    // - Without Due: rent + all bills, regardless of checks.
    // - Total + Due: rent + all bills + dues, regardless of checks.
    // - Amount Received: what the selected status/checks say was actually paid.
    // - Remaining Balance: everything in Total + Due that is still unpaid,
    //   including unchecked electricity/gas and unchecked dues.
    syncAmountPaidUI(rent, electricity, electricityEnabled, gas, gasEnabled, dues, duesEnabled, totalWithDue, status, amountPaidRaw) {
        const amountPaidGroup = document.getElementById('amountPaidGroup');
        const amountPaidInput = document.getElementById('paymentAmountPaid');
        const paidDisplay = document.getElementById('paymentPaidDisplay');
        const remainingDisplay = document.getElementById('paymentRemainingDisplay');

        if (amountPaidGroup) amountPaidGroup.style.display = status === 'partial' ? 'block' : 'none';

        const checkedBills = rent +
            (electricityEnabled ? electricity : 0) +
            (gasEnabled ? gas : 0);
        const checkedTotal = checkedBills + (duesEnabled ? dues : 0);
        const resolvedPaid = status === 'paid'
            ? checkedTotal
            : (status === 'partial' ? Math.max(0, amountPaidRaw || 0) : 0);
        const remaining = Math.max(0, totalWithDue - resolvedPaid);

        if (paidDisplay) paidDisplay.textContent = formatCurrency(resolvedPaid);
        if (remainingDisplay) remainingDisplay.textContent = formatCurrency(remaining);

        if (amountPaidInput && status === 'partial') {
            amountPaidInput.max = totalWithDue > 0 ? Math.max(totalWithDue - 0.01, 0).toFixed(2) : 0;
        }
    },

    syncStatusChecks(status) {
        const electricityCheck = document.getElementById('paymentElectricityEnabled');
        const gasCheck = document.getElementById('paymentGasEnabled');
        const duesCheck = document.getElementById('paymentDuesEnabled');

        if (status === 'paid') {
            if (electricityCheck) electricityCheck.checked = true;
            if (gasCheck) gasCheck.checked = true;
            if (duesCheck) duesCheck.checked = true;
        } else if (status === 'unpaid') {
            if (electricityCheck) electricityCheck.checked = false;
            if (gasCheck) gasCheck.checked = false;
            if (duesCheck) duesCheck.checked = false;
        }
    },

    getStatusHTML(selected = 'unpaid') {
        if (!selected) selected = 'unpaid';
        const statuses = [
            { value: 'paid', label: 'Paid', class: 'status-btn-paid' },
            { value: 'partial', label: 'Partial', class: 'status-btn-partial' },
            { value: 'unpaid', label: 'Unpaid', class: 'status-btn-unpaid' }
        ];
        
        return statuses.map(s => 
            `<button type="button" class="status-btn ${s.class} ${selected === s.value ? 'active' : ''}" data-status="${s.value}">${s.label}</button>`
        ).join('');
    },
    
    updateDuesConstraint(userTriggered = false) {
        const duesEl = document.getElementById('paymentDues');
        const duesCheck = document.getElementById('paymentDuesEnabled');
        const statusInput = document.getElementById('paymentStatus');
        if (!duesEl || !statusInput) return;

        const dues = parseFloat(duesEl.value) || 0;
        const hasDuesAmount = dues > 0;
        const includeDues = !!duesCheck?.checked;
        const paidButton = document.querySelector('.status-btn[data-status="paid"]');

        // No amount: the include-due check stays off/neutral and Paid remains
        // completely selectable.
        if (!hasDuesAmount) {
            if (duesCheck) {
                duesCheck.checked = false;
                duesCheck.disabled = false;
            }
            if (paidButton) {
                paidButton.disabled = false;
                paidButton.classList.remove('status-btn-disabled');
            }
        } else if (includeDues) {
            // Once dues are explicitly included, Paid is valid and is selected
            // automatically because it represents the full total including dues.
            if (duesCheck) duesCheck.disabled = false;
            if (paidButton) {
                paidButton.disabled = false;
                paidButton.classList.remove('status-btn-disabled');
            }
            if (userTriggered && statusInput.value !== 'paid') {
                statusInput.value = 'paid';
                document.querySelectorAll('.status-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.status === 'paid'));
            }
        } else {
            // A positive dues amount that has NOT been explicitly included must
            // never silently turn a Paid selection into a full-total payment.
            if (paidButton) {
                paidButton.disabled = true;
                paidButton.classList.add('status-btn-disabled');
            }
            if (statusInput.value === 'paid') {
                statusInput.value = 'unpaid';
                document.querySelectorAll('.status-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.status === 'unpaid'));
            }
        }

        if (statusInput.value === 'partial') {
            const fields = this.getFormFields();
            const total = fields.rent + (fields.electricityEnabled ? fields.electricity : 0) + (fields.gasEnabled ? fields.gas : 0) + (includeDues ? dues : 0);
            const input = document.getElementById('paymentAmountPaid');
            if (input) input.max = total > 0 ? Math.max(total - 0.01, 0).toFixed(2) : 0;
        }
    },
    
    getTotalHTML(withoutDue = 0, totalWithDue = 0, amountPaid = 0, status = 'unpaid', paidTotal = 0) {
        const resolvedPaid = status === 'paid'
            ? Math.max(0, paidTotal)
            : (status === 'partial' ? Math.max(0, amountPaid || 0) : 0);
        const remaining = Math.max(0, totalWithDue - resolvedPaid);
        return `
            <div class="payment-overview" aria-label="Payment overview">
                <div class="payment-overview-grid">
                    <div class="payment-overview-item">
                        <span class="payment-overview-label">Without Due</span>
                        <span id="paymentWithoutDueDisplay" class="payment-overview-value">${formatCurrency(withoutDue)}</span>
                    </div>
                    <div class="payment-overview-item">
                        <span class="payment-overview-label">Total + Due</span>
                        <span id="paymentTotalDisplay" class="payment-overview-value">${formatCurrency(totalWithDue)}</span>
                    </div>
                    <div class="payment-overview-item payment-overview-item-emphasis">
                        <span class="payment-overview-label">Amount Received</span>
                        <span id="paymentPaidDisplay" class="payment-overview-value payment-overview-positive">${formatCurrency(resolvedPaid)}</span>
                    </div>
                    <div class="payment-overview-item payment-overview-item-emphasis">
                        <span class="payment-overview-label">Remaining Balance</span>
                        <span id="paymentRemainingDisplay" class="payment-overview-value payment-overview-negative">${formatCurrency(remaining)}</span>
                    </div>
                </div>
            </div>
        `;
    },

    toggleNotes(trigger) {
        const scope = trigger?.closest('.modal-content, .popup-box, form') || document;
        const container = scope.querySelector('[data-payment-notes-container]') || scope.querySelector('#notesContainer');
        const icon = trigger?.querySelector('[data-notes-icon]') || trigger?.querySelector('#notesToggleIcon');
        if (!container) return;
        const isHidden = getComputedStyle(container).display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        if (icon) icon.textContent = isHidden ? '▼' : '▶';
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
                    <div class="payment-charge-input-wrap"><input type="number" class="form-control" id="paymentElectricity" min="0" value="0"><label class="payment-dues-check" title="Include electricity"><input type="checkbox" id="paymentElectricityEnabled" aria-label="Include electricity" checked><span>✓</span></label></div>
                </div>
                <div class="form-group">
                    <label>Gas</label>
                    <div class="payment-charge-input-wrap"><input type="number" class="form-control" id="paymentGas" min="0" value="0"><label class="payment-dues-check" title="Include gas"><input type="checkbox" id="paymentGasEnabled" aria-label="Include gas" checked><span>✓</span></label></div>
                </div>
                <div class="form-group">
                    <label>Previous Dues</label>
                    <div class="payment-dues-input-wrap"><input type="number" class="form-control" id="paymentDues" min="0" value="0"><label class="payment-dues-check" title="Include previous dues"><input type="checkbox" id="paymentDuesEnabled" aria-label="Include previous dues"><span>✓</span></label></div>
                </div>
            </div>
                <div class="form-group">
                    <label>Status</label>
                    <div class="status-group">${this.getStatusHTML('unpaid')}</div>
                    <input type="hidden" id="paymentStatus" value="unpaid">
                </div>
                <div class="form-group" id="amountPaidGroup" style="display: none;">
                    <label>Amount Received <span class="required">*</span></label>
                    <input type="number" class="form-control" id="paymentAmountPaid" min="0.01" step="0.01" value="0">
                    <small style="color: var(--text-light); display: block; margin-top: 4px;">How much has this tenant actually paid toward the total above?</small>
                </div>
                ${this.getTotalHTML()}
                <div class="form-group">
                    <button type="button" class="payment-notes-toggle" id="paymentNotesToggle" data-action="toggle-payment-notes"><span data-notes-icon id="notesToggleIcon">▶</span> Add Notes</button>
                    <div data-payment-notes-container id="notesContainer" style="display: none; margin-top: 4px;">
                        <textarea class="form-control" id="paymentNotes" rows="2" placeholder="Additional notes"></textarea>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary" id="paymentSubmitBtn">Save Payment</button>
                </div>
            </form>
        `;
        
        App.openModal('Record Payment', form);
        this.setupFormHandlers();
        
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
        if (this._isProcessing) return;
        
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
            
            const profilePic = fixedTenant.profile_pic 
                ? `<img src="${escapeHTML(fixedTenant.profile_pic)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">`
                : `<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 500; color: var(--text-light); flex-shrink: 0;">${escapeHTML(fixedTenant.name.charAt(0).toUpperCase())}</div>`;
            
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
        const paidTotal = (payment.monthly_rent || 0) + (payment.electricity || 0) + (payment.gas || 0) + (payment.previous_dues || 0);
        
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
                    <div class="payment-charge-input-wrap"><input type="number" class="form-control" id="paymentElectricity" value="${payment.electricity || 0}" min="0"><label class="payment-dues-check" title="Include electricity"><input type="checkbox" id="paymentElectricityEnabled" aria-label="Include electricity" checked><span>✓</span></label></div>
                </div>
                <div class="form-group">
                    <label>Gas</label>
                    <div class="payment-charge-input-wrap"><input type="number" class="form-control" id="paymentGas" value="${payment.gas || 0}" min="0"><label class="payment-dues-check" title="Include gas"><input type="checkbox" id="paymentGasEnabled" aria-label="Include gas" checked><span>✓</span></label></div>
                </div>
                <div class="form-group">
                    <label>Previous Dues</label>
                    <div class="payment-dues-input-wrap"><input type="number" class="form-control" id="paymentDues" value="${payment.previous_dues || 0}" min="0"><label class="payment-dues-check" title="Include previous dues"><input type="checkbox" id="paymentDuesEnabled" aria-label="Include previous dues" ${payment.previous_dues > 0 ? "checked" : ""}><span>✓</span></label></div>
                </div>
            </div>
                <div class="form-group">
                    <label>Status</label>
                    <div class="status-group">${this.getStatusHTML(payment.status)}</div>
                    <input type="hidden" id="paymentStatus" value="${payment.status}">
                </div>
                <div class="form-group" id="amountPaidGroup" style="display: ${payment.status === 'partial' ? 'block' : 'none'};">
                    <label>Amount Received <span class="required">*</span></label>
                    <input type="number" class="form-control" id="paymentAmountPaid" value="${payment.amount_paid || 0}" min="0.01" step="0.01">
                    <small style="color: var(--text-light); display: block; margin-top: 4px;">How much has this tenant actually paid toward the total above?</small>
                </div>
                ${this.getTotalHTML(withoutDue, totalWithDue, payment.amount_paid || 0, payment.status, paidTotal)}
                <div class="form-group">
                    <button type="button" class="payment-notes-toggle" id="paymentNotesToggle" data-action="toggle-payment-notes"><span data-notes-icon id="notesToggleIcon">▶</span> Add Notes</button>
                    <div data-payment-notes-container id="notesContainer" style="display: none; margin-top: 4px;">
                        <textarea class="form-control" id="paymentNotes" rows="2">${escapeHTML(payment.notes || '')}</textarea>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-outline" id="paymentExportBtn">Export</button>
                    <button type="button" class="btn btn-primary" id="paymentSubmitBtn">Update Payment</button>
                </div>
            </form>
        `;
        
        App.openModal('Edit Payment', form);
        this.setupFormHandlers();
    },

    setupFormHandlers() {
        setTimeout(() => {
            document.querySelectorAll('#paymentForm input[type="number"]').forEach(input => {
                input.addEventListener('wheel', function(e) {
                    e.preventDefault();
                    const container = this.closest('.modal-body');
                    if (container) container.scrollTop += e.deltaY;
                }, { passive: false });
            });
        }, 100);
        
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.disabled) return;
                document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const status = this.dataset.status;
                document.getElementById('paymentStatus').value = status;
                Payments.syncStatusChecks(status);
                Payments.updateTotal();
            });
        });
        
        const duesCheck = document.getElementById('paymentDuesEnabled');
        if (duesCheck && !duesCheck.dataset.toastBound) {
            duesCheck.dataset.toastBound = '1';
            duesCheck.addEventListener('click', (e) => {
                const dues = parseFloat(document.getElementById('paymentDues')?.value) || 0;
                if (dues <= 0 && !duesCheck.checked) {
                    e.preventDefault();
                    showNotification('Add dues', 'info');
                }
            });
        }

        ['paymentRent', 'paymentElectricity', 'paymentGas', 'paymentDues', 'paymentAmountPaid', 'paymentDuesEnabled', 'paymentElectricityEnabled', 'paymentGasEnabled'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
                Payments.updateTotal();
                if (id === 'paymentDues' || id === 'paymentDuesEnabled') Payments.updateDuesConstraint(true);
            });
        });
        
        const initialStatus = document.getElementById('paymentStatus')?.value || 'unpaid';
        this.syncStatusChecks(initialStatus);
        this.updateDuesConstraint(false);
        this.updateTotal();
        
        const tenantSelect = document.getElementById('paymentTenant');
        if (tenantSelect && tenantSelect.tagName === 'SELECT') {
            tenantSelect.addEventListener('change', function() {
                const rent = parseFloat(this.options[this.selectedIndex]?.dataset.rent) || 0;
                document.getElementById('paymentRent').value = rent;
                Payments.updateTotal();
            });
        }
        
        const paymentExportBtn = document.getElementById('paymentExportBtn');
        if (paymentExportBtn) {
            paymentExportBtn.addEventListener('click', () => this.exportCurrentPayment());
        }

        const form = document.getElementById('paymentForm');
        const editSubmitBtn = document.getElementById('paymentSubmitBtn');
        if (editSubmitBtn && document.getElementById('paymentId') && !editSubmitBtn.dataset.bound) {
            editSubmitBtn.dataset.bound = '1';
            editSubmitBtn.addEventListener('click', () => this.updatePayment());
        }

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
        if (this._isProcessing) return;
        
        const submitBtn = document.getElementById('paymentSubmitBtn');
        const fields = this.getFormFields();
        const totalPayment = fields.rent + fields.electricity + fields.gas + fields.dues;
        const checkedTotal = fields.rent + (fields.electricityEnabled ? fields.electricity : 0) + (fields.gasEnabled ? fields.gas : 0) + (fields.duesEnabled ? fields.dues : 0);
        
        if (!fields.tenantId) {
            showNotification('Please select a tenant', 'error');
            return;
        }
        if (fields.rent <= 0) {
            showNotification('Rent must be greater than 0', 'error');
            return;
        }
        if (fields.status === 'partial') {
            if (!fields.amountPaid || fields.amountPaid <= 0) {
                showNotification('Enter the amount received for a partial payment', 'error');
                return;
            }
            if (fields.amountPaid >= totalPayment) {
                showNotification('Amount received must be less than the total amount due for a partial payment', 'error');
                return;
            }
        }
        
        const resolvedAmountPaid = this.resolveAmountPaid(fields.status, totalPayment, fields.status === 'paid' ? checkedTotal : fields.amountPaid);
        
        this._isProcessing = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
        }
        Components.showLoading('Recording payment...');
        
        try {
            if (isDemoMode()) {
                const newPayment = {
                    id: generateDemoId('pay'),
                    tenant_id: fields.tenantId,
                    month: fields.month,
                    year: fields.year,
                    monthly_rent: fields.rent,
                    electricity: fields.electricityEnabled ? fields.electricity : 0,
                    gas: fields.gasEnabled ? fields.gas : 0,
                    previous_dues: fields.duesEnabled ? fields.dues : 0,
                    total_payment: totalPayment,
                    amount_paid: resolvedAmountPaid,
                    status: fields.status,
                    notes: fields.notes,
                    created_at: new Date().toISOString()
                };
                addDemoRecord('payments', newPayment);
                await App.loadData();
                App.closeModal();
                await this.render();
                if (document.getElementById('tenants')?.classList.contains('active')) {
                    await Tenants.render();
                }
                Components.hideLoading();
                showNotification('Payment recorded successfully', 'success');
                return;
            }

            await API.createPayment({
                tenantId: fields.tenantId,
                month: fields.month,
                year: fields.year,
                monthlyRent: fields.rent,
                electricity: fields.electricityEnabled ? fields.electricity : 0,
                gas: fields.gasEnabled ? fields.gas : 0,
                previousDues: fields.duesEnabled ? fields.dues : 0,
                totalPayment,
                amountPaid: resolvedAmountPaid,
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
            Components.hideLoading();
            showNotification('Payment recorded successfully', 'success');
        } catch (error) {
            Components.hideLoading();
            showNotification(error.message || 'Failed to save payment', 'error');
        } finally {
            this._isProcessing = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Payment';
            }
        }
    },
    

    exportCurrentPayment() {
        const id = document.getElementById('paymentId')?.value;
        const fields = this.getFormFields();
        const payment = (App.state.payments || []).find(p => p.id === id);
        if (!payment) {
            showNotification('Payment not found', 'error');
            return;
        }

        // Export the same tenant-facing PDF receipt already used elsewhere in
        // the app. Build it from the current edit fields so the receipt reflects
        // unsaved changes made in the editor.
        const totalPayment = fields.rent + fields.electricity + fields.gas + fields.dues;
        const checkedTotal = fields.rent + (fields.electricityEnabled ? fields.electricity : 0) + (fields.gasEnabled ? fields.gas : 0) + (fields.duesEnabled ? fields.dues : 0);
        const amountPaid = this.resolveAmountPaid(fields.status, totalPayment, fields.status === 'paid' ? checkedTotal : fields.amountPaid);
        const receiptPayment = {
            ...payment,
            tenant_id: fields.tenantId,
            month: fields.month,
            year: fields.year,
            monthly_rent: fields.rent,
            electricity: fields.electricityEnabled ? fields.electricity : 0,
            gas: fields.gasEnabled ? fields.gas : 0,
            previous_dues: fields.duesEnabled ? fields.dues : 0,
            total_payment: totalPayment,
            amount_paid: amountPaid,
            status: fields.status,
            notes: fields.notes
        };
        const tenant = (App.state.tenants || []).find(t => t.id === fields.tenantId);

        if (typeof DataIO !== 'undefined' && typeof DataIO.generateReceipt === 'function') {
            DataIO.generateReceipt(receiptPayment, tenant);
        } else {
            showNotification('Receipt unavailable', 'error');
        }
    },
    async updatePayment() {
        if (this._isProcessing) return;
        
        const submitBtn = document.getElementById('paymentSubmitBtn');
        const id = document.getElementById('paymentId').value;
        const fields = this.getFormFields();
        const totalPayment = fields.rent + fields.electricity + fields.gas + fields.dues;
        const checkedTotal = fields.rent + (fields.electricityEnabled ? fields.electricity : 0) + (fields.gasEnabled ? fields.gas : 0) + (fields.duesEnabled ? fields.dues : 0);
        
        if (!fields.tenantId) {
            showNotification('Please select a tenant', 'error');
            return;
        }
        if (fields.rent <= 0) {
            showNotification('Rent must be greater than 0', 'error');
            return;
        }
        if (fields.status === 'partial') {
            if (!fields.amountPaid || fields.amountPaid <= 0) {
                showNotification('Enter the amount received for a partial payment', 'error');
                return;
            }
            if (fields.amountPaid >= totalPayment) {
                showNotification('Amount received must be less than the total amount due for a partial payment', 'error');
                return;
            }
        }
        
        const resolvedAmountPaid = this.resolveAmountPaid(fields.status, totalPayment, fields.status === 'paid' ? checkedTotal : fields.amountPaid);
        
        this._isProcessing = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating...';
        }
        Components.showLoading('Updating payment...');
        
        try {
            if (isDemoMode()) {
                updateDemoRecord('payments', id, {
                    tenant_id: fields.tenantId,
                    month: fields.month,
                    year: fields.year,
                    monthly_rent: fields.rent,
                    electricity: fields.electricityEnabled ? fields.electricity : 0,
                    gas: fields.gasEnabled ? fields.gas : 0,
                    previous_dues: fields.duesEnabled ? fields.dues : 0,
                    total_payment: totalPayment,
                    amount_paid: resolvedAmountPaid,
                    status: fields.status,
                    notes: fields.notes
                });
                await App.loadData();
                App.closeModal();
                await this.render();
                if (document.getElementById('tenants')?.classList.contains('active')) {
                    await Tenants.render();
                }
                Components.hideLoading();
                showNotification('Payment updated successfully', 'success');
                return;
            }

            await API.updatePayment(id, {
                tenantId: fields.tenantId,
                month: fields.month,
                year: fields.year,
                monthlyRent: fields.rent,
                electricity: fields.electricityEnabled ? fields.electricity : 0,
                gas: fields.gasEnabled ? fields.gas : 0,
                previousDues: fields.duesEnabled ? fields.dues : 0,
                totalPayment,
                amountPaid: resolvedAmountPaid,
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
            Components.hideLoading();
            showNotification('Payment updated successfully', 'success');
        } catch (error) {
            Components.hideLoading();
            showNotification(error.message || 'Failed to update payment', 'error');
        } finally {
            this._isProcessing = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update Payment';
            }
        }
    },
    
    async deletePayment(id) {
        if (this._isProcessing) return;
        
        Components.showConfirm(
            'Delete Payment',
            'Are you sure you want to delete this payment record?',
            'Delete',
            'Cancel',
            'danger',
            async () => {
                this._isProcessing = true;
                Components.showLoading('Deleting payment...');
                
                try {
                    if (isDemoMode()) {
                        deleteDemoRecord('payments', id);
                        await App.loadData();
                        await this.render();
                        if (document.getElementById('tenants')?.classList.contains('active')) {
                            await Tenants.render();
                        }
                        Components.hideLoading();
                        Components.showSuccess('Payment deleted successfully');
                        return;
                    }
                    await API.deletePayment(id);
                    await App.loadData();
                    await this.render();
                    if (document.getElementById('tenants')?.classList.contains('active')) {
                        await Tenants.render();
                    }
                    Components.hideLoading();
                    Components.showSuccess('Payment deleted successfully');
                } catch (error) {
                    Components.hideLoading();
                    Components.showError(error.message || 'Failed to delete payment');
                } finally {
                    this._isProcessing = false;
                }
            }
        );
    }
};

window.Payments = Payments;
