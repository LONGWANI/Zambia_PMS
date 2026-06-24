async function render_dashboard() {
    showLoader(); // Existing router.js loading state
    try {
        const data = await api.reports.dashboard();
        
        const content = `
            ${data.arrears_count > 0 ? `
            <div class="alert alert-danger d-flex align-items-center mb-4" role="alert" style="border-radius: var(--radius-md); border: none; background: var(--danger-bg); color: #991b1b;">
                <i class="bi bi-exclamation-triangle-fill me-3 fs-5"></i>
                <div>
                    <strong>Action Required:</strong> ${data.arrears_count} tenant(s) in arrears totalling <span class="font-monospace fw-bold">${zmw(data.arrears_total)}</span>. 
                    <a href="#" onclick="navigate('reports');return false" class="alert-link ms-2">Review Arrears Report &rarr;</a>
                </div>
            </div>` : ''}
            
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-icon primary"><i class="bi bi-building"></i></div>
                    <div class="kpi-value">${data.portfolio.total_units}</div>
                    <div class="kpi-label">Total Portfolio Units</div>
                    <div class="mt-3 text-success fw-medium" style="font-size: 12px;">
                        <i class="bi bi-graph-up"></i> ${data.portfolio.portfolio_occupancy_rate}% Occupancy
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon success"><i class="bi bi-cash-stack"></i></div>
                    <div class="kpi-value">${zmw(data.this_month_revenue)}</div>
                    <div class="kpi-label">Revenue (This Month)</div>
                    <div class="mt-3 text-success fw-medium" style="font-size: 12px;">
                        <i class="bi bi-arrow-up-right"></i> +${data.revenue_change_percent}% vs last month
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon warning"><i class="bi bi-door-open"></i></div>
                    <div class="kpi-value">${data.portfolio.vacant_units}</div>
                    <div class="kpi-label">Vacant Units</div>
                    <div class="mt-3 text-muted fw-medium" style="font-size: 12px;">
                        Out of ${data.portfolio.total_units} total units
                    </div>
                </div>
            </div>

            <div class="row g-4 mb-4">
                <div class="col-lg-8">
                    <div class="saas-card">
                        <div class="card-header-bar">
                            <h3 class="card-title">Revenue Tracking (ZMW)</h3>
                            <button class="btn-outline btn-sm"><i class="bi bi-download"></i> Export</button>
                        </div>
                        <div class="chart-wrap">
                            <canvas id="revenueChart"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="saas-card">
                        <div class="card-header-bar">
                            <h3 class="card-title">Property Occupancy</h3>
                        </div>
                        <div id="occList"></div>
                    </div>
                </div>
            </div>

            <div class="row g-4">
                <div class="col-lg-6">
                    <div class="saas-card p-0 overflow-hidden">
                        <div class="p-4 pb-0 d-flex justify-content-between align-items-center mb-3">
                            <h3 class="card-title m-0">Recent Payments</h3>
                            <button class="btn btn-link text-decoration-none p-0 fw-medium" onclick="navigate('payments')">View All</button>
                        </div>
                        <div class="table-responsive border-0 border-top">
                            <table class="saas-table mb-0">
                                <thead><tr><th>Tenant</th><th>Amount</th><th>Status</th></tr></thead>
                                <tbody id="recentPayments"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="saas-card p-0 overflow-hidden">
                        <div class="p-4 pb-0 d-flex justify-content-between align-items-center mb-3">
                            <h3 class="card-title m-0">Open Maintenance</h3>
                            <button class="btn btn-link text-decoration-none p-0 fw-medium" onclick="navigate('maintenance')">View All</button>
                        </div>
                        <div class="table-responsive border-0 border-top">
                            <table class="saas-table mb-0">
                                <thead><tr><th>Issue</th><th>Unit</th><th>Priority</th></tr></thead>
                                <tbody id="recentMaintenance"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('content').innerHTML = content;

        // Occupancy Data Rendering
        const props = await api.properties.list();
        const occHtml = props.map(p => `
            <div class="mb-3">
                <div class="d-flex justify-content-between mb-1" style="font-size: 13px;">
                    <span class="fw-medium text-slate-800">${p.name}</span>
                    <span class="fw-bold ${p.occupancy_rate >= 90 ? 'text-success' : p.occupancy_rate >= 70 ? 'text-warning' : 'text-danger'}">${p.occupancy_rate}%</span>
                </div>
                <div class="progress" style="height: 6px; background-color: var(--slate-100);">
                    <div class="progress-bar ${p.occupancy_rate >= 90 ? 'bg-success' : p.occupancy_rate >= 70 ? 'bg-warning' : 'bg-danger'}" role="progressbar" style="width: ${p.occupancy_rate}%"></div>
                </div>
            </div>
        `).join('');
        document.getElementById('occList').innerHTML = occHtml;

        // Recent Payments
        const payments = await api.payments.list('?limit=4');
        document.getElementById('recentPayments').innerHTML = (payments.results || []).map(p => `
            <tr>
                <td>
                    <div class="fw-medium">${p.tenant_name}</div>
                    <div class="text-muted" style="font-size: 11px;">Unit ${p.unit_number}</div>
                </td>
                <td class="font-monospace fw-medium">${zmw(p.amount)}</td>
                <td><span class="badge badge-success">Completed</span></td>
            </tr>
        `).join('');

        // Recent Maintenance
        const maint = await api.maintenance.list('?status=open,in_progress&limit=4');
        document.getElementById('recentMaintenance').innerHTML = (maint.results || []).map(m => `
            <tr>
                <td class="fw-medium">${m.title}</td>
                <td class="text-muted">${m.unit_number}</td>
                <td><span class="badge ${m.priority === 'high' ? 'badge-danger' : 'badge-warning'}">${m.priority.toUpperCase()}</span></td>
            </tr>
        `).join('');

        // Chart.js init using CSS variables
        const ctx = document.getElementById('revenueChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: data.monthly_revenue.map(m => m.month), 
                datasets: [{ 
                    label: 'Revenue', 
                    data: data.monthly_revenue.map(m => m.amount), 
                    backgroundColor: '#2563eb', // primary blue
                    borderRadius: 4,
                    barPercentage: 0.6
                }] 
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    y: { border: { display: false }, grid: { color: '#e2e8f0' }, ticks: { callback: v => `${(v / 1000).toFixed(0)}K`, font: { family: 'Inter' } } },
                    x: { border: { display: false }, grid: { display: false }, ticks: { font: { family: 'Inter' } } }
                } 
            }
        });
    } catch (err) {
        document.getElementById('content').innerHTML = `<div class="alert alert-danger m-4">Failed to load dashboard: ${err.message}</div>`;
    }
}
window.render_dashboard = render_dashboard;