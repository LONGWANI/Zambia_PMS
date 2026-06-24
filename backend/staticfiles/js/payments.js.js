async function render_payments() {
  showLoader();
  try {
    const data = await api.payments.list();
    const payments = data.results || data;
    
    const html = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h2 class="fs-4 fw-bold text-slate-900 mb-1">Financial Ledger</h2>
            <div class="text-muted fs-6">Tracking ${payments.length} transactions</div>
        </div>
        <button class="btn-primary d-flex align-items-center gap-2" onclick="openRecordPaymentModal()">
            <i class="bi bi-receipt"></i> Record Payment
        </button>
      </div>
      
      <div class="saas-card p-0">
          <div class="table-responsive border-0">
              <table class="saas-table">
                  <thead>
                      <tr>
                          <th>Tenant</th>
                          <th>Property / Unit</th>
                          <th>Amount (ZMW)</th>
                          <th>Method</th>
                          <th>Date</th>
                          <th class="text-end">Actions</th>
                      </tr>
                  </thead>
                  <tbody>
                    ${payments.map(p => `
                      <tr>
                        <td class="fw-medium text-slate-900">${p.tenant_name}</td>
                        <td>
                            <div>${p.property_name}</div>
                            <div class="text-muted" style="font-size: 11px;">Unit ${p.unit_number}</div>
                        </td>
                        <td class="font-monospace fw-bold text-slate-900">${zmw(p.amount)}</td>
                        <td><span class="badge badge-primary">${p.payment_method_display}</span></td>
                        <td class="text-muted">${p.payment_date}</td>
                        <td class="text-end">
                            <button class="btn-outline btn-sm" onclick="viewReceipt('${p.id}')">
                                <i class="bi bi-file-earmark-text"></i> Receipt
                            </button>
                        </td>
                      </tr>`).join('')}
                  </tbody>
              </table>
          </div>
      </div>`;
    document.getElementById('content').innerHTML = html;
  } catch (err) {
    document.getElementById('content').innerHTML = `<div class="alert alert-danger m-4">Error: ${err.message}</div>`;
  }
}
window.render_payments = render_payments;