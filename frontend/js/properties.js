/**
 * ZambiaPMS – Property Portfolio Management
 */

let propertiesCache = [];

// ─── Main Render ─────────────────────────────────────────────────────────────

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

// ─── Table Population ────────────────────────────────────────────────────────

function populatePropertiesTable(properties) {
    const tbody = document.getElementById('propertyTableBody');
    if (!tbody) return;

    if (properties.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    No properties found matching your filter.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = properties.map(p => `
        <tr>
            <td class="fw-semibold text-dark">${p.name}</td>
            <td>${p.address || ''}, ${p.city || ''}</td>
            <td><span class="badge bg-light text-dark border">${p.property_type || 'Residential'}</span></td>
            <td class="font-monospace fw-medium">${p.total_units || 1} units</td>
            <td>
                <span class="badge ${p.occupied_units > 0 ? 'bg-success-subtle text-success border border-success' : 'bg-warning-subtle text-warning border border-warning'}">
                    ${p.occupied_units || 0} Occupied
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="openUtilitySplitModal(${p.id}, '${p.name.replace(/'/g, "\\'")}')">
                        <i class="bi bi-calculator me-1"></i> Split Utility
                    </button>
                    <button class="btn btn-outline-secondary" onclick="openEditPropertyModal(${p.id})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteProperty(${p.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ─── Filtering Helpers ────────────────────────────────────────────────────────

function bindPropertyFilters() {
    const searchEl = document.getElementById('propertySearch');
    if (searchEl) {
        const fresh = searchEl.cloneNode(true);
        searchEl.replaceWith(fresh);
        fresh.addEventListener('input', applyPropertyFilters);
    }

    const typeEl = document.getElementById('propertyTypeFilter');
    if (typeEl) {
        const fresh = typeEl.cloneNode(true);
        typeEl.replaceWith(fresh);
        fresh.addEventListener('change', applyPropertyFilters);
    }
}

function applyPropertyFilters() {
    const query = (document.getElementById('propertySearch')?.value || '').toLowerCase();
    const type  = document.getElementById('propertyTypeFilter')?.value || '';

    const filtered = propertiesCache.filter(p => {
        const matchesQuery = !query ||
            (p.name && p.name.toLowerCase().includes(query)) ||
            (p.address && p.address.toLowerCase().includes(query)) ||
            (p.city && p.city.toLowerCase().includes(query));
        const matchesType = !type || p.property_type === type;

        return matchesQuery && matchesType;
    });

    populatePropertiesTable(filtered);
}

// ─── Property Creation & Edit Modals ─────────────────────────────────────────

function openCreatePropertyModal() {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">Add New Property</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body">
            <form id="propertyForm">
                <div class="mb-3">
                    <label class="form-label small fw-medium">Property Name</label>
                    <input type="text" id="modalPropName" class="form-control" placeholder="e.g. Lusaka Heights Complex" required>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-medium">Physical Address</label>
                    <input type="text" id="modalPropAddress" class="form-control" placeholder="Plot 1045, Great East Road" required>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">City</label>
                        <input type="text" id="modalPropCity" class="form-control" value="Lusaka" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">District</label>
                        <input type="text" id="modalPropDistrict" class="form-control" placeholder="Central">
                    </div>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Property Type</label>
                        <select id="modalPropType" class="form-select" required>
                            <option value="Apartment">Apartment</option>
                            <option value="Commercial">Commercial</option>
                            <option value="Stand-alone House">Stand-alone House</option>
                            <option value="Complex">Complex</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Total Units</label>
                        <input type="number" id="modalPropUnits" class="form-control" value="1" min="1" required>
                    </div>
                </div>
            </form>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="submitAddProperty()">Create Property</button>
        </div>
    `;
    openModal(html);
}

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
        toast(`Property "${payload.name}" added successfully.`, 'ok');
        await render_properties();
    } catch (err) {
        toast(`Failed to add property: ${err.message}`, 'err');
    }
}

async function deleteProperty(propertyId) {
    if (!confirm('Are you sure you want to delete this property? This cannot be undone.')) return;
    try {
        await api.properties.delete(propertyId);
        toast('Property deleted.', 'ok');
        await render_properties();
    } catch (err) {
        toast(`Delete failed: ${err.message}`, 'err');
    }
}

// ─── Utility Bill Splitter Modal ─────────────────────────────────────────────

