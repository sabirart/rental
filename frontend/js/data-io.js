// js/data-io.js - Data Export/Import overlay:
// export all / by month / PDF receipt, and JSON import.

const DataIO = {
    init() {
        document.getElementById('openDataExportBtn')?.addEventListener('click', () => this.openPanel('export'));
        document.getElementById('openDataImportBtn')?.addEventListener('click', () => this.openPanel('import'));
        document.getElementById('dataIoClose')?.addEventListener('click', () => this.closePanel());
        document.getElementById('dataExportOverlay')?.addEventListener('click', () => this.closePanel());

        document.querySelectorAll('.data-io-option[data-export] button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const option = e.target.closest('.data-io-option');
                this.handleExport(option.dataset.export);
            });
        });

        const fileInput = document.getElementById('importFileInput');
        document.getElementById('importChooseBtn')?.addEventListener('click', () => fileInput.click());
        fileInput?.addEventListener('change', () => {
            const file = fileInput.files[0];
            document.getElementById('importFileName').textContent = file ? file.name : 'No file selected';
            document.getElementById('importConfirmBtn').disabled = !file;
        });
        document.getElementById('importConfirmBtn')?.addEventListener('click', () => this.handleImport());
    },

    openPanel(mode, tenantId) {
        if (window.closeAllOverlays) window.closeAllOverlays('dataExportPanel');
        this.populateSelects(tenantId);
        document.getElementById('dataIoTitle').textContent = mode === 'import' ? 'Import Data' : 'Export Data';
        document.getElementById('dataExportView').style.display = mode === 'import' ? 'none' : 'block';
        document.getElementById('dataImportView').style.display = mode === 'import' ? 'block' : 'none';
        document.getElementById('dataExportPanel').style.display = 'flex';
        document.getElementById('dataExportOverlay').style.display = 'block';
    },

    closePanel() {
        document.getElementById('dataExportPanel').style.display = 'none';
        document.getElementById('dataExportOverlay').style.display = 'none';
    },

    populateSelects(tenantId) {
        const monthSelect = document.getElementById('exportMonthSelect');
        const yearSelect = document.getElementById('exportYearSelect');
        const receiptSelect = document.getElementById('receiptPaymentSelect');

        if (monthSelect && monthSelect.options.length === 0) {
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            months.forEach((m, i) => {
                const opt = document.createElement('option');
                opt.value = String(i + 1);
                opt.textContent = m;
                monthSelect.appendChild(opt);
            });
            monthSelect.value = String(new Date().getMonth() + 1);
        }

        if (yearSelect) {
            yearSelect.innerHTML = '';
            const currentYear = new Date().getFullYear();
            for (let y = currentYear - 3; y <= currentYear + 1; y++) {
                const opt = document.createElement('option');
                opt.value = String(y);
                opt.textContent = String(y);
                yearSelect.appendChild(opt);
            }
            yearSelect.value = String(currentYear);
        }

        const payments = (App.state && App.state.payments) || [];
        if (receiptSelect) {
            // When opened as a shortcut from a specific tenant's detail
            // overlay, jump straight to just their receipts instead of
            // the full list - falls back to everyone's when opened from
            // Settings as usual (tenantId undefined).
            const scoped = tenantId ? payments.filter(p => p.tenant_id === tenantId) : payments;
            const sorted = [...scoped].sort((a, b) => (b.year - a.year) || (b.month - a.month));
            receiptSelect.innerHTML = sorted.map(p =>
                `<option value="${p.id}">${escapeHTML(p.tenant_name || 'Tenant')} — ${monthName(p.month)} ${p.year}</option>`
            ).join('') || `<option value="">No payments${tenantId ? ' for this tenant' : ''}</option>`;
        }
    },

    downloadJson(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },

    handleExport(type) {
        const tenants = (App.state && App.state.tenants) || [];
        const properties = (App.state && App.state.properties) || [];
        const payments = (App.state && App.state.payments) || [];
        const today = new Date().toISOString().split('T')[0];

        if (type === 'all') {
            if (typeof Settings !== 'undefined' && Settings.exportData) {
                Settings.exportData();
            } else {
                this.downloadJson(`rental_data_${today}.json`, { tenants, properties, payments, exportedAt: new Date().toISOString() });
            }
            return;
        }

        if (type === 'month') {
            const month = parseInt(document.getElementById('exportMonthSelect').value);
            const year = parseInt(document.getElementById('exportYearSelect').value);
            const filtered = payments.filter(p => p.month === month && p.year === year);
            if (filtered.length === 0) {
                Components.showWarning(`No payment records found for ${monthName(month)} ${year}.`);
                return;
            }
            this.downloadJson(`payments_${monthName(month)}_${year}.json`, { month, year, payments: filtered, exportedAt: new Date().toISOString() });
            showNotification('Month export downloaded', 'success');
            return;
        }

        if (type === 'receipt') {
            const paymentId = document.getElementById('receiptPaymentSelect').value;
            const payment = payments.find(p => p.id === paymentId);
            if (!payment) {
                Components.showWarning('Please select a payment to generate a receipt for.');
                return;
            }
            const tenant = tenants.find(t => t.id === payment.tenant_id);
            this.generateReceipt(payment, tenant);
            return;
        }
    },

    generateReceipt(payment, tenant) {
        const win = window.open('', '_blank', 'width=480,height=640');
        if (!win) {
            Components.showWarning('Please allow pop-ups to generate the receipt.');
            return;
        }
        const owner = JSON.parse(localStorage.getItem('ownerInfo') || '{}');
        const rows = [
            ['Rent', payment.monthly_rent],
            ['Electricity', payment.electricity],
            ['Gas', payment.gas],
            ['Previous Dues', payment.previous_dues]
        ];
        (payment.custom_charges || []).forEach(c => rows.push([c.label || 'Other Charge', c.amount || 0]));

        win.document.write(`
            <html>
            <head>
                <title>Payment Receipt</title>
                <style>
                    body { font-family: -apple-system, Arial, sans-serif; padding: 32px; color: #1c1c1c; }
                    h1 { font-size: 1.2rem; margin-bottom: 0; }
                    .sub { color: #6b6b6b; font-size: 0.85rem; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    td { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 0.9rem; }
                    td:last-child { text-align: right; }
                    .total-row td { font-weight: 700; border-top: 2px solid #1a1a1a; border-bottom: none; padding-top: 12px; }
                    .status { display:inline-block; margin-top:16px; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
                </style>
            </head>
            <body onload="window.print()">
                <h1>${escapeHTML(owner.name || 'Rental Manager')}</h1>
                <p class="sub">Payment Receipt · ${monthName(payment.month)} ${payment.year}</p>
                <p class="sub">Tenant: ${escapeHTML(tenant ? tenant.name : 'N/A')}</p>
                <table>
                    ${rows.map(([label, amt]) => `<tr><td>${escapeHTML(String(label))}</td><td>${formatCurrency(amt || 0)}</td></tr>`).join('')}
                    <tr class="total-row"><td>Total</td><td>${formatCurrency(payment.total_payment || 0)}</td></tr>
                </table>
                <span class="status">${escapeHTML(payment.status || 'unpaid')}</span>
            </body>
            </html>
        `);
        win.document.close();
    },

    async handleImport() {
        const fileInput = document.getElementById('importFileInput');
        const file = fileInput.files[0];
        if (!file) return;

        const confirmBtn = document.getElementById('importConfirmBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Importing...';
        Components.showLoading('Importing data...');

        try {
            const data = await Settings.importData(file);
            const existingPropertyNames = new Map((App.state.properties || []).map(p => [p.name, p.id]));
            const propertyIdMap = new Map(); // old id -> new/matched id

            // Properties: create any that don't already exist by name.
            for (const property of (data.properties || [])) {
                if (existingPropertyNames.has(property.name)) {
                    propertyIdMap.set(property.id, existingPropertyNames.get(property.name));
                    continue;
                }
                if (isDemoMode()) continue; // demo mode: skip property creation, tenants import unassigned
                const created = await API.createProperty({
                    name: property.name,
                    address: property.address,
                    totalRooms: property.total_rooms || 1,
                    baseRent: property.base_rent || 0,
                    status: property.status || 'active',
                    description: property.description || ''
                });
                propertyIdMap.set(property.id, created.data.id);
                existingPropertyNames.set(property.name, created.data.id);
            }

            // Tenants: skip any whose CNIC already exists.
            const existingCnics = new Set((App.state.tenants || []).map(t => t.cnic));
            let imported = 0, skipped = 0;

            for (const tenant of (data.tenants || [])) {
                if (existingCnics.has(tenant.cnic)) { skipped++; continue; }

                const newPropertyId = tenant.property_id ? propertyIdMap.get(tenant.property_id) : null;

                if (isDemoMode()) {
                    addDemoRecord('tenants', {
                        ...tenant,
                        id: 'tenant_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                        property_id: newPropertyId || null
                    });
                } else {
                    await API.createTenant({
                        name: tenant.name,
                        fatherName: tenant.father_name,
                        cnic: tenant.cnic,
                        location: tenant.location,
                        description: tenant.description || '',
                        propertyId: newPropertyId || undefined,
                        roomNumber: newPropertyId ? tenant.room_number : undefined,
                        mobileNumber: tenant.mobile_number || null,
                        advancePayment: tenant.advance_payment || 0,
                        leaseEndDate: tenant.lease_end_date || null,
                        documents: []
                    });
                }
                existingCnics.add(tenant.cnic);
                imported++;
            }

            await App.loadData();
            App.renderCurrentView();
            Components.hideLoading();

            this.closePanel();
            showNotification(`Imported ${imported} tenant(s)${skipped ? `, skipped ${skipped} duplicate(s)` : ''}`, 'success');
        } catch (error) {
            Components.hideLoading();
            Components.showError(error.message || 'Failed to import data');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Import';
            fileInput.value = '';
            document.getElementById('importFileName').textContent = 'No file selected';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    DataIO.init();
});

window.DataIO = DataIO;
