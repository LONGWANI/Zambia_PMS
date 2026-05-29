/**
 * ZambiaPMS – Financial Ledger Processing Engine
 * Handles structural transaction logs, search indices, and programmatic payment collection tracking.
 */

let masterFinancialLedgerCache = [];

async function render_payments() {
  const tableBody = document.getElementById('paymentTableBody');
  const counterSubtext = document.getElementById('paymentsSubtext');
  const searchInput = document.getElementById('paymentSearch');
  const monthFilterInput = document.getElementById('paymentMonthFilter');

  try {
    const responsePayload = await api.payments.list();
    masterFinancialLedgerCache = responsePayload.results || responsePayload || [];

    const calculatedGrossCollection = masterFinancialLedgerCache.reduce((accum, curr) => accum + (parseFloat(curr.amount) || 0), 0);
    
    if (counterSubtext) {
      counterSubtext.textContent = `Aggregated gross revenue capture total: ${zmw(calculatedGrossCollection)} (${masterFinancialLedgerCache.length} transactions processed)`;
    }

    // Trigger operational layout compilation
    executeFinancialUIRenderFilter();

    // Attach text search anchors cleanly
    if (searchInput) {
      searchInput.replaceWith(searchInput.cloneNode(true));
      document.getElementById('paymentSearch').addEventListener('input', executeFinancialUIRenderFilter);
    }

    // Attach dynamic chronological filter parameters
    if (monthFilterInput) {
      monthFilterInput.replaceWith(monthFilterInput.cloneNode(true));
      document.getElementById('paymentMonthFilter').addEventListener('input', executeFinancialUIRenderFilter);
    }

  } catch (err) {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger fw-medium"><i class="bi bi-exclamation-circle me-1"></i> Financial pipeline trace error: ${err.message}</td></tr>`;
    }
  }
}

/**
 * Filter evaluation processing engine map. Builds standard tabular blocks matching parameters.
 */
