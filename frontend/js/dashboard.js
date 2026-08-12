// dashboard.js – Landlord & Tenant views (fully dynamic, robust)

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
        document.getElementById('content').innerHTML =
            `<div class="alert alert-danger m-4">Failed to load dashboard: ${err.message}</div>`;
    }
}

// ─── Helper: safely extract array from API response ──────────────────────
function safeExtract(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (response.results && Array.isArray(response.results)) return response.results;
    if (response.data && Array.isArray(response.data)) return response.data;
    return [];
}

// ─── LANDLORD DASHBOARD (Dynamic) ──────────────────────────────────────────

async function render_landlord_dashboard() {
    try {
        // ─── 1. Fetch all required data ─────────────────────────────
        const [propertiesRes, unitsRes, leasesRes, paymentsRes, tenantsRes] = await Promise.all([
            api.properties.list(),
            api.units.list(),
            api.leases.list(),
            api.payments.list(),
            api.tenants.list()
        ]);

        const properties = safeExtract(propertiesRes);
        const units = safeExtract(unitsRes);
        const leases = safeExtract(leasesRes);
        const payments = safeExtract(paymentsRes);
        const tenants = safeExtract(tenantsRes);

        // ─── 2. Portfolio stats ──────────────────────────────────────
        const totalUnits = units.length;
        const occupiedUnits = units.filter(u => 
            (u.status || '').toLowerCase() === 'occupied'
        ).length;
        const vacantUnits = totalUnits - occupiedUnits;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

        // ─── 3. Revenue stats ────────────────────────────────────────
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        // Only confirmed payments
        const confirmedPayments = payments.filter(p => p.status === 'confirmed');

        // Current month revenue
        const currentMonthRevenue = confirmedPayments
            .filter(p => {
                const d = new Date(p.payment_date);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            })
            .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        // Previous month revenue
        const lastMonthRevenue = confirmedPayments
            .filter(p => {
                const d = new Date(p.payment_date);
                return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
            })
            .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        // MoM growth
        let revenueChangePercent = 0;
        if (lastMonthRevenue > 0) {
            revenueChangePercent = ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
        }
        revenueChangePercent = Math.round(revenueChangePercent * 100) / 100;

        // ─── 4. Collection Efficiency ───────────────────────────────
        const activeLeases = leases.filter(l => l.status === 'active');
        const expectedRent = activeLeases.reduce((sum, l) => sum + parseFloat(l.monthly_rent || 0), 0);
        const collectionEfficiency = expectedRent > 0 
            ? Math.round((currentMonthRevenue / expectedRent) * 100) 
            : 0;

        // ─── 5. Arrears stats ────────────────────────────────────────
        const arrearsLeases = activeLeases.filter(l => parseFloat(l.balance_due || 0) > 0);
        const totalArrears = arrearsLeases.reduce((sum, l) => sum + parseFloat(l.balance_due || 0), 0);

        // ─── 6. Monthly revenue for chart (last 6 months) ──────────
        const monthLabels = [];
        const monthData = [];
        for (let i = 5; i >= 0; i--) {
            const m = new Date(currentYear, currentMonth - i, 1);
            const label = m.toLocaleString('default', { month: 'short' });
            const revenue = confirmedPayments
                .filter(p => {
                    const d = new Date(p.payment_date);
                    return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
                })
                .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
            monthLabels.push(label);
            monthData.push(revenue);
        }

        // ─── 7. Update KPI Cards ─────────────────────────────────────
        document.getElementById('kpiTotalUnits').textContent = totalUnits;
        document.getElementById('kpiOccupancy').innerHTML =
            `<i class="bi bi-graph-up-arrow"></i> <span>${occupancyRate}% Occupancy Rate</span>`;

        document.getElementById('kpiRevenue').textContent = zmw(currentMonthRevenue);
        document.getElementById('kpiRevenueChange').innerHTML =
            `<i class="bi bi-arrow-${revenueChangePercent >= 0 ? 'up' : 'down'}-right"></i> <span>${revenueChangePercent >= 0 ? '+' : ''}${revenueChangePercent}% MoM growth</span>`;

        document.getElementById('kpiVacant').textContent = vacantUnits;

        document.getElementById('kpiCollectionRate').textContent = `${collectionEfficiency}%`;

        // ─── 8. Arrears Alert ────────────────────────────────────────
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

        // ─── 9. Revenue Chart ────────────────────────────────────────
        const ctx = document.getElementById('revenueChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: monthLabels.length ? monthLabels : ['No Data'],
                datasets: [{
                    label: 'Revenue',
                    data: monthData.length ? monthData : [0],
                    backgroundColor: '#2563eb',
                    borderRadius: 4,
                    barPercentage: 0.6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        border: { display: false }, 
                        grid: { color: '#e2e8f0' }, 
                        ticks: { 
                            callback: v => `${(v/1000).toFixed(0)}K`,
                            font: { family: 'Inter' }
                        } 
                    },
                    x: { border: { display: false }, grid: { display: false }, ticks: { font: { family: 'Inter' } } }
                }
            }
        });

        // ─── 10. Property Occupancy List ─────────────────────────────
        const occupancyHtml = properties.map(p => {
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
        document.getElementById('occList').innerHTML = occupancyHtml || '<p class="text-muted">No properties found.</p>';

        // ─── 11. Recent Payments ──────────────────────────────────────
        const recentPayments = confirmedPayments.slice(0, 5);
        document.getElementById('recentPayments').innerHTML = recentPayments.map(p => `
            <tr>
                <td><div class="fw-medium">${p.tenant_name || 'N/A'}</div><div class="text-muted" style="font-size: 11px;">Unit ${p.unit_number || 'N/A'}</div></td>
                <td class="font-monospace fw-medium">${zmw(p.amount)}</td>
                <td><span class="badge bg-success">Completed</span></td>
            </tr>
        `).join('') || '<tr><td colspan="3" class="text-center text-muted py-3">No recent payments</td></tr>';

        // ─── 12. Open Maintenance ──────────────────────────────────────
        let maintenance = [];
        try {
            const maintRes = await api.maintenance.list('?status=open,in_progress&limit=4');
            maintenance = safeExtract(maintRes);
        } catch {
            maintenance = [];
        }
        document.getElementById('recentMaintenance').innerHTML = maintenance.map(m => `
            <tr>
                <td class="fw-medium">${m.title}</td>
                <td class="text-muted">${m.unit_number || 'N/A'}</td>
                <td><span class="badge ${m.priority === 'high' ? 'bg-danger' : 'bg-warning'}">${m.priority ? m.priority.toUpperCase() : 'N/A'}</span></td>
            </tr>
        `).join('') || '<tr><td colspan="3" class="text-center text-muted py-3">No open issues</td></tr>';

    } catch (err) {
        console.error('Dashboard error:', err);
        document.getElementById('content').innerHTML =
            `<div class="alert alert-danger m-4">Failed to load dashboard: ${err.message}</div>`;
    }
}

