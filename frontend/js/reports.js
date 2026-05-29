/**
 * ZambiaPMS – Unified Performance Analytics Engine
 * Compiles trends, structural summaries, and processes calculations without viewport replacement errors.
 */

let activeChartChartInstance = null;

async function render_reports() {
  // Simple view initialization verification
  const checkRenderArea = document.getElementById('reportRenderArea');
  if (checkRenderArea) {
    checkRenderArea.classList.add('d-none'); // Establish base view initialization parameters cleanly
  }
}

/**
 * Handles target analytics parameters, targets containers, and dynamically injects tables and analytical maps
 * @param {string} reportType - 'financial', 'arrears', or 'occupancy'
 */
async function generateReport(reportType) {
  const containerArea = document.getElementById('reportRenderArea');
  const contextTitle = document.getElementById('reportTitle');
  const targetContentFrame = document.getElementById('reportContent');

  if (!containerArea || !targetContentFrame) return;

  // Unhide target presentation containers cleanly
  containerArea.classList.remove('d-none');
  targetContentFrame.innerHTML = `
    <div class="text-center py-4 text-muted">
      <div class="spinner-border spinner-border-sm text-teal me-2" role="status"></div>
      Parsing raw historical logs...
    </div>
  `;

  // Wipe structural tracking references from duplicate charts cleanly
  if (activeChartChartInstance) {
    activeChartChartInstance.destroy();
    activeChartChartInstance = null;
  }

  try {
    if (reportType === 'financial') {
      contextTitle.textContent = 'Financial Portfolio Statement (6-Month Range Capture)';
      
      const financialLogs = await api.reports.financial('?months=6');
      const dataSummaries = financialLogs.monthly_summary || [];

      targetContentFrame.innerHTML = `
        <div class="mb-4" style="height: 240px; position: relative;">
          <canvas id="analyticsReportChart"></canvas>
        </div>
        <div class="table-responsive">
          <table class="saas-table border mb-0">
            <thead>
              <tr class="bg-slate-50">
                <th>Chronological Range</th>
                <th>Gross Income Capture</th>
                <th>Expense Tracking</th>
                <th>Net Balance Assets</th>
              </tr>
            </thead>
            <tbody>
              ${dataSummaries.map(row => `
                <tr>
                  <td class="fw-medium text-slate-900">${row.month}</td>
                  <td class="font-monospace text-success fw-medium">+${zmw(row.total_revenue)}</td>
                  <td class="font-monospace text-danger">-${zmw(row.total_expenses || 0)}</td>
                  <td class="font-monospace fw-semibold text-slate-900">${zmw(row.net_profit || row.total_revenue)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Build performance metric graph traces natively using client engines
      const chartCtx = document.getElementById('analyticsReportChart').getContext('2d');
      activeChartChartInstance = new Chart(chartCtx, {
        type: 'line',
        data: {
          labels: dataSummaries.map(m => m.month),
          datasets: [{
            label: 'Gross Cash Capture Flow (ZMW)',
            data: dataSummaries.map(m => m.total_revenue),
            borderColor: '#0d9488',
            backgroundColor: 'rgba(13, 148, 136, 0.06)',
            fill: true,
            tension: 0.25,
            borderWidth: 2.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
        }
      });

    } else if (reportType === 'arrears') {
      contextTitle.textContent = 'Aged Outstanding Accounts Matrix';
      
      const collectionsTrace = await api.reports.arrears();
      const arrearsCollection = collectionsTrace.arrears_list || [];

      if (arrearsCollection.length === 0) {
        targetContentFrame.innerHTML = `
          <div class="alert alert-success border-0 text-center py-4 my-2" role="alert">
            <i class="bi bi-shield-check-fill fs-4 d-block mb-2"></i>
            <strong>Zero Liabilities Discovered:</strong> All registered accounts and spaces match up completely with standard targets.
          </div>
        `;
        return;
      }

      targetContentFrame.innerHTML = `
        <div class="table-responsive">
          <table class="saas-table border mb-0">
            <thead>
              <tr class="bg-slate-50">
                <th>Responsible Obligor</th>
                <th>Structural Identity</th>
                <th>Overdue Outstanding Liability</th>
                <th>Aged Interval</th>
                <th>Operational Status</th>
              </tr>
            </thead>
            <tbody>
              ${arrearsCollection.map(record => `
                <tr>
                  <td class="fw-semibold text-slate-900">${record.tenant_name}</td>
                  <td>${record.property_name || 'Individual Contract'} / Unit ${record.unit_number}</td>
                  <td class="font-monospace fw-bold text-danger">${zmw(record.balance_due)}</td>
                  <td class="fw-medium text-slate-700">${record.days_overdue} Days Overdue</td>
                  <td>${statusBadge('arrears')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

    } else if (reportType === 'occupancy') {
      contextTitle.textContent = 'Portfolio Occupancy Distribution Matrix';
      
      const statusSummaryLogs = await api.reports.dashboard();
      const summaryMetrics = statusSummaryLogs.portfolio || { total_units: 0, occupied_units: 0 };
      
      const totalUnits = parseInt(summaryMetrics.total_units) || 0;
      const occupiedUnits = parseInt(summaryMetrics.occupied_units) || 0;
      const emptyUnits = totalUnits - occupiedUnits;
      const distributionRatio = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

      targetContentFrame.innerHTML = `
        <div class="row align-items-center py-3 g-4">
          <div class="col-md-5 text-center">
            <div class="fs-1 fw-extrabold text-teal font-monospace">${distributionRatio}%</div>
            <div class="text-muted fw-medium fs-7 text-uppercase tracking-wider">Net Portfolio Occupancy</div>
          </div>
          <div class="col-md-7">
            <div class="d-flex flex-column gap-2">
              <div class="d-flex justify-content-between border-bottom pb-1">
                <span class="text-slate-600 fw-medium"><i class="bi bi-circle-fill text-success me-2" style="font-size:10px;"></i>Occupied Contract Allocations</span>
                <span class="fw-bold text-slate-900 font-monospace">${occupiedUnits} Units</span>
              </div>
              <div class="d-flex justify-content-between border-bottom pb-1">
                <span class="text-slate-600 fw-medium"><i class="bi bi-circle-fill text-warning me-2" style="font-size:10px;"></i>Vacant Space Placements</span>
                <span class="fw-bold text-slate-900 font-monospace">${emptyUnits} Units</span>
              </div>
              <div class="d-flex justify-content-between pt-1">
                <span class="text-slate-700 fw-semibold">Aggregate Gross Spatial Capacity</span>
                <span class="fw-extrabold text-slate-900 font-monospace">${totalUnits} Units</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

  } catch (err) {
    targetContentFrame.innerHTML = `
      <div class="alert alert-danger border-0 d-flex gap-2 align-items-center" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <div><strong>Analytics Compilation Exception:</strong> ${err.message}</div>
      </div>
    `;
  }
}

// Bind analytics components securely to global paths
window.render_reports = render_reports;
window.generateReport = generateReport;