function executeFinancialUIRenderFilter() {
  const tableBody = document.getElementById('paymentTableBody');
  const textQuery = (document.getElementById('paymentSearch')?.value || '').toLowerCase().trim();
  const targetsTargetMonth = document.getElementById('paymentMonthFilter')?.value || ''; // Returns format structural format 'YYYY-MM'

  if (!tableBody) return;

  const processedSubset = masterFinancialLedgerCache.filter(item => {
    const textMatches = 
      item.tenant_name.toLowerCase().includes(textQuery) ||
      (item.reference_number && item.reference_number.toLowerCase().includes(textQuery)) ||
      (item.property_name && item.property_name.toLowerCase().includes(textQuery));

    let dateMatches = true;
    if (targetsTargetMonth && item.payment_date) {
      dateMatches = item.payment_date.startsWith(targetsTargetMonth);
    }

    return textMatches && dateMatches;
  });

  if (processedSubset.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted fw-medium fs-6">No matching transactions discovered inside ledger indices.</td></tr>`;
    return;
  }

  tableBody.innerHTML = processedSubset.map(entry => {
    return `
      <tr>
        <td class="align-middle fw-semibold text-slate-900">
          ${entry.tenant_name}
        </td>
        <td class="align-middle text-slate-800">
          <div>${entry.property_name || 'Portfolio Contract'}</div>
          <div class="text-muted small">Unit ${entry.unit_number || '—'}</div>
        </td>
        <td class="align-middle fw-bold font-monospace text-slate-900">
          ${zmw(entry.amount)}
        </td>
        <td class="align-middle">
          <span class="badge bg-light text-slate-700 border px-2 py-1 fs-8 fw-medium">${entry.payment_method_display || entry.payment_method || 'Bank Transfer'}</span>
        </td>
        <td class="align-middle text-muted small" style="font-family: monospace;">
          ${entry.reference_number || 'Internal Transfer'}
        </td>
        <td class="align-middle text-slate-700" style="font-size:13px;">
          <i class="bi bi-calendar3 text-muted me-1"></i>${entry.payment_date || '—'}
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Compiles transaction collection sheets into open views
 */
async function openRecordPaymentModal() {
  try {
    const targetedUsers = await api.tenants.list();
    const structuredUserOptions = targetedUsers.map(t => `<option value="${t.id}">${t.full_name} (${t.property_name || 'Contract'} - Unit ${t.unit_number || '?'})</option>`).join('');

    // Default current time configuration limits
    const currentZambianDateStamp = new Date().toISOString().split('T')[0];

    openModal(`
      <div class="modal-header border-0 pb-2">
        <h5 class="modal-title fw-bold text-slate-900 fs-5">Record Ledger Payment</h5>
        <button type="button" class="btn-close fs-7" onclick="closeModal()"></button>
      </div>
      <div class="modal-body border-0 py-2">
        <form id="ledgerPaymentEntryForm" class="d-flex flex-column gap-3">
          <div>
            <label class="form-label text-slate-700 fw-medium small mb-1">Payer Account (Tenant Link) *</label>
            <select class="form-select" id="modalPaymentTenant" required>
              <option value="" disabled selected>Select associated member profile</option>
              ${structuredUserOptions}
            </select>
          </div>
          <div class="row g-2">
            <div class="col-6">
              <label class="form-label text-slate-700 fw-medium small mb-1">Amount Transferred (ZMW) *</label>
              <input type="number" class="form-control fw-bold" id="modalPaymentAmount" step="0.01" min="1" placeholder="0.00" required>
            </div>
            <div class="col-6">
              <label class="form-label text-slate-700 fw-medium small mb-1">Transaction Channel *</label>
              <select class="form-select" id="modalPaymentMethod" required>
                <option value="bank_transfer" selected>Bank Transfer / EFT</option>
                <option value="airtel_money">Airtel Money</option>
                <option value="mtn_momo">MTN MoMo</option>
                <option value="cheque">Corporate Cheque</option>
                <option value="cash">Direct Cash Receipt</option>
              </select>
            </div>
          </div>
          <div class="row g-2">
            <div class="col-6">
              <label class="form-label text-slate-700 fw-medium small mb-1">Reference Code / ID</label>
              <input type="text" class="form-control" id="modalPaymentRef" placeholder="e.g., TXN1039485">
            </div>
            <div class="col-6">
              <label class="form-label text-slate-700 fw-medium small mb-1">Execution Date *</label>
              <input type="date" class="form-control" id="modalPaymentDate" value="${currentZambianDateStamp}" required>
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer border-0 pt-3 d-flex justify-content-end gap-2">
        <button type="button" class="btn btn-light border px-4" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-teal text-white px-4" onclick="submitPayment()">Record Payment</button>
      </div>
    `);
  } catch (err) {
    toast(`Failed to load structural workflow dependency layers: ${err.message}`, 'err');
  }
}

/**
 * Evaluates execution forms and routes payload parameters back down into backend processing threads
 */
async function submitPayment() {
  const activePaymentForm = document.getElementById('ledgerPaymentEntryForm');
  if (activePaymentForm && !activePaymentForm.checkValidity()) {
    activePaymentForm.reportValidity();
    return;
  }

  const tenantId = document.getElementById('modalPaymentTenant').value;
  const paymentAmount = parseFloat(document.getElementById('modalPaymentAmount').value);
  const selectedMethod = document.getElementById('modalPaymentMethod').value;
  const trackingReference = document.getElementById('modalPaymentRef').value.trim();
  const compilationDate = document.getElementById('modalPaymentDate').value;

  const executionPayload = {
    tenant_id: tenantId,
    amount: paymentAmount,
    payment_method: selectedMethod,
    reference_number: trackingReference,
    payment_date: compilationDate
  };

  try {
    await api.payments.create(executionPayload);
    closeModal();
    toast(`Payment capture event registered successfully into structural indexes`, 'ok');
    await render_payments();
  } catch (err) {
    toast(`Ledger allocation error exception: ${err.message}`, 'err');
  }
}

/**
 * Triggers spreadsheet generation parameters out to client processing systems
 */
function exportLedger() {
  if (masterFinancialLedgerCache.length === 0) {
    toast('No operational indices available inside current view trace to map.', 'warn');
    return;
  }
  toast('Compiling unified balance ledger workbook sheets... download initialization active', 'ok');
}

// Bind interfaces securely to global environments
window.render_payments = render_payments;
window.openRecordPaymentModal = openRecordPaymentModal;
window.submitPayment = submitPayment;
window.exportLedger = exportLedger;