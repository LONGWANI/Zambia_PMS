// dashboard.js – Landlord & Tenant views with rent due reminders

// ─── Helper: compute next rent due date from lease start ────────────────
function getNextRentDueDate(leaseStartDate) {
    if (!leaseStartDate) return null;
    const start = new Date(leaseStartDate);
    const today = new Date();
    const dueDay = start.getDate();
    let dueMonth = today.getMonth();
    let dueYear = today.getFullYear();
    let dueDate = new Date(dueYear, dueMonth, dueDay);
    if (today > dueDate) {
        dueDate = new Date(dueYear, dueMonth + 1, dueDay);
    }
    return dueDate;
}

function formatDate(date) {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-ZM', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysUntil(date) {
    if (!date) return null;
    const today = new Date();
    const diff = date.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Helper: safeExtract ──────────────────────────────────────────────────
function safeExtract(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (response.results && Array.isArray(response.results)) return response.results;
    if (response.data && Array.isArray(response.data)) return response.data;
    return [];
}

// ─── Main render ──────────────────────────────────────────────────────────
async function render_dashboard() {
    showLoader();
    try {
        const user = await auth.me();
        const role = user?.role || 'tenant';

        if (role === 'landlord' || role === 'admin') {
            await render_landlord_dashboard();
        } else {
            await render_tenant_dashboard();
        }
    } catch (err) {
        const contentEl = document.getElementById('contentWorkspace') || document.getElementById('content');
        if (contentEl) {
            contentEl.innerHTML =
                `<div class="alert alert-danger m-4">Failed to load dashboard: ${err.message}</div>`;
        }
        console.error('Dashboard error:', err);
    }
}

// ─── LANDLORD DASHBOARD ───────────────────────────────────────────────────

async function render_landlord_dashboard() {
    try {
        const [propertiesRes, unitsRes, leasesRes, paymentsRes, tenantsRes, financialRes] = await Promise.all([
            api.properties.list(),
            api.units.list(),
            api.leases.list(),
            api.payments.list(),
            api.tenants.list(),
            api.reports.financial('?months=6')
        ]);

        const properties = safeExtract(propertiesRes);
        const units = safeExtract(unitsRes);
        const leases = safeExtract(leasesRes);
        const payments = safeExtract(paymentsRes);
        const tenants = safeExtract(tenantsRes);
        const financialData = financialRes?.monthly_summary || [];

        // ─── KPIs ──────────────────────────────────────────────────────
        const totalUnits = units.length;
        const occupiedUnits = units.filter(u => (u.status || '').toLowerCase() === 'occupied').length;
        const vacantUnits = totalUnits - occupiedUnits;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        const confirmedPayments = payments.filter(p => p.status === 'confirmed');
        const currentMonthRevenue = confirmedPayments
            .filter(p => {
                const d = new Date(p.payment_date);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            })
            .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        const lastMonthRevenue = confirmedPayments
            .filter(p => {
                const d = new Date(p.payment_date);
                return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
            })
            .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        let revenueChangePercent = 0;
        if (lastMonthRevenue > 0) {
            revenueChangePercent = ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
        }
        revenueChangePercent = Math.round(revenueChangePercent * 100) / 100;

        const activeLeases = leases.filter(l => l.status === 'active');
        const expectedRent = activeLeases.reduce((sum, l) => sum + parseFloat(l.monthly_rent || 0), 0);
        const collectionEfficiency = expectedRent > 0 ? Math.round((currentMonthRevenue / expectedRent) * 100) : 0;

        const arrearsLeases = activeLeases.filter(l => parseFloat(l.balance_due || 0) > 0);
        const totalArrears = arrearsLeases.reduce((sum, l) => sum + parseFloat(l.balance_due || 0), 0);

        // ─── Chart data ──────────────────────────────────────────────
        let chartLabels = [], revenueData = [], expenseData = [];
        if (financialData.length > 0) {
            const sorted = financialData.sort((a, b) => new Date(a.month) - new Date(b.month));
            chartLabels = sorted.map(item => item.month);
            revenueData = sorted.map(item => item.total_revenue);
            expenseData = sorted.map(item => item.total_expenses);
        } else {
            for (let i = 5; i >= 0; i--) {
                const m = new Date(currentYear, currentMonth - i, 1);
                const label = m.toLocaleString('default', { month: 'short', year: 'numeric' });
                const revenue = confirmedPayments
                    .filter(p => {
                        const d = new Date(p.payment_date);
                        return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
                    })
                    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
                chartLabels.push(label);
                revenueData.push(revenue);
                expenseData.push(0);
            }
        }

        // ─── Update KPI labels ──────────────────────────────────────
        document.getElementById('kpiLabel1').textContent = 'Portfolio Size';
        document.getElementById('kpiValue1').textContent = totalUnits;
        document.getElementById('kpiSub1').innerHTML =
            `<i class="bi bi-graph-up-arrow"></i> <span>${occupancyRate}% Occupancy Rate</span>`;

        document.getElementById('kpiLabel2').textContent = 'Gross Revenue';
        document.getElementById('kpiValue2').textContent = zmw(currentMonthRevenue);
        document.getElementById('kpiSub2').innerHTML =
            `<i class="bi bi-arrow-${revenueChangePercent >= 0 ? 'up' : 'down'}-right"></i> <span>${revenueChangePercent >= 0 ? '+' : ''}${revenueChangePercent}% MoM growth</span>`;

        document.getElementById('kpiLabel3').textContent = 'Vacant Spaces';
        document.getElementById('kpiValue3').textContent = vacantUnits;
        document.getElementById('kpiSub3').innerHTML =
            `<i class="bi bi-clock-history"></i> <span>Ready for onboarding</span>`;

        document.getElementById('kpiLabel4').textContent = 'Collection Efficiency';
        document.getElementById('kpiValue4').textContent = `${collectionEfficiency}%`;
        document.getElementById('kpiSub4').innerHTML =
            `<i class="bi bi-exclamation-circle"></i>
            <a href="{% url 'reports' %}" class="text-danger fw-semibold text-decoration-none">View active invoice deficits</a>`;

        // ─── Right Panel: Property Occupancy ──────────────────────────
        const rightPanelTitle = document.getElementById('rightPanelTitle');
        if (rightPanelTitle) rightPanelTitle.textContent = 'Property Occupancy';
        const occHtml = properties.map(p => {
            const propUnits = units.filter(u => u.property === p.id || u.property_id === p.id);
            const occupied = propUnits.filter(u => (u.status || '').toLowerCase() === 'occupied').length;
            const rate = propUnits.length > 0 ? Math.round((occupied / propUnits.length) * 100) : 0;
            return `
                <div class="mb-3">
                    <div class="d-flex justify-content-between mb-1" style="font-size: 13px;">
                        <span class="fw-medium">${p.name}</span>
                        <span class="fw-bold ${rate >= 90 ? 'text-success' : rate >= 70 ? 'text-warning' : 'text-danger'}">${rate}%</span>
                    </div>
                    <div class="progress" style="height: 6px; background-color: #e2e8f0;">
                        <div class="progress-bar ${rate >= 90 ? 'bg-success' : rate >= 70 ? 'bg-warning' : 'bg-danger'}" role="progressbar" style="width: ${rate}%"></div>
                    </div>
                </div>
            `;
        }).join('');
        document.getElementById('rightPanelContent').innerHTML = occHtml || '<p class="text-muted">No properties found.</p>';

        // ─── Rent Due Reminders (Landlord) ──────────────────────────
        const remindersDiv = document.getElementById('landlordReminders');
        if (remindersDiv) {
            remindersDiv.style.display = 'block';
            const listDiv = document.getElementById('rentDueList');
            if (listDiv) {
                const activeLeaseData = activeLeases.map(l => {
                    const dueDate = getNextRentDueDate(l.start_date);
                    return {
                        tenant: l.tenant_name || l.tenant?.user?.full_name || 'N/A',
                        unit: l.unit_number || l.unit?.unit_number || 'N/A',
                        property: l.property_name || l.unit?.property?.name || 'N/A',
                        dueDate: dueDate,
                        days: daysUntil(dueDate),
                        monthlyRent: parseFloat(l.monthly_rent) || 0
                    };
                }).filter(d => d.dueDate !== null).sort((a, b) => (a.days || 999) - (b.days || 999));

                if (activeLeaseData.length === 0) {
                    listDiv.innerHTML = '<p class="text-muted text-center">No active leases found.</p>';
                } else {
                    listDiv.innerHTML = `
                        <div class="table-responsive">
                            <table class="table table-sm table-hover saas-table m-0">
                                <thead>
                                    <tr>
                                        <th>Tenant</th>
                                        <th>Property / Unit</th>
                                        <th>Next Due Date</th>
                                        <th>Days Until Due</th>
                                        <th>Monthly Rent</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${activeLeaseData.map(d => `
                                        <tr>
                                            <td class="fw-medium">${d.tenant}</td>
                                            <td>${d.property} / Unit ${d.unit}</td>
                                            <td>${formatDate(d.dueDate)}</td>
                                            <td>${d.days !== null ? (d.days <= 0 ? '<span class="badge bg-danger">Overdue</span>' : `${d.days} days`) : '—'}</td>
                                            <td class="font-monospace">${zmw(d.monthlyRent)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                }
            }
        }

        // ─── Chart ──────────────────────────────────────────────────────
        const ctx = document.getElementById('revenueChart').getContext('2d');
        if (window._dashboardChart) window._dashboardChart.destroy();
        window._dashboardChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartLabels.length ? chartLabels : ['No Data'],
                datasets: [
                    { label: 'Revenue', data: revenueData.length ? revenueData : [0], backgroundColor: '#2563eb', borderRadius: 4, barPercentage: 0.4 },
                    { label: 'Expenses', data: expenseData.length ? expenseData : [0], backgroundColor: '#ef4444', borderRadius: 4, barPercentage: 0.4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { boxWidth: 12, padding: 12, font: { family: 'Inter', size: 12 } } }
                },
                scales: {
                    y: { border: { display: false }, grid: { color: '#e2e8f0' }, ticks: { callback: v => `${(v/1000).toFixed(0)}K`, font: { family: 'Inter' } } },
                    x: { border: { display: false }, grid: { display: false }, ticks: { font: { family: 'Inter' } } }
                }
            }
        });

        // ─── Recent Payments ──────────────────────────────────────────
        const recentPayments = confirmedPayments.slice(0, 5);
        document.getElementById('recentPayments').innerHTML = recentPayments.map(p => `
            <tr>
                <td><div class="fw-medium">${p.tenant_name || 'N/A'}</div><div class="text-muted" style="font-size: 11px;">Unit ${p.unit_number || 'N/A'}</div></td>
                <td class="font-monospace fw-medium">${zmw(p.amount)}</td>
                <td><span class="badge bg-success">Completed</span></td>
            </tr>
        `).join('') || '<tr><td colspan="3" class="text-center text-muted py-3">No recent payments</td></tr>';

        // ─── Maintenance ──────────────────────────────────────────────
        let maintenance = [];
        try {
            const maintRes = await api.maintenance.list('?status=open,in_progress&limit=4');
            maintenance = safeExtract(maintRes);
        } catch { maintenance = []; }
        document.getElementById('recentMaintenance').innerHTML = maintenance.map(m => `
            <tr>
                <td class="fw-medium">${m.title}</td>
                <td class="text-muted">${m.unit_number || 'N/A'}</td>
                <td><span class="badge ${m.priority === 'high' ? 'bg-danger' : 'bg-warning'}">${m.priority ? m.priority.toUpperCase() : 'N/A'}</span></td>
            </tr>
        `).join('') || '<tr><td colspan="3" class="text-center text-muted py-3">No open issues</td></tr>';

        // ─── Arrears Alert ────────────────────────────────────────────
        const alertsContainer = document.getElementById('alertsContainer');
        if (arrearsLeases.length > 0) {
            alertsContainer.innerHTML = `
                <div class="alert alert-danger d-flex align-items-center" role="alert">
                    <i class="bi bi-exclamation-triangle-fill me-3 fs-5"></i>
                    <div>
                        <strong>Action Required:</strong> ${arrearsLeases.length} tenant(s) in arrears totalling
                        <span class="font-monospace fw-bold">${zmw(totalArrears)}</span>.
                        <a href="#" onclick="navigate('tenants');return false" class="alert-link ms-2">View Arrears →</a>
                    </div>
                </div>
            `;
        } else {
            alertsContainer.innerHTML = '';
        }

    } catch (err) {
        console.error('Landlord dashboard error:', err);
        const contentEl = document.getElementById('contentWorkspace') || document.getElementById('content');
        if (contentEl) {
            contentEl.innerHTML = `<div class="alert alert-danger m-4">Failed to load dashboard: ${err.message}</div>`;
        }
    }
}

