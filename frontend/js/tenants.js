/**
 * ZambiaPMS – Tenant Directory
 */

let tenantsCache = [];

// ─── Main render ─────────────────────────────────────────────────────────────

async function render_tenants() {
    showLoader('tenantTableBody', 6);

    try {
        const response = await api.tenants.list();
        tenantsCache   = response.results || response || [];

        const subtextEl = document.getElementById('tenantSubtext');
        if (subtextEl) {
            subtextEl.textContent =
                `${tenantsCache.length} tenant${tenantsCache.length !== 1 ? 's' : ''} registered`;
        }

        applyTenantFilters();
        bindTenantFilters();

    } catch (err) {
        const tbody = document.getElementById('tenantTableBody');
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

// ─── Filter helpers ───────────────────────────────────────────────────────────

function bindTenantFilters() {
    ['tenantSearch', 'tenantStatusFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const fresh = el.cloneNode(true);
        el.replaceWith(fresh);
        fresh.addEventListener(id === 'tenantStatusFilter' ? 'change' : 'input', applyTenantFilters);
    });
}

function applyTenantFilters() {
    const tbody  = document.getElementById('tenantTableBody');
    if (!tbody) return;

    const query  = (document.getElementById('tenantSearch')?.value || '').toLowerCase().trim();
    const status = document.getElementById('tenantStatusFilter')?.value || 'all';

    const filtered = tenantsCache.filter(t => {
        const textMatch =
            (t.full_name    || '').toLowerCase().includes(query) ||
            (t.email        || '').toLowerCase().includes(query) ||
            (t.phone        || '').includes(query) ||
            (t.unit_number  || '').toLowerCase().includes(query);

        const balance     = parseFloat(t.balance) || 0;
        const statusMatch =
            status === 'all' ||
            (status === 'arrears' && balance > 0) ||
            (status === 'active'  && balance <= 0);

        return textMatch && statusMatch;
    });

    renderTenantRows(filtered, tbody);
}

function renderTenantRows(tenants, tbody) {
    if (tenants.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-muted fw-medium">
                    No tenants match the current search.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = tenants.map(t => {
        const balance    = parseFloat(t.balance) || 0;
        const statusKey  = balance > 0 ? 'arrears' : 'active';
        const balColor   = balance > 0 ? 'var(--red, #dc2626)' : 'var(--green, #16a34a)';

        return `
            <tr>
                <td class="align-middle">
                    <div class="fw-semibold text-slate-900">${t.full_name}</div>
                    <div class="text-muted small font-monospace">NRC: ${t.nrc_number || 'Not Registered'}</div>
                </td>
                <td class="align-middle text-slate-800">
                    <div class="fw-medium">${t.property_name || '—'}</div>
                    <div class="text-muted small">Unit ${t.unit_number || 'Pending'}</div>
                </td>
                <td class="align-middle" style="font-size: 13px;">
                    <div class="text-slate-800 fw-medium">
                        <i class="bi bi-telephone text-muted me-1"></i>${t.phone || '—'}
                    </div>
                    <div class="text-muted">
                        <i class="bi bi-envelope text-muted me-1"></i>${t.email || '—'}
                    </div>
                </td>
                <td class="align-middle">${statusBadge(statusKey)}</td>
                <td class="align-middle fw-bold font-monospace" style="color: ${balColor};">
                    ${zmw(balance)}
                </td>
                <td class="text-end align-middle">
                    <button class="btn btn-sm btn-light border px-3"
                            onclick="toast('Lease view — coming soon.', 'warn')">
                        <i class="bi bi-file-earmark-text me-1"></i> Lease
                    </button>
                </td>
            </tr>`;
    }).join('');
}

// ─── Onboard tenant modal ─────────────────────────────────────────────────────

async function openOnboardTenantModal() {
    try {
        const properties = await api.properties.list();
        const propOptions = (properties.results || properties || [])
            .map(p => `<option value="${p.id}">${p.name}</option>`)
            .join('');

        openModal(`
            <div class="modal-header border-0 pb-2">
                <h5 class="modal-title fw-bold text-slate-900 fs-5">Onboard New Tenant</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body border-0 py-1" style="max-height: 70vh; overflow-y: auto;">
                <form id="tenantForm" class="d-flex flex-column gap-3">
                    <div>
                        <label class="form-label text-slate-700 fw-medium small mb-1">Full Legal Name *</label>
                        <input type="text" class="form-control" id="modalTenantName"
                               placeholder="e.g. Banji Mwape" required>
                    </div>
                    <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label text-slate-700 fw-medium small mb-1">Email *</label>
                            <input type="email" class="form-control" id="modalTenantEmail"
                                   placeholder="name@domain.zm" required>
                        </div>
                        <div class="col-6">
                            <label class="form-label text-slate-700 fw-medium small mb-1">Phone *</label>
                            <input type="tel" class="form-control" id="modalTenantPhone"
                                   placeholder="0977000000" required>
                        </div>
                    </div>
                    <div>
                        <label class="form-label text-slate-700 fw-medium small mb-1">NRC Number *</label>
                        <input type="text" class="form-control" id="modalTenantNRC"
                               placeholder="000000/00/0" required>
                    </div>
                    <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label text-slate-700 fw-medium small mb-1">Property *</label>
                            <select class="form-select" id="modalTenantProperty" required>
                                <option value="" disabled selected>Select property</option>
                                ${propOptions}
                            </select>
                        </div>
                        <div class="col-6">
                            <label class="form-label text-slate-700 fw-medium small mb-1">Unit *</label>
                            <select class="form-select" id="modalTenantUnit" required disabled>
                                <option value="" disabled selected>Select property first</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="form-label text-slate-700 fw-medium small mb-1">Portal Password *</label>
                        <input type="password" class="form-control" id="modalTenantPassword"
                               placeholder="Minimum 6 characters" required minlength="6">
                    </div>
                </form>
            </div>
            <div class="modal-footer border-0 pt-3 d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-light border px-4" onclick="closeModal()">Cancel</button>
                <button type="button" class="btn btn-teal text-white px-4" onclick="submitOnboardTenant()">Onboard Tenant</button>
            </div>`);

        // Dynamically load vacant units when a property is selected.
        document.getElementById('modalTenantProperty')?.addEventListener('change', async e => {
            const unitSelect = document.getElementById('modalTenantUnit');
            if (!unitSelect) return;

            unitSelect.disabled  = true;
            unitSelect.innerHTML = `<option value="" disabled selected>Loading units...</option>`;

            try {
                const units = await api.units.list(`?property_id=${e.target.value}`);
                const list  = units.results || units || [];

                if (list.length === 0) {
                    unitSelect.innerHTML = `<option value="" disabled selected>No vacant units found</option>`;
                } else {
                    unitSelect.innerHTML =
                        `<option value="" disabled selected>Select unit</option>` +
                        list.map(u => `<option value="${u.id}">Unit ${u.unit_number} (${u.status || 'Vacant'})</option>`).join('');
                    unitSelect.disabled = false;
                }
            } catch {
                unitSelect.innerHTML = `<option value="" disabled selected>Error loading units</option>`;
            }
        });

    } catch (err) {
        toast(`Could not load properties: ${err.message}`, 'err');
    }
}

// ─── Submit onboard ───────────────────────────────────────────────────────────

async function submitOnboardTenant() {
    const form = document.getElementById('tenantForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const payload = {
        full_name:   document.getElementById('modalTenantName').value.trim(),
        email:       document.getElementById('modalTenantEmail').value.trim(),
        phone:       document.getElementById('modalTenantPhone').value.trim(),
        nrc_number:  document.getElementById('modalTenantNRC').value.trim(),
        property_id: document.getElementById('modalTenantProperty').value,
        unit_id:     document.getElementById('modalTenantUnit').value,
        password:    document.getElementById('modalTenantPassword').value,
    };

    try {
        await api.tenants.create(payload);
        closeModal();
        toast('Tenant onboarded successfully.', 'ok');
        await render_tenants();
    } catch (err) {
        toast(`Onboarding failed: ${err.message}`, 'err');
    }
}

// ─── Exports ─────────────────────────────────────────────────────────────────
window.render_tenants        = render_tenants;
window.applyTenantFilters    = applyTenantFilters;
window.openOnboardTenantModal = openOnboardTenantModal;
window.submitOnboardTenant   = submitOnboardTenant;
