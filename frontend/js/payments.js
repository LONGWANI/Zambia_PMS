/**
 * ZambiaPMS – Financial Ledger & Tenant Payment Gateway (v5)
 * Final error handling for receipt fetch.
 */
(function () {
    'use strict';

    const REQUIRED_GLOBALS = ['api', 'auth'];
    const missing = REQUIRED_GLOBALS.filter(n => typeof window[n] === 'undefined');
    if (missing.length) {
        console.error(`[ZambiaPMS][payments.js] Missing required globals: ${missing.join(', ')}.`);
    }
    if (typeof window.toast !== 'function') {
        window.toast = (msg) => console.log('[toast]', msg);
    }
    if (typeof window.zmw !== 'function') {
        console.warn('[ZambiaPMS][payments.js] window.zmw() not found — using fallback.');
        window.zmw = (n) => 'ZMW ' + (parseFloat(n) || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    let paymentsCache = [];
    let currentUserRole = '';
    const TABLE_COLS = 8;

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function money(v) { return window.zmw(parseFloat(v) || 0); }

    function fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return esc(iso);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function fmtMonth(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso).slice(0, 7);
        return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    }

    function errMessage(err, fallback) {
        if (err && err.data && typeof err.data === 'object' && !Array.isArray(err.data)) {
            const flat = Object.values(err.data).flat().join('; ');
            if (flat) return flat;
        }
        return (err && err.message) || fallback || 'Unexpected error.';
    }

    function triggerBlobDownload(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    }

    async function getCurrentUser() {
        try {
            if (typeof auth !== 'undefined' && typeof auth.me === 'function') {
                const cached = await auth.me();
                if (cached && cached.role) return cached;
            }
        } catch (_) { }
        try {
            const fresh = await api.auth.me();
            if (fresh) { auth.setUser?.(fresh); }
            return fresh;
        } catch (_) {
            return null;
        }
    }

    // Global exports
    window.render_payments         = render_payments;
    window.renderTenantFinancials  = renderTenantFinancials;
    window.openPaymentGatewayModal = openPaymentGatewayModal;
    window.executeSandboxPayment   = executeSandboxPayment;
    window.openRecordPaymentModal  = openRecordPaymentModal;
    window.submitRecordPayment     = submitRecordPayment;
    window.approvePayment          = approvePayment;
    window.viewReceipt             = viewReceipt;
    window.sendReceipt             = sendReceipt;
    window.batchReceipts           = batchReceipts;
    window.showArrearsReport       = showArrearsReport;
    window.applyPaymentFilters     = applyPaymentFilters;
    window.exportLedger            = exportLedger;
    window.paymentsDebug           = () => ({ cached: paymentsCache.length, role: currentUserRole });
    console.info('[ZambiaPMS] payments.js ready ✓');

    // ─── Delegated click dispatcher ────────────────────────────────
    if (!document.__zpsPaymentsBound) {
        document.__zpsPaymentsBound = true;
        document.addEventListener('click', function (e) {
            const el = e.target.closest('[data-action]');
            if (!el) return;
            const action = el.getAttribute('data-action');
            const id = el.getAttribute('data-id');
            switch (action) {
                case 'approve-payment':       approvePayment(id); break;
                case 'view-receipt':          viewReceipt(id); break;
                case 'send-receipt':          sendReceipt(id); break;
                case 'batch-receipts':        batchReceipts(); break;
                case 'show-arrears-report':   showArrearsReport(); break;
                case 'export-ledger-csv':     exportLedger(); break;
                case 'open-record-payment':   openRecordPaymentModal(); break;
                case 'apply-payment-filters': applyPaymentFilters(); break;
                case 'open-gateway':
                    openPaymentGatewayModal(
                        el.getAttribute('data-ref') || '',
                        parseFloat(el.getAttribute('data-amount')) || 0,
                        el.getAttribute('data-type') || 'Rent'
                    );
                    break;
                case 'confirm-sandbox-payment':
                    executeSandboxPayment(
                        el.getAttribute('data-ref') || '',
                        parseFloat(el.getAttribute('data-amount')) || 0
                    );
                    break;
                case 'submit-record-payment': submitRecordPayment(); break;
                case 'print-modal':           window.print(); break;
                default: break;
            }
        });
    }

    // ─── Row builders ───────────────────────────────────────────────
    function statusBadge(status) {
        const s = (status || '').toLowerCase();
        const map = {
            confirmed: ['bg-success-subtle', 'text-success-emphasis', 'border-success-subtle', 'Confirmed'],
            pending:   ['bg-warning-subtle', 'text-warning-emphasis', 'border-warning-subtle', 'Pending'],
            reversed:  ['bg-danger-subtle',  'text-danger-emphasis',  'border-danger-subtle',  'Reversed'],
        };
        const m = map[s] || ['bg-secondary-subtle', 'text-secondary-emphasis', 'border-secondary-subtle', status || 'Unknown'];
        return `<span class="badge ${m[0]} ${m[1]} border ${m[2]}">${esc(m[3])}</span>`;
    }

    function prepaidBadge(p) {
        if (!p.is_prepaid) return '';
        const allocs = Array.isArray(p.prepaid_allocations) ? p.prepaid_allocations : [];
        const count = (p.months_covered || []).length || allocs.length;
        const tip = allocs.map(a => `${fmtMonth(a.month)}: ZMW ${a.amount}`).join('  •  ') || 'Prepaid months';
        return `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle ms-1"
                      data-bs-toggle="tooltip" data-bs-placement="top"
                      data-bs-title="${esc(tip)}" title="${esc(tip)}">Prepaid ${count} mo</span>`;
    }

    function actionCell(p) {
        const isManager = currentUserRole === 'landlord' || currentUserRole === 'admin';
        const printBtn = `
            <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                    data-action="view-receipt" data-id="${esc(p.id)}"
                    title="View / Print receipt">
                <i class="bi bi-printer"></i> Print
            </button>`;
        if (!isManager) return printBtn;

        const sendBtn = `
            <button class="btn btn-sm btn-outline-primary py-0 px-2 ms-1"
                    data-action="send-receipt" data-id="${esc(p.id)}"
                    title="Resend receipt email to tenant">
                <i class="bi bi-envelope"></i> Send
            </button>`;

        const approveBtn = (p.status === 'pending') ? `
            <button class="btn btn-sm btn-warning py-0 px-2 me-1"
                    data-action="approve-payment" data-id="${esc(p.id)}"
                    title="Confirm this payment">
                <i class="bi bi-check-circle"></i> Approve
            </button>` : '';

        return approveBtn + printBtn + sendBtn;
    }

    // ─── Landlord view ──────────────────────────────────────────────
    async function render_payments() {
        showLoaderSafe('paymentTableBody', TABLE_COLS);

        try {
            const user = await getCurrentUser();
            currentUserRole = user?.role || '';

            const response = await api.payments.list();
            paymentsCache = response.results || response || [];

            const total = paymentsCache.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
            const pendingCount = paymentsCache.filter(p => (p.status || '').toLowerCase() === 'pending').length;
            const subtextEl = document.getElementById('paymentsSubtext');
            if (subtextEl) {
                subtextEl.textContent =
                    `${paymentsCache.length} transaction${paymentsCache.length !== 1 ? 's' : ''} · ` +
                    `Gross total: ${money(total)}` +
                    (pendingCount ? ` · ${pendingCount} pending approval` : '');
            }

            if (currentUserRole === 'landlord' || currentUserRole === 'admin') {
                await populatePropertyFilter();
            }

            bindPaymentFilters();
            applyPaymentFilters();

        } catch (err) {
            console.error('[payments.js] render_payments failed:', err);
            const tbody = document.getElementById('paymentTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="${TABLE_COLS}" class="text-center py-4 text-danger fw-medium">
                            <i class="bi bi-exclamation-circle me-1"></i> ${esc(errMessage(err))}
                        </td>
                    </tr>`;
            }
        }
    }

    // ─── Tenant view ────────────────────────────────────────────────
    async function renderTenantFinancials() {
        showLoaderSafe('paymentTableBody', TABLE_COLS);
        try {
            let tenantProfile;
            try {
                tenantProfile = await api.tenants.current();
            } catch (err) {
                toast(`Could not load tenant profile: ${errMessage(err)}`, 'err');
                tenantProfile = { balance: '0.00', full_name: 'You', property_name: 'N/A', unit: 'N/A' };
            }

            const balance = parseFloat(tenantProfile.balance) || 0;
            const fullName = tenantProfile.full_name || 'You';
            const propertyName = tenantProfile.property_name || 'N/A';
            const unitNumber = tenantProfile.unit || 'N/A';

            const balanceEl = document.getElementById('tenantTotalBalance');
            if (balanceEl) balanceEl.textContent = money(balance);

            let payments = [];
            try {
                const response = await api.payments.list();
                payments = response.results || response || [];
            } catch (err) {
                console.warn('Could not load payment history:', err);
            }

            const tbody = document.getElementById('paymentTableBody');
            if (!tbody) return;

            let html = '';

            const rowClass = balance > 0 ? 'table-warning' : 'table-success';
            const statusText = balance > 0 ? 'Outstanding' : 'All Clear';
            const btnClass = balance > 0 ? 'btn-primary' : 'btn-outline-primary';
            const btnText = balance > 0 ? 'Pay Now' : 'Pay in Advance';
            const amountToPay = balance > 0 ? balance : 0;

            html += `
                <tr class="${rowClass}">
                    <td class="fw-semibold">${esc(fullName)}</td>
                    <td>${esc(propertyName)} <span class="badge bg-light text-dark font-monospace">${esc(unitNumber)}</span></td>
                    <td class="font-monospace fw-bold ${balance > 0 ? 'text-danger' : 'text-success'}">${money(balance)}</td>
                    <td><span class="badge bg-light text-dark border">Balance</span></td>
                    <td class="font-monospace text-muted small">—</td>
                    <td>—</td>
                    <td>
                        <span class="badge ${balance > 0 ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' : 'bg-success-subtle text-success-emphasis border border-success-subtle'}">${esc(statusText)}</span>
                    </td>
                    <td>
                        <button class="btn btn-sm ${btnClass} py-1 px-3 shadow-sm"
                                data-action="open-gateway"
                                data-ref="BAL-${Date.now()}"
                                data-amount="${amountToPay}"
                                data-type="Rent">
                            <i class="bi bi-credit-card me-1"></i> ${btnText}
                        </button>
                    </td>
                </tr>
            `;

            if (payments.length > 0) {
                payments.forEach(p => {
                    const isPending = (p.status || '').toLowerCase() === 'pending';
                    const amountVal = parseFloat(p.amount) || 0;
                    const refNum = p.reference_number || p.reference || `REF-${p.id}`;

                    html += `
                        <tr data-payment-id="${esc(p.id)}">
                            <td class="fw-medium">${esc(p.tenant_name || 'N/A')}</td>
                            <td>${esc(p.property_name || 'N/A')} ${p.unit_number ? `<span class="badge bg-light text-dark font-monospace">${esc(p.unit_number)}</span>` : ''}</td>
                            <td class="font-monospace fw-bold">${money(amountVal)}</td>
                            <td><span class="badge bg-light text-dark border">${esc(p.payment_method_display || p.payment_method || 'N/A')}</span></td>
                            <td class="font-monospace text-muted small">${esc(refNum)}</td>
                            <td>${fmtDate(p.payment_date)}</td>
                            <td>${statusBadge(p.status)}${prepaidBadge(p)}</td>
                            <td>
                                ${isPending
                                    ? `<button class="btn btn-sm btn-primary py-1 px-3 shadow-sm"
                                            data-action="open-gateway"
                                            data-ref="${esc(refNum)}"
                                            data-amount="${amountVal}"
                                            data-type="${esc(p.charge_type || 'Rent')}">
                                        <i class="bi bi-credit-card me-1"></i> Pay Now
                                    </button>`
                                    : `<button class="btn btn-sm btn-outline-secondary py-1"
                                            data-action="view-receipt" data-id="${esc(p.id)}">
                                        <i class="bi bi-printer me-1"></i> Print
                                    </button>`
                                }
                            </td>
                        </tr>
                    `;
                });
            }

            tbody.innerHTML = html;
            initTooltips();

        } catch (err) {
            toast(`Error loading financials: ${errMessage(err)}`, 'err');
            const tbody = document.getElementById('paymentTableBody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="${TABLE_COLS}" class="text-center py-4 text-danger">${esc(errMessage(err))}</td></tr>`;
            }
        }
    }

    // ─── Gateway Modal ──────────────────────────────────────────────
    function openPaymentGatewayModal(refNumber, amount, chargeType) {
        if (typeof openModal !== 'function') {
            console.error('[payments.js] openModal() is not available');
            return;
        }
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
                    <input type="text" class="form-control font-monospace bg-light" value="${esc(refNumber)}" readonly>
                </div>
                <div class="mb-3">
                    <label class="form-label text-muted small fw-medium">Total Payable Amount</label>
                    <input type="text" class="form-control font-monospace fw-bold text-success fs-5 bg-light" value="${esc(money(finalAmount))}" readonly>
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
                <button type="button" class="btn btn-success px-4"
                        data-action="confirm-sandbox-payment"
                        data-ref="${esc(refNumber)}"
                        data-amount="${finalAmount}">
                    <i class="bi bi-check-circle me-1"></i> Confirm Payment
                </button>
            </div>
        `;
        openModal(html);
    }

    async function executeSandboxPayment(refNumber, amount) {
        try {
            const providerEl = document.getElementById('gatewayProvider');
            const accountEl = document.getElementById('sandboxAccountInput');
            const provider = providerEl ? providerEl.value : 'paystack';
            const account = accountEl ? accountEl.value : '';

            showLoaderSafe('modalWrap');

            const response = await api.payments.processOnline({
                amount: amount,
                provider: provider,
                reference_number: refNumber,
                account_number: account,
            });

            closeModal();
            toast('Payment recorded successfully and is pending approval.', 'ok');

            if (response.receipt) showReceiptPopup(response.receipt);

            if (currentUserRole && currentUserRole !== 'tenant') {
                await render_payments();
            } else {
                await renderTenantFinancials();
            }

        } catch (err) {
            if (typeof closeModal === 'function') closeModal();
            toast(`Payment failed: ${errMessage(err)}`, 'err');
        }
    }

    // ─── Receipt Popup ──────────────────────────────────────────────
    function showReceiptPopup(receipt) {
        if (typeof openModal !== 'function') return;

        const allocs = Array.isArray(receipt.prepaid_months) ? receipt.prepaid_months : [];
        const prepaidHtml = allocs.length ? `
            <hr class="my-2">
            <div class="small text-muted mb-1 fw-semibold">Prepaid allocation (total ZMW ${esc(receipt.total_prepaid || '0.00')}):</div>
            ${allocs.map(a => `
                <div class="d-flex justify-content-between small">
                    <span>${esc(fmtMonth(a.month))}</span>
                    <span class="font-monospace">ZMW ${esc(a.amount)}</span>
                </div>`).join('')}
        ` : '';

        const html = `
            <div class="modal-header border-0 pb-0">
                <h5 class="fw-bold"><i class="bi bi-receipt me-2"></i>Payment Receipt</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body">
                <div class="receipt-content p-3 bg-light rounded">
                    <div class="text-center mb-3">
                        <h5 class="fw-bold">ZambiaPMS</h5>
                        <p class="text-muted small mb-0">Official Payment Receipt</p>
                    </div>
                    <div class="row mb-2"><div class="col-6"><strong>Receipt No:</strong></div><div class="col-6 text-end font-monospace">${esc(receipt.receipt_number || 'N/A')}</div></div>
                    <div class="row mb-2"><div class="col-6"><strong>Date:</strong></div><div class="col-6 text-end">${esc(receipt.date || 'N/A')}</div></div>
                    <div class="row mb-2"><div class="col-6"><strong>Tenant:</strong></div><div class="col-6 text-end">${esc(receipt.tenant || 'N/A')}</div></div>
                    <div class="row mb-2"><div class="col-6"><strong>Unit:</strong></div><div class="col-6 text-end">${esc(receipt.unit || 'N/A')}</div></div>
                    <div class="row mb-2"><div class="col-6"><strong>Charge Type:</strong></div><div class="col-6 text-end">${esc(receipt.charge_type || 'Rent')}</div></div>
                    <div class="row mb-2"><div class="col-6"><strong>Amount Paid:</strong></div><div class="col-6 text-end fw-bold">${esc(money(receipt.amount_paid))}</div></div>
                    <div class="row mb-2"><div class="col-6"><strong>Payment Method:</strong></div><div class="col-6 text-end">${esc(receipt.payment_method || 'N/A')}</div></div>
                    <div class="row mb-2"><div class="col-6"><strong>Reference:</strong></div><div class="col-6 text-end font-monospace">${esc(receipt.reference || '—')}</div></div>
                    <div class="row mb-2"><div class="col-6"><strong>Balance Before:</strong></div><div class="col-6 text-end">${esc(money(receipt.balance_before))}</div></div>
                    <div class="row mb-2"><div class="col-6"><strong>Balance After:</strong></div><div class="col-6 text-end fw-bold">${esc(money(receipt.balance_after))}</div></div>
                    ${prepaidHtml}
                    ${receipt.approved_by ? `<div class="row mb-2 mt-1"><div class="col-6"><strong>Approved By:</strong></div><div class="col-6 text-end">${esc(receipt.approved_by)}</div></div>` : ''}
                    <div class="row mt-2"><div class="col-6"><strong>Status:</strong></div><div class="col-6 text-end"><span class="badge bg-success">${esc(receipt.status || 'PAID')}</span></div></div>
                    <div class="text-center mt-3">
                        <button class="btn btn-outline-secondary btn-sm" data-action="print-modal"><i class="bi bi-printer me-1"></i> Print</button>
                    </div>
                </div>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        `;
        openModal(html);
    }

    // ─── Manual Payment Recording ──────────────────────────────────
    function openRecordPaymentModal() {
        if (typeof openModal !== 'function') {
            console.error('[payments.js] openModal() is not available');
            return;
        }
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
                        <label class="form-label small fw-medium">Charge Type</label>
                        <select id="modalPayChargeType" class="form-select" required>
                            <option value="rent">Rent</option>
                            <option value="utility">Utility</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="deposit">Security Deposit</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small fw-medium">Amount (ZMW)</label>
                        <input type="number" step="0.01" min="0.01" id="modalPayAmount" class="form-control" placeholder="0.00" required>
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
                    <div class="alert alert-light border py-2 small text-muted mb-0">
                        <i class="bi bi-info-circle me-1"></i> Payments are recorded as <strong>pending</strong> until approved.
                    </div>
                </form>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button type="button" class="btn btn-light" onclick="closeModal()">Cancel</button>
                <button type="button" class="btn btn-primary px-4" data-action="submit-record-payment">Record Payment</button>
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
                    tenants.map(t =>
                        `<option value="${esc(t.id)}">${esc(t.full_name || t.name)} (${esc(t.unit || t.unit_number || 'Unit')})</option>`
                    ).join('');
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
        const periodMonth = paymentDate ? paymentDate.slice(0, 7) + '-01' : null;

        const payload = {
            tenant_id: document.getElementById('modalPayTenant').value,
            charge_type: (document.getElementById('modalPayChargeType') || {}).value || 'rent',
            amount: parseFloat(document.getElementById('modalPayAmount').value),
            payment_method: document.getElementById('modalPayMethod').value,
            reference_number: (document.getElementById('modalPayRef').value || '').trim(),
            payment_date: paymentDate,
            period_month: periodMonth,
            notes: 'Manual entry',
        };

        if (!payload.tenant_id) {
            toast('Please select a tenant.', 'warn');
            return;
        }

        try {
            await api.payments.create(payload);
            if (typeof closeModal === 'function') closeModal();
            toast('Payment recorded successfully (pending approval).', 'ok');
            await render_payments();
        } catch (err) {
            toast(`Failed to record payment: ${errMessage(err)}`, 'err');
        }
    }

    // ─── Approve Payment ────────────────────────────────────────────
    async function approvePayment(paymentId) {
        if (!confirm('Approve this payment? It will be applied to the lease balance immediately.')) return;
        try {
            const updated = await api.payments.approve(paymentId);
            toast(updated && updated.is_prepaid
                ? `Payment approved. ${(updated.months_covered || []).length} future month(s) prepaid.`
                : 'Payment approved successfully.', 'ok');
            await render_payments();
        } catch (err) {
            toast(`Approval failed: ${errMessage(err)}`, 'err');
        }
    }

    // ─── View / Print Receipt (parses error JSON) ──────────────────
    async function viewReceipt(paymentId) {
        if (!paymentId) {
            toast('Payment ID missing. Please refresh the page and try again.', 'err');
            return;
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(paymentId)) {
            toast(`Invalid payment ID format: ${paymentId}`, 'err');
            return;
        }
        const url = `/api/payments/${paymentId}/receipt/?format=pdf`;
        const token = auth.getAccessToken();
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                let errorMsg = 'Unable to load receipt.';
                try {
                    const text = await response.text();
                    console.error('[viewReceipt] raw error response:', text);
                    try {
                        const json = JSON.parse(text);
                        // Try to extract a meaningful error message
                        errorMsg = json.error || json.message || json.detail || json.error_message;
                        if (typeof errorMsg === 'object') {
                            errorMsg = JSON.stringify(errorMsg);
                        }
                    } catch (e) {
                        errorMsg = text || response.statusText;
                    }
                } catch (e) {
                    errorMsg = `HTTP ${response.status}`;
                }
                toast(`Receipt not available: ${errorMsg}`, 'err');
                return;
            }
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch (err) {
            toast('Network error loading receipt.', 'err');
            console.error('[viewReceipt] fetch error:', err);
        }
    }

    // ─── Send Receipt ──────────────────────────────────────────────
    async function sendReceipt(paymentId) {
        if (!paymentId) {
            toast('Payment ID missing.', 'err');
            return;
        }
        try {
            await api.payments.sendReceipt(paymentId);
            toast('Receipt resent to tenant.', 'ok');
        } catch (err) {
            toast(`Failed to send receipt: ${errMessage(err)}`, 'err');
            console.error('[sendReceipt] error:', err);
        }
    }

    // ─── Batch Receipts ─────────────────────────────────────────────
    async function batchReceipts() {
        const visibleRows = document.querySelectorAll('#paymentTableBody tr[data-payment-id]');
        const ids = Array.from(visibleRows).map(row => row.dataset.paymentId).filter(Boolean);
        if (!ids.length) {
            toast('No payments to export. Adjust filters or load records first.', 'warn');
            return;
        }
        try {
            const blob = await api.payments.batchReceipts(ids);
            triggerBlobDownload(blob, 'receipts_batch.zip');
            toast(`Exporting ${ids.length} receipt(s)…`, 'ok');
        } catch (err) {
            toast(`Batch export failed: ${errMessage(err)}`, 'err');
        }
    }

    // ─── Arrears Report ─────────────────────────────────────────────
    async function showArrearsReport() {
        try {
            const payload = await api.payments.arrearsSummary();
            const arrears = Array.isArray(payload) ? payload : (payload.results || []);
            const totalOutstanding = payload && payload.total_outstanding_zmw != null
                ? payload.total_outstanding_zmw
                : arrears.reduce((s, a) => s + (parseFloat(a.balance_due) || 0), 0);

            if (typeof openModal !== 'function') {
                console.error('[payments.js] openModal() is not available');
                return;
            }

            if (arrears.length === 0) {
                toast('No tenants with outstanding balances.', 'ok');
                return;
            }

            let rows = '';
            arrears.forEach(a => {
                const daysChip = a.is_in_arrears
                    ? `<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle">${esc(a.arrears_days)} days overdue</span>`
                    : `<span class="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">Current</span>`;
                rows += `<tr>
                    <td class="fw-medium">${esc(a.tenant)}</td>
                    <td>${esc(a.unit)}</td>
                    <td class="text-danger fw-bold font-monospace">${esc(money(a.balance_due))}</td>
                    <td>${daysChip}</td>
                </tr>`;
            });

            const html = `
                <div class="modal-header">
                    <h5 class="fw-bold"><i class="bi bi-exclamation-triangle text-danger me-2"></i>Arrears Report</h5>
                    <button class="btn-close" onclick="closeModal()"></button>
                </div>
                <div class="modal-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="text-muted small">${arrears.length} tenant(s) with outstanding balances</span>
                        <span class="fw-bold text-danger">Total: ${esc(money(totalOutstanding))}</span>
                    </div>
                    <table class="table table-sm table-striped align-middle">
                        <thead>
                            <tr><th>Tenant</th><th>Unit</th><th>Balance Due</th><th>Status</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>`;
            openModal(html);
        } catch (err) {
            toast(`Failed to load arrears: ${errMessage(err)}`, 'err');
        }
    }

    // ─── Filtering & Export ─────────────────────────────────────────
    function bindPaymentFilters() {
        ['paymentSearch', 'paymentStatusFilter', 'paymentPropertyFilter', 'paymentDateFrom', 'paymentDateTo'].forEach(id => {
            const el = document.getElementById(id);
            if (!el || el.__bound) return;
            el.__bound = true;
            el.addEventListener(id === 'paymentSearch' ? 'input' : 'change', applyPaymentFilters);
        });
    }

    async function populatePropertyFilter() {
        try {
            const res = await api.properties.list();
            const properties = res.results || res || [];
            const sel = document.getElementById('paymentPropertyFilter');
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = '<option value="">All Properties</option>' +
                properties.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
            if (current) sel.value = current;
        } catch (e) {
            console.warn('Could not load properties:', e);
        }
    }

    function applyPaymentFilters() {
        const query = (document.getElementById('paymentSearch')?.value || '').toLowerCase().trim();
        const status = document.getElementById('paymentStatusFilter')?.value || '';
        const property = document.getElementById('paymentPropertyFilter')?.value || '';
        const dateFrom = document.getElementById('paymentDateFrom')?.value || '';
        const dateTo = document.getElementById('paymentDateTo')?.value || '';

        const filtered = paymentsCache.filter(p => {
            const tenant = (p.tenant_name || '').toLowerCase();
            const propertyName = (p.property_name || '').toLowerCase();
            const ref = (p.reference_number || '').toLowerCase();
            const matchesQuery = !query || tenant.includes(query) || propertyName.includes(query) || ref.includes(query);

            const matchesStatus = !status || (p.status || '').toLowerCase() === status.toLowerCase();
            const matchesProperty = !property || String(p.property_id || '') === String(property);
            const matchesDateFrom = !dateFrom || (p.payment_date || '') >= dateFrom;
            const matchesDateTo = !dateTo || (p.payment_date || '') <= dateTo;

            return matchesQuery && matchesStatus && matchesProperty && matchesDateFrom && matchesDateTo;
        });

        populatePaymentsTable(filtered);
    }

    function populatePaymentsTable(payments) {
        const tbody = document.getElementById('paymentTableBody');
        if (!tbody) return;

        if (!payments || payments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${TABLE_COLS}" class="text-center py-4 text-muted">
                        No payment records found matching your filters.
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = payments.map(p => `
            <tr data-payment-id="${esc(p.id)}">
                <td class="fw-medium">${esc(p.tenant_name || 'N/A')}</td>
                <td>${esc(p.property_name || 'N/A')} ${p.unit_number ? `<span class="badge bg-light text-dark font-monospace">${esc(p.unit_number)}</span>` : ''}</td>
                <td class="font-monospace fw-bold text-success">${money(p.amount)}</td>
                <td><span class="badge bg-light text-dark border">${esc(p.payment_method_display || p.payment_method || 'N/A')}</span></td>
                <td class="font-monospace text-muted small">${esc(p.reference_number || '—')}</td>
                <td>${fmtDate(p.payment_date)}</td>
                <td>${statusBadge(p.status)}${prepaidBadge(p)}</td>
                <td class="text-nowrap">${actionCell(p)}</td>
            </tr>
        `).join('');

        initTooltips();
    }

    function initTooltips() {
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
            document.querySelectorAll('#paymentTableBody [data-bs-toggle="tooltip"]').forEach(el => {
                if (!el.__tooltip) {
                    el.__tooltip = new bootstrap.Tooltip(el);
                }
            });
        }
    }

    function showLoaderSafe(elementId, cols) {
        const el = document.getElementById(elementId);
        if (typeof showLoader === 'function') {
            showLoader(elementId, cols);
            return;
        }
        if (el) {
            el.innerHTML = `
                <tr>
                    <td colspan="${cols}" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
                        Loading...
                    </td>
                </tr>`;
        }
    }

    // ─── CSV Export ─────────────────────────────────────────────────
    function exportLedger() {
        if (paymentsCache.length === 0) {
            toast('No payments to export.', 'warn');
            return;
        }
        const params = new URLSearchParams();
        const status = document.getElementById('paymentStatusFilter')?.value;
        const property = document.getElementById('paymentPropertyFilter')?.value;
        const dateFrom = document.getElementById('paymentDateFrom')?.value;
        const dateTo = document.getElementById('paymentDateTo')?.value;
        if (status) params.set('status', status);
        if (property) params.set('property_id', property);
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);

        const qs = params.toString();

        (async () => {
            try {
                const blob = await api.payments.exportCsv(qs ? '?' + qs : '');
                const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                triggerBlobDownload(blob, `payments_export_${stamp}.csv`);
            } catch (err) {
                toast(`CSV export failed: ${errMessage(err)}`, 'err');
            }
        })();
    }

})();