function openUtilitySplitModal(propertyId, propertyName) {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">Split Utility Bill &mdash; ${propertyName}</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body">
            <form id="utilitySplitForm">
                <div class="mb-3">
                    <label class="form-label small fw-medium">Utility Type</label>
                    <select id="utilType" class="form-select" required>
                        <option value="Electricity (ZESCO)">Electricity (ZESCO Meter)</option>
                        <option value="Water (LWSC)">Water (LWSC)</option>
                        <option value="Refuse / Trash">Refuse / Trash Collection</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-medium">Total Invoice Amount (ZMW)</label>
                    <input type="number" step="0.01" id="utilAmount" class="form-control font-monospace" placeholder="e.g. 3000.00" required>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Billing Period Start</label>
                        <input type="date" id="utilStart" class="form-control" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Billing Period End</label>
                        <input type="date" id="utilEnd" class="form-control" required>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-medium">Split Method</label>
                    <select id="utilMethod" class="form-select">
                        <option value="equal">Equal Split (Occupied Units Only)</option>
                        <option value="percentage">Percentage Allocation</option>
                    </select>
                </div>
                <div class="alert alert-warning py-2 small mb-0">
                    <i class="bi bi-info-circle me-1"></i> Charges will be added to each tenant's account automatically. Vacant units are ignored.
                </div>
            </form>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="submitUtilitySplit(${propertyId})">Calculate & Issue Invoices</button>
        </div>
    `;
    openModal(html);
}

async function submitUtilitySplit(propertyId) {
    try {
        const payload = {
            property_id: propertyId,
            utility_type: document.getElementById('utilType').value,
            total_amount: document.getElementById('utilAmount').value,
            period_start: document.getElementById('utilStart').value,
            period_end: document.getElementById('utilEnd').value,
            split_method: document.getElementById('utilMethod').value
        };

        await api.utilityBills.createAndSplit(payload);
        closeModal();
        toast('Utility bill split and issued to all occupied units.', 'ok');
    } catch (err) {
        toast(`Failed to split utility bill: ${err.message}`, 'err');
    }
}

// ─── Digital Lease Agreement Modal ───────────────────────────────────────────

function openCreateLeaseModal(propertyId, unitId) {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">Generate Digital Lease Agreement</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body" style="max-height:70vh; overflow-y:auto;">
            <form id="leaseAgreementForm">
                <h6 class="text-primary fw-bold mb-3"><i class="bi bi-file-text me-1"></i> Financial & Duration Terms</h6>
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label small">Monthly Rent (ZMW)</label>
                        <input type="number" id="leaseRent" class="form-control" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small">Security Deposit (ZMW)</label>
                        <input type="number" id="leaseDeposit" class="form-control" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small">Start Date</label>
                        <input type="date" id="leaseStart" class="form-control" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small">End Date</label>
                        <input type="date" id="leaseEnd" class="form-control" required>
                    </div>
                </div>

                <h6 class="text-primary fw-bold mb-3"><i class="bi bi-shield-check me-1"></i> Policy & Obligations</h6>
                <div class="mb-2">
                    <label class="form-label small">Late Payment Policy</label>
                    <textarea id="leaseLatePolicy" class="form-control" rows="2">A late fee of 5% applies if rent is not received within 5 days of due date.</textarea>
                </div>
                <div class="mb-2">
                    <label class="form-label small">Utility Responsibilities</label>
                    <textarea id="leaseUtilities" class="form-control" rows="2">Tenant is responsible for split electricity and water bills as allocated.</textarea>
                </div>
                <div class="mb-3">
                    <label class="form-label small">Digital Signature (Type Full Legal Name)</label>
                    <input type="text" id="leaseLandlordSig" class="form-control font-monospace" placeholder="e.g. John Mwansa" required>
                </div>
                <div class="form-check mb-3">
                    <input class="form-check-input" type="checkbox" id="leaseAccept" required>
                    <label class="form-check-label small" for="leaseAccept">
                        I confirm this agreement legally binds the specified property terms under Zambian Landlord & Tenant Act regulations.
                    </label>
                </div>
            </form>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-success" onclick="submitLeaseAgreement(${propertyId}, ${unitId})">Create & Sign Lease</button>
        </div>
    `;
    openModal(html);
}

async function submitLeaseAgreement(propertyId, unitId) {
    const form = document.getElementById('leaseAgreementForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const payload = {
        property_id: propertyId,
        unit_id: unitId,
        monthly_rent: parseFloat(document.getElementById('leaseRent').value),
        security_deposit: parseFloat(document.getElementById('leaseDeposit').value),
        start_date: document.getElementById('leaseStart').value,
        end_date: document.getElementById('leaseEnd').value,
        late_payment_policy: document.getElementById('leaseLatePolicy').value,
        utility_responsibilities: document.getElementById('leaseUtilities').value,
        landlord_signature: document.getElementById('leaseLandlordSig').value.trim(),
        is_accepted: document.getElementById('leaseAccept').checked
    };

    try {
        if (api.leaseAgreements && api.leaseAgreements.create) {
            await api.leaseAgreements.create(payload);
        } else if (api.leases && api.leases.create) {
            await api.leases.create(payload);
        }
        closeModal();
        toast('Digital Lease Agreement created and signed successfully.', 'ok');
    } catch (err) {
        toast(`Failed to generate lease agreement: ${err.message}`, 'err');
    }
}

// ─── Exports ─────────────────────────────────────────────────────────────────
window.render_properties        = render_properties;
window.populatePropertiesTable  = populatePropertiesTable;
window.applyPropertyFilters     = applyPropertyFilters;
window.openCreatePropertyModal  = openCreatePropertyModal;
window.submitAddProperty        = submitAddProperty;
window.deleteProperty           = deleteProperty;
window.openUtilitySplitModal    = openUtilitySplitModal;
window.submitUtilitySplit      = submitUtilitySplit;
window.openCreateLeaseModal     = openCreateLeaseModal;
window.submitLeaseAgreement    = submitLeaseAgreement;