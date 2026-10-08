// js/dashboard.js - Professional dashboard

const Dashboard = {
    async render() {
        await this.renderStats();
        await this.renderRecentPayments();
    },
    
    async renderStats() {
        try {
            const stats = await API.getDashboardStats();
            const data = stats.data || {};
            
            document.getElementById('totalProperties').textContent = data.total_properties || 0;
            document.getElementById('totalTenants').textContent = data.total_tenants || 0;
            document.getElementById('occupiedRooms').textContent = data.occupied_rooms || 0;
            document.getElementById('monthlyRevenue').textContent = formatCurrency(data.monthly_revenue || 0);
            
            this.renderRatios();
            
        } catch (error) {
            const tenants = App.state.tenants;
            const properties = App.state.properties;
            const payments = App.state.payments;
            
            document.getElementById('totalProperties').textContent = properties.length;
            document.getElementById('totalTenants').textContent = tenants.length;
            document.getElementById('occupiedRooms').textContent = tenants.filter(t => t.status === 'active' && t.property_id).length;
            
            const currentMonth = getCurrentMonth();
            const currentYear = getCurrentYear();
            const monthlyRevenue = payments
                .filter(p => p.month === currentMonth && p.year === currentYear)
                .reduce((sum, p) => {
                    const received = p.status === 'paid' ? (p.total_payment || p.total || 0)
                        : p.status === 'unpaid' ? 0
                        : (p.amount_paid || 0);
                    return sum + received;
                }, 0);
            document.getElementById('monthlyRevenue').textContent = formatCurrency(monthlyRevenue);
            
            this.renderRatios();
        }
    },
    
    renderRatios() {
        const container = document.getElementById('ratioStats');
        if (!container) return;
        
        const tenants = App.state.tenants;
        const properties = App.state.properties;
        const payments = App.state.payments;
        
        const totalTenants = tenants.length;
        const activeTenants = tenants.filter(t => t.status === 'active').length;
        const inactiveTenants = totalTenants - activeTenants;
        
        const totalRooms = properties.reduce((sum, p) => sum + (p.total_rooms || 0), 0);
        const occupiedRooms = tenants.filter(t => t.status === 'active' && t.property_id).length;
        const emptyRooms = totalRooms - occupiedRooms;
        
        const currentMonth = getCurrentMonth();
        const currentYear = getCurrentYear();
        const paidCount = payments.filter(p => p.month === currentMonth && p.year === currentYear && p.status === 'paid').length;
        const unpaidCount = payments.filter(p => p.month === currentMonth && p.year === currentYear && p.status !== 'paid').length;
        const totalPayments = paidCount + unpaidCount;
        
        const tenantPercent = totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 100) : 0;
        const roomPercent = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
        const paymentPercent = totalPayments > 0 ? Math.round((paidCount / totalPayments) * 100) : 0;
        
        container.innerHTML = `
            <div class="ratio-grid">
                <div class="ratio-card">
                    <div class="ratio-header">
                        <span class="ratio-label">Tenants</span>
                        <span class="ratio-number">${totalTenants}</span>
                    </div>
                    <div class="ratio-bar">
                        <div class="ratio-fill" style="width: ${tenantPercent}%; background: #28a745;"></div>
                    </div>
                    <div class="ratio-footer">
                        <span>Active <strong>${activeTenants}</strong></span>
                        <span>Inactive <strong>${inactiveTenants}</strong></span>
                    </div>
                </div>
                
                <div class="ratio-card">
                    <div class="ratio-header">
                        <span class="ratio-label">Rooms</span>
                        <span class="ratio-number">${totalRooms}</span>
                    </div>
                    <div class="ratio-bar">
                        <div class="ratio-fill" style="width: ${roomPercent}%; background: #17a2b8;"></div>
                    </div>
                    <div class="ratio-footer">
                        <span>Occupied <strong>${occupiedRooms}</strong></span>
                        <span>Empty <strong>${emptyRooms}</strong></span>
                    </div>
                </div>
                
                <div class="ratio-card">
                    <div class="ratio-header">
                        <span class="ratio-label">Payments</span>
                        <span class="ratio-number">${totalPayments}</span>
                    </div>
                    <div class="ratio-bar">
                        <div class="ratio-fill" style="width: ${paymentPercent}%; background: #28a745;"></div>
                    </div>
                    <div class="ratio-footer">
                        <span>Paid <strong>${paidCount}</strong></span>
                        <span>Unpaid <strong>${unpaidCount}</strong></span>
                    </div>
                </div>
            </div>
        `;
    },
    
    renderRecentPayments() {
        const container = document.getElementById('recentPayments');
        const payments = App.state.payments;
        const tenants = App.state.tenants;
        
        const recent = [...payments]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5);
        
        if (recent.length === 0) {
            container.innerHTML = '<div class="empty-state">No recent payments</div>';
            return;
        }
        
        let html = '';
        recent.forEach(payment => {
            const tenant = tenants.find(t => t.id === payment.tenant_id);
            const tenantName = tenant ? escapeHTML(tenant.name) : 'Unknown';
            const amount = payment.total_payment || payment.total || 0;
            const statusClass = payment.status === 'paid' ? 'success' : payment.status === 'partial' ? 'warning' : 'danger';
            
            html += `
                <div class="recent-payment-item">
                    <div class="recent-payment-info">
                        <span class="recent-payment-name">${tenantName}</span>
                        <span class="recent-payment-date">${formatDate(payment.created_at)}</span>
                    </div>
                    <div class="recent-payment-right">
                        <span class="recent-payment-amount">${formatCurrency(amount)}</span>
                        <span class="badge badge-${statusClass}">${escapeHTML(payment.status)}</span>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }
};

window.Dashboard = Dashboard;