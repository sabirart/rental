// js/tenants.js - Complete Version with Room Dropdown

const Tenants = {
    async render() {
        await this.renderTable();
        this.setupEventListeners();
        this.populatePropertyFilter(App.state.properties);
    },
    
    getPaymentStatus(tenantId) {
        const payments = App.state.payments.filter(p => p.tenant_id === tenantId);
        
        if (payments.length === 0) {
            return '<span class="badge badge-warning">No Payment</span>';
        }
        
        const latestPayment = payments.reduce((a, b) => {
            if (a.year !== b.year) return a.year > b.year ? a : b;
            return a.month > b.month ? a : b;
        });
        
        if (latestPayment.status === 'paid') {
            return '<span class="badge badge-success">Paid</span>';
        } else if (latestPayment.status === 'partial') {
            return '<span class="badge badge-warning">Partial</span>';
        } else if (latestPayment.status === 'unpaid') {
            return '<span class="badge badge-danger">Unpaid</span>';
        }
        return '<span class="badge badge-info">' + escapeHTML(latestPayment.status) + '</span>';
    },

    async renderTable() {
        const tbody = document.getElementById('tenantsList');
        const tenants = App.state.tenants;
        const properties = App.state.properties;
        const payments = App.state.payments;
        
        this.populatePropertyFilter(properties);
        
        if (tenants.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="empty-state">No tenants added yet</td>
                </tr>
            `;
            return;
        }
        
        let html = '';
        for (const tenant of tenants) {
            const property = properties.find(p => p.id === tenant.property_id);
            const roomDisplay = property 
                ? `<div class="room-display">
                    <span class="property-name" title="${escapeHTML(property.name)}">${escapeHTML(property.name)}</span>
                    <span class="room-number">Room ${escapeHTML(String(tenant.room_number))}</span>
                   </div>`
                : `<div class="room-display">
                    <span class="property-name">Not assigned</span>
                   </div>`;
            
            const tenantPayments = payments.filter(p => p.tenant_id === tenant.id);
            const latestPayment = tenantPayments.length > 0 ? tenantPayments.reduce((a, b) => {
                if (a.year !== b.year) return a.year > b.year ? a : b;
                return a.month > b.month ? a : b;
            }) : null;

            const monthlyRent = latestPayment ? latestPayment.monthly_rent : (property ? property.base_rent : 0);
            const electricity = latestPayment ? (latestPayment.electricity || 0) : 0;
            const gas = latestPayment ? (latestPayment.gas || 0) : 0;
            const previousDues = latestPayment ? (latestPayment.previous_dues || 0) : 0;
            const totalWithoutDues = monthlyRent + electricity + gas;

            const profilePic = tenant.profile_pic 
                ? `<img src="${escapeHTML(tenant.profile_pic)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">`
                : `<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 500; color: var(--text-light);">${tenant.name ? escapeHTML(tenant.name.charAt(0).toUpperCase()) : '?'}</div>`;
            
            html += `
                <tr class="tenant-row-clickable" data-id="${escapeHTML(tenant.id)}" style="cursor: pointer;">
                    <td>${profilePic}</td>
                    <td><strong>${escapeHTML(tenant.name)}</strong></td>
                    <td>${roomDisplay}</td>
                    <td>${formatCurrency(monthlyRent)}</td>
                    <td>${formatCurrency(electricity)}</td>
                    <td>${formatCurrency(gas)}</td>
                    <td style="color: ${(latestPayment && (latestPayment.status === 'unpaid' || latestPayment.status === 'partial') && previousDues > 0) ? '#ff8c00' : 'inherit'}; font-weight: ${(latestPayment && (latestPayment.status === 'unpaid' || latestPayment.status === 'partial') && previousDues > 0) ? '600' : 'normal'};">${formatCurrency(previousDues)}</td>
                    <td>
                        ${latestPayment 
                            ? (latestPayment.status === 'unpaid' 
                                ? `<span class="badge badge-danger">Unpaid</span>`
                                : latestPayment.status === 'partial'
                                    ? `<strong style="color: #ff8c00;">${formatCurrency(totalWithoutDues)}</strong> <span style="color: var(--text-light); font-size: 0.7rem;">(P)</span>`
                                    : `<strong>${formatCurrency(totalWithoutDues)}</strong>`)
                            : `<span class="badge badge-warning">No Payment</span>`
                        }
                    </td>
                    <td>
                        <div class="action-dropdown">
                            <button class="action-dropdown-btn" data-id="${escapeHTML(tenant.id)}" aria-label="More actions" onclick="event.stopPropagation();">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="5" r="1.5"/>
                                    <circle cx="12" cy="12" r="1.5"/>
                                    <circle cx="12" cy="19" r="1.5"/>
                                </svg>
                            </button>
                            <div class="action-dropdown-menu" data-id="${escapeHTML(tenant.id)}">
                                <button class="dropdown-item view-details" data-id="${escapeHTML(tenant.id)}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                        <circle cx="12" cy="12" r="3"/>
                                    </svg>
                                    View Details
                                </button>
                                <button class="dropdown-item payment" data-id="${escapeHTML(tenant.id)}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="2" y="6" width="20" height="14" rx="2"/>
                                        <line x1="2" y1="10" x2="22" y2="10"/>
                                    </svg>
                                    Payment
                                </button>
                                <button class="dropdown-item edit" data-id="${escapeHTML(tenant.id)}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                    Edit
                                </button>
                                <button class="dropdown-item delete" data-id="${escapeHTML(tenant.id)}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    </svg>
                                    Delete
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }
        
        tbody.innerHTML = html;
        
        tbody.querySelectorAll('.tenant-row-clickable').forEach(row => {
            row.addEventListener('click', function(e) {
                if (e.target.closest('.action-dropdown') || e.target.closest('.action-dropdown-menu') || e.target.closest('.action-dropdown-btn')) {
                    return;
                }
                const tenantId = this.dataset.id;
                Tenants.openEditPayment(tenantId);
            });
        });

        tbody.querySelectorAll('.action-dropdown-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = btn.parentElement.querySelector('.action-dropdown-menu');
                document.querySelectorAll('.action-dropdown-menu.active').forEach(m => {
                    if (m !== menu) m.classList.remove('active');
                });
                menu.classList.toggle('active');
                
                if (menu.classList.contains('active')) {
                    const rect = btn.getBoundingClientRect();
                    const menuHeight = 160;
                    const spaceBelow = window.innerHeight - rect.bottom;
                    const spaceAbove = rect.top;
                    
                    if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
                        menu.style.top = (rect.top - menuHeight) + 'px';
                    } else {
                        menu.style.top = (rect.bottom + 2) + 'px';
                    }
                    
                    menu.style.left = (rect.right - 180) + 'px';
                    
                    const menuRect = menu.getBoundingClientRect();
                    if (menuRect.right > window.innerWidth - 10) {
                        menu.style.left = (window.innerWidth - menuRect.width - 10) + 'px';
                    }
                    if (menuRect.left < 10) {
                        menu.style.left = '10px';
                    }
                }
            });
        });
        
        tbody.querySelectorAll('.view-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.showDetails(id);
                btn.closest('.action-dropdown-menu').classList.remove('active');
            });
        });
        
        tbody.querySelectorAll('.payment').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.showPayment(id);
                btn.closest('.action-dropdown-menu').classList.remove('active');
            });
        });
        
        tbody.querySelectorAll('.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.editTenant(id);
                btn.closest('.action-dropdown-menu').classList.remove('active');
            });
        });
        
        tbody.querySelectorAll('.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.deleteTenant(id);
                btn.closest('.action-dropdown-menu').classList.remove('active');
            });
        });
        
        document.addEventListener('click', () => {
            document.querySelectorAll('.action-dropdown-menu.active').forEach(menu => {
                menu.classList.remove('active');
            });
        });
    },
    
    showPayment(id) {
        const tenant = App.state.tenants.find(t => t.id === id);
        if (!tenant) {
            showNotification('Tenant not found', 'error');
            return;
        }
        
        const allPayments = App.state.payments.filter(p => p.tenant_id === id);
        const property = App.state.properties.find(p => p.id === tenant.property_id);
        
        if (allPayments.length === 0) {
            App.closeModal();
            if (typeof Payments !== 'undefined') {
                Payments.showAddForm();
                setTimeout(() => {
                    const tenantSelect = document.getElementById('paymentTenant');
                    if (tenantSelect) {
                        tenantSelect.value = id;
                        const event = new Event('change');
                        tenantSelect.dispatchEvent(event);
                    }
                }, 100);
            } else {
                showNotification('Payments module not loaded', 'error');
            }
            return;
        }
        
        const years = [...new Set(allPayments.map(p => p.year))].sort((a, b) => b - a);
        const currentYear = getCurrentYear();
        const defaultYear = years.includes(currentYear) ? currentYear : years[0];
        
        const getMonthsForYear = (year) => {
            const months = [...new Set(allPayments.filter(p => p.year === year).map(p => p.month))].sort((a, b) => a - b);
            return months;
        };
        
        let currentMonth = getCurrentMonth();
        const monthsForDefaultYear = getMonthsForYear(defaultYear);
        if (!monthsForDefaultYear.includes(currentMonth)) {
            currentMonth = monthsForDefaultYear.length > 0 ? monthsForDefaultYear[monthsForDefaultYear.length - 1] : currentMonth;
        }
        
        let html = `
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <h4 style="margin: 0;">${escapeHTML(tenant.name)}</h4>
                        <p style="color: var(--text-light); font-size: 0.875rem; margin: 2px 0 0 0;">${property ? escapeHTML(property.name) : 'No Property'} - Room ${tenant.room_number || 'N/A'}</p>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; background: var(--bg); padding: 8px 12px; border-radius: var(--radius);">
                <button id="prevMonthBtn" class="nav-arrow-btn" style="background: none; border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; cursor: pointer; color: var(--text-light); font-size: 1rem; transition: var(--transition);" title="Previous Month (←)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                
                <select class="form-control" id="paymentYearFilterTenant" style="width: auto; padding: 4px 10px; font-size: 0.8rem; min-width: 80px;">
                    ${years.map(y => `<option value="${y}" ${y === defaultYear ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
                
                <span style="color: var(--text-light); font-weight: 300; font-size: 0.9rem;">/</span>
                
                <select class="form-control" id="paymentMonthFilterTenant" style="width: auto; padding: 4px 10px; font-size: 0.8rem; min-width: 100px;">
                    ${this.getMonthOptionsForYear(allPayments, defaultYear, currentMonth)}
                </select>
                
                <button id="nextMonthBtn" class="nav-arrow-btn" style="background: none; border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; cursor: pointer; color: var(--text-light); font-size: 1rem; transition: var(--transition);" title="Next Month (→)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                
                <span style="flex: 1;"></span>
                
                <button id="goToPaymentsBtn" class="btn btn-sm btn-outline" style="font-size: 0.7rem; padding: 4px 12px;" title="Go to Payments section">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12 5l7 7-7 7"/></svg>
                    More
                </button>
            </div>
            
            <div style="max-height: 400px; overflow-y: auto;" id="paymentHistoryList">
        `;
        
        html += this.renderPaymentListForMonth(allPayments, defaultYear, currentMonth);
        html += '</div>';
        
        App.openModal('Payment History', html);
        
        this._currentTenantId = id;
        this._allPayments = allPayments;
        this._years = years;
        this._currentYear = defaultYear;
        this._currentMonth = currentMonth;
        
        this.setupPaymentNavigation(allPayments);
        
        this._keydownHandler = (e) => {
            if (!document.getElementById('modal')?.classList.contains('active')) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prevBtn = document.getElementById('prevMonthBtn');
                if (prevBtn && !prevBtn.disabled) prevBtn.click();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                const nextBtn = document.getElementById('nextMonthBtn');
                if (nextBtn && !nextBtn.disabled) nextBtn.click();
            }
        };
        document.addEventListener('keydown', this._keydownHandler);
        
        const modal = document.getElementById('modal');
        if (modal) {
            modal._paymentNavigationCleanup = () => {
                document.removeEventListener('keydown', this._keydownHandler);
            };
        }
    },

    getMonthOptionsForYear(allPayments, year, selectedMonth) {
        const months = [...new Set(allPayments.filter(p => p.year === year).map(p => p.month))].sort((a, b) => a - b);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months.map(m => 
            `<option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${monthNames[m - 1] || m}</option>`
        ).join('');
    },

    setupPaymentNavigation(allPayments) {
        const yearSelect = document.getElementById('paymentYearFilterTenant');
        const monthSelect = document.getElementById('paymentMonthFilterTenant');
        const prevBtn = document.getElementById('prevMonthBtn');
        const nextBtn = document.getElementById('nextMonthBtn');
        const goToPaymentsBtn = document.getElementById('goToPaymentsBtn');
        const listContainer = document.getElementById('paymentHistoryList');
        
        if (!yearSelect || !monthSelect || !listContainer) return;
        
        const years = [...new Set(allPayments.map(p => p.year))].sort((a, b) => b - a);
        
        const getMonthsForYear = (year) => {
            return [...new Set(allPayments.filter(p => p.year === year).map(p => p.month))].sort((a, b) => a - b);
        };
        
        const updateMonthOptions = (year, selectedMonth = null) => {
            const months = getMonthsForYear(year);
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const currentValue = selectedMonth || parseInt(monthSelect.value) || months[months.length - 1];
            
            monthSelect.innerHTML = months.map(m => 
                `<option value="${m}" ${m === currentValue ? 'selected' : ''}>${monthNames[m - 1] || m}</option>`
            ).join('');
            
            if (!months.includes(currentValue) && months.length > 0) {
                monthSelect.value = months[months.length - 1];
            }
            
            return parseInt(monthSelect.value);
        };
        
        const renderPaymentsForMonth = (year, month) => {
            const filtered = allPayments.filter(p => p.year === year && p.month === month);
            listContainer.innerHTML = Tenants.renderPaymentList(filtered);
            
            const months = getMonthsForYear(year);
            const currentIndex = months.indexOf(month);
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            if (prevBtn) {
                const hasPrev = currentIndex > 0 || years.some(y => y < year && getMonthsForYear(y).length > 0);
                prevBtn.style.opacity = hasPrev ? '1' : '0.3';
                prevBtn.disabled = !hasPrev;
            }
            
            if (nextBtn) {
                const hasNext = currentIndex < months.length - 1 || years.some(y => y > year && getMonthsForYear(y).length > 0);
                nextBtn.style.opacity = hasNext ? '1' : '0.3';
                nextBtn.disabled = !hasNext;
            }
        };
        
        yearSelect.addEventListener('change', function() {
            const year = parseInt(this.value);
            const month = updateMonthOptions(year);
            Tenants._currentYear = year;
            Tenants._currentMonth = month;
            renderPaymentsForMonth(year, month);
        });
        
        monthSelect.addEventListener('change', function() {
            const year = parseInt(yearSelect.value);
            const month = parseInt(this.value);
            Tenants._currentMonth = month;
            renderPaymentsForMonth(year, month);
        });
        
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                const year = parseInt(yearSelect.value);
                const month = parseInt(monthSelect.value);
                const months = getMonthsForYear(year);
                const currentIndex = months.indexOf(month);
                
                if (currentIndex > 0) {
                    const newMonth = months[currentIndex - 1];
                    monthSelect.value = newMonth;
                    Tenants._currentMonth = newMonth;
                    renderPaymentsForMonth(year, newMonth);
                } else {
                    const yearIndex = years.indexOf(year);
                    if (yearIndex < years.length - 1) {
                        const prevYear = years[yearIndex + 1];
                        const prevMonths = getMonthsForYear(prevYear);
                        if (prevMonths.length > 0) {
                            yearSelect.value = prevYear;
                            const newMonth = updateMonthOptions(prevYear, prevMonths[prevMonths.length - 1]);
                            Tenants._currentYear = prevYear;
                            Tenants._currentMonth = newMonth;
                            renderPaymentsForMonth(prevYear, newMonth);
                        }
                    }
                }
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                const year = parseInt(yearSelect.value);
                const month = parseInt(monthSelect.value);
                const months = getMonthsForYear(year);
                const currentIndex = months.indexOf(month);
                
                if (currentIndex < months.length - 1) {
                    const newMonth = months[currentIndex + 1];
                    monthSelect.value = newMonth;
                    Tenants._currentMonth = newMonth;
                    renderPaymentsForMonth(year, newMonth);
                } else {
                    const yearIndex = years.indexOf(year);
                    if (yearIndex > 0) {
                        const nextYear = years[yearIndex - 1];
                        const nextMonths = getMonthsForYear(nextYear);
                        if (nextMonths.length > 0) {
                            yearSelect.value = nextYear;
                            const newMonth = updateMonthOptions(nextYear, nextMonths[0]);
                            Tenants._currentYear = nextYear;
                            Tenants._currentMonth = newMonth;
                            renderPaymentsForMonth(nextYear, newMonth);
                        }
                    }
                }
            });
        }
        
        if (goToPaymentsBtn) {
            goToPaymentsBtn.addEventListener('click', function() {
                App.closeModal();
                document.querySelector('[data-view="payments"]')?.click();
                setTimeout(() => {
                    const tenantSearch = document.querySelector('#payments .search-input');
                    if (tenantSearch && Tenants._currentTenantId) {
                        const tenant = App.state.tenants.find(t => t.id === Tenants._currentTenantId);
                        if (tenant) {
                            tenantSearch.value = tenant.name;
                            const event = new Event('input');
                            tenantSearch.dispatchEvent(event);
                        }
                    }
                }, 300);
            });
        }
        
        const initialYear = parseInt(yearSelect.value);
        const initialMonth = parseInt(monthSelect.value);
        renderPaymentsForMonth(initialYear, initialMonth);
    },

    renderPaymentList(payments) {
        const sorted = [...payments].sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.month - a.month;
        });
        
        if (sorted.length === 0) {
            return '<div style="text-align: center; padding: 30px; color: var(--text-lighter);">No payments found for this period</div>';
        }
        
        let html = '';
        sorted.forEach(payment => {
            const total = (payment.monthly_rent || 0) + (payment.electricity || 0) + (payment.gas || 0) + (payment.previous_dues || 0);
            const statusBadge = payment.status === 'paid' 
                ? '<span class="badge badge-success">Paid</span>'
                : payment.status === 'partial' 
                    ? '<span class="badge badge-warning">Partial</span>'
                    : '<span class="badge badge-danger">Unpaid</span>';
            
            html += `
                <div class="payment-history-item" onclick="Tenants.editPayment('${escapeHTML(payment.id)}')" style="
                    border: 1px solid var(--border-light);
                    border-radius: 8px;
                    padding: 12px 16px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    transition: background 0.15s ease;
                " onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <strong>${escapeHTML(getMonthName(payment.month))} ${payment.year}</strong>
                            ${statusBadge}
                        </div>
                        <div>
                            <span style="font-weight: 600; font-size: 1.1rem;">${formatCurrency(total)}</span>
                            <span style="margin-left: 8px; font-size: 0.7rem; color: var(--text-light);">✎</span>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px 16px; font-size: 0.8rem; color: var(--text-light); padding-top: 8px; margin-top: 6px; border-top: 1px solid var(--border-light);">
                        <div><span style="color: var(--text-light);">Rent:</span> <span style="color: var(--text); font-weight: 450;">${formatCurrency(payment.monthly_rent || 0)}</span></div>
                        <div><span style="color: var(--text-light);">Electric:</span> <span style="color: var(--text); font-weight: 450;">${formatCurrency(payment.electricity || 0)}</span></div>
                        <div><span style="color: var(--text-light);">Gas:</span> <span style="color: var(--text); font-weight: 450;">${formatCurrency(payment.gas || 0)}</span></div>
                        <div><span style="color: var(--text-light);">Dues:</span> <span style="color: var(--text); font-weight: 450;">${formatCurrency(payment.previous_dues || 0)}</span></div>
                    </div>
                    ${payment.notes ? `<div style="font-size: 0.75rem; color: var(--text-lighter); margin-top: 6px; padding-top: 4px; border-top: 1px solid var(--border-light);">${escapeHTML(payment.notes)}</div>` : ''}
                </div>
            `;
        });
        
        return html;
    },

    renderPaymentListForMonth(allPayments, year, month) {
        const filtered = allPayments.filter(p => p.year === year && p.month === month);
        return this.renderPaymentList(filtered);
    },
    
    openEditPayment(id) {
        const tenant = App.state.tenants.find(t => t.id === id);
        if (!tenant) {
            showNotification('Tenant not found', 'error');
            return;
        }
        
        const tenantPayments = App.state.payments.filter(p => p.tenant_id === id);
        
        if (tenantPayments.length === 0) {
            this.closeDetails();
            if (typeof Payments !== 'undefined') {
                App.closeModal();
                Payments.showAddForm();
                setTimeout(() => {
                    const tenantSelect = document.getElementById('paymentTenant');
                    if (tenantSelect) {
                        tenantSelect.value = id;
                        const event = new Event('change');
                        tenantSelect.dispatchEvent(event);
                    }
                }, 100);
            } else {
                showNotification('Payments module not loaded', 'error');
            }
            return;
        }
        
        const latestPayment = tenantPayments.reduce((a, b) => {
            if (a.year !== b.year) return a.year > b.year ? a : b;
            return a.month > b.month ? a : b;
        });
        
        if (typeof Payments !== 'undefined') {
            Payments.editPayment(latestPayment.id, tenant.id);
        } else {
            showNotification('Payments module not loaded', 'error');
        }
    },
    
    async editPayment(id) {
        App.closeModal();
        if (typeof Payments !== 'undefined') {
            const payment = App.state.payments.find(p => p.id === id);
            if (payment) {
                await Payments.editPayment(id, payment.tenant_id);
            } else {
                await Payments.editPayment(id);
            }
        } else {
            showNotification('Payments module not loaded', 'error');
        }
    },
    
    setupEventListeners() {
        document.getElementById('addTenantBtn').addEventListener('click', () => {
            this.showAddForm();
        });
        
        document.getElementById('tenantSearch').addEventListener('input', debounce((e) => {
            this.filterTenants(e.target.value);
        }, 300));
        
        document.getElementById('tenantFilter').addEventListener('change', (e) => {
            this.filterTenants(document.getElementById('tenantSearch').value, e.target.value);
        });
        
        document.getElementById('tenantPropertyFilter').addEventListener('change', (e) => {
            this.filterTenants(document.getElementById('tenantSearch').value, document.getElementById('tenantFilter').value);
        });
    },
    
    filterTenants(search, filter = 'all') {
        const rows = document.querySelectorAll('#tenantsList tr');
        const propertyFilter = document.getElementById('tenantPropertyFilter').value;
        
        rows.forEach(row => {
            if (row.querySelector('.empty-state')) return;
            const name = row.querySelector('td:nth-child(2)')?.textContent?.toLowerCase() || '';
            const tenantId = row.dataset.id;
            
            let paymentStatus = 'no-payment';
            const tenantPayments = App.state.payments.filter(p => p.tenant_id === tenantId);
            if (tenantPayments.length > 0) {
                const latestPayment = tenantPayments.reduce((a, b) => {
                    if (a.year !== b.year) return a.year > b.year ? a : b;
                    return a.month > b.month ? a : b;
                });
                paymentStatus = latestPayment.status || 'no-payment';
            }
            
            const tenant = App.state.tenants.find(t => t.id === tenantId);
            const tenantPropertyId = tenant ? tenant.property_id : null;
            
            const matchesSearch = name.includes(search.toLowerCase());
            const matchesPaymentFilter = filter === 'all' || paymentStatus === filter;
            const matchesPropertyFilter = propertyFilter === 'all' || tenantPropertyId === propertyFilter;
            
            row.style.display = (matchesSearch && matchesPaymentFilter && matchesPropertyFilter) ? '' : 'none';
        });
    },
    
    populatePropertyFilter(properties) {
        const propertyFilter = document.getElementById('tenantPropertyFilter');
        if (!propertyFilter) return;
        
        const currentValue = propertyFilter.value;
        propertyFilter.innerHTML = '<option value="all">All Properties</option>';
        
        properties.forEach(property => {
            const option = document.createElement('option');
            option.value = property.id;
            option.textContent = property.name;
            propertyFilter.appendChild(option);
        });
        
        if (currentValue && properties.some(p => p.id === currentValue)) {
            propertyFilter.value = currentValue;
        }
    },

    showDetails(id) {
        const tenant = App.state.tenants.find(t => t.id === id);
        if (!tenant) {
            showNotification('Tenant not found', 'error');
            return;
        }
        
        const property = App.state.properties.find(p => p.id === tenant.property_id);
        const roomInfo = property ? `${escapeHTML(property.name)} - Room ${escapeHTML(String(tenant.room_number))}` : 'Not assigned';
        
        const moveInDate = new Date(tenant.created_at);
        const now = new Date();
        const monthsDiff = (now.getFullYear() - moveInDate.getFullYear()) * 12 + (now.getMonth() - moveInDate.getMonth());
        const years = Math.floor(monthsDiff / 12);
        const months = monthsDiff % 12;
        
        let stayDuration = 'Less than a month';
        if (years > 0 && months > 0) {
            stayDuration = `${years} year${years > 1 ? 's' : ''} and ${months} month${months > 1 ? 's' : ''}`;
        } else if (years > 0) {
            stayDuration = `${years} year${years > 1 ? 's' : ''}`;
        } else if (months > 0) {
            stayDuration = `${months} month${months > 1 ? 's' : ''}`;
        }
        
        const documents = tenant.documents || [];
        const docCount = documents.length;
        
        let documentsHtml = '';
        if (docCount > 0) {
            documentsHtml = documents.map((doc) => `
                <div class="detail-doc-item">
                    <span>📄 ${escapeHTML(doc.name)}</span>
                    <span class="detail-doc-size">${getFileSize(doc.size)}</span>
                    <button class="btn btn-sm btn-outline" onclick="Tenants.viewDocuments('${escapeHTML(tenant.id)}')">View</button>
                </div>
            `).join('');
        } else {
            documentsHtml = '<span class="detail-empty">No documents uploaded</span>';
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'tenant-details-overlay';
        overlay.id = 'tenantDetailsOverlay';
        
        overlay.innerHTML = `
            <div class="tenant-details-box">
                <button class="tenant-details-close" onclick="Tenants.closeDetails()">&times;</button>
                
                <div class="tenant-details-header">
                    <div class="tenant-details-header-left">
                        ${tenant.profile_pic 
                            ? `<img src="${escapeHTML(tenant.profile_pic)}" class="tenant-details-avatar">`
                            : `<div class="tenant-details-avatar-placeholder">${escapeHTML(tenant.name.charAt(0).toUpperCase())}</div>`
                        }
                        <div class="tenant-details-name-section">
                            <h2>${escapeHTML(tenant.name)}</h2>
                            <p class="tenant-details-address">${roomInfo}</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-shrink: 0;">
                        <button class="btn btn-primary btn-sm" onclick="Tenants.closeDetails(); Tenants.openEditPayment('${escapeHTML(tenant.id)}')">Payment</button>
                        <button class="btn btn-outline btn-sm" onclick="Tenants.closeDetails(); Tenants.editTenant('${escapeHTML(tenant.id)}')">Edit</button>
                    </div>
                </div>
                
                <div class="tenant-details-grid">
                    <div class="detail-item">
                        <span class="detail-label">Father Name</span>
                        <span class="detail-value">${escapeHTML(tenant.father_name)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">CNIC</span>
                        <span class="detail-value">${escapeHTML(tenant.cnic)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Location</span>
                        <span class="detail-value">${escapeHTML(tenant.location)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Payment Status</span>
                        <span class="detail-value">${this.getPaymentStatus(tenant.id)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Property</span>
                        <span class="detail-value">${property ? escapeHTML(property.name) : 'Not assigned'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Room Number</span>
                        <span class="detail-value">${tenant.room_number ? escapeHTML(String(tenant.room_number)) : 'Not assigned'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Tenant Since</span>
                        <span class="detail-value">${formatDate(tenant.created_at)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Duration</span>
                        <span class="detail-value">${stayDuration}</span>
                    </div>
                </div>
                
                ${tenant.description ? `
                <div class="tenant-details-description">
                    <span class="detail-label">Description</span>
                    <p>${escapeHTML(tenant.description)}</p>
                </div>
                ` : ''}
                
                <div class="tenant-details-documents">
                    <span class="detail-label">Documents (${docCount})</span>
                    <div class="detail-documents-list">
                        ${documentsHtml}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeDetails();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        overlay._escapeHandler = escapeHandler;
    },
    
    closeDetails() {
        const overlay = document.getElementById('tenantDetailsOverlay');
        if (overlay) {
            if (overlay._escapeHandler) {
                document.removeEventListener('keydown', overlay._escapeHandler);
            }
            overlay.remove();
        }
        document.body.style.overflow = '';
    },
    
    showAddForm() {
        const properties = App.state.properties || [];
        
        if (!properties || properties.length === 0) {
            const noPropertyForm = `
                <div style="padding: 40px 20px; text-align: center;">
                    <p style="font-size: 1.1rem; margin-bottom: 12px; color: var(--text);">No Properties Available</p>
                    <p style="color: var(--text-light); margin-bottom: 20px;">You need to add a property before adding a tenant.</p>
                    <button class="btn btn-primary" onclick="
                        App.closeModal(); 
                        document.querySelector('[data-view=\\'properties\\']').click();
                        setTimeout(() => Properties.showAddForm(), 300);
                    ">
                        Add Property First
                    </button>
                </div>
            `;
            App.openModal('Add Tenant', noPropertyForm);
            return;
        }
        
        let propertyOptions = '<option value="">-- Select Property --</option>';
        properties.forEach(p => {
            propertyOptions += `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)} (${p.total_rooms || 0} rooms)</option>`;
        });
        
        const form = `
            <form id="tenantForm" enctype="multipart/form-data" style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: flex; gap: 20px; align-items: flex-start;">
                    <div class="settings-form-group" style="flex: 0 0 auto; text-align: center;">
                        <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Profile Picture</label>
                        <div onclick="document.getElementById('tenantProfilePic').click()" style="width: 100px; height: 100px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; font-weight: 500; color: var(--text-light); cursor: pointer; border: 2px dashed var(--border); overflow: hidden; margin: 0 auto;">
                            <span id="profilePicPlaceholder">+</span>
                            <img id="profilePicPreviewImg" style="display: none; width: 100%; height: 100%; object-fit: cover;" src="">
                        </div>
                        <input type="file" id="tenantProfilePic" accept="image/*" style="display: none;" onchange="Tenants.previewProfilePic(event)">
                        <small style="color: var(--text-light); font-size: 0.7rem; display: block; margin-top: 6px; text-align: center;">Click to upload</small>
                    </div>

                    <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="settings-form-group">
                                <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Name <span class="required" style="color: #dc3545;">*</span></label>
                                <input type="text" class="form-control" id="tenantName" required>
                            </div>
                            <div class="settings-form-group">
                                <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Father Name <span class="required" style="color: #dc3545;">*</span></label>
                                <input type="text" class="form-control" id="tenantFatherName" required>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="settings-form-group">
                                <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">CNIC <span class="required" style="color: #dc3545;">*</span></label>
                                <input type="text" class="form-control" id="tenantCnic" placeholder="XXXXX-XXXXXXX-X" required>
                                <small style="color: var(--text-light); font-size: 0.65rem; display: block; margin-top: 2px;">Format: 12345-1234567-8</small>
                            </div>
                            <div class="settings-form-group">
                                <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Original Location <span class="required" style="color: #dc3545;">*</span></label>
                                <input type="text" class="form-control" id="tenantLocation" required>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="settings-form-group">
                    <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px; cursor: pointer;" onclick="Tenants.toggleDescription()">
                        <span id="descriptionToggleIcon">▶</span> Add Description
                    </label>
                    <div id="descriptionContainer" style="display: none; margin-top: 4px;">
                        <textarea class="form-control" id="tenantDescription" rows="2"></textarea>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="settings-form-group">
                        <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Property <span class="required" style="color: #dc3545;">*</span></label>
                        <select class="form-control" id="tenantProperty" required>
                            ${propertyOptions}
                        </select>
                    </div>
                    <div class="settings-form-group">
                        <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Room Number <span class="required" style="color: #dc3545;">*</span></label>
                        <select class="form-control" id="tenantRoomSelect" required>
                            <option value="">-- Select Room --</option>
                        </select>
                    </div>
                </div>

                <div class="settings-form-group">
                    <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Upload Documents</label>
                    <input type="file" class="form-control" id="tenantDocuments" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" multiple>
                    <small style="color: var(--text-light); font-size: 0.7rem; display: block; margin-top: 4px;">Upload PDF, DOC, DOCX, or Images (Max 5 files, 5MB each)</small>
                </div>

                <div class="settings-form-actions" style="display: flex; gap: 12px; justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--border-light); margin-top: 4px;">
                    <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Tenant</button>
                </div>
            </form>
        `;
        
        App.openModal('Add Tenant', form);
        
        setTimeout(async () => {
            document.querySelectorAll('#tenantForm input[type="number"]').forEach(input => {
                input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
            });
            
            // Populate room dropdown when property changes
            const propertySelect = document.getElementById('tenantProperty');
            if (propertySelect) {
            propertySelect.addEventListener('change', async function() {
                const propertyId = this.value;
                const roomSelect = document.getElementById('tenantRoomSelect');
                
                if (!propertyId) {
                    roomSelect.innerHTML = '<option value="">-- Select Room --</option>';
                    return;
                }
                
                // Check if user is authenticated first
                if (!Auth.isAuthenticated) {
                    roomSelect.innerHTML = '<option value="" disabled>Please login first</option>';
                    showNotification('Please login to load rooms', 'warning');
                    return;
                }
                
                try {
                    // Show loading state
                    roomSelect.innerHTML = '<option value="">Loading rooms...</option>';
                    roomSelect.disabled = true;
                    
                    const roomsData = await API.getPropertyRooms(propertyId);
                    const rooms = roomsData.data || [];
                    
                    roomSelect.innerHTML = '<option value="">-- Select Room --</option>';
                    
                    const availableRooms = rooms.filter(r => r.status !== 'occupied');
                    
                    if (availableRooms.length === 0) {
                        roomSelect.innerHTML += '<option value="" disabled>No available rooms</option>';
                    } else {
                        availableRooms.forEach(room => {
                            const roomLabel = room.room_name || `Room ${room.room_number}`;
                            const rentDisplay = room.rent_amount ? ` (${formatCurrency(room.rent_amount)})` : '';
                            roomSelect.innerHTML += `<option value="${room.room_number}">${escapeHTML(roomLabel)}${rentDisplay}</option>`;
                        });
                    }
                    
                    roomSelect.disabled = false;
                    
                } catch (error) {
                    console.error('Failed to load rooms:', error);
                    
                    // Check if error is authentication related
                    if (error.message && (error.message.includes('Authentication') || 
                        error.message.includes('login') || 
                        error.message.includes('401'))) {
                        roomSelect.innerHTML = '<option value="" disabled>Please login first</option>';
                        showNotification('Please login to load rooms', 'warning');
                    } else {
                        // FALLBACK: If API fails, generate dummy rooms based on property total_rooms
                        const property = App.state.properties.find(p => p.id === propertyId);
                        if (property && property.total_rooms) {
                            roomSelect.innerHTML = '<option value="">-- Select Room --</option>';
                            for (let i = 1; i <= property.total_rooms; i++) {
                                const isOccupied = App.state.tenants.some(t => t.property_id === propertyId && t.room_number === i);
                                if (!isOccupied) {
                                    roomSelect.innerHTML += `<option value="${i}">Room ${i}</option>`;
                                }
                            }
                            if (roomSelect.options.length <= 1) {
                                roomSelect.innerHTML += '<option value="" disabled>No available rooms</option>';
                            }
                            showNotification('Using cached room data. Please login for full access.', 'warning');
                        } else {
                            roomSelect.innerHTML = '<option value="" disabled>Error loading rooms</option>';
                            showNotification('Failed to load rooms. Please try again.', 'error');
                        }
                    }
                    roomSelect.disabled = false;
                }
            });
        }
            
            // Trigger initial room load if property is pre-selected
            const initialProperty = document.getElementById('tenantProperty').value;
            if (initialProperty) {
                document.getElementById('tenantProperty').dispatchEvent(new Event('change'));
            }
        }, 100);
        
        document.getElementById('tenantForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveTenant();
        });
    },

    async saveTenant() {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to add tenants.',
                'Login',
                'primary',
                () => {
                    window.location.href = 'index.html?show=login';
                }
            );
            return;
        }
        const name = document.getElementById('tenantName').value.trim();
        const fatherName = document.getElementById('tenantFatherName').value.trim();
        const cnic = document.getElementById('tenantCnic').value.trim();
        const location = document.getElementById('tenantLocation').value.trim();
        const description = document.getElementById('tenantDescription').value.trim();
        const propertyId = document.getElementById('tenantProperty').value;
        const roomNumber = parseInt(document.getElementById('tenantRoomSelect').value);
        
        const profilePicFile = document.getElementById('tenantProfilePic').files[0];
        const documentFiles = document.getElementById('tenantDocuments').files;
        
        if (!name || !fatherName || !cnic || !location) {
            showNotification('Please fill all required fields', 'error');
            return;
        }
        
        if (!propertyId) {
            showNotification('Please select a property', 'error');
            return;
        }
        
        if (!roomNumber || roomNumber < 1) {
            showNotification('Please select a room', 'error');
            return;
        }
        
        if (!validateCNIC(cnic)) {
            showNotification('Invalid CNIC format. Use: XXXXX-XXXXXXX-X', 'error');
            return;
        }
        
        if (profilePicFile) {
            if (!validateFileSize(profilePicFile, 5)) {
                showNotification('Profile picture too large. Max 5MB allowed.', 'error');
                return;
            }
            if (!validateFileType(profilePicFile)) {
                showNotification('Invalid profile picture format. Use JPG, PNG, or GIF.', 'error');
                return;
            }
        }
        
        if (documentFiles.length > 5) {
            showNotification('Maximum 5 documents allowed.', 'error');
            return;
        }
        
        for (let i = 0; i < documentFiles.length; i++) {
            if (!validateFileSize(documentFiles[i], 5)) {
                showNotification(`Document "${documentFiles[i].name}" too large. Max 5MB allowed.`, 'error');
                return;
            }
        }
        
        try {
            let profilePicBase64 = null;
            if (profilePicFile) {
                profilePicBase64 = await this.fileToBase64(profilePicFile);
            }
            
            const documents = [];
            for (let i = 0; i < Math.min(documentFiles.length, 5); i++) {
                const file = documentFiles[i];
                const fileData = await this.fileToBase64(file);
                documents.push({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    data: fileData
                });
            }
            
            await API.createTenant({
                name,
                fatherName,
                cnic,
                location,
                description,
                propertyId,
                roomNumber,
                profile_pic: profilePicBase64,
                documents: documents
            });
            
            await App.loadData();
            App.closeModal();
            await this.render();
            showNotification('Tenant added successfully', 'success');
        } catch (error) {
            console.error('Error saving tenant:', error);
            showNotification(error.message || 'Failed to add tenant', 'error');
        }
    },
    
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    },
    
    previewProfilePic(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('profilePicPreviewImg');
            const placeholder = document.getElementById('profilePicPlaceholder');
            if (img && placeholder) {
                img.src = e.target.result;
                img.style.display = 'block';
                placeholder.style.display = 'none';
            }
        };
        reader.readAsDataURL(file);
    },

    toggleDescription() {
        const container = document.getElementById('descriptionContainer');
        const icon = document.getElementById('descriptionToggleIcon');
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

    async editTenant(id) {
        const tenant = App.state.tenants.find(t => t.id === id);
        if (!tenant) {
            showNotification('Tenant not found', 'error');
            return;
        }
        
        let properties = App.state.properties;
        
        if (!properties || properties.length === 0) {
            showNotification('Loading properties...', 'info');
            try {
                const response = await API.getProperties();
                properties = response.data || [];
                App.state.properties = properties;
                App.saveToLocalStorage();
            } catch (error) {
                console.error('Failed to load properties:', error);
                showNotification('Failed to load properties. Please refresh.', 'error');
                return;
            }
        }
        
        let propertyOptions = '<option value="">Select Property</option>';
        if (properties && properties.length > 0) {
            properties.forEach(p => {
                const selected = p.id === tenant.property_id ? 'selected' : '';
                propertyOptions += `<option value="${escapeHTML(p.id)}" ${selected}>${escapeHTML(p.name)} (${p.total_rooms || 0} rooms)</option>`;
            });
        } else {
            propertyOptions = '<option value="">No properties available</option>';
        }
        
        const docCount = tenant.documents ? tenant.documents.length : 0;
        
        const form = `
            <form id="tenantForm" enctype="multipart/form-data" style="display: flex; flex-direction: column; gap: 16px;">
                <input type="hidden" id="tenantId" value="${escapeHTML(tenant.id)}">
                
                <div style="display: flex; gap: 20px; align-items: flex-start;">
                    <div class="settings-form-group" style="flex: 0 0 auto; text-align: center;">
                        <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Profile Picture</label>
                        <div onclick="document.getElementById('tenantProfilePic').click()" style="width: 100px; height: 100px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; font-weight: 500; color: var(--text-light); cursor: pointer; border: 2px dashed var(--border); overflow: hidden; margin: 0 auto;">
                            ${tenant.profile_pic 
                                ? `<img id="profilePicPreviewImg" style="width: 100%; height: 100%; object-fit: cover; display: block;" src="${escapeHTML(tenant.profile_pic)}">` 
                                : `<span id="profilePicPlaceholder">+</span>`
                            }
                        </div>
                        <input type="file" id="tenantProfilePic" accept="image/*" style="display: none;" onchange="Tenants.previewProfilePic(event)">
                        <small style="color: var(--text-light); font-size: 0.7rem; display: block; margin-top: 6px; text-align: center;">Click to upload</small>
                    </div>

                    <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="settings-form-group">
                                <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Name <span class="required" style="color: #dc3545;">*</span></label>
                                <input type="text" class="form-control" id="tenantName" value="${escapeHTML(tenant.name)}" required>
                            </div>
                            <div class="settings-form-group">
                                <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Father Name <span class="required" style="color: #dc3545;">*</span></label>
                                <input type="text" class="form-control" id="tenantFatherName" value="${escapeHTML(tenant.father_name)}" required>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="settings-form-group">
                                <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">CNIC <span class="required" style="color: #dc3545;">*</span></label>
                                <input type="text" class="form-control" id="tenantCnic" value="${escapeHTML(tenant.cnic)}" required>
                                <small style="color: var(--text-light); font-size: 0.65rem; display: block; margin-top: 2px;">Format: 12345-1234567-8</small>
                            </div>
                            <div class="settings-form-group">
                                <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Original Location <span class="required" style="color: #dc3545;">*</span></label>
                                <input type="text" class="form-control" id="tenantLocation" value="${escapeHTML(tenant.location)}" required>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="settings-form-group">
                    <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px; cursor: pointer;" onclick="Tenants.toggleDescription()">
                        <span id="descriptionToggleIcon">▶</span> Change Description
                    </label>
                    <div id="descriptionContainer" style="display: none; margin-top: 4px;">
                        <textarea class="form-control" id="tenantDescription" rows="2">${escapeHTML(tenant.description || '')}</textarea>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="settings-form-group">
                        <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Property <span class="required" style="color: #dc3545;">*</span></label>
                        <select class="form-control" id="tenantProperty" required>
                            ${propertyOptions}
                        </select>
                        ${properties && properties.length === 0 ? '<small style="color: #dc3545; display: block; margin-top: 4px;">No properties available. Please add a property first.</small>' : ''}
                    </div>
                    <div class="settings-form-group">
                        <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Room Number <span class="required" style="color: #dc3545;">*</span></label>
                        <select class="form-control" id="tenantRoomSelect" required>
                            <option value="">-- Select Room --</option>
                        </select>
                    </div>
                </div>

                <div class="settings-form-group">
                    <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Status</label>
                    <select class="form-control" id="tenantStatus">
                        <option value="active" ${tenant.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${tenant.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>

                <div class="settings-form-group">
                    <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Upload New Documents</label>
                    <input type="file" class="form-control" id="tenantDocuments" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" multiple>
                    <small style="color: var(--text-light); font-size: 0.7rem; display: block; margin-top: 4px;">Current documents: ${docCount} file(s). Upload to add more. (Max 5MB each)</small>
                </div>
                
                ${docCount > 0 ? `
                <div class="settings-form-group">
                    <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-light); font-weight: 500; display: block; margin-bottom: 4px;">Current Documents</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${tenant.documents.map((doc, index) => `
                            <span style="background: var(--bg); padding: 4px 12px; border-radius: 4px; font-size: 0.8rem; display: flex; align-items: center; gap: 8px;">
                                ${escapeHTML(doc.name)}
                                <button type="button" onclick="Tenants.removeDocument('${escapeHTML(tenant.id)}', ${index})" style="background: none; border: none; color: #dc3545; cursor: pointer; font-size: 1rem;">×</button>
                            </span>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="settings-form-actions" style="display: flex; gap: 12px; justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--border-light); margin-top: 4px;">
                    <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Update Tenant</button>
                </div>
            </form>
        `;
        
        App.openModal('Edit Tenant', form);
        
        setTimeout(async () => {
            document.querySelectorAll('#tenantForm input[type="number"]').forEach(input => {
                input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
            });
            
            // Populate room dropdown when property changes
            const propertySelect = document.getElementById('tenantProperty');
            const currentTenantId = document.getElementById('tenantId').value;
            const currentTenant = App.state.tenants.find(t => t.id === currentTenantId);
            
            if (propertySelect) {
            propertySelect.addEventListener('change', async function() {
                const propertyId = this.value;
                const roomSelect = document.getElementById('tenantRoomSelect');
                
                if (!propertyId) {
                    roomSelect.innerHTML = '<option value="">-- Select Room --</option>';
                    return;
                }
                
                // Check if user is authenticated first
                if (!Auth.isAuthenticated) {
                    roomSelect.innerHTML = '<option value="" disabled>Please login first</option>';
                    showNotification('Please login to load rooms', 'warning');
                    return;
                }
                
                try {
                    // Show loading state
                    roomSelect.innerHTML = '<option value="">Loading rooms...</option>';
                    roomSelect.disabled = true;
                    
                    const roomsData = await API.getPropertyRooms(propertyId);
                    const rooms = roomsData.data || [];
                    
                    roomSelect.innerHTML = '<option value="">-- Select Room --</option>';
                    
                    const currentTenantId = document.getElementById('tenantId').value;
                    const currentTenant = App.state.tenants.find(t => t.id === currentTenantId);
                    
                    rooms.forEach(room => {
                        const isOccupied = room.status === 'occupied' && room.tenant_id !== currentTenantId;
                        const isCurrentTenantRoom = room.tenant_id === currentTenantId;
                        const roomLabel = room.room_name || `Room ${room.room_number}`;
                        const rentDisplay = room.rent_amount ? ` (${formatCurrency(room.rent_amount)})` : '';
                        
                        if (!isOccupied || isCurrentTenantRoom) {
                            const selected = room.room_number === currentTenant?.room_number ? 'selected' : '';
                            roomSelect.innerHTML += `<option value="${room.room_number}" ${selected}>${escapeHTML(roomLabel)}${rentDisplay}</option>`;
                        }
                    });
                    
                    roomSelect.disabled = false;
                    
                    if (!roomSelect.querySelector('[selected]') && roomSelect.options.length > 1) {
                        roomSelect.selectedIndex = 1;
                    }
                    
                } catch (error) {
                    console.error('Failed to load rooms:', error);
                    
                    // Check if error is authentication related
                    if (error.message && (error.message.includes('Authentication') || 
                        error.message.includes('login') || 
                        error.message.includes('401'))) {
                        roomSelect.innerHTML = '<option value="" disabled>Please login first</option>';
                        showNotification('Please login to load rooms', 'warning');
                    } else {
                        roomSelect.innerHTML = '<option value="">Error loading rooms</option>';
                        showNotification('Failed to load rooms. Please try again.', 'error');
                    }
                    roomSelect.disabled = false;
                }
            });
        }

            
            // Trigger initial room load with current tenant's property
            if (currentTenant?.property_id) {
                propertySelect.value = currentTenant.property_id;
                propertySelect.dispatchEvent(new Event('change'));
            }
        }, 100);
        
        document.getElementById('tenantForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updateTenant();
        });
    },
    
    async updateTenant() {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to update tenants.',
                'Login',
                'primary',
                () => {
                    window.location.href = 'index.html?show=login';
                }
            );
            return;
        }
        const id = document.getElementById('tenantId').value;
        const name = document.getElementById('tenantName').value.trim();
        const fatherName = document.getElementById('tenantFatherName').value.trim();
        const cnic = document.getElementById('tenantCnic').value.trim();
        const location = document.getElementById('tenantLocation').value.trim();
        const description = document.getElementById('tenantDescription').value.trim();
        const propertyId = document.getElementById('tenantProperty').value;
        const roomNumber = parseInt(document.getElementById('tenantRoomSelect').value);
        const status = document.getElementById('tenantStatus').value;
        
        const profilePicFile = document.getElementById('tenantProfilePic').files[0];
        const documentFiles = document.getElementById('tenantDocuments').files;
        
        if (!name || !fatherName || !cnic || !location || !propertyId || !roomNumber) {
            showNotification('Please fill all required fields', 'error');
            return;
        }
        
        if (!validateCNIC(cnic)) {
            showNotification('Invalid CNIC format. Use: XXXXX-XXXXXXX-X', 'error');
            return;
        }
        
        if (profilePicFile) {
            if (!validateFileSize(profilePicFile, 5)) {
                showNotification('Profile picture too large. Max 5MB allowed.', 'error');
                return;
            }
            if (!validateFileType(profilePicFile)) {
                showNotification('Invalid profile picture format. Use JPG, PNG, or GIF.', 'error');
                return;
            }
        }
        
        const currentDocCount = App.state.tenants.find(t => t.id === id)?.documents?.length || 0;
        if (documentFiles.length + currentDocCount > 10) {
            showNotification('Maximum 10 documents allowed total.', 'error');
            return;
        }
        
        for (let i = 0; i < documentFiles.length; i++) {
            if (!validateFileSize(documentFiles[i], 5)) {
                showNotification(`Document "${documentFiles[i].name}" too large. Max 5MB allowed.`, 'error');
                return;
            }
        }
        
        try {
            const tenant = App.state.tenants.find(t => t.id === id);
            let profilePicBase64 = tenant.profile_pic || null;
            
            if (profilePicFile) {
                profilePicBase64 = await this.fileToBase64(profilePicFile);
            }
            
            const documents = tenant.documents ? [...tenant.documents] : [];
            for (let i = 0; i < Math.min(documentFiles.length, 5); i++) {
                const file = documentFiles[i];
                const fileData = await this.fileToBase64(file);
                documents.push({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    data: fileData
                });
            }
            
            await API.updateTenant(id, {
                name,
                fatherName,
                cnic,
                location,
                description,
                propertyId,
                roomNumber,
                status,
                profile_pic: profilePicBase64,
                documents: documents
            });
            
            await App.loadData();
            App.closeModal();
            await this.render();
            showNotification('Tenant updated successfully', 'success');
        } catch (error) {
            showNotification(error.message || 'Failed to update tenant', 'error');
        }
    },
    
    async removeDocument(tenantId, docIndex) {
        Components.showConfirm(
            'Remove Document',
            'Are you sure you want to remove this document?',
            'Remove',
            'Cancel',
            'danger',
            async () => {
                try {
                    const tenant = App.state.tenants.find(t => t.id === tenantId);
                    if (!tenant) return;
                    
                    const documents = tenant.documents || [];
                    documents.splice(docIndex, 1);
                    
                    await API.updateTenant(tenantId, {
                        name: tenant.name,
                        fatherName: tenant.father_name,
                        cnic: tenant.cnic,
                        location: tenant.location,
                        description: tenant.description || '',
                        propertyId: tenant.property_id,
                        roomNumber: tenant.room_number,
                        status: tenant.status || 'active',
                        profile_pic: tenant.profile_pic || null,
                        documents: documents
                    });
                    
                    await App.loadData();
                    await this.editTenant(tenantId);
                    Components.showSuccess('Document removed successfully');
                } catch (error) {
                    console.error('Error removing document:', error);
                    Components.showError(error.message || 'Failed to remove document');
                }
            }
        );
    },
    
    async viewDocuments(tenantId) {
        const tenant = App.state.tenants.find(t => t.id === tenantId);
        if (!tenant) {
            showNotification('Tenant not found', 'error');
            return;
        }
        
        const documents = tenant.documents || [];
        
        if (documents.length === 0) {
            showNotification('No documents found for this tenant', 'warning');
            return;
        }
        
        this.closeDetails();
        
        let html = `<h4>Documents for ${escapeHTML(tenant.name)}</h4><div style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">`;
        
        documents.forEach((doc) => {
            const isImage = doc.type && doc.type.startsWith('image/');
            html += `
                <div style="border: 1px solid var(--border-light); border-radius: 8px; padding: 12px 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong>${escapeHTML(doc.name)}</strong>
                        <span style="color: var(--text-light); font-size: 0.8rem;">${getFileSize(doc.size)}</span>
                    </div>
                    ${isImage ? `<img src="${escapeHTML(doc.data)}" style="max-width: 100%; max-height: 300px; border-radius: 4px;">` : 
                    `<a href="${escapeHTML(doc.data)}" download="${escapeHTML(doc.name)}" class="btn btn-sm btn-outline">Download ${escapeHTML(doc.name)}</a>`}
                </div>
            `;
        });
        
        html += '</div>';
        
        const modal = document.getElementById('documentModal');
        const body = document.getElementById('documentModalBody');
        body.innerHTML = html;
        modal.classList.add('active');
    },
    
    async deleteTenant(id) {
        if (isDemoMode()) {
            Components.showAlert(
                'Demo Mode',
                'Please create an account or login to delete tenants.',
                'Login',
                'primary',
                () => {
                    window.location.href = 'index.html?show=login';
                }
            );
            return;
        }
        Components.showConfirm(
            'Delete Tenant',
            'Are you sure you want to delete this tenant?',
            'Delete',
            'Cancel',
            'danger',
            async () => {
                try {
                    await API.deleteTenant(id);
                    await App.loadData();
                    await this.render();
                    Components.showSuccess('Tenant deleted successfully');
                } catch (error) {
                    Components.showError(error.message || 'Failed to delete tenant');
                }
            }
        );
    }
};

window.Tenants = Tenants;