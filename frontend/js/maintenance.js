/**
 * ZambiaPMS – Maintenance
 */

let maintenanceCache = [];
let isLandlordMode = false;

// ─── Main render ────────────────────────────────────────────────────────────

async function render_maintenance() {
    showLoader('maintenanceTableBody', 6);

    try {
        const data = await api.maintenance.list();
        maintenanceCache = data.results || data || [];

        const openCount = maintenanceCache.filter(r => r.status === 'open').length;
        const subtextEl = document.getElementById('maintenanceSubtext');
        if (subtextEl) {
            subtextEl.textContent = `${openCount} open request${openCount !== 1 ? 's' : ''} require your attention`;
        }

        filterAndRenderMaintenance();
        bindMaintenanceFilters();

    } catch (err) {
        const tbody = document.getElementById('maintenanceTableBody');
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

// ─── Filter helpers ──────────────────────────────────────────────────────────

function bindMaintenanceFilters() {
    ['maintStatusFilter', 'maintPriorityFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const fresh = el.cloneNode(true);
        el.replaceWith(fresh);
        fresh.addEventListener('change', filterAndRenderMaintenance);
    });
}

function filterAndRenderMaintenance() {
    const statusFilter   = document.getElementById('maintStatusFilter')?.value   || 'all';
    const priorityFilter = document.getElementById('maintPriorityFilter')?.value || 'all';

    const filtered = maintenanceCache.filter(r => {
        const statusOk = statusFilter === 'all' || r.status === statusFilter;
        const priorityOk =
            priorityFilter === 'all' ||
            (priorityFilter === 'high'   && (r.priority === 'high' || r.priority === 'emergency')) ||
            (priorityFilter === 'normal' && (r.priority === 'medium' || r.priority === 'low'));
        return statusOk && priorityOk;
    });

    renderMaintenanceRows(filtered);
}

function renderMaintenanceRows(requests) {
    const tbody = document.getElementById('maintenanceTableBody');
    if (!tbody) return;

    if (requests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-muted fw-medium">
                    No maintenance requests match the selected filters.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = requests.map(r => {
        const priorityClass = (r.priority === 'emergency' || r.priority === 'high')
            ? 'badge-danger'
            : r.priority === 'medium' ? 'badge-warning' : 'badge-primary';
        const statusClass = r.status === 'resolved' ? 'badge-success' : 'badge-warning';

        return `
            <tr>
                <td>
                    <div class="fw-semibold text-slate-900">${r.title}</div>
                    <div class="text-muted" style="font-size: 12px;">${r.property_name || ''}</div>
                </td>
                <td>
                    <div class="fw-medium">${r.tenant_name || '—'}</div>
                    <div class="text-muted" style="font-size: 12px;">Unit ${r.unit_number || '—'}</div>
                </td>
                <td><span class="badge ${priorityClass}">${(r.priority || '').toUpperCase()}</span></td>
                <td><span class="badge ${statusClass}">${(r.status || '').toUpperCase()}</span></td>
                <td class="text-muted">${(r.created_at || '').slice(0, 10)}</td>
                <td class="text-end">
                    ${r.status !== 'resolved'
                        ? `<button class="btn-outline btn-sm" onclick="resolveRequest('${r.id}')">Resolve</button>`
                        : `<span class="text-success"><i class="bi bi-check2-circle fs-5"></i></span>`
                    }
                </td>
            </tr>`;
    }).join('');
}

// ─── Create request modal ────────────────────────────────────────────────────

async function openCreateMaintenanceModal() {
    try {
        const user = await api.auth.me();
        isLandlordMode = user && (user.role === 'landlord' || user.role === 'admin');

        let tenantOptionsHtml = '';
        let tenantId = '';
        let unitId = '';

        if (isLandlordMode) {
            // Landlord: fetch tenants and show dropdowns
            try {
                const tenants = await api.tenants.list();
                const tenantOptions = (tenants.results || tenants || [])
                    .map(t => `<option value="${t.id}">${t.full_name}</option>`)
                    .join('');
                tenantOptionsHtml = `
                    <div class="col-md-6">
                        <label class="form-label text-slate-700 fw-medium small mb-1">Tenant *</label>
                        <select class="form-select" id="maint_tenant" required>
                            <option value="" disabled selected>Select tenant</option>
                            ${tenantOptions}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label text-slate-700 fw-medium small mb-1">Unit *</label>
                        <select class="form-select" id="maint_unit" required>
                            <option value="" disabled selected>Select unit</option>
                        </select>
                    </div>
                `;
            } catch (err) {
                toast(`Failed to load tenant list: ${err.message}`, 'err');
                return;
            }
        } else {
            // Tenant: show read-only info, no inputs for tenant/unit
            try {
                const tenantData = await api.tenants.current();
                if (!tenantData) throw new Error('No tenant profile found.');
                const unit = tenantData.unit;
                const propertyName = tenantData.property_name;
                const unitNumber = unit ? unit.unit_number : 'N/A';
                tenantId = tenantData.id;
                unitId = unit ? unit.id : '';

                tenantOptionsHtml = `
                    <div class="col-md-12">
                        <p class="text-muted small">You are submitting this request for your current unit: <strong>${propertyName || 'N/A'} - Unit ${unitNumber}</strong></p>
                        <!-- No hidden inputs – we don't send tenant_id/unit in payload -->
                    </div>
                `;
            } catch (err) {
                toast(`Failed to load your tenant details: ${err.message}`, 'err');
                return;
            }
        }

        const modalHtml = `
            <div class="modal-header border-0 pb-2">
                <h5 class="modal-title fw-bold text-slate-900 fs-5">File Maintenance Request</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body border-0 py-2">
                <form id="maintenanceForm" class="d-flex flex-column gap-3">
                    <div>
                        <label class="form-label text-slate-700 fw-medium small mb-1">Issue Title *</label>
                        <input class="form-control" id="maint_title" placeholder="e.g. Broken HVAC Unit" required>
                    </div>
                    <div>
                        <label class="form-label text-slate-700 fw-medium small mb-1">Description</label>
                        <textarea class="form-control" id="maint_description" rows="3" placeholder="Provide details about the issue..."></textarea>
                    </div>
                    <div class="row g-3">
                        ${tenantOptionsHtml}
                        <div class="col-md-6">
                            <label class="form-label text-slate-700 fw-medium small mb-1">Priority</label>
                            <select class="form-select" id="maint_priority">
                                <option value="low">Low</option>
                                <option value="medium" selected>Medium</option>
                                <option value="high">High</option>
                                <option value="emergency">Emergency</option>
                            </select>
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer border-0 pt-3 d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-light border" onclick="closeModal()">Cancel</button>
                <button type="button" class="btn btn-teal text-white px-4" onclick="submitMaintenance()">Submit Request</button>
            </div>`;

        openModal(modalHtml);

        if (isLandlordMode) {
            const tenantSelect = document.getElementById('maint_tenant');
            if (tenantSelect) {
                tenantSelect.addEventListener('change', function() {
                    loadUnitsForTenant(this.value);
                });
            }
        }

    } catch (err) {
        toast(`Failed to load user info: ${err.message}`, 'err');
    }
}

// ─── Helper for landlord: load units for selected tenant ──────────────────
async function loadUnitsForTenant(tenantId) {
    if (!tenantId) return;
    try {
        const tenant = await api.tenants.get(tenantId);
        const unit = tenant.unit;
        const unitSelect = document.getElementById('maint_unit');
        if (unitSelect) {
            if (unit) {
                unitSelect.innerHTML = `<option value="${unit.id}">Unit ${unit.unit_number}</option>`;
            } else {
                unitSelect.innerHTML = `<option value="">No active unit</option>`;
            }
        }
    } catch (err) {
        toast('Failed to load unit for tenant.', 'err');
    }
}

// ─── Submit new request ──────────────────────────────────────────────────────

async function submitMaintenance() {
    const form = document.getElementById('maintenanceForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const title    = document.getElementById('maint_title')?.value.trim();
    const desc     = document.getElementById('maint_description')?.value.trim();
    const priority = document.getElementById('maint_priority')?.value;

    if (!title) {
        toast('Issue title is required.', 'warn');
        return;
    }

    // Build payload – start with only common fields
    const payload = { title, description: desc, priority };

    // For landlords, also include tenant and unit (they are required)
    if (isLandlordMode) {
        const tenantEl = document.getElementById('maint_tenant');
        const unitEl = document.getElementById('maint_unit');
        const tenantId = tenantEl ? tenantEl.value : null;
        const unitId = unitEl ? unitEl.value : null;

        if (!tenantId || tenantId === '') {
            toast('Please select a tenant.', 'warn');
            return;
        }
        if (!unitId || unitId === '') {
            toast('Please select a unit (or ensure the tenant has an active lease).', 'warn');
            return;
        }

        payload.tenant_id = tenantId;
        payload.unit = unitId;
    }
    // For tenants, we DO NOT send tenant_id or unit – the backend auto-assigns them.

    try {
        await api.maintenance.create(payload);
        closeModal();
        toast('Maintenance request submitted successfully.', 'ok');
        await render_maintenance();
    } catch (err) {
        // Show the actual server error
        const errorMsg = err.data?.detail || err.message || 'Failed to submit request.';
        toast(`Failed to submit request: ${errorMsg}`, 'err');
    }
}

// ─── Resolve request ─────────────────────────────────────────────────────────

async function resolveRequest(requestId) {
    if (!confirm('Mark this maintenance issue as fully resolved?')) return;

    const notes = prompt('Enter resolution notes (optional):', '');
    const cost = prompt('Enter actual cost (optional, e.g., 150.00):', '');

    const payload = {};
    if (notes) payload.resolution_notes = notes;
    if (cost && !isNaN(parseFloat(cost))) payload.actual_cost = parseFloat(cost);

    try {
        await api.maintenance.resolve(requestId, payload);
        toast('Issue marked as resolved.', 'ok');
        await render_maintenance();
    } catch (err) {
        toast(`Could not resolve issue: ${err.message}`, 'err');
    }
}

// ─── Exports ─────────────────────────────────────────────────────────────────
window.render_maintenance          = render_maintenance;
window.filterAndRenderMaintenance  = filterAndRenderMaintenance;
window.openCreateMaintenanceModal  = openCreateMaintenanceModal;
window.submitMaintenance           = submitMaintenance;
window.resolveRequest              = resolveRequest;