// ─── TENANT DASHBOARD ─────────────────────────────────────────────────────

async function render_tenant_dashboard() {
    try {
        const now = new Date();

        let profile;
        try {
            profile = await api.tenants.current();
        } catch {
            profile = { balance: '0.00', full_name: 'You', property_name: 'N/A', unit: 'N/A', lease_status: 'inactive' };
        }

        const balance = parseFloat(profile.balance) || 0;
        const fullName = profile.full_name || 'You';
        const propertyName = profile.property_name || 'N/A';
        const unitNumber = profile.unit || 'N/A';
        const leaseStatus = profile.lease_status || 'No active lease';
        // ─── Use fields from profile (now available) ──────────────
        const monthlyRent = parseFloat(profile.monthly_rent) || 0;
        const leaseStart = profile.lease_start ? new Date(profile.lease_start) : null;
        const leaseEnd = profile.lease_end ? new Date(profile.lease_end) : null;

        // ─── Payments ──────────────────────────────────────────────────
        let payments = [];
        try {
            const res = await api.payments.list();
            payments = safeExtract(res);
        } catch {}

        let utilities = [];
        try {
            const res = await api.utility.allocations();
            utilities = safeExtract(res);
        } catch { utilities = []; }

        // ─── KPI Cards (tenant) ──────────────────────────────────────
        document.getElementById('kpiLabel1').textContent = 'Your Unit';
        document.getElementById('kpiValue1').textContent = unitNumber;
        document.getElementById('kpiSub1').innerHTML =
            `<i class="bi bi-house-door"></i> <span>${propertyName}</span>`;

        document.getElementById('kpiLabel2').textContent = 'Current Balance';
        document.getElementById('kpiValue2').textContent = zmw(balance);
        const balanceColor = balance > 0 ? 'text-danger' : 'text-success';
        const balanceText = balance > 0 ? 'Outstanding' : 'All Clear';
        document.getElementById('kpiSub2').innerHTML = `<span class="${balanceColor}">${balanceText}</span>`;

        document.getElementById('kpiLabel3').textContent = 'Lease Status';
        document.getElementById('kpiValue3').textContent = leaseStatus;
        const statusBadge = leaseStatus && leaseStatus.toLowerCase() === 'active' ? 'bg-success' : 'bg-secondary';
        document.getElementById('kpiSub3').innerHTML = `<span class="badge ${statusBadge}">${leaseStatus}</span>`;

        document.getElementById('kpiLabel4').textContent = 'Payments Made';
        document.getElementById('kpiValue4').textContent = payments.length;
        const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        document.getElementById('kpiSub4').innerHTML =
            `<i class="bi bi-credit-card"></i> <span>Total: ${zmw(totalPaid)}</span>`;

        // ─── Right Panel: Rent Calendar ──────────────────────────────
        const rightPanelTitle = document.getElementById('rightPanelTitle');
        if (rightPanelTitle) rightPanelTitle.textContent = 'Rent Calendar';
        const dueDate = getNextRentDueDate(leaseStart);
        const days = daysUntil(dueDate);
        let dueInfo = '';
        if (dueDate && leaseStatus && leaseStatus.toLowerCase() === 'active') {
            const color = days <= 0 ? 'text-danger' : 'text-warning';
            const label = days <= 0 ? 'Overdue' : `${days} days until due`;
            dueInfo = `
                <div class="text-center mb-3">
                    <div class="display-6 fw-bold ${color}">${formatDate(dueDate)}</div>
                    <div class="text-muted small">${label}</div>
                </div>
                <div class="alert ${days <= 0 ? 'alert-danger' : 'alert-info'} text-center py-2">
                    <i class="bi bi-calendar-event me-2"></i>
                    Your next rent due date is <strong>${formatDate(dueDate)}</strong>
                    ${days <= 0 ? '<span class="badge bg-danger ms-2">OVERDUE</span>' : ''}
                </div>
                <div class="mt-3">
                    <div class="d-flex justify-content-between"><span>Monthly Rent:</span><span class="fw-bold">${zmw(monthlyRent)}</span></div>
                    <div class="d-flex justify-content-between"><span>Lease Start:</span><span class="fw-medium">${leaseStart ? formatDate(leaseStart) : 'N/A'}</span></div>
                    <div class="d-flex justify-content-between"><span>Lease End:</span><span class="fw-medium">${leaseEnd ? formatDate(leaseEnd) : 'Open-ended'}</span></div>
                </div>
            `;
        } else {
            dueInfo = `<p class="text-muted text-center">No active lease found.</p>`;
        }
        document.getElementById('rightPanelContent').innerHTML = dueInfo;

        // ─── Hide landlord reminders section ──────────────────────────
        const remindersDiv = document.getElementById('landlordReminders');
        if (remindersDiv) remindersDiv.style.display = 'none';

        // ─── Chart: Rent Owed vs Rent Paid ───────────────────────────
        // Start from the lease start date – no truncation to 6 months
        let startDate = leaseStart ? new Date(leaseStart) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
        // ✅ FIX: removed the clamping to sixMonthsAgo – now shows ALL months from lease start to now

        const monthMap = {};
        const currentDate = new Date(startDate);
        while (currentDate <= now) {
            const label = currentDate.toLocaleString('default', { month: 'short', year: 'numeric' });
            monthMap[label] = { month: label, rentDue: monthlyRent, rentPaid: 0, date: new Date(currentDate) };
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        payments.forEach(p => {
            const d = new Date(p.payment_date);
            const label = d.toLocaleString('default', { month: 'short', year: 'numeric' });
            if (monthMap[label]) monthMap[label].rentPaid += parseFloat(p.amount || 0);
        });
        const months = Object.values(monthMap).sort((a, b) => a.date - b.date);
        const chartLabels = months.map(m => m.month);
        const rentDueData = months.map(m => m.rentDue);
        const rentPaidData = months.map(m => m.rentPaid);

        const ctx = document.getElementById('revenueChart').getContext('2d');
        if (window._dashboardChart) window._dashboardChart.destroy();
        window._dashboardChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartLabels.length ? chartLabels : ['No Data'],
                datasets: [
                    { label: 'Rent Owed', data: rentDueData.length ? rentDueData : [0], backgroundColor: '#ef4444', borderRadius: 4, barPercentage: 0.4 },
                    { label: 'Rent Paid', data: rentPaidData.length ? rentPaidData : [0], backgroundColor: '#10b981', borderRadius: 4, barPercentage: 0.4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, labels: { boxWidth: 12, padding: 12, font: { family: 'Inter', size: 12 } } } },
                scales: {
                    y: { border: { display: false }, grid: { color: '#e2e8f0' }, ticks: { callback: v => `${(v/1000).toFixed(0)}K`, font: { family: 'Inter' } } },
                    x: { border: { display: false }, grid: { display: false }, ticks: { font: { family: 'Inter' } } }
                }
            }
        });

        // ─── Recent Payments ──────────────────────────────────────────
        const recentPayments = payments.slice(0, 5);
        document.getElementById('recentPayments').innerHTML = recentPayments.map(p => `
            <tr>
                <td><div class="fw-medium">${p.payment_date || 'N/A'}</div></td>
                <td class="font-monospace fw-medium">${zmw(p.amount)}</td>
                <td><span class="badge ${p.status === 'confirmed' ? 'bg-success' : 'bg-warning'}">${p.status || 'pending'}</span></td>
            </tr>
        `).join('') || '<tr><td colspan="3" class="text-center text-muted py-3">No payment records found.</td></tr>';

        // ─── Maintenance (tenant shows their own requests) ────────────
        let maintenance = [];
        try {
            const maintRes = await api.maintenance.list('?limit=4');
            maintenance = safeExtract(maintRes);
        } catch { maintenance = []; }
        document.getElementById('recentMaintenance').innerHTML = maintenance.map(m => `
            <tr>
                <td class="fw-medium">${m.title}</td>
                <td class="text-muted">Unit ${m.unit_number || 'N/A'}</td>
                <td><span class="badge ${m.priority === 'high' ? 'bg-danger' : 'bg-warning'}">${m.priority ? m.priority.toUpperCase() : 'N/A'}</span></td>
            </tr>
        `).join('') || '<tr><td colspan="3" class="text-center text-muted py-3">No maintenance requests.</td></tr>';

        // ─── No arrears alert ─────────────────────────────────────────
        document.getElementById('alertsContainer').innerHTML = '';

    } catch (err) {
        console.error('Tenant dashboard error:', err);
        const contentEl = document.getElementById('contentWorkspace') || document.getElementById('content');
        if (contentEl) {
            contentEl.innerHTML = `<div class="alert alert-danger m-4">Failed to load tenant dashboard: ${err.message}</div>`;
        }
    }
}

window.render_dashboard = render_dashboard;