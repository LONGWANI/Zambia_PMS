/**
 * ZambiaPMS – Financial Ledger & Tenant Payment Gateway
 */

let paymentsCache = [];
let currentUserRole = '';

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

// ─── Tenant Financial View ─────────────────────────────────────────────────────

async function renderTenantFinancials() {
    showLoader('paymentTableBody', 6);
    try {
        // 1) Get tenant profile
        let tenantProfile;
        try {
            tenantProfile = await api.tenants.current();
        } catch (err) {
            toast(`Could not load tenant profile: ${err.message}`, 'err');
            // Fallback: use empty profile
            tenantProfile = { balance: '0.00', full_name: 'You', property_name: 'N/A', unit: 'N/A' };
        }

        const balance = parseFloat(tenantProfile.balance) || 0;
        const fullName = tenantProfile.full_name || 'You';
        const propertyName = tenantProfile.property_name || 'N/A';
        const unitNumber = tenantProfile.unit || 'N/A';

        // Update balance card
        const balanceEl = document.getElementById('tenantTotalBalance');
        if (balanceEl) balanceEl.textContent = zmw(balance);

        // 2) Get payment history (might fail if permissions not set)
        let payments = [];
        try {
            const response = await api.payments.list();
            payments = response.results || response || [];
        } catch (err) {
            console.warn('Could not load payment history:', err);
            // Continue – we'll show the balance row anyway
        }

        const tbody = document.getElementById('paymentTableBody');
        if (!tbody) return;

        let html = '';

        // ─── Always show a payment row with a Pay Now button ────
        const rowClass = balance > 0 ? 'table-warning' : 'table-success';
        const statusText = balance > 0 ? 'Outstanding' : 'All Clear';
        const btnClass = balance > 0 ? 'btn-primary' : 'btn-outline-primary';
        const btnText = balance > 0 ? 'Pay Now' : 'Pay in Advance';
        const amountToPay = balance > 0 ? balance : 0; // 0 will trigger custom amount prompt

        html += `
            <tr class="${rowClass}">
                <td class="fw-semibold">${fullName}</td>
                <td>${propertyName} <span class="badge bg-light text-dark font-monospace">${unitNumber}</span></td>
                <td class="font-monospace fw-bold ${balance > 0 ? 'text-danger' : 'text-success'}">${zmw(balance)}</td>
                <td><span class="badge ${balance > 0 ? 'bg-warning-subtle text-warning border border-warning' : 'bg-success-subtle text-success border border-success'}">${statusText}</span></td>
                <td>—</td>
                <td>
                    <button class="btn btn-sm ${btnClass} py-1 px-3 shadow-sm" onclick="openPaymentGatewayModal('BAL-${Date.now()}', ${amountToPay}, 'Rent')">
                        <i class="bi bi-credit-card me-1"></i> ${btnText}
                    </button>
                </td>
            </tr>
        `;

        // ─── Payment history rows ──────────────────────────────────
        if (payments.length > 0) {
            payments.forEach(p => {
                const isPending = (p.status || '').toLowerCase() === 'pending';
                const amountVal = parseFloat(p.amount) || 0;
                const refNum = p.reference_number || p.reference || `REF-${p.id}`;
                const statusStr = (p.status || 'completed').toLowerCase();
                const receiptLink = p.receipt_pdf || p.receipt_url || '#';

                html += `
                    <tr>
                        <td class="fw-medium">${p.tenant_name || 'N/A'}</td>
                        <td>${p.property_name || 'N/A'} ${p.unit_number ? `<span class="badge bg-light text-dark font-monospace">${p.unit_number}</span>` : ''}</td>
                        <td class="font-monospace fw-bold">${zmw(amountVal)}</td>
                        <td><span class="badge bg-light text-dark border">${p.payment_method || 'N/A'}</span></td>
                        <td class="font-monospace text-muted small">${refNum}</td>
                        <td>
                            ${isPending ? 
                                `<button class="btn btn-sm btn-primary py-1 px-3 shadow-sm" onclick="openPaymentGatewayModal('${refNum}', ${amountVal}, '${p.charge_type || 'Rent'}')">
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
        }

        tbody.innerHTML = html;

    } catch (err) {
        toast(`Error loading financials: ${err.message}`, 'err');
        const tbody = document.getElementById('paymentTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">${err.message}</td></tr>`;
        }
    }
}

// ─── Sandbox Payment Gateway Modal ──────────────────────────────────────────

function openPaymentGatewayModal(refNumber, amount, chargeType) {
    // If amount is 0, prompt for custom amount
    let finalAmount = amount;
    if (amount === 0) {
        const customAmount = prompt('Enter the amount you wish to pay (ZMW):', '100.00');
        if (!customAmount) return;
        const parsed = parseFloat(customAmount);
        if (isNaN(parsed) || parsed <= 0) {
            toast('Please enter a valid amount.', 'warn');
            return;
        }
        finalAmount = parsed;
    }

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
                <input type="text" class="form-control font-monospace fw-bold text-success fs-5 bg-light" value="${zmw(finalAmount)}" readonly>
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
            <button type="button" class="btn btn-success px-4" onclick="executeSandboxPayment('${refNumber}', ${finalAmount})">
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

        const response = await api.payments.processOnline({
            amount: amount,
            provider: provider,
            reference_number: refNumber,
            account_number: account,
        });

        closeModal();
        toast('Payment processed successfully!', 'ok');

        if (response.receipt) {
            showReceiptPopup(response.receipt);
        }

        // Refresh the financials (tenant view)
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

// ─── Manual Payment Recording (Landlord only) ──────────────────────────────

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
                        <option value="mobile_money">Mobile Money (MTN / Airtel)</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
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

    const paymentDate = document.getElementById('modalPayDate').value;
    // Compute period_month as first day of the payment month
    const periodMonth = paymentDate ? paymentDate.slice(0, 7) + '-01' : null;

    const payload = {
        tenant_id: document.getElementById('modalPayTenant').value,
        amount: parseFloat(document.getElementById('modalPayAmount').value),
        payment_method: document.getElementById('modalPayMethod').value,
        reference_number: document.getElementById('modalPayRef').value.trim(),
        payment_date: paymentDate,
        period_month: periodMonth,   // optional, but we provide it
        notes: 'Manual entry',
    };

    try {
        await api.payments.create(payload);
        closeModal();
        toast('Payment recorded successfully.', 'ok');
        await render_payments();
    } catch (err) {
        // Show detailed error from API
        let msg = err.message;
        if (err.response && err.response.data) {
            const data = err.response.data;
            if (typeof data === 'object') {
                msg = Object.values(data).flat().join('; ');
            }
        }
        toast(`Failed to record payment: ${msg}`, 'err');
    }
}

// ─── Filtering & Export (Landlord only) ─────────────────────────────────────

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
    const query = (document.getElementById('paymentSearch')?.value || '').toLowerCase().trim();
    const method = document.getElementById('paymentMethodFilter')?.value || 'all';

    // If method is not a valid choice (e.g., old value), treat as 'all'
    const validMethods = ['mobile_money', 'bank_transfer', 'cash', 'cheque', 'sandbox_gateway'];
    const methodFilter = (method === 'all' || !validMethods.includes(method)) ? 'all' : method;

    console.log(' Filtering with query:', query, 'method:', methodFilter);

    const filtered = paymentsCache.filter(p => {
        const tenant = (p.tenant_name || '').toLowerCase();
        const property = (p.property_name || '').toLowerCase();
        const ref = (p.reference_number || '').toLowerCase();
        const matchesQuery = !query ||
            tenant.includes(query) ||
            property.includes(query) ||
            ref.includes(query);

        const matchesMethod = methodFilter === 'all' || p.payment_method === methodFilter;

        return matchesQuery && matchesMethod;
    });

    console.log(` Filtered ${filtered.length} payments out of ${paymentsCache.length}`);
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