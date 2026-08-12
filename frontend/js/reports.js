/**
 * ZambiaPMS – Analytics & Reports
 * Fully dynamic: fetches live data from the API and renders charts/tables.
 */

let activeChart = null;

// ─── Safe array extractor (mirrors dashboard.js) ──────────────────────────
function safeExtract(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (response.results && Array.isArray(response.results)) return response.results;
    if (response.data && Array.isArray(response.data)) return response.data;
    return [];
}

// ─── Page init ──────────────────────────────────────────────────────────────

async function render_reports() {
    const panel = document.getElementById('reportRenderArea');
    if (panel) panel.classList.add('d-none');
}

// ─── Report generator ──────────────────────────────────────────────────────

async function generateReport(reportType) {
    const panel     = document.getElementById('reportRenderArea');
    const titleEl   = document.getElementById('reportTitle');
    const contentEl = document.getElementById('reportContent');

    if (!panel || !contentEl) return;

    panel.classList.remove('d-none');
    contentEl.innerHTML = `
        <div class="text-center py-5 text-muted">
            <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
            Generating report...
        </div>`;

    if (activeChart) {
        activeChart.destroy();
        activeChart = null;
    }

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        if (reportType === 'financial') {
            await renderFinancialReport(titleEl, contentEl);
        } else if (reportType === 'arrears') {
            await renderArrearsReport(titleEl, contentEl);
        } else if (reportType === 'occupancy') {
            await renderOccupancyReport(titleEl, contentEl);
        }
    } catch (err) {
        contentEl.innerHTML = `
            <div class="alert alert-danger border-0 d-flex gap-2 align-items-center" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <div><strong>Failed to generate report:</strong> ${err.message}</div>
            </div>`;
    }
}

// ─── Financial Report ──────────────────────────────────────────────────────

async function renderFinancialReport(titleEl, contentEl) {
    if (titleEl) titleEl.textContent = 'Financial Performance — 6-Month Rolling';

    let data;
    try {
        data = await api.reports.financial('?months=6');
    } catch {
        data = { monthly_summary: [] };
    }

    let summary = data.monthly_summary || [];

    if (summary.length === 0) {
        const payments = safeExtract(await api.payments.list());
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const monthMap = {};
        for (let i = 5; i >= 0; i--) {
            const m = new Date(currentYear, currentMonth - i, 1);
            const label = m.toLocaleString('default', { month: 'short', year: 'numeric' });
            monthMap[label] = { month: label, total_revenue: 0, total_expenses: 0 };
        }

        payments.forEach(p => {
            if (p.status !== 'confirmed') return;
            const d = new Date(p.payment_date);
            const label = d.toLocaleString('default', { month: 'short', year: 'numeric' });
            if (monthMap[label]) {
                monthMap[label].total_revenue += parseFloat(p.amount || 0);
            }
        });

        summary = Object.values(monthMap);
        summary.sort((a, b) => new Date(a.month) - new Date(b.month));
    }

    // Ensure every row has total_revenue, total_expenses, net_profit
    summary = summary.map(row => ({
        ...row,
        total_revenue: row.total_revenue ?? parseFloat(row.amount) ?? 0,
        total_expenses: row.total_expenses ?? 0,
        net_profit: row.net_profit ?? (row.total_revenue - row.total_expenses),
    }));

    contentEl.innerHTML = `
        <div class="mb-4" style="height: 260px; position: relative;">
            <canvas id="analyticsReportChart"></canvas>
        </div>
        <div class="table-responsive">
            <table class="saas-table border mb-0">
                <thead>
                    <tr class="bg-light">
                        <th>Month</th>
                        <th>Revenue</th>
                        <th>Expenses</th>
                        <th>Net Profit</th>
                    </tr>
                </thead>
                <tbody>
                    ${summary.length ? summary.map(row => `
                        <tr>
                            <td class="fw-medium text-slate-900">${row.month}</td>
                            <td class="font-monospace text-success fw-medium">+${zmw(row.total_revenue)}</td>
                            <td class="font-monospace text-danger">-${zmw(row.total_expenses)}</td>
                            <td class="font-monospace fw-semibold text-slate-900">
                                ${zmw(row.net_profit)}
                            </td>
                        </tr>`).join('') : `
                        <tr><td colspan="4" class="text-center text-muted py-3">No financial data available</td></tr>
                    `}
                </tbody>
            </table>
        </div>`;

    const ctx = document.getElementById('analyticsReportChart')?.getContext('2d');
    if (ctx && summary.length) {
        activeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: summary.map(m => m.month),
                datasets: [{
                    label: 'Revenue (ZMW)',
                    data: summary.map(m => m.total_revenue),
                    borderColor: '#0d9488',
                    backgroundColor: 'rgba(13,148,136,0.06)',
                    fill: true,
                    tension: 0.25,
                    borderWidth: 2.5,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } },
                },
            },
        });
    }
}

