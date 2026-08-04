/**
 * ZambiaPMS – Financial Ledger & Tenant Payment Gateway
 */

let paymentsCache = [];

// ─── Landlord Ledger View ─────────────────────────────────────────────────────

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

// ─── Tenant Financial View & Payment Table ─────────────────────────────────────

async function renderTenantFinancials() {
    showLoader('paymentTableBody', 6);
    try {
        const response = await api.payments.list();
        const payments = response.results || response || [];

        const tbody = document.getElementById('paymentTableBody');
        if (!tbody) return;

        let totalDue = 0;
        let html = '';

        payments.forEach(p => {
            const isPending = (p.status || '').toLowerCase() === 'pending';
            const amountVal = parseFloat(p.amount) || 0;
            if (isPending) totalDue += amountVal;

            const chargeType = (p.charge_type || p.payment_method || 'RENT').toUpperCase();
            const refNum = p.reference_number || p.reference || `REF-${p.id}`;
            const statusStr = (p.status || 'completed').toLowerCase();
            const receiptLink = p.receipt_pdf || p.receipt_url || '#';

            html += `
                <tr>
                    <td class="fw-semibold font-monospace">${refNum}</td>
                    <td><span class="badge bg-light text-dark border">${chargeType}</span></td>
                    <td class="font-monospace fw-bold">${zmw(amountVal)}</td>
                    <td>${p.due_date || p.payment_date || 'N/A'}</td>
                    <td>
                        <span class="badge ${statusStr === 'completed' || statusStr === 'paid' ? 'bg-success-subtle text-success border border-success' : 'bg-warning-subtle text-warning border border-warning'}">
                            ${statusStr.toUpperCase()}
                        </span>
                    </td>
                    <td>
                        ${isPending ? 
                            `<button class="btn btn-sm btn-primary py-1 px-3 shadow-sm" onclick="openPaymentGatewayModal('${refNum}', ${amountVal}, '${chargeType}')">
                                <i class="bi bi-credit-card me-1"></i> Pay Now
                            </button>` : 
                            `<a href="${receiptLink}" class="btn btn-sm btn-outline-secondary py-1" download>
                                <i class="bi bi-file-earmark-pdf me-1"></i> Receipt
                            </a>`
                        }
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html || '<tr><td colspan="6" class="text-center py-4 text-muted">No financial records found.</td></tr>';

        // Update KPI summary balance
        const balanceEl = document.getElementById('tenantTotalBalance');
        if (balanceEl) balanceEl.textContent = zmw(totalDue);

    } catch (err) {
        toast(`Error loading financials: ${err.message}`, 'err');
    }
}

// ─── Sandbox Payment Gateway Modal ──────────────────────────────────────────

function openPaymentGatewayModal(refNumber, amount, chargeType) {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold"><i class="bi bi-shield-check text-success me-2"></i>Online Payment Gateway (Sandbox)</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body">
            <div class="alert alert-info py-2" style="font-size:13px;">
                <i class="bi bi-shield-lock me-1"></i> Demonstration Mode: Test transactions will not process real funds.
            </div>
            <div class="mb-3">
                <label class="form-label text-muted small fw-medium">Reference Number</label>
                <input type="text" class="form-control font-monospace bg-light" value="${refNumber}" readonly>
            </div>
            <div class="mb-3">
                <label class="form-label text-muted small fw-medium">Total Payable Amount</label>
                <input type="text" class="form-control font-monospace fw-bold text-success fs-5 bg-light" value="${zmw(amount)}" readonly>
            </div>
            <div class="mb-3">
                <label class="form-label small fw-medium">Select Sandbox Provider</label>
                <select id="gatewayProvider" class="form-select">
                    <option value="paystack">Paystack Sandbox (Mobile Money / Cards)</option>
                    <option value="flutterwave">Flutterwave Test Mode</option>
                    <option value="stripe">Stripe Test Mode</option>
                    <option value="paypal">PayPal Sandbox</option>
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label small fw-medium">Card / Phone Number (Test Input)</label>
                <input type="text" id="sandboxAccountInput" class="form-control" placeholder="0970000000 or 4000 0000 0000 0002" value="0970000000">
            </div>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-success px-4" onclick="executeSandboxPayment('${refNumber}', ${amount})">
                <i class="bi bi-check-circle me-1"></i> Confirm Payment
            </button>
        </div>
    `;
    openModal(html);
}

async function executeSandboxPayment(refNumber, amount) {
    try {
        const provider = document.getElementById('gatewayProvider').value;
        const account = document.getElementById('sandboxAccountInput').value;

        showLoader('modalWrap');

        // Call the new online payment endpoint
        const response = await api.payments.processOnline({
            amount: amount,
            provider: provider,
            reference_number: refNumber,
            account_number: account,
        });

        closeModal();
        toast('Payment processed successfully!', 'ok');

        // Display receipt popup
        if (response.receipt) {
            showReceiptPopup(response.receipt);
        }

        // Refresh the financials
        if (typeof renderTenantFinancials === 'function') {
            await renderTenantFinancials();
        } else {
            await render_payments();
        }

    } catch (err) {
        closeModal();
        toast(`Payment failed: ${err.message}`, 'err');
    }
}

// ─── Receipt Popup ───────────────────────────────────────────────────────────

function showReceiptPopup(receipt) {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold"><i class="bi bi-receipt me-2"></i>Payment Receipt</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body">
            <div class="receipt-content p-3 bg-light rounded">
                <div class="text-center mb-3">
                    <h5 class="fw-bold">ZambiaPMS</h5>
                    <p class="text-muted small">Official Payment Receipt</p>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Receipt No:</strong></div>
                    <div class="col-6 text-end">${receipt.receipt_number || 'N/A'}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Date:</strong></div>
                    <div class="col-6 text-end">${receipt.date || 'N/A'}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Tenant:</strong></div>
                    <div class="col-6 text-end">${receipt.tenant || 'N/A'}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Unit:</strong></div>
                    <div class="col-6 text-end">${receipt.unit || 'N/A'}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Amount Paid:</strong></div>
                    <div class="col-6 text-end fw-bold">${zmw(receipt.amount_paid)}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Payment Method:</strong></div>
                    <div class="col-6 text-end">${receipt.payment_method || 'N/A'}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Reference:</strong></div>
                    <div class="col-6 text-end">${receipt.reference || 'N/A'}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Balance Before:</strong></div>
                    <div class="col-6 text-end">${zmw(receipt.balance_before)}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Balance After:</strong></div>
                    <div class="col-6 text-end">${zmw(receipt.balance_after)}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-6"><strong>Status:</strong></div>
                    <div class="col-6 text-end"><span class="badge bg-success">${receipt.status || 'PAID'}</span></div>
                </div>
                <div class="text-center mt-3">
                    <button class="btn btn-outline-secondary btn-sm" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print</button>
                </div>
            </div>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>
    `;
    openModal(html);
}

// ─── Manual Payment Recording ────────────────────────────────────────────────

function openRecordPaymentModal() {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">Record Manual Payment</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body">
            <form id="paymentRecordForm">
                <div class="mb-3">
                    <label class="form-label small fw-medium">Tenant</label>
                    <select id="modalPayTenant" class="form-select" required>
                        <option value="">Select Tenant...</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-medium">Amount (ZMW)</label>
                    <input type="number" step="0.01" id="modalPayAmount" class="form-control" placeholder="0.00" required>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-medium">Payment Method</label>
                    <select id="modalPayMethod" class="form-select" required>
                        <option value="MTN MoMo">MTN Mobile Money</option>
                        <option value="Airtel Money">Airtel Money</option>
                        <option value="Zamtel Kwacha">Zamtel Kwacha</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cash">Cash</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-medium">Reference Number</label>
                    <input type="text" id="modalPayRef" class="form-control" placeholder="e.g. TXN-987654">
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-medium">Payment Date</label>
                    <input type="date" id="modalPayDate" class="form-control" required value="${new Date().toISOString().slice(0, 10)}">
                </div>
            </form>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="submitRecordPayment()">Record Payment</button>
        </div>
    `;
    openModal(html);
    populatePaymentTenantDropdown();
}

async function populatePaymentTenantDropdown() {
    try {
        const res = await api.tenants.list();
        const tenants = res.results || res || [];
        const sel = document.getElementById('modalPayTenant');
        if (sel) {
            sel.innerHTML = '<option value="">Select Tenant...</option>' +
                tenants.map(t => `<option value="${t.id}">${t.full_name || t.name} (${t.unit_number || 'Unit'})</option>`).join('');
        }
    } catch (e) {
        console.error('Failed to load tenants for payment modal:', e);
    }
}

async function submitRecordPayment() {
    const form = document.getElementById('paymentRecordForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const payload = {
        tenant_id: document.getElementById('modalPayTenant').value,
        amount: parseFloat(document.getElementById('modalPayAmount').value),
        payment_method: document.getElementById('modalPayMethod').value,
        reference_number: document.getElementById('modalPayRef').value.trim(),
        payment_date: document.getElementById('modalPayDate').value,
        status: 'completed'
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

// ─── Filtering & Export ─────────────────────────────────────────────────────

function bindPaymentFilters() {
    ['paymentSearch', 'paymentMonthFilter', 'paymentMethodFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const fresh = el.cloneNode(true);
        el.replaceWith(fresh);
        fresh.addEventListener(id === 'paymentSearch' ? 'input' : 'change', applyPaymentFilters);
    });
}

function applyPaymentFilters() {
    const query = (document.getElementById('paymentSearch')?.value || '').toLowerCase();
    const method = document.getElementById('paymentMethodFilter')?.value || '';

    const filtered = paymentsCache.filter(p => {
        const matchesQuery = !query ||
            (p.tenant_name && p.tenant_name.toLowerCase().includes(query)) ||
            (p.property_name && p.property_name.toLowerCase().includes(query)) ||
            (p.reference_number && p.reference_number.toLowerCase().includes(query));
        const matchesMethod = !method || p.payment_method === method;

        return matchesQuery && matchesMethod;
    });

    populatePaymentsTable(filtered);
}

function populatePaymentsTable(payments) {
    const tbody = document.getElementById('paymentTableBody');
    if (!tbody) return;

    if (payments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    No payment records found matching your filters.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = payments.map(p => `
        <tr>
            <td class="fw-medium">${p.tenant_name || 'N/A'}</td>
            <td>${p.property_name || 'N/A'} ${p.unit_number ? `<span class="badge bg-light text-dark font-monospace">${p.unit_number}</span>` : ''}</td>
            <td class="fw-bold text-success font-monospace">${zmw(p.amount)}</td>
            <td><span class="badge bg-light text-dark border">${p.payment_method || 'N/A'}</span></td>
            <td class="font-monospace text-muted small">${p.reference_number || '—'}</td>
            <td>${p.payment_date || 'N/A'}</td>
        </tr>
    `).join('');
}

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
window.renderTenantFinancials  = renderTenantFinancials;
window.openPaymentGatewayModal = openPaymentGatewayModal;
window.executeSandboxPayment   = executeSandboxPayment;
window.openRecordPaymentModal  = openRecordPaymentModal;
window.submitRecordPayment     = submitRecordPayment;
window.applyPaymentFilters     = applyPaymentFilters;
window.exportLedger            = exportLedger;