// ─── TENANT DASHBOARD ────────────────────────────────────────────────────────

async function render_tenant_dashboard() {
    // 1. Get tenant profile
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

    // 2. Get payment history (last 5)
    let payments = [];
    try {
        const res = await api.payments.list('?limit=5');
        payments = safeExtract(res);
    } catch {}

    // 3. Get utility allocations (if available)
    let utilities = [];
    try {
        const res = await api.utility.allocations(); 
        utilities = safeExtract(res);
    } catch {
        utilities = [];
    }

    // ─── Update KPI cards ──────────────────────────────────────────────────
    document.getElementById('kpiTotalUnits').textContent = unitNumber;
    document.getElementById('kpiOccupancy').innerHTML =
        `<i class="bi bi-house-door"></i> <span>${propertyName}</span>`;

    document.getElementById('kpiRevenue').textContent = zmw(balance);
    document.getElementById('kpiRevenueChange').innerHTML =
        `<span class="${balance > 0 ? 'text-danger' : 'text-success'}">${balance > 0 ? 'Outstanding' : 'All Clear'}</span>`;

    document.getElementById('kpiVacant').textContent = leaseStatus;
    document.getElementById('kpiCollectionRate').textContent = `${payments.length} payments`;

    // ─── Chart: Payment history (last 6 months) ──────────────────────────
    const months = {};
    payments.forEach(p => {
        const date = new Date(p.payment_date);
        const key = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        months[key] = (months[key] || 0) + parseFloat(p.amount);
    });
    const labels = Object.keys(months).slice(-6);
    const data = labels.map(l => months[l]);

    const ctx = document.getElementById('revenueChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
                label: 'Payments Made',
                data: data.length ? data : [0],
                backgroundColor: '#10b981',
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { border: { display: false }, grid: { color: '#e2e8f0' }, ticks: { callback: v => `${(v/1000).toFixed(0)}K` } },
                x: { border: { display: false }, grid: { display: false } }
            }
        }
    });

    // ─── Occupancy / Next Rent Due ────────────────────────────────────────
    const nextDue = profile.next_rent_due || 'Not set';
    document.getElementById('occList').innerHTML = `
        <div class="mb-3">
            <div class="d-flex justify-content-between"><span>Next Rent Due</span><span class="fw-bold">${nextDue}</span></div>
            <div class="d-flex justify-content-between mt-2"><span>Lease Status</span><span class="badge ${leaseStatus === 'Active' ? 'bg-success' : 'bg-secondary'}">${leaseStatus}</span></div>
        </div>
        <hr>
        <h6 class="mt-3">Utility Bills</h6>
        ${utilities.length ? utilities.map(u => `
            <div class="d-flex justify-content-between mb-1">
                <span>${u.utility_type || 'Utility'}</span>
                <span>${zmw(u.allocated_amount)} ${u.is_paid ? '✅' : '⏳'}</span>
            </div>
        `).join('') : '<p class="text-muted small">No utility bills pending.</p>'}
    `;

    // ─── Recent Payments ──────────────────────────────────────────────────
    document.getElementById('recentPayments').innerHTML = payments.map(p => `
        <tr>
            <td><div class="fw-medium">${p.payment_date || 'N/A'}</div></td>
            <td class="font-monospace fw-medium">${zmw(p.amount)}</td>
            <td><span class="badge ${p.status === 'confirmed' ? 'bg-success' : 'bg-warning'}">${p.status || 'pending'}</span></td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="text-center text-muted py-3">No payment records found.</td></tr>';

    // ─── Lease Details ─────────────────────────────────────────────────────
    document.getElementById('recentMaintenance').innerHTML = `
        <tr><td colspan="3">
            <div class="d-flex justify-content-between py-1"><span>Start Date</span><span class="fw-medium">${profile.lease_start || 'N/A'}</span></div>
            <div class="d-flex justify-content-between py-1"><span>End Date</span><span class="fw-medium">${profile.lease_end || 'N/A'}</span></div>
            <div class="d-flex justify-content-between py-1"><span>Monthly Rent</span><span class="fw-medium">${zmw(profile.monthly_rent || 0)}</span></div>
        </td></tr>
    `;

    document.getElementById('alertsContainer').innerHTML = '';
}

// ─── Expose the main function ──────────────────────────────────────────────
window.render_dashboard = render_dashboard;