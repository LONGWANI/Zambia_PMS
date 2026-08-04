/**
 * ZambiaPMS – Tenant Directory & Unit Assignment
 */

let tenantsCache = [];

// ─── Main Render ─────────────────────────────────────────────────────────────

async function render_tenants() {
    showLoader('tenantTableBody', 6);

    try {
        const response = await api.tenants.list();
        tenantsCache = response.results || response || [];

        const subtextEl = document.getElementById('tenantSubtext');
        if (subtextEl) {
            subtextEl.textContent =
                `${tenantsCache.length} tenant${tenantsCache.length !== 1 ? 's' : ''} registered`;
        }

        applyTenantFilters();
        bindTenantFilters();

    } catch (err) {
        console.error('Error loading tenants:', err);
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

// ─── Filtering Helpers ───────────────────────────────────────────────────────

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
    const query = (document.getElementById('tenantSearch')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('tenantStatusFilter')?.value || 'all';

    const filtered = tenantsCache.filter(t => {
        // 1) Match search query (name, email, phone, NRC)
        const matchesQuery = !query ||
            (t.full_name && t.full_name.toLowerCase().includes(query)) ||
            (t.email && t.email.toLowerCase().includes(query)) ||
            (t.phone && t.phone.includes(query)) ||
            (t.nrc_number && t.nrc_number.toLowerCase().includes(query));

        // 2) Match status filter
        let matchesStatus = true;
        if (statusFilter !== 'all' && statusFilter !== '') {
            const leaseStatus = (t.lease_status || 'No Lease').toLowerCase();
            if (statusFilter === 'active') {
                // "Current (No Balance)" – shows tenants with an active lease
                matchesStatus = leaseStatus === 'active';
            } else if (statusFilter === 'arrears') {
                // "In Arrears" – balance > 0 (assuming positive balance means overdue)
                const balance = parseFloat(t.balance) || 0;
                matchesStatus = balance > 0;
            } else {
                // fallback – treat other values as exact match on lease_status
                matchesStatus = leaseStatus === statusFilter.toLowerCase();
            }
        }
        return matchesQuery && matchesStatus;
    });

    populateTenantsTable(filtered);
}

function populateTenantsTable(tenants) {
    const tbody = document.getElementById('tenantTableBody');
    if (!tbody) return;

    if (!tenants || tenants.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    No tenants found matching your filters.
                </td>
            </tr>`;
        return;
    }

    let html = '';
    try {
        tenants.forEach(t => {
            const fullName = t.full_name || t.name || 'Unknown';
            const email = t.email || 'N/A';
            const phone = t.phone || '';
            const nrc = t.nrc_number || 'N/A';
            const property = t.property_name || 'Unassigned';
            const unit = t.unit_number || 'N/A';
            const balance = t.balance || '0.00';
            const status = t.lease_status || 'No Lease';
            
            let statusBadge = '';
            if (status === 'active') {
                statusBadge = '<span class="badge bg-success">Active</span>';
            } else if (status === 'pending') {
                statusBadge = '<span class="badge bg-warning">Pending</span>';
            } else if (status === 'expired' || status === 'terminated') {
                statusBadge = '<span class="badge bg-danger">Expired</span>';
            } else {
                statusBadge = '<span class="badge bg-secondary">No Lease</span>';
            }

            const balanceNum = parseFloat(balance) || 0;
            const balanceColor = balanceNum > 0 ? 'text-danger' : 'text-success';
            const balanceDisplay = balanceNum > 0 ? `ZMW ${balanceNum.toFixed(2)}` : 'ZMW 0.00';

            html += `
                <tr>
                    <td class="fw-semibold">${fullName}</td>
                    <td>${property}<br><span class="text-muted small">${unit}</span></td>
                    <td>${email}<br><span class="text-muted small">${phone}</span></td>
                    <td>${statusBadge}</td>
                    <td class="${balanceColor} fw-bold">${balanceDisplay}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="openAssignUnitModal(${t.id}, '${(fullName || '').replace(/'/g, "\\'")}')">
                                <i class="bi bi-arrow-left-right me-1"></i> Assign Unit
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (err) {
        console.error('Error rendering tenants table:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-danger">
                    <i class="bi bi-exclamation-circle me-1"></i> Error rendering tenants: ${err.message}
                </td>
            </tr>`;
    }
}

// ─── Onboarding Modal ────────────────────────────────────────────────────────

function openOnboardTenantModal() {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">Onboard New Tenant</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body">
            <form id="tenantForm">
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">First Name</label>
                        <input type="text" id="modalTenantFirstName" class="form-control" placeholder="e.g. Chileshe" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Last Name</label>
                        <input type="text" id="modalTenantLastName" class="form-control" placeholder="e.g. Mulenga" required>
                    </div>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Email Address</label>
                        <input type="email" id="modalTenantEmail" class="form-control" placeholder="tenant@example.com" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Phone Number</label>
                        <input type="text" id="modalTenantPhone" class="form-control" placeholder="0970000000" required>
                    </div>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">NRC Number</label>
                        <input type="text" id="modalTenantNRC" class="form-control" placeholder="123456/11/1" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Temporary Password</label>
                        <input type="password" id="modalTenantPassword" class="form-control" minlength="8" required>
                    </div>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Assigned Property</label>
                        <select id="modalTenantProperty" class="form-select" required>
                            <option value="">Select Property...</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-medium">Available Unit</label>
                        <select id="modalTenantUnit" class="form-select" required>
                            <option value="">Select Unit...</option>
                        </select>
                    </div>
                </div>
            </form>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="submitOnboardTenant()">Onboard Tenant</button>
        </div>
    `;
    openModal(html);
    loadPropertiesForTenantModal();
}

async function loadPropertiesForTenantModal() {
    try {
        const res = await api.properties.list();
        const props = res.results || res || [];
        const sel = document.getElementById('modalTenantProperty');
        if (sel) {
            if (props.length === 0) {
                sel.innerHTML = '<option value="">No properties available – create one first</option>';
                toast('You have no properties. Create a property before onboarding tenants.', 'warn');
            } else {
                sel.innerHTML = '<option value="">Select Property...</option>' +
                    props.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            }
        }

        const propSelect = document.getElementById('modalTenantProperty');
        if (propSelect) {
            propSelect.addEventListener('change', function() {
                loadUnitsForProperty(this.value);
            });
        }
    } catch (e) {
        console.error('Failed to load properties into modal:', e);
        toast('Could not load properties. Please refresh the page.', 'err');
    }
}

async function loadUnitsForProperty(propertyId) {
    const unitSelect = document.getElementById('modalTenantUnit');
    if (!unitSelect) return;

    if (!propertyId) {
        unitSelect.innerHTML = '<option value="">Select Unit...</option>';
        return;
    }

    try {
        const response = await api.units.listByProperty(propertyId);
        const units = response.results || response || [];

        const available = units.filter(u => 
            (u.status || '').toLowerCase() === 'vacant' || 
            (u.status || '').toLowerCase() === 'available'
        );

        if (available.length === 0) {
            unitSelect.innerHTML = '<option value="">No available units in this property</option>';
        } else {
            unitSelect.innerHTML = available.map(u => 
                `<option value="${u.unit_number}">${u.unit_number}</option>`
            ).join('');
        }
    } catch (err) {
        console.error('Failed to load units:', err);
        unitSelect.innerHTML = '<option value="">Error loading units</option>';
        toast('Could not load units for this property.', 'err');
    }
}

async function submitOnboardTenant() {
    console.log('🚀 Starting submitOnboardTenant...');

    const form = document.getElementById('tenantForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        console.log('❌ Form validation failed.');
        return;
    }

    const password = document.getElementById('modalTenantPassword').value;
    if (password.length < 8) {
        const msg = 'Password must be at least 8 characters.';
        console.warn('⚠️ ' + msg);
        showError(msg);
        return;
    }

    const propertyId = document.getElementById('modalTenantProperty').value;
    const unitNumber = document.getElementById('modalTenantUnit').value.trim();

    if (!propertyId) {
        const msg = 'Please select a property.';
        console.warn('⚠️ ' + msg);
        showError(msg);
        return;
    }
    if (!unitNumber) {
        const msg = 'Please select a unit.';
        console.warn('⚠️ ' + msg);
        showError(msg);
        return;
    }

    const payload = {
        first_name: document.getElementById('modalTenantFirstName').value.trim(),
        last_name: document.getElementById('modalTenantLastName').value.trim(),
        email: document.getElementById('modalTenantEmail').value.trim(),
        phone: document.getElementById('modalTenantPhone').value.trim(),
        nrc_passport: document.getElementById('modalTenantNRC').value.trim(),
        password: password,
        employer_name: '',
        employer_phone: '',
        notes: '',
        property_id: propertyId,
        unit_number: unitNumber,
    };

    console.log('📦 Payload being sent:', JSON.stringify(payload, null, 2));

    try {
        console.log('⏳ Calling api.tenants.create...');
        const result = await api.tenants.create(payload);
        console.log('✅ API response:', result);
        closeModal();
        showSuccess('Tenant onboarded successfully.');
        await render_tenants();
    } catch (err) {
        console.error('❌ Error caught in submitOnboardTenant:', err);
        console.error('Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));

        let errorMsg = err.message || 'Onboarding failed.';

        if (err.response && err.response.data) {
            const data = err.response.data;
            if (data.details) {
                const fieldErrors = Object.entries(data.details)
                    .filter(([key]) => key !== 'non_field_errors')
                    .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(' ') : msgs}`)
                    .join('\n');
                if (fieldErrors) {
                    errorMsg = fieldErrors;
                } else if (data.details.non_field_errors) {
                    errorMsg = data.details.non_field_errors.join(' ');
                } else {
                    errorMsg = data.message || data.detail || errorMsg;
                }
            } else if (data.message) {
                errorMsg = data.message;
            } else if (data.detail) {
                errorMsg = data.detail;
            }
        } else if (err.data) {
            if (typeof err.data === 'object') {
                const fieldErrors = Object.entries(err.data)
                    .filter(([key]) => key !== 'detail' && key !== 'message')
                    .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(' ') : msgs}`)
                    .join('\n');
                if (fieldErrors) {
                    errorMsg = fieldErrors;
                } else if (err.data.detail) {
                    errorMsg = err.data.detail;
                } else if (err.data.message) {
                    errorMsg = err.data.message;
                }
            } else {
                errorMsg = err.data;
            }
        }

        showError(`Onboarding failed:\n${errorMsg}`);
    }
}

// ─── Helper functions to show errors safely ────────────────────────────────

function showError(message) {
    try {
        if (typeof toast === 'function') {
            toast(message, 'err');
        } else {
            alert(message);
        }
    } catch (e) {
        alert(message);
    }
}

function showSuccess(message) {
    try {
        if (typeof toast === 'function') {
            toast(message, 'ok');
        } else {
            alert(message);
        }
    } catch (e) {
        alert(message);
    }
}

// ─── Multi-Unit Assignment Modal ─────────────────────────────────────────────

function openAssignUnitModal(tenantId, tenantName) {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">Assign Unit to ${tenantName}</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body">
            <div class="mb-3">
                <label class="form-label small fw-medium">Select Property</label>
                <select id="assignPropSelect" class="form-select" onchange="loadAvailableUnitsForProp(this.value)">
                    <option value="">-- Choose Property --</option>
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label small fw-medium">Available Unit</label>
                <select id="assignUnitSelect" class="form-select">
                    <option value="">-- Select Available Unit --</option>
                </select>
            </div>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="submitUnitAssignment(${tenantId})">Confirm Assignment</button>
        </div>
    `;
    openModal(html);
    populateAssignPropertyOptions();
}

async function populateAssignPropertyOptions() {
    try {
        const res = await api.properties.list();
        const properties = res.results || res || [];
        const select = document.getElementById('assignPropSelect');
        if (select) {
            select.innerHTML = '<option value="">-- Choose Property --</option>' +
                properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        }
    } catch (err) {
        showError(`Could not load properties: ${err.message}`);
    }
}

async function loadAvailableUnitsForProp(propId) {
    if (!propId) return;
    try {
        const units = await api.units.listByProperty(propId);
        const available = (units.results || units || []).filter(u => (u.status || '').toLowerCase() === 'available');

        const select = document.getElementById('assignUnitSelect');
        if (select) {
            select.innerHTML = available.length > 0
                ? available.map(u => `<option value="${u.id}">Unit ${u.unit_number || u.name} (${zmw(u.monthly_rent || 0)}/mo)</option>`).join('')
                : '<option value="">No available units in this property</option>';
        }
    } catch (err) {
        showError(`Failed to load units: ${err.message}`);
    }
}

async function submitUnitAssignment(tenantId) {
    const propId = document.getElementById('assignPropSelect').value;
    const unitId = document.getElementById('assignUnitSelect').value;

    if (!propId || !unitId) {
        showError('Please select both a property and an available unit.');
        return;
    }

    try {
        if (api.tenants && api.tenants.update) {
            await api.tenants.update(tenantId, { property_id: propId, unit_id: unitId });
        } else if (api.units && api.units.assignTenant) {
            await api.units.assignTenant(unitId, { tenant_id: tenantId });
        }
        closeModal();
        showSuccess('Tenant unit assignment updated successfully.');
        await render_tenants();
    } catch (err) {
        showError(`Failed to assign unit: ${err.message}`);
    }
}

// ─── Exports ─────────────────────────────────────────────────────────────────
window.render_tenants = render_tenants;
window.applyTenantFilters = applyTenantFilters;
window.openOnboardTenantModal = openOnboardTenantModal;
window.submitOnboardTenant = submitOnboardTenant;
window.openAssignUnitModal = openAssignUnitModal;
window.loadAvailableUnitsForProp = loadAvailableUnitsForProp;
window.submitUnitAssignment = submitUnitAssignment;