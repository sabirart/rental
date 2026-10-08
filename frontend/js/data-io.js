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

        // CSV From/To range selects - same month/year options as above,
        // defaulting the whole range to just the current month.
        const csvSelectIds = ['exportCsvFromMonth', 'exportCsvToMonth'];
        csvSelectIds.forEach(id => {
            const sel = document.getElementById(id);
            if (sel && sel.options.length === 0) {
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                months.forEach((m, i) => {
                    const opt = document.createElement('option');
                    opt.value = String(i + 1);
                    opt.textContent = m;
                    sel.appendChild(opt);
                });
                sel.value = String(new Date().getMonth() + 1);
            }
        });
        ['exportCsvFromYear', 'exportCsvToYear'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel) {
                sel.innerHTML = '';
                const currentYear = new Date().getFullYear();
                for (let y = currentYear - 3; y <= currentYear + 1; y++) {
                    const opt = document.createElement('option');
                    opt.value = String(y);
                    opt.textContent = String(y);
                    sel.appendChild(opt);
                }
                sel.value = String(currentYear);
            }
        });

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

        if (type === 'csv') {
            const fromMonth = parseInt(document.getElementById('exportCsvFromMonth').value);
            const fromYear = parseInt(document.getElementById('exportCsvFromYear').value);
            const toMonth = parseInt(document.getElementById('exportCsvToMonth').value);
            const toYear = parseInt(document.getElementById('exportCsvToYear').value);

            const fromKey = fromYear * 12 + fromMonth;
            const toKey = toYear * 12 + toMonth;
            const [startKey, endKey] = fromKey <= toKey ? [fromKey, toKey] : [toKey, fromKey];

            const filtered = payments.filter(p => {
                const key = (p.year * 12) + p.month;
                return key >= startKey && key <= endKey;
            });

            if (filtered.length === 0) {
                Components.showWarning('No payment records found in that date range.');
                return;
            }

            this.downloadPaymentsCsv(filtered, tenants);
            showNotification('CSV export downloaded', 'success');
            return;
        }
    },

    // Builds a spreadsheet-friendly CSV of payments for bookkeeping -
    // distinct from the JSON export (a full data backup/re-import format)
    // and the PDF receipt (a single tenant-facing document): this is meant
    // to be opened directly in Excel/Google Sheets for accounting.
    downloadPaymentsCsv(payments, tenants) {
        const header = ['Tenant', 'Month', 'Year', 'Rent', 'Electricity', 'Gas', 'Previous Dues', 'Total Due', 'Amount Received', 'Remaining Balance', 'Status', 'Notes'];

        const escapeCsv = (value) => {
            const str = String(value === undefined || value === null ? '' : value);
            if (/[",\n]/.test(str)) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = payments
            .slice()
            .sort((a, b) => (a.year - b.year) || (a.month - b.month))
            .map(p => {
                const tenant = tenants.find(t => t.id === p.tenant_id);
                const total = p.total_payment || 0;
                const amountPaid = p.status === 'paid' ? total : p.status === 'unpaid' ? 0 : (p.amount_paid || 0);
                const remaining = Math.max(0, total - amountPaid);
                return [
                    tenant ? tenant.name : (p.tenant_name || 'Unknown'),
                    monthName(p.month),
                    p.year,
                    (p.monthly_rent || 0).toFixed(2),
                    (p.electricity || 0).toFixed(2),
                    (p.gas || 0).toFixed(2),
                    (p.previous_dues || 0).toFixed(2),
                    total.toFixed(2),
                    amountPaid.toFixed(2),
                    remaining.toFixed(2),
                    p.status || 'unpaid',
                    p.notes || ''
                ];
            });

        const csvContent = [header, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payments_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
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

        const amountPaid = payment.status === 'paid' ? (payment.total_payment || 0)
            : payment.status === 'unpaid' ? 0
            : (payment.amount_paid || 0);
        const remaining = Math.max(0, (payment.total_payment || 0) - amountPaid);

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
                    ${payment.status === 'partial' ? `
                    <tr><td>Amount Received</td><td>${formatCurrency(amountPaid)}</td></tr>
                    <tr><td>Remaining Balance</td><td>${formatCurrency(remaining)}</td></tr>
                    ` : ''}
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
            const currentProperties = App.state.properties || [];
            const currentTenants = App.state.tenants || [];
            const currentPayments = App.state.payments || [];
            const propertyKey = (property) => `${String(property?.name || '').trim().toLowerCase()}|${String(property?.address || '').trim().toLowerCase()}`;
            const existingPropertyNames = new Map(currentProperties.map(p => [propertyKey(p), p.id]));
            const propertyIdMap = new Map();
            const tenantIdMap = new Map();

            const makeRooms = (property, tenantList = []) => {
                const count = Math.max(0, Number(property.total_rooms || 0));
                const existingRooms = Array.isArray(property.rooms) ? property.rooms : [];
                const byNumber = new Map(existingRooms.map(r => [Number(r.room_number), r]));
                const result = [];
                for (let i = 1; i <= count; i++) {
                    const room = byNumber.get(i) || {};
                    const tenant = tenantList.find(t => Number(t.room_number) === i && t.property_id === property.id && t.status === 'active');
                    result.push({
                        room_number: i,
                        room_name: room.room_name || `Room ${i}`,
                        status: tenant ? 'occupied' : (room.status === 'maintenance' ? 'maintenance' : 'available'),
                        tenant_id: tenant ? tenant.id : null,
                        rent_amount: Number(room.rent_amount ?? property.base_rent ?? 0)
                    });
                }
                return result;
            };

            // Properties are restored first so tenant room assignments can be mapped.
            for (const property of (data.properties || [])) {
                const key = propertyKey(property);
                const existingId = existingPropertyNames.get(key);
                if (existingId) {
                    propertyIdMap.set(property.id, existingId);
                    continue;
                }

                if (isDemoMode()) {
                    const newProperty = {
                        ...property,
                        id: generateDemoId('prop'),
                        total_rooms: Number(property.total_rooms || 1),
                        base_rent: Number(property.base_rent || 0),
                        rooms: []
                    };
                    newProperty.rooms = makeRooms(newProperty, data.tenants || []);
                    addDemoRecord('properties', newProperty);
                    propertyIdMap.set(property.id, newProperty.id);
                    existingPropertyNames.set(key, newProperty.id);
                } else {
                    const created = await API.createProperty({
                        name: property.name,
                        address: property.address,
                        totalRooms: property.total_rooms || 1,
                        baseRent: property.base_rent || 0,
                        status: property.status || 'active',
                        description: property.description || ''
                    });
                    propertyIdMap.set(property.id, created.data.id);
                    existingPropertyNames.set(key, created.data.id);
                }
            }

            // Existing tenants are mapped by CNIC; newly imported tenants are mapped by old id.
            const existingCnics = new Set(currentTenants.map(t => t.cnic));
            for (const tenant of (data.tenants || [])) {
                if (existingCnics.has(tenant.cnic)) {
                    const existing = currentTenants.find(t => t.cnic === tenant.cnic);
                    if (existing) tenantIdMap.set(tenant.id, existing.id);
                    continue;
                }

                const newPropertyId = tenant.property_id ? propertyIdMap.get(tenant.property_id) : null;
                const importedRoom = tenant.room_number ? Number(tenant.room_number) : null;

                if (isDemoMode()) {
                    const newTenant = {
                        ...tenant,
                        id: generateDemoId('tenant'),
                        property_id: newPropertyId || null,
                        room_number: newPropertyId ? importedRoom : null,
                        documents: Array.isArray(tenant.documents) ? tenant.documents : []
                    };
                    addDemoRecord('tenants', newTenant);
                    tenantIdMap.set(tenant.id, newTenant.id);
                } else {
                    const created = await API.createTenant({
                        name: tenant.name,
                        fatherName: tenant.father_name,
                        cnic: tenant.cnic,
                        location: tenant.location,
                        description: tenant.description || '',
                        propertyId: newPropertyId || undefined,
                        roomNumber: newPropertyId ? importedRoom : undefined,
                        mobileNumber: tenant.mobile_number || null,
                        advancePayment: tenant.advance_payment || 0,
                        leaseEndDate: tenant.lease_end_date || null,
                        profile_pic: tenant.profile_pic || null,
                        documents: Array.isArray(tenant.documents) ? tenant.documents : []
                    });
                    tenantIdMap.set(tenant.id, created.data.id);
                }
                existingCnics.add(tenant.cnic);
            }

            // Rebuild demo room occupancy after tenant IDs are known.
            if (isDemoMode()) {
                const store = getDemoStore();
                store.properties.forEach(property => {
                    property.rooms = makeRooms(property, store.tenants);
                });
            }

            // Payments are part of the full backup and must be restored too.
            const paymentKeys = new Set(currentPayments.map(p => `${p.tenant_id}|${p.month}|${p.year}`));
            let paymentsImported = 0;
            let paymentsSkipped = 0;
            for (const payment of (data.payments || [])) {
                const newTenantId = tenantIdMap.get(payment.tenant_id);
                if (!newTenantId) { paymentsSkipped++; continue; }
                const key = `${newTenantId}|${payment.month}|${payment.year}`;
                if (paymentKeys.has(key)) { paymentsSkipped++; continue; }

                const payload = {
                    tenantId: newTenantId,
                    month: Number(payment.month),
                    year: Number(payment.year),
                    monthlyRent: Number(payment.monthly_rent || 0),
                    electricity: Number(payment.electricity || 0),
                    gas: Number(payment.gas || 0),
                    previousDues: Number(payment.previous_dues || 0),
                    amountPaid: Number(payment.amount_paid || 0),
                    customCharges: Array.isArray(payment.custom_charges) ? payment.custom_charges : [],
                    status: payment.status || 'unpaid',
                    notes: payment.notes || ''
                };
                payload.totalPayment = payload.monthlyRent + payload.electricity + payload.gas + payload.previousDues;

                if (isDemoMode()) {
                    addDemoRecord('payments', {
                        ...payment,
                        id: generateDemoId('pay'),
                        tenant_id: newTenantId,
                        monthly_rent: payload.monthlyRent,
                        electricity: payload.electricity,
                        gas: payload.gas,
                        previous_dues: payload.previousDues,
                        total_payment: payload.totalPayment,
                        amount_paid: payload.status === 'paid' ? payload.totalPayment : payload.status === 'unpaid' ? 0 : payload.amountPaid,
                        custom_charges: payload.customCharges
                    });
                } else {
                    await API.createPayment(payload);
                }
                paymentKeys.add(key);
                paymentsImported++;
            }

            await App.loadData();
            App.renderCurrentView();
            Components.hideLoading();
            this.closePanel();
            showNotification(`Imported ${tenantIdMap.size} tenant(s), ${paymentsImported} payment(s)`, 'success');
        } catch (error) {
            Components.hideLoading();
            console.error('Import failed:', error);
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