// ─── Arrears Report ────────────────────────────────────────────────────────

async function renderArrearsReport(titleEl, contentEl) {
    if (titleEl) titleEl.textContent = 'Aged Arrears Ledger';

    let data;
    try {
        data = await api.reports.arrears();
    } catch {
        data = { arrears_list: [] };
    }

    const arrears = data.arrears_list || [];

    if (arrears.length === 0) {
        contentEl.innerHTML = `
            <div class="alert alert-success border-0 text-center py-5" role="alert">
                <i class="bi bi-shield-check-fill fs-2 d-block mb-2"></i>
                <strong>No Outstanding Balances</strong><br>
                <span class="text-muted">All tenant accounts are current.</span>
            </div>`;
        return;
    }

    contentEl.innerHTML = `
        <div class="table-responsive">
            <table class="saas-table border mb-0">
                <thead>
                    <tr class="bg-light">
                        <th>Tenant</th>
                        <th>Property / Unit</th>
                        <th>Balance Due</th>
                        <th>Days Overdue</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${arrears.map(r => `
                        <tr>
                            <td class="fw-semibold text-slate-900">${r.tenant_name}</td>
                            <td>${r.property_name || '—'} / Unit ${r.unit_number || '—'}</td>
                            <td class="font-monospace fw-bold text-danger">${zmw(r.balance_due)}</td>
                            <td class="fw-medium text-slate-700">${r.days_overdue ?? '—'} days</td>
                            <td>${statusBadge('arrears')}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

// ─── Occupancy Report ──────────────────────────────────────────────────────

async function renderOccupancyReport(titleEl, contentEl) {
    if (titleEl) titleEl.textContent = 'Portfolio Occupancy Distribution';

    let data;
    try {
        data = await api.reports.dashboard();
    } catch {
        data = { portfolio: {} };
    }

    const portfolio = data.portfolio || {};
    const total     = parseInt(portfolio.total_units)    || 0;
    const occupied  = parseInt(portfolio.occupied_units) || 0;
    const vacant    = total - occupied;
    const rate      = total > 0 ? Math.round((occupied / total) * 100) : 0;

    contentEl.innerHTML = `
        <div class="row align-items-center py-3 g-4">
            <div class="col-md-4 text-center">
                <div class="display-4 fw-bold font-monospace" style="color: var(--accent);">${rate}%</div>
                <div class="text-muted fw-medium small text-uppercase mt-1">Portfolio Occupancy</div>
            </div>
            <div class="col-md-8">
                <div class="mb-3">
                    <div class="progress" style="height: 12px; border-radius: 6px;">
                        <div class="progress-bar bg-success" role="progressbar"
                             style="width: ${rate}%" aria-valuenow="${rate}" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>
                </div>
                <div class="d-flex flex-column gap-3">
                    <div class="d-flex justify-content-between align-items-center border-bottom pb-2">
                        <span class="text-slate-600 fw-medium d-flex align-items-center gap-2">
                            <i class="bi bi-circle-fill text-success" style="font-size:10px;"></i>
                            Occupied Units
                        </span>
                        <span class="fw-bold text-slate-900 font-monospace">${occupied}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center border-bottom pb-2">
                        <span class="text-slate-600 fw-medium d-flex align-items-center gap-2">
                            <i class="bi bi-circle-fill text-warning" style="font-size:10px;"></i>
                            Vacant Units
                        </span>
                        <span class="fw-bold text-slate-900 font-monospace">${vacant}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center pt-1">
                        <span class="text-slate-700 fw-semibold">Total Portfolio Units</span>
                        <span class="fw-bold text-slate-900 font-monospace">${total}</span>
                    </div>
                </div>
            </div>
        </div>`;
}

function statusBadge(type) {
    if (type === 'arrears') {
        return `<span class="badge bg-danger">Overdue</span>`;
    }
    return `<span class="badge bg-secondary">—</span>`;
}

window.render_reports   = render_reports;
window.generateReport   = generateReport;