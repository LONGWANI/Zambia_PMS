/**
 * ZambiaPMS – Financial Ledger (Payments)
 */

let paymentsCache = [];

// ─── Main render ─────────────────────────────────────────────────────────────

async function render_payments() {
    showLoader('paymentTableBody', 6);

    try {
        const response = await api.payments.list();
        paymentsCache = response.results || response || [];

        const total = paymentsCache.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const subtextEl = document.getElementById('paymentsSubtext');
        if (subtextEl) {
            subtextEl.textContent =
                `${paymentsCache.length} transaction${paymentsCache.length !== 1 ? 's' : ''} · ` +
                `Gross total: ${zmw(total)}`;
        }

        applyPaymentFilters();
        bindPaymentFilters();

    } catch (err) {
        const tbody = document.getElementById('paymentTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-danger fw-medium">
                        <i class="bi bi-exclamation-circle me-1"></i> ${err.message}
                    </td>
                </tr>`;
        }
    }
}

// ─── Filtering ────────────────────────────────────────────────────────────────

function bindPaymentFilters() {
    ['paymentSearch', 'paymentMonthFilter', 'paymentMethodFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const fresh = el.cloneNode(true);
        el.replaceWith(fresh);
        fresh.addEventListener(id === 'paymentMethodFilter' ? 'change' : 'input', applyPaymentFilters);
    });
}

function applyPaymentFilters() {
    const tbody = document.getElementById('paymentTableBody');
    if (!tbody) return;

    const query  = (document.getElementById('paymentSearch')?.value || '').toLowerCase().trim();
    const month  = document.getElementById('paymentMonthFilter')?.value || '';
    const method = document.getElementById('paymentMethodFilter')?.value || 'all';

    const results = paymentsCache.filter(p => {
        const textMatch =
            (p.tenant_name       || '').toLowerCase().includes(query) ||
            (p.reference_number  || '').toLowerCase().includes(query) ||
            (p.property_name     || '').toLowerCase().includes(query);

        const monthMatch  = !month || (p.payment_date || '').startsWith(month);
        const methodMatch = method === 'all' || p.payment_method === method;

        return textMatch && monthMatch && methodMatch;
    });

    if (results.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-muted fw-medium">
                    No payments match the current filters.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = results.map(p => `
        <tr>
            <td class="align-middle fw-semibold text-slate-900">${p.tenant_name || '—'}</td>
            <td class="align-middle text-slate-800">
                <div>${p.property_name || '—'}</div>
                <div class="text-muted small">Unit ${p.unit_number || '—'}</div>
            </td>
            <td class="align-middle fw-bold font-monospace text-slate-900">${zmw(p.amount)}</td>
            <td class="align-middle">
                <span class="badge bg-light text-slate-700 border px-2 py-1 fw-medium">
                    ${p.payment_method_display || p.payment_method || 'Bank Transfer'}
                </span>
            </td>
            <td class="align-middle text-muted small font-monospace">
                ${p.reference_number || '—'}
            </td>
            <td class="align-middle text-slate-700" style="font-size: 13px;">
                <i class="bi bi-calendar3 text-muted me-1"></i>${p.payment_date || '—'}
            </td>
        </tr>`).join('');
}

// ─── Record payment modal ─────────────────────────────────────────────────────

async function openRecordPaymentModal() {
    try {
        const tenants = await api.tenants.list();
        const tenantOptions = (tenants.results || tenants || [])
            .map(t => `<option value="${t.id}">${t.full_name} — Unit ${t.unit_number || '?'}</option>`)
            .join('');

        const today = new Date().toISOString().split('T')[0];

        openModal(`
            <div class="modal-header border-0 pb-2">
                <h5 class="modal-title fw-bold text-slate-900 fs-5">Record Payment</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body border-0 py-2">
                <form id="paymentForm" class="d-flex flex-column gap-3">
                    <div>
                        <label class="form-label text-slate-700 fw-medium small mb-1">Tenant *</label>
                        <select class="form-select" id="modalPaymentTenant" required>
                            <option value="" disabled selected>Select tenant</option>
                            ${tenantOptions}
                        </select>
                    </div>
                    <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label text-slate-700 fw-medium small mb-1">Amount (ZMW) *</label>
                            <input type="number" class="form-control fw-bold" id="modalPaymentAmount"
                                   step="0.01" min="1" placeholder="0.00" required>
                        </div>
                        <div class="col-6">
                            <label class="form-label text-slate-700 fw-medium small mb-1">Payment Method *</label>
                            <select class="form-select" id="modalPaymentMethod" required>
                                <option value="bank_transfer" selected>Bank Transfer</option>
                                <option value="airtel_money">Airtel Money</option>
                                <option value="mtn_momo">MTN MoMo</option>
                                <option value="cheque">Cheque</option>
                                <option value="cash">Cash</option>
                            </select>
                        </div>
                    </div>
                    <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label text-slate-700 fw-medium small mb-1">Reference Number</label>
                            <input type="text" class="form-control" id="modalPaymentRef" placeholder="e.g. TXN1234567">
                        </div>
                        <div class="col-6">
                            <label class="form-label text-slate-700 fw-medium small mb-1">Payment Date *</label>
                            <input type="date" class="form-control" id="modalPaymentDate" value="${today}" required>
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer border-0 pt-3 d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-light border px-4" onclick="closeModal()">Cancel</button>
                <button type="button" class="btn btn-teal text-white px-4" onclick="submitPayment()">Record Payment</button>
            </div>`);

    } catch (err) {
        toast(`Failed to load tenant list: ${err.message}`, 'err');
    }
}

// ─── Submit payment ───────────────────────────────────────────────────────────

async function submitPayment() {
    const form = document.getElementById('paymentForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const payload = {
        tenant_id:        document.getElementById('modalPaymentTenant').value,
        amount:           parseFloat(document.getElementById('modalPaymentAmount').value),
        payment_method:   document.getElementById('modalPaymentMethod').value,
        reference_number: document.getElementById('modalPaymentRef').value.trim(),
        payment_date:     document.getElementById('modalPaymentDate').value,
    };

    try {
        await api.payments.create(payload);
        closeModal();
        toast('Payment recorded successfully.', 'ok');
        await render_payments();
    } catch (err) {
        toast(`Failed to record payment: ${err.message}`, 'err');
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportLedger() {
    if (paymentsCache.length === 0) {
        toast('No payments to export.', 'warn');
        return;
    }

    const headers = ['Tenant', 'Property', 'Unit', 'Amount', 'Method', 'Reference', 'Date'];
    const rows = paymentsCache.map(p => [
        p.tenant_name || '',
        p.property_name || '',
        p.unit_number || '',
        parseFloat(p.amount).toFixed(2),
        p.payment_method || '',
        p.reference_number || '',
        p.payment_date || '',
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `payments_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV export downloaded.', 'ok');
}

// ─── Exports ─────────────────────────────────────────────────────────────────
window.render_payments         = render_payments;
window.applyPaymentFilters     = applyPaymentFilters;
window.openRecordPaymentModal  = openRecordPaymentModal;
window.submitPayment           = submitPayment;
window.exportLedger            = exportLedger;
