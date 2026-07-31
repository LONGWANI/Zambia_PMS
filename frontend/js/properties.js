/**
 * ZambiaPMS – Property Portfolio
 */

let propertiesCache = [];

// ─── Main render ─────────────────────────────────────────────────────────────

async function render_properties() {
    showLoader('propertyTableBody', 6);

    try {
        const response = await api.properties.list();
        propertiesCache = response.results || response || [];

        const totalUnits = propertiesCache.reduce((sum, p) => sum + (parseInt(p.total_units) || 0), 0);
        const subtextEl  = document.getElementById('propertySubtext');
        if (subtextEl) {
            subtextEl.textContent =
                `${propertiesCache.length} propert${propertiesCache.length !== 1 ? 'ies' : 'y'} · ${totalUnits} total units`;
        }

        populatePropertiesTable(propertiesCache);
        bindPropertyFilters();

    } catch (err) {
        const tbody = document.getElementById('propertyTableBody');
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

function bindPropertyFilters() {
    // Search input
    const searchEl = document.getElementById('propertySearch');
    if (searchEl) {
        const fresh = searchEl.cloneNode(true);
        searchEl.replaceWith(fresh);
        fresh.addEventListener('input', applyPropertyFilters);
    }
    // Type filter
    const typeEl = document.getElementById('propertyTypeFilter');
    if (typeEl) {
        const fresh = typeEl.cloneNode(true);
        typeEl.replaceWith(fresh);
        fresh.addEventListener('change', applyPropertyFilters);
    }
}

function applyPropertyFilters() {
    const query = (document.getElementById('propertySearch')?.value || '').toLowerCase().trim();
    const type  = document.getElementById('propertyTypeFilter')?.value || 'all';

    const filtered = propertiesCache.filter(p => {
        const textMatch =
            (p.name     || '').toLowerCase().includes(query) ||
            (p.city     || '').toLowerCase().includes(query) ||
            (p.district || '').toLowerCase().includes(query);
        const typeMatch = type === 'all' || (p.property_type || '').toLowerCase() === type;
        return textMatch && typeMatch;
    });

    populatePropertiesTable(filtered);
}

// ─── Table render ─────────────────────────────────────────────────────────────

function populatePropertiesTable(properties) {
    const tbody = document.getElementById('propertyTableBody');
    if (!tbody) return;

    if (properties.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-muted fw-medium">
                    No properties match the current search.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = properties.map(p => {
        const total    = parseInt(p.total_units) || 0;
        const occupied = parseInt(p.occupied_units) || (p.occupancy_rate ? Math.round(total * p.occupancy_rate / 100) : 0);
        const rate     = p.occupancy_rate !== undefined ? p.occupancy_rate : (total > 0 ? Math.round((occupied / total) * 100) : 0);
        const isActive = rate > 0 || occupied > 0;

        return `
            <tr>
                <td class="align-middle">
                    <div class="fw-semibold text-slate-900">${p.name}</div>
                    <small class="text-muted text-uppercase" style="font-size: 11px;">${p.property_type || 'Residential'}</small>
                </td>
                <td class="align-middle text-slate-700">
                    <i class="bi bi-geo-alt text-muted me-1"></i>${p.district || 'Central'}, ${p.city || 'Lusaka'}
                </td>
                <td class="align-middle fw-medium">
                    <span class="text-slate-900">${total}</span>
                    <span class="text-muted" style="font-size: 12px;"> units</span>
                </td>
                <td class="align-middle">
                    <div class="d-flex align-items-center gap-2">
                        <div class="progress flex-grow-1" style="height: 6px; max-width: 100px;">
                            <div class="progress-bar bg-primary" role="progressbar" style="width: ${rate}%"></div>
                        </div>
                        <small class="fw-medium">${rate}%</small>
                    </div>
                </td>
                <td class="align-middle">
                    <span class="badge-status ${isActive ? 'badge-active' : 'badge-vacant'}">
                        ${isActive ? 'Active' : 'Vacant'}
                    </span>
                </td>
                <td class="text-end align-middle">
                    <div class="action-group">
                        <button class="btn-action view-btn"   data-id="${p.id}" title="View"><i class="bi bi-eye"></i></button>
                        <button class="btn-action edit-btn"   data-id="${p.id}" title="Edit"><i class="bi bi-pencil"></i></button>
                        <button class="btn-action delete delete-btn" data-id="${p.id}" title="Delete"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    attachPropertyActionListeners();
}

function attachPropertyActionListeners() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            toast('Property view — coming soon.', 'warn');
        });
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            openEditPropertyModal(e.currentTarget.getAttribute('data-id'));
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            const id = e.currentTarget.getAttribute('data-id');
            if (confirm('Remove this property and all its units? This cannot be undone.')) {
                await deleteProperty(id);
            }
        });
    });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteProperty(propertyId) {
    try {
        await api.properties.delete(propertyId);
        toast('Property deleted.', 'ok');
        await render_properties();
    } catch (err) {
        toast(`Delete failed: ${err.message}`, 'err');
    }
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function openCreatePropertyModal() {
    openModal(`
        <div class="modal-header border-0 pb-2">
            <h5 class="modal-title fw-bold text-slate-900 fs-5">Add Property</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body border-0 py-2">
            <form id="propertyForm" class="d-flex flex-column gap-3">
                <div>
                    <label class="form-label text-slate-700 fw-medium small mb-1">Property Name *</label>
                    <input type="text" class="form-control" id="modalPropName"
                           placeholder="e.g. Mukuba Heights Block A" required>
                </div>
                <div>
                    <label class="form-label text-slate-700 fw-medium small mb-1">Street Address *</label>
                    <input type="text" class="form-control" id="modalPropAddress"
                           placeholder="e.g. Plot 4826, Great East Road" required>
                </div>
                <div class="row g-2">
                    <div class="col-6">
                        <label class="form-label text-slate-700 fw-medium small mb-1">City *</label>
                        <input type="text" class="form-control" id="modalPropCity" value="Lusaka" required>
                    </div>
                    <div class="col-6">
                        <label class="form-label text-slate-700 fw-medium small mb-1">District</label>
                        <input type="text" class="form-control" id="modalPropDistrict" placeholder="e.g. Lusaka Central">
                    </div>
                </div>
                <div class="row g-2">
                    <div class="col-6">
                        <label class="form-label text-slate-700 fw-medium small mb-1">Type</label>
                        <select class="form-select" id="modalPropType">
                            <option value="residential" selected>Residential</option>
                            <option value="commercial">Commercial</option>
                            <option value="mixed">Mixed-Use</option>
                        </select>
                    </div>
                    <div class="col-6">
                        <label class="form-label text-slate-700 fw-medium small mb-1">Total Units *</label>
                        <input type="number" class="form-control" id="modalPropUnits"
                               min="1" max="500" value="4" required>
                    </div>
                </div>
            </form>
        </div>
        <div class="modal-footer border-0 pt-3 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-light border px-4" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-teal text-white px-4" onclick="submitAddProperty()">Save Property</button>
        </div>`);
}

function openEditPropertyModal(id) {
    toast(`Edit property (ID: ${id}) — coming soon.`, 'warn');
}

// ─── Submit create ────────────────────────────────────────────────────────────

async function submitAddProperty() {
    const form = document.getElementById('propertyForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const payload = {
        name:          document.getElementById('modalPropName').value.trim(),
        address:       document.getElementById('modalPropAddress').value.trim(),
        city:          document.getElementById('modalPropCity').value.trim(),
        district:      document.getElementById('modalPropDistrict').value.trim(),
        property_type: document.getElementById('modalPropType').value,
        total_units:   parseInt(document.getElementById('modalPropUnits').value) || 1,
    };

    try {
        await api.properties.create(payload);
        closeModal();
        toast(`Property "${payload.name}" added.`, 'ok');
        await render_properties();
    } catch (err) {
        toast(`Failed to add property: ${err.message}`, 'err');
    }
}

// ─── Exports ─────────────────────────────────────────────────────────────────
window.render_properties        = render_properties;
window.populatePropertiesTable  = populatePropertiesTable;
window.applyPropertyFilters     = applyPropertyFilters;
window.openCreatePropertyModal  = openCreatePropertyModal;
window.openEditPropertyModal    = openEditPropertyModal;
window.submitAddProperty        = submitAddProperty;
window.deleteProperty           = deleteProperty;
