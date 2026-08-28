/**
 * ZambiaPMS – Tenant Directory & Contract Management
 * Full implementation with all actions, tabs, NRC verification, and contract upload.
 * NRC is shown fully (no masking).
 * "Open-ended" removed – replaced with "—".
 */

let tenantsCache = [];
let currentTenantId = null;

// ─── Main Render ─────────────────────────────────────────────────────────────

async function render_tenants() {
    showLoader('tenantTableBody', 7);
    try {
        const response = await api.tenants.list();
        tenantsCache = response.results || response || [];
        updateTenantCount();
        applyTenantFilters();
        bindTenantFilters();
    } catch (err) {
        showTableError(err);
    }
}

function updateTenantCount() {
    const subtext = document.getElementById('tenantSubtext');
    if (subtext) {
        subtext.textContent = `${tenantsCache.length} tenant${tenantsCache.length !== 1 ? 's' : ''} registered`;
    }
}

function showTableError(err) {
    const tbody = document.getElementById('tenantTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-danger fw-medium">
                    <i class="bi bi-exclamation-circle me-1"></i> ${err.message}
                </td>
            </tr>`;
    }
}

// ─── Filtering ───────────────────────────────────────────────────────────────

function bindTenantFilters() {
    ['tenantSearch', 'tenantStatusFilter', 'tenantContractFilter', 'tenantPropertyFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const fresh = el.cloneNode(true);
        el.replaceWith(fresh);
        fresh.addEventListener(id === 'tenantSearch' ? 'input' : 'change', applyTenantFilters);
    });
    document.querySelectorAll('.saved-view-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const view = this.dataset.view;
            applySavedView(view);
        });
    });
}

function applyTenantFilters() {
    const query = (document.getElementById('tenantSearch')?.value || '').toLowerCase();
    const status = document.getElementById('tenantStatusFilter')?.value || 'all';
    const contract = document.getElementById('tenantContractFilter')?.value || 'all';
    const property = document.getElementById('tenantPropertyFilter')?.value || 'all';

    const filtered = tenantsCache.filter(t => {
        const nameMatch = (t.full_name || '').toLowerCase().includes(query);
        const idMatch = (t.tenant_id || '').toLowerCase().includes(query);
        const nrcMatch = (t.nrc_number || '').toLowerCase().includes(query);
        const phoneMatch = (t.phone || '').includes(query);
        const emailMatch = (t.email || '').toLowerCase().includes(query);
        const propertyMatch = (t.property_name || '').toLowerCase().includes(query);
        const unitMatch = (t.unit || '').toLowerCase().includes(query);
        const matchesQuery = nameMatch || idMatch || nrcMatch || phoneMatch || emailMatch || propertyMatch || unitMatch;

        const leaseStatus = (t.lease_status || 'none').toLowerCase();
        const matchesStatus = status === 'all' || leaseStatus === status;

        const contractStatus = t.contract_status || 'none';
        const matchesContract = contract === 'all' || contractStatus === contract;

        const matchesProperty = property === 'all' || (t.property_name || '').toLowerCase() === property;

        return matchesQuery && matchesStatus && matchesContract && matchesProperty;
    });

    populateTenantsTable(filtered);
}

function applySavedView(view) {
    const statusMap = {
        'active': 'active',
        'expiring': 'active',
        'expired': 'expired',
        'unverified': 'all',
        'unassigned': 'none'
    };
    const contractMap = {
        'active': 'active',
        'expiring': 'active',
        'expired': 'expired',
        'unverified': 'all',
        'unassigned': 'none'
    };
    const statusEl = document.getElementById('tenantStatusFilter');
    const contractEl = document.getElementById('tenantContractFilter');
    if (statusEl) statusEl.value = statusMap[view] || 'all';
    if (contractEl) contractEl.value = contractMap[view] || 'all';
    applyTenantFilters();
}

// ─── Table Population ───────────────────────────────────────────────────────

function populateTenantsTable(tenants) {
    const tbody = document.getElementById('tenantTableBody');
    if (!tbody) return;

    if (!tenants || tenants.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No tenants found.</td></tr>`;
        return;
    }

    let html = '';
    tenants.forEach(t => {
        const fullName = t.full_name || 'Unknown';
        const tenantId = t.tenant_id || `TEN-${String(t.id).padStart(4, '0')}`;
        const nrc = t.nrc_number || '—';
        const verified = t.nrc_verified ? 'Verified' : 'Verification Required';
        const verifiedBadge = t.nrc_verified
            ? '<span class="badge bg-success">Verified</span>'
            : '<span class="badge bg-warning text-dark">Verification Required</span>';
        const property = t.property_name || '—';
        const unit = t.unit || '—';
        const phone = t.phone || '—';
        const email = t.email || '—';
        const status = t.lease_status || 'none';
        const statusBadge = getStatusBadge(status);

        const contractStatus = t.contract_status || 'none';
        const contractEnd = t.lease_end ? new Date(t.lease_end) : null;
        const contractDisplay = contractStatus === 'active' ? 'Active Contract' :
                               contractStatus === 'expired' ? `Expired — ${formatDate(contractEnd)}` :
                               'No Contract';

        const actionsHtml = buildActionMenu(t.id, fullName, status, contractStatus, contractEnd);

        html += `
            <tr data-tenant-id="${t.id}">
                <td class="tenant-cell">
                    <div class="d-flex align-items-center">
                        <div class="avatar-sm me-2">${getInitials(fullName)}</div>
                        <div>
                            <div class="fw-semibold tenant-link" data-id="${t.id}">${fullName}</div>
                            <div class="text-muted small">${tenantId}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div>${nrc}</div>
                    <div>${verifiedBadge}</div>
                </td>
                <td>
                    <div class="fw-medium">${property}</div>
                    <div class="text-muted small">Unit ${unit}</div>
                </td>
                <td>
                    <div>${phone}</div>
                    <div class="text-muted small">${email}</div>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div><i class="bi bi-file-text me-1"></i> ${contractDisplay}</div>
                    ${contractEnd ? `<div class="text-muted small">ends ${formatDate(contractEnd)}</div>` : ''}
                </td>
                <td>${actionsHtml}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll('.tenant-link').forEach(el => {
        el.addEventListener('click', function() {
            const id = this.dataset.id;
            openTenantProfile(id);
        });
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getStatusBadge(status) {
    const map = {
        'active': 'bg-success',
        'pending': 'bg-warning text-dark',
        'expired': 'bg-danger',
        'terminated': 'bg-secondary',
        'archived': 'bg-secondary',
        'none': 'bg-light text-dark'
    };
    const label = status.charAt(0).toUpperCase() + status.slice(1) || 'None';
    return `<span class="badge ${map[status] || 'bg-secondary'}">${label}</span>`;
}

function formatDate(date) {
    if (!date) return '—';
    return date.toLocaleDateString('en-ZM', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isExpiringSoon(endDate) {
    if (!endDate) return false;
    const now = new Date();
    const diff = endDate - now;
    return diff > 0 && diff <= 30 * 24 * 60 * 60 * 1000;
}

function buildActionMenu(tenantId, tenantName, status, contractStatus, contractEnd) {
    const baseActions = [
        { label: 'View', action: 'view' },
        { label: 'Edit', action: 'edit' },
        { label: 'Contract', action: 'contract' }
    ];
    let extraActions = [];

    if (status === 'active') {
        extraActions = [
            { label: 'Change Terms', action: 'change_terms' },
            { label: 'Change Unit', action: 'change_unit' },
            { label: 'More', action: 'more' }
        ];
    } else if (status === 'expired') {
        extraActions = [
            { label: 'Renew Contract', action: 'renew' },
            { label: 'More', action: 'more' }
        ];
    } else if (status === 'none' || status === 'pending') {
        extraActions = [
            { label: 'Assign Unit', action: 'assign_unit' },
            { label: 'More', action: 'more' }
        ];
    } else {
        extraActions = [{ label: 'More', action: 'more' }];
    }

    const allActions = [...baseActions, ...extraActions];
    const dropdownItems = allActions.map(a => `
        <li><a class="dropdown-item" href="#" data-action="${a.action}" data-tenant-id="${tenantId}" data-tenant-name="${tenantName}">${a.label}</a></li>
    `).join('');

    let renewButton = '';
    if (status === 'active' && isExpiringSoon(contractEnd)) {
        renewButton = `
            <button class="btn btn-sm btn-warning me-1" data-action="renew" data-tenant-id="${tenantId}" data-tenant-name="${tenantName}">
                <i class="bi bi-arrow-repeat me-1"></i> Renew
            </button>
        `;
    } else if (status === 'expired') {
        renewButton = `
            <button class="btn btn-sm btn-danger me-1" data-action="renew" data-tenant-id="${tenantId}" data-tenant-name="${tenantName}">
                <i class="bi bi-arrow-repeat me-1"></i> Renew
            </button>
        `;
    }

    return `
        <div class="d-flex align-items-center">
            ${renewButton}
            <div class="dropdown">
                <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bi bi-three-dots-vertical"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                    ${dropdownItems}
                </ul>
            </div>
        </div>
    `;
}

function handleTenantAction(action, tenantId, tenantName) {
    switch (action) {
        case 'view': openTenantProfile(tenantId); break;
        case 'edit': openEditTenantModal(tenantId); break;
        case 'contract': openContractModal(tenantId); break;
        case 'change_terms': openChangeTermsModal(tenantId); break;
        case 'change_unit': openAssignUnitModal(tenantId, tenantName); break;
        case 'assign_unit': openAssignUnitModal(tenantId, tenantName); break;
        case 'renew': openRenewContractModal(tenantId); break;
        case 'terminate': terminateLease(tenantId); break;
        case 'archive': archiveTenant(tenantId); break;
        case 'more': openMoreActions(tenantId); break;
        case 'verify_nrc': verifyNRC(tenantId); break;
        default: break;
    }
}

// ─── Tenant 360 Profile ──────────────────────────────────────────────────

async function openTenantProfile(tenantId) {
    try {
        const tenant = await api.tenants.get(tenantId);
        const leases = await api.leases.list(`?tenant_id=${tenantId}`);
        const leaseList = leases.results || leases || [];

        const content = document.getElementById('contentWorkspace') || document.getElementById('content');
        if (!content) return;

        const profileHtml = buildProfileHTML(tenant, leaseList);
        content.innerHTML = profileHtml;

        // --- Tab Handling ---
        const tabButtons = document.querySelectorAll('.profile-tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('shown.bs.tab', function(e) {
                const tab = this.dataset.tab;
                loadTabContent(tab, tenantId);
            });
            // Also load if already active and clicked
            btn.addEventListener('click', function(e) {
                const tab = this.dataset.tab;
                if (this.classList.contains('active')) {
                    loadTabContent(tab, tenantId);
                }
            });
        });

        // --- Back button ---
        document.getElementById('backToTenantsBtn')?.addEventListener('click', function() {
            render_tenants();
        });

        // Load overview initially
        loadTabContent('overview', tenantId);

    } catch (err) {
        toast(`Failed to load tenant profile: ${err.message}`, 'err');
        console.error('Profile error:', err);
    }
}

async function loadTabContent(tab, tenantId) {
    const containerId = tab === 'overview' ? 'profileTabContent' : `profileTabContent-${tab}`;
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Container not found for tab: ${tab}`);
        return;
    }

    container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-secondary" role="status"></div> Loading...</div>';

    try {
        let html = '';
        switch (tab) {
            case 'overview': html = await buildOverviewTab(tenantId); break;
            case 'personal': html = await buildPersonalTab(tenantId); break;
            case 'nextofkin': html = await buildNextOfKinTab(tenantId); break;
            case 'occupancy': html = await buildOccupancyTab(tenantId); break;
            case 'contract': html = await buildContractTab(tenantId); break;
            case 'history': html = await buildHistoryTab(tenantId); break;
            default: html = '<p>Tab not found.</p>';
        }
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Error loading tab: ${err.message}</div>`;
        console.error(`Error loading tab ${tab}:`, err);
    }
}

function buildProfileHTML(tenant, leases) {
    const fullName = tenant.full_name || 'Unknown';
    const tenantId = tenant.tenant_id || `TEN-${String(tenant.id).padStart(4, '0')}`;
    const status = tenant.lease_status || 'none';
    const statusBadge = getStatusBadge(status);
    const nrcVerified = tenant.nrc_verified ? 'Verified' : 'Verification Required';
    const property = tenant.property_name || '—';
    const unit = tenant.unit || '—';
    const contractStatus = tenant.contract_status || 'none';
    const contractEnd = tenant.lease_end ? new Date(tenant.lease_end) : null;
    const contractEndStr = contractEnd ? formatDate(contractEnd) : '—';

    // Action buttons in header
    const actions = [
        { label: 'Edit Tenant', action: 'edit' },
        { label: 'View Contract', action: 'contract' },
        { label: 'Change Terms', action: 'change_terms' },
        { label: 'Change Unit', action: 'change_unit' },
        { label: 'More', action: 'more' }
    ];
    const actionButtons = actions.map(a => `
        <button class="btn btn-outline-secondary btn-sm" data-action="${a.action}" data-tenant-id="${tenant.id}" data-tenant-name="${fullName}">${a.label}</button>
    `).join('');

    // Verify NRC button
    const verifyButton = tenant.nrc_verified
        ? `<button class="btn btn-sm btn-outline-success" data-action="verify_nrc" data-tenant-id="${tenant.id}">Verified ✓</button>`
        : `<button class="btn btn-sm btn-warning" data-action="verify_nrc" data-tenant-id="${tenant.id}">Verify NRC</button>`;

    return `
        <div class="tenant-profile">
            <div class="d-flex justify-content-between align-items-start mb-4">
                <div>
                    <button id="backToTenantsBtn" class="btn btn-link text-decoration-none p-0 mb-2">
                        <i class="bi bi-arrow-left me-1"></i> Back to Tenant Directory
                    </button>
                    <h2 class="fw-bold mb-1">${fullName} · ${tenantId}</h2>
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        ${statusBadge}
                        <span class="badge ${tenant.nrc_verified ? 'bg-success' : 'bg-warning text-dark'}">NRC ${nrcVerified}</span>
                        ${verifyButton}
                        <span class="text-muted">|</span>
                        <span class="text-muted">${property} · Unit ${unit}</span>
                        <span class="text-muted">|</span>
                        <span class="text-muted">Contract: ${contractStatus} ${contractEnd ? `(ends ${contractEndStr})` : ''}</span>
                    </div>
                </div>
                <div class="d-flex flex-wrap gap-1">
                    ${actionButtons}
                </div>
            </div>

            <ul class="nav nav-tabs mb-3" id="profileTabs" role="tablist">
                <li class="nav-item"><button class="nav-link profile-tab-btn active" data-tab="overview" data-bs-toggle="tab" data-bs-target="#tab-overview">Overview</button></li>
                <li class="nav-item"><button class="nav-link profile-tab-btn" data-tab="personal" data-bs-toggle="tab" data-bs-target="#tab-personal">Personal</button></li>
                <li class="nav-item"><button class="nav-link profile-tab-btn" data-tab="nextofkin" data-bs-toggle="tab" data-bs-target="#tab-nextofkin">Next of Kin</button></li>
                <li class="nav-item"><button class="nav-link profile-tab-btn" data-tab="occupancy" data-bs-toggle="tab" data-bs-target="#tab-occupancy">Occupancy</button></li>
                <li class="nav-item"><button class="nav-link profile-tab-btn" data-tab="contract" data-bs-toggle="tab" data-bs-target="#tab-contract">Contract</button></li>
                <li class="nav-item"><button class="nav-link profile-tab-btn" data-tab="history" data-bs-toggle="tab" data-bs-target="#tab-history">Contract History</button></li>
            </ul>

            <div class="tab-content">
                <div class="tab-pane fade show active" id="tab-overview" role="tabpanel"><div id="profileTabContent">Loading...</div></div>
                <div class="tab-pane fade" id="tab-personal" role="tabpanel"><div id="profileTabContent-personal">Loading...</div></div>
                <div class="tab-pane fade" id="tab-nextofkin" role="tabpanel"><div id="profileTabContent-nextofkin">Loading...</div></div>
                <div class="tab-pane fade" id="tab-occupancy" role="tabpanel"><div id="profileTabContent-occupancy">Loading...</div></div>
                <div class="tab-pane fade" id="tab-contract" role="tabpanel"><div id="profileTabContent-contract">Loading...</div></div>
                <div class="tab-pane fade" id="tab-history" role="tabpanel"><div id="profileTabContent-history">Loading...</div></div>
            </div>
        </div>
    `;
}

// ─── Tab Builders ──────────────────────────────────────────────────────────

async function buildOverviewTab(tenantId) {
    const tenant = await api.tenants.get(tenantId);
    const nok = tenant.next_of_kin || {};
    return `
        <div class="row">
            <div class="col-md-6">
                <div class="card mb-3"><div class="card-body">
                    <h6 class="card-title">Identity</h6>
                    <p><strong>Name:</strong> ${tenant.full_name}</p>
                    <p><strong>NRC:</strong> ${tenant.nrc_number || '—'} ${tenant.nrc_verified ? '✓' : '⚠'}</p>
                    <p><strong>Tenant ID:</strong> ${tenant.tenant_id || '—'}</p>
                    <p><strong>Date of Birth:</strong> ${tenant.date_of_birth ? formatDate(new Date(tenant.date_of_birth)) : '—'}</p>
                    <p><strong>Gender:</strong> ${tenant.gender || '—'}</p>
                    <p><strong>Nationality:</strong> ${tenant.nationality || '—'}</p>
                </div></div>
                <div class="card"><div class="card-body">
                    <h6 class="card-title">Contact</h6>
                    <p><strong>Phone:</strong> ${tenant.phone || '—'}</p>
                    <p><strong>Email:</strong> ${tenant.email || '—'}</p>
                    <p><strong>Address:</strong> ${tenant.address || '—'}</p>
                </div></div>
            </div>
            <div class="col-md-6">
                <div class="card mb-3"><div class="card-body">
                    <h6 class="card-title">Tenancy</h6>
                    <p><strong>Property:</strong> ${tenant.property_name || '—'}</p>
                    <p><strong>Unit:</strong> ${tenant.unit || '—'}</p>
                    <p><strong>Status:</strong> ${getStatusBadge(tenant.lease_status)}</p>
                    <p><strong>Lease Start:</strong> ${tenant.lease_start ? formatDate(new Date(tenant.lease_start)) : '—'}</p>
                    <p><strong>Lease End:</strong> ${tenant.lease_end ? formatDate(new Date(tenant.lease_end)) : '—'}</p>
                    <p><strong>Monthly Rent:</strong> ${tenant.monthly_rent ? `ZMW ${tenant.monthly_rent}` : '—'}</p>
                    <p><strong>Occupants:</strong> ${tenant.occupants || '1'}</p>
                </div></div>
                <div class="card"><div class="card-body">
                    <h6 class="card-title">Next of Kin</h6>
                    <p><strong>Name:</strong> ${nok.full_name || '—'}</p>
                    <p><strong>Relationship:</strong> ${nok.relationship || '—'}</p>
                    <p><strong>Phone:</strong> ${nok.phone || '—'}</p>
                    <p><strong>Email:</strong> ${nok.email || '—'}</p>
                </div></div>
            </div>
        </div>
    `;
}

async function buildPersonalTab(tenantId) {
    const tenant = await api.tenants.get(tenantId);
    return `
        <div class="card"><div class="card-body">
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Full Name:</strong> ${tenant.full_name}</p>
                    <p><strong>NRC:</strong> ${tenant.nrc_number || '—'}</p>
                    <p><strong>Date of Birth:</strong> ${tenant.date_of_birth ? formatDate(new Date(tenant.date_of_birth)) : '—'}</p>
                    <p><strong>Gender:</strong> ${tenant.gender || '—'}</p>
                    <p><strong>Nationality:</strong> ${tenant.nationality || '—'}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Phone:</strong> ${tenant.phone || '—'}</p>
                    <p><strong>Email:</strong> ${tenant.email || '—'}</p>
                    <p><strong>Address:</strong> ${tenant.address || '—'}</p>
                    <p><strong>NRC Verified:</strong> ${tenant.nrc_verified ? '✓' : 'X'}</p>
                </div>
            </div>
        </div></div>
    `;
}

async function buildNextOfKinTab(tenantId) {
    const tenant = await api.tenants.get(tenantId);
    const nok = tenant.next_of_kin || {};
    return `
        <div class="card"><div class="card-body">
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Full Name:</strong> ${nok.full_name || '—'}</p>
                    <p><strong>Relationship:</strong> ${nok.relationship || '—'}</p>
                    <p><strong>Phone:</strong> ${nok.phone || '—'}</p>
                    <p><strong>Email:</strong> ${nok.email || '—'}</p>
                    <p><strong>Address:</strong> ${nok.address || '—'}</p>
                </div>
                <div class="col-md-6 d-flex align-items-center">
                    ${nok.phone ? `<button class="btn btn-primary"><i class="bi bi-telephone me-1"></i> Call</button>` : ''}
                </div>
            </div>
        </div></div>
    `;
}

async function buildOccupancyTab(tenantId) {
    const tenant = await api.tenants.get(tenantId);
    return `
        <div class="card"><div class="card-body">
            <p><strong>Property:</strong> ${tenant.property_name || '—'}</p>
            <p><strong>Unit:</strong> ${tenant.unit || '—'}</p>
            <p><strong>Occupancy Status:</strong> ${tenant.lease_status || '—'}</p>
            <p><strong>Number of Occupants:</strong> ${tenant.occupants || '1'}</p>
            <p><strong>Move-in Date:</strong> ${tenant.move_in_date ? formatDate(new Date(tenant.move_in_date)) : '—'}</p>
            <p><strong>Start Date:</strong> ${tenant.lease_start ? formatDate(new Date(tenant.lease_start)) : '—'}</p>
            <p><strong>End Date:</strong> ${tenant.lease_end ? formatDate(new Date(tenant.lease_end)) : '—'}</p>
            <button class="btn btn-primary" data-action="change_unit" data-tenant-id="${tenantId}">Change Unit</button>
        </div></div>
    `;
}

async function buildContractTab(tenantId) {
    // Fetch the active lease for this tenant
    const response = await api.leases.list(`?tenant_id=${tenantId}&status=active`);
    const leases = response.results || response || [];
    const lease = leases.length > 0 ? leases[0] : null;

    if (!lease) {
        return `<div class="card"><div class="card-body"><p class="text-muted">No active contract found.</p></div></div>`;
    }

    const hasDocument = lease.pdf_document ? true : false;
    const documentLink = lease.pdf_document ? `<i class="bi bi-file-pdf"></i> <a href="${lease.pdf_document}" target="_blank">View Contract</a>` : 'Not uploaded';

    return `
        <div class="card"><div class="card-body">
            <h5 class="card-title">Current Contract</h5>
            <p><strong>Contract Number:</strong> ${lease.lease_id || '—'}</p>
            <p><strong>Status:</strong> <span class="badge ${lease.status === 'active' ? 'bg-success' : 'bg-secondary'}">${lease.status || 'None'}</span></p>
            <p><strong>Start Date:</strong> ${lease.start_date ? formatDate(new Date(lease.start_date)) : '—'}</p>
            <p><strong>End Date:</strong> ${lease.end_date ? formatDate(new Date(lease.end_date)) : '—'}</p>
            <p><strong>Monthly Rent:</strong> ${lease.monthly_rent ? `ZMW ${lease.monthly_rent}` : '—'}</p>
            <p><strong>Deposit:</strong> ${lease.deposit_amount ? `ZMW ${lease.deposit_amount}` : '—'}</p>
            <p><strong>Occupants:</strong> ${lease.occupants || '1'}</p>
            <p><strong>Document:</strong> ${documentLink}</p>
            <p><strong>Amendment Reason:</strong> ${lease.amendment_reason || '—'}</p>

            <div class="mt-3 d-flex gap-2 flex-wrap">
                <button class="btn btn-primary" data-action="contract" data-tenant-id="${tenantId}">View Full Contract</button>
                <button class="btn btn-outline-primary" id="uploadContractBtn" data-tenant-id="${tenantId}">
                    <i class="bi bi-upload me-1"></i> Upload Contract
                </button>
                <input type="file" id="contractFileInput" accept=".pdf" style="display:none;" />
            </div>
        </div></div>
    `;
}

// ─── Contract Upload Function ─────────────────────────────────────────────

function uploadContractDocument(tenantId, file) {
    // First, get the active lease ID
    api.leases.list(`?tenant_id=${tenantId}&status=active`).then(response => {
        const leases = response.results || response || [];
        if (leases.length === 0) {
            toast('No active lease found to upload document.', 'err');
            return;
        }
        const leaseId = leases[0].id;
        const formData = new FormData();
        formData.append('pdf_document', file);

        // Show uploading status
        toast('Uploading contract...', 'warn');
        const btn = document.getElementById('uploadContractBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Uploading...';
        }

        api.leases.update(leaseId, formData).then(() => {
            toast('Contract uploaded successfully.', 'ok');
            // Refresh the contract tab
            const tenantId = new URLSearchParams(window.location.search).get('tenantId') || 
                            document.querySelector('[data-tenant-id]')?.dataset.tenantId;
            if (tenantId) {
                loadTabContent('contract', tenantId);
            } else {
                // fallback: reload profile
                openTenantProfile(leaseId);
            }
        }).catch(err => {
            toast(`Upload failed: ${err.message}`, 'err');
        }).finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-upload me-1"></i> Upload Contract';
            }
        });
    }).catch(err => {
        toast(`Failed to find lease: ${err.message}`, 'err');
    });
}

// ─── Attach upload listener (delegated) ────────────────────────────────────

document.addEventListener('click', function(e) {
    const target = e.target.closest('#uploadContractBtn');
    if (target) {
        e.preventDefault();
        const tenantId = target.dataset.tenantId;
        // Trigger hidden file input
        const fileInput = document.getElementById('contractFileInput');
        if (fileInput) {
            fileInput.click();
            // Listen for file selection
            fileInput.onchange = function() {
                if (this.files && this.files[0]) {
                    uploadContractDocument(tenantId, this.files[0]);
                }
                this.value = ''; // reset so same file can be re-uploaded
            };
        }
    }
});

// ─── Other Tab Builders ──────────────────────────────────────────────────

async function buildHistoryTab(tenantId) {
    const leases = await api.leases.list(`?tenant_id=${tenantId}`);
    const leaseList = leases.results || leases || [];
    if (leaseList.length === 0) {
        return '<p class="text-muted">No contract history.</p>';
    }
    leaseList.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    let html = '<div class="list-group">';
    leaseList.forEach(l => {
        const status = l.status;
        const period = `${formatDate(new Date(l.start_date))} — ${l.end_date ? formatDate(new Date(l.end_date)) : 'Present'}`;
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
        const badgeClass = status === 'active' ? 'bg-success' : status === 'expired' ? 'bg-danger' : 'bg-secondary';
        html += `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <strong>${l.lease_id || 'Contract'}</strong>
                    <div class="text-muted small">${period}</div>
                    ${l.amendment_reason ? `<div class="text-muted small">${l.amendment_reason}</div>` : ''}
                </div>
                <div>
                    <span class="badge ${badgeClass} me-2">${statusLabel}</span>
                    <button class="btn btn-sm btn-outline-primary" data-action="view_contract" data-lease-id="${l.id}">View</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// ─── Action: Verify NRC ────────────────────────────────────────────────────

async function verifyNRC(tenantId) {
    try {
        const tenant = await api.tenants.get(tenantId);
        const newStatus = !tenant.nrc_verified;
        await api.tenants.update(tenantId, { nrc_verified: newStatus });
        toast(`NRC verification ${newStatus ? 'completed' : 'reverted'}.`, 'ok');
        openTenantProfile(tenantId);
    } catch (err) {
        toast(`Failed to update NRC status: ${err.message}`, 'err');
        console.error('Verify NRC error:', err);
    }
}

// ─── Action: Edit Tenant ────────────────────────────────────────────────────

async function openEditTenantModal(tenantId) {
    try {
        const tenant = await api.tenants.get(tenantId);
        const nok = tenant.next_of_kin || {};
        const html = `
            <div class="modal-header border-0 pb-0">
                <h5 class="fw-bold">Edit Tenant</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body">
                <form id="editTenantForm">
                    <h6 class="text-primary fw-bold mb-3">Personal Information</h6>
                    <div class="row g-2 mb-3">
                        <div class="col-md-6"><label class="form-label small">First Name</label><input type="text" id="editFirstName" class="form-control" value="${tenant.first_name || ''}" required></div>
                        <div class="col-md-6"><label class="form-label small">Last Name</label><input type="text" id="editLastName" class="form-control" value="${tenant.last_name || ''}" required></div>
                    </div>
                    <div class="row g-2 mb-3">
                        <div class="col-md-6"><label class="form-label small">Phone</label><input type="text" id="editPhone" class="form-control" value="${tenant.phone || ''}"></div>
                        <div class="col-md-6"><label class="form-label small">Email</label><input type="email" id="editEmail" class="form-control" value="${tenant.email || ''}" required></div>
                    </div>
                    <div class="row g-2 mb-3">
                        <div class="col-md-6"><label class="form-label small">Date of Birth</label><input type="date" id="editDob" class="form-control" value="${tenant.date_of_birth || ''}"></div>
                        <div class="col-md-6"><label class="form-label small">Gender</label>
                            <select id="editGender" class="form-select">
                                <option value="">Select</option>
                                <option value="Male" ${tenant.gender === 'Male' ? 'selected' : ''}>Male</option>
                                <option value="Female" ${tenant.gender === 'Female' ? 'selected' : ''}>Female</option>
                                <option value="Other" ${tenant.gender === 'Other' ? 'selected' : ''}>Other</option>
                            </select>
                        </div>
                    </div>
                    <div class="mb-3"><label class="form-label small">Address</label><input type="text" id="editAddress" class="form-control" value="${tenant.address || ''}"></div>

                    <h6 class="text-primary fw-bold mb-3 mt-4">Next of Kin</h6>
                    <div class="row g-2 mb-3">
                        <div class="col-md-4"><label class="form-label small">Full Name</label><input type="text" id="editNokName" class="form-control" value="${nok.full_name || ''}"></div>
                        <div class="col-md-4"><label class="form-label small">Relationship</label><input type="text" id="editNokRelation" class="form-control" value="${nok.relationship || ''}"></div>
                        <div class="col-md-4"><label class="form-label small">Phone</label><input type="text" id="editNokPhone" class="form-control" value="${nok.phone || ''}"></div>
                    </div>
                    <div class="mb-3"><label class="form-label small">Email</label><input type="email" id="editNokEmail" class="form-control" value="${nok.email || ''}"></div>
                </form>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button class="btn btn-light" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" id="confirmEditBtn">Save Changes</button>
            </div>
        `;
        openModal(html);
        document.getElementById('confirmEditBtn').addEventListener('click', function() {
            submitEditTenant(tenantId);
        });
    } catch (err) {
        toast(`Failed to load tenant: ${err.message}`, 'err');
    }
}

async function submitEditTenant(tenantId) {
    const form = document.getElementById('editTenantForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const nextOfKin = {
        full_name: document.getElementById('editNokName').value.trim(),
        relationship: document.getElementById('editNokRelation').value.trim(),
        phone: document.getElementById('editNokPhone').value.trim(),
        email: document.getElementById('editNokEmail').value.trim(),
    };

    const payload = {
        first_name: document.getElementById('editFirstName').value.trim(),
        last_name: document.getElementById('editLastName').value.trim(),
        phone: document.getElementById('editPhone').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        date_of_birth: document.getElementById('editDob').value || null,
        gender: document.getElementById('editGender').value,
        address: document.getElementById('editAddress').value.trim(),
        next_of_kin: nextOfKin,
    };

    const btn = document.getElementById('confirmEditBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Saving...';

    try {
        await api.tenants.update(tenantId, payload);
        closeModal();
        toast('Tenant updated successfully.', 'ok');
        openTenantProfile(tenantId);
    } catch (err) {
        let msg = err.message || 'Update failed.';
        if (err.data && typeof err.data === 'object') {
            const errors = Object.entries(err.data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join('\n');
            if (errors) msg = errors;
        }
        toast(`Update failed:\n${msg}`, 'err');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ─── Action: View Contract Modal ──────────────────────────────────────────

async function openContractModal(tenantId) {
    try {
        // Fetch the active lease
        const response = await api.leases.list(`?tenant_id=${tenantId}&status=active`);
        const leases = response.results || response || [];
        const lease = leases.length > 0 ? leases[0] : null;

        if (!lease) {
            toast('No active lease found.', 'warn');
            return;
        }

        const tenant = await api.tenants.get(tenantId);
        const html = `
            <div class="modal-header border-0 pb-0">
                <h5 class="fw-bold">Contract Details</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-title">${tenant.full_name} · ${tenant.tenant_id}</h6>
                        <p><strong>Contract Number:</strong> ${lease.lease_id || '—'}</p>
                        <p><strong>Status:</strong> <span class="badge ${lease.status === 'active' ? 'bg-success' : 'bg-secondary'}">${lease.status || 'None'}</span></p>
                        <hr>
                        <div class="row">
                            <div class="col-md-6">
                                <p><strong>Start Date:</strong> ${lease.start_date ? formatDate(new Date(lease.start_date)) : '—'}</p>
                                <p><strong>End Date:</strong> ${lease.end_date ? formatDate(new Date(lease.end_date)) : '—'}</p>
                            </div>
                            <div class="col-md-6">
                                <p><strong>Monthly Rent:</strong> ${lease.monthly_rent ? `ZMW ${lease.monthly_rent}` : '—'}</p>
                                <p><strong>Deposit:</strong> ${lease.deposit_amount ? `ZMW ${lease.deposit_amount}` : '—'}</p>
                            </div>
                        </div>
                        <hr>
                        <p><strong>Property:</strong> ${tenant.property_name || '—'} · Unit ${tenant.unit || '—'}</p>
                        <p><strong>Occupants:</strong> ${lease.occupants || '1'}</p>
                        <p><strong>Document:</strong> ${lease.pdf_document ? `<i class="bi bi-file-pdf"></i> <a href="${lease.pdf_document}" target="_blank">Download PDF</a>` : 'Not uploaded'}</p>
                    </div>
                </div>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button class="btn btn-light" onclick="closeModal()">Close</button>
                ${lease.pdf_document ? `<a href="${lease.pdf_document}" target="_blank" class="btn btn-primary"><i class="bi bi-download me-1"></i> Download</a>` : ''}
            </div>
        `;
        openModal(html);
    } catch (err) {
        toast(`Failed to load contract: ${err.message}`, 'err');
    }
}

// ─── Action: Change Terms ────────────────────────────────────────────────────

async function openChangeTermsModal(tenantId) {
    try {
        const tenant = await api.tenants.get(tenantId);
        const response = await api.leases.list(`?tenant_id=${tenantId}&status=active`);
        const leases = response.results || response || [];
        const lease = leases.length > 0 ? leases[0] : null;

        if (!lease) {
            toast('No active lease found to amend.', 'err');
            return;
        }

        const html = `
            <div class="modal-header border-0 pb-0">
                <h5 class="fw-bold">Change Terms</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body">
                <p class="text-muted small">Modify terms for the current lease. This will create a contract amendment record.</p>
                <form id="changeTermsForm">
                    <div class="row g-2 mb-3">
                        <div class="col-md-6">
                            <label class="form-label small">End Date</label>
                            <input type="date" id="changeEndDate" class="form-control" value="${lease.end_date || ''}">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">Monthly Rent (ZMW)</label>
                            <input type="number" step="0.01" id="changeRent" class="form-control" value="${lease.monthly_rent || ''}">
                        </div>
                    </div>
                    <div class="row g-2 mb-3">
                        <div class="col-md-6">
                            <label class="form-label small">Occupants</label>
                            <input type="number" id="changeOccupants" class="form-control" value="${lease.occupants || 1}" min="1">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">Deposit (ZMW)</label>
                            <input type="number" step="0.01" id="changeDeposit" class="form-control" value="${lease.deposit_amount || 0}">
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small">Special Conditions</label>
                        <textarea id="changeConditions" class="form-control" rows="2">${lease.special_conditions || ''}</textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small">Amendment Reason</label>
                        <input type="text" id="changeReason" class="form-control" placeholder="e.g., Rent adjustment, duration change..." required>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="changeConfirm" required>
                        <label class="form-check-label small" for="changeConfirm">I confirm these changes and agree to create an amendment.</label>
                    </div>
                </form>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button class="btn btn-light" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" id="confirmChangeBtn">Create Amendment</button>
            </div>
        `;
        openModal(html);
        document.getElementById('confirmChangeBtn').addEventListener('click', function() {
            submitChangeTerms(lease.id, tenantId);
        });
    } catch (err) {
        toast(`Failed to load terms: ${err.message}`, 'err');
    }
}

async function submitChangeTerms(leaseId, tenantId) {
    const form = document.getElementById('changeTermsForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const payload = {
        end_date: document.getElementById('changeEndDate').value || null,
        monthly_rent: parseFloat(document.getElementById('changeRent').value) || 0,
        occupants: parseInt(document.getElementById('changeOccupants').value) || 1,
        deposit_amount: parseFloat(document.getElementById('changeDeposit').value) || 0,
        special_conditions: document.getElementById('changeConditions').value.trim(),
        amendment_reason: document.getElementById('changeReason').value.trim(),
    };

    const btn = document.getElementById('confirmChangeBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Creating...';

    try {
        await api.leases.update(leaseId, payload);
        closeModal();
        toast('Amendment created successfully.', 'ok');
        openTenantProfile(tenantId);
    } catch (err) {
        let msg = err.message || 'Failed to create amendment.';
        if (err.data && typeof err.data === 'object') {
            const errors = Object.entries(err.data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join('\n');
            if (errors) msg = errors;
        }
        toast(`Amendment failed:\n${msg}`, 'err');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ─── Action: Change Unit ────────────────────────────────────────────────────

async function openAssignUnitModal(tenantId, tenantName) {
    try {
        const tenant = await api.tenants.get(tenantId);
        const html = `
            <div class="modal-header border-0 pb-0">
                <h5 class="fw-bold">Change Unit</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body">
                <p><strong>Tenant:</strong> ${tenantName || tenant.full_name}</p>
                <p><strong>Current Unit:</strong> ${tenant.property_name || '—'} · Unit ${tenant.unit || '—'}</p>
                <hr>
                <div class="mb-3">
                    <label class="form-label small">Select Property</label>
                    <select id="assignPropSelect" class="form-select" onchange="loadAvailableUnitsForProp(this.value)">
                        <option value="">-- Choose Property --</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label small">Available Unit</label>
                    <select id="assignUnitSelect" class="form-select">
                        <option value="">-- Select Available Unit --</option>
                    </select>
                </div>
                <div id="assignError" class="text-danger small mt-2" style="display:none;"></div>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button class="btn btn-light" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" id="confirmAssignBtn">Reassign Unit</button>
            </div>
        `;
        openModal(html);
        populateAssignPropertyOptions();
        document.getElementById('confirmAssignBtn').addEventListener('click', function() {
            submitUnitAssignment(tenantId);
        });
    } catch (err) {
        toast(`Failed to load tenant: ${err.message}`, 'err');
    }
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
        toast(`Could not load properties: ${err.message}`, 'err');
    }
}

async function loadAvailableUnitsForProp(propId) {
    if (!propId) {
        const select = document.getElementById('assignUnitSelect');
        if (select) select.innerHTML = '<option value="">-- Select Available Unit --</option>';
        return;
    }
    try {
        const response = await api.units.listByProperty(propId);
        const units = response.results || response || [];
        const available = units.filter(u => {
            const status = (u.status || '').toLowerCase();
            return status === 'vacant' || status === 'available';
        });
        const select = document.getElementById('assignUnitSelect');
        if (select) {
            if (available.length === 0) {
                select.innerHTML = '<option value="">No available units in this property</option>';
            } else {
                select.innerHTML = available.map(u => {
                    const rent = u.rent_amount || u.monthly_rent || 0;
                    return `<option value="${u.id}">Unit ${u.unit_number || u.name} (ZMW ${rent}/mo)</option>`;
                }).join('');
            }
        }
    } catch (err) {
        const select = document.getElementById('assignUnitSelect');
        if (select) select.innerHTML = '<option value="">Error loading units</option>';
        toast(`Failed to load units: ${err.message}`, 'err');
    }
}

async function submitUnitAssignment(tenantId) {
    const unitSelect = document.getElementById('assignUnitSelect');
    const unitId = unitSelect ? unitSelect.value : null;
    if (!unitId) {
        toast('Please select an available unit.', 'err');
        return;
    }

    const btn = document.getElementById('confirmAssignBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Reassigning...';

    try {
        await api.tenants.assignUnit(tenantId, { unit_id: unitId });
        closeModal();
        toast('Unit reassigned successfully.', 'ok');
        openTenantProfile(tenantId);
    } catch (err) {
        let msg = err.message || 'Failed to reassign unit.';
        if (err.data && err.data.error) msg = err.data.error;
        toast(`Reassignment failed:\n${msg}`, 'err');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ─── Action: Renew Contract ──────────────────────────────────────────────────

async function openRenewContractModal(tenantId) {
    try {
        const tenant = await api.tenants.get(tenantId);
        const response = await api.leases.list(`?tenant_id=${tenantId}&status=active`);
        const leases = response.results || response || [];
        const lease = leases.length > 0 ? leases[0] : null;

        if (!lease) {
            toast('No active lease to renew.', 'err');
            return;
        }

        const html = `
            <div class="modal-header border-0 pb-0">
                <h5 class="fw-bold">Renew Contract</h5>
                <button type="button" class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-body">
                <div class="alert alert-info">
                    <strong>Current Contract:</strong> ${lease.start_date ? formatDate(new Date(lease.start_date)) : '—'} —
                    ${lease.end_date ? formatDate(new Date(lease.end_date)) : '—'}
                </div>
                <form id="renewForm">
                    <div class="row g-2 mb-3">
                        <div class="col-md-6">
                            <label class="form-label small">New Start Date</label>
                            <input type="date" id="renewStart" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">New End Date</label>
                            <input type="date" id="renewEnd" class="form-control" required>
                        </div>
                    </div>
                    <div class="row g-2 mb-3">
                        <div class="col-md-6">
                            <label class="form-label small">Monthly Rent (ZMW)</label>
                            <input type="number" step="0.01" id="renewRent" class="form-control" value="${lease.monthly_rent || ''}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">Deposit (ZMW)</label>
                            <input type="number" step="0.01" id="renewDeposit" class="form-control" value="${lease.deposit_amount || 0}">
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small">Special Conditions</label>
                        <textarea id="renewConditions" class="form-control" rows="2">${lease.special_conditions || ''}</textarea>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="renewConfirm" required>
                        <label class="form-check-label small" for="renewConfirm">I confirm the renewed terms are correct.</label>
                    </div>
                </form>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button class="btn btn-light" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" id="confirmRenewBtn">Confirm Renewal</button>
            </div>
        `;
        openModal(html);
        const today = new Date().toISOString().split('T')[0];
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        document.getElementById('renewStart').value = today;
        document.getElementById('renewEnd').value = nextYear.toISOString().split('T')[0];
        document.getElementById('confirmRenewBtn').addEventListener('click', function() {
            submitRenewal(tenantId, lease);
        });
    } catch (err) {
        toast(`Failed to load tenant: ${err.message}`, 'err');
    }
}

async function submitRenewal(tenantId, oldLease) {
    const form = document.getElementById('renewForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const payload = {
        start_date: document.getElementById('renewStart').value,
        end_date: document.getElementById('renewEnd').value,
        monthly_rent: parseFloat(document.getElementById('renewRent').value) || 0,
        deposit_amount: parseFloat(document.getElementById('renewDeposit').value) || 0,
        special_conditions: document.getElementById('renewConditions').value.trim(),
        status: 'active',
    };

    const btn = document.getElementById('confirmRenewBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Renewing...';

    try {
        // Mark old lease as expired
        await api.leases.update(oldLease.id, { status: 'expired' });
        // Create new lease
        await api.leases.create({
            tenant: tenantId,
            unit: oldLease.unit_id,
            ...payload
        });
        closeModal();
        toast('Contract renewed successfully.', 'ok');
        openTenantProfile(tenantId);
    } catch (err) {
        let msg = err.message || 'Renewal failed.';
        if (err.data && typeof err.data === 'object') {
            const errors = Object.entries(err.data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join('\n');
            if (errors) msg = errors;
        }
        toast(`Renewal failed:\n${msg}`, 'err');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ─── Action: More ────────────────────────────────────────────────────────────

function openMoreActions(tenantId) {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">More Actions</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body">
            <div class="list-group">
                <button class="list-group-item list-group-item-action d-flex align-items-center" data-action="terminate" data-tenant-id="${tenantId}">
                    <i class="bi bi-x-octagon text-danger me-3 fs-5"></i>
                    <div>
                        <div class="fw-medium">Terminate Lease</div>
                        <div class="text-muted small">End the current lease immediately</div>
                    </div>
                </button>
                <button class="list-group-item list-group-item-action d-flex align-items-center" data-action="archive" data-tenant-id="${tenantId}">
                    <i class="bi bi-archive text-secondary me-3 fs-5"></i>
                    <div>
                        <div class="fw-medium">Archive Tenant</div>
                        <div class="text-muted small">Remove from active directory (can be restored)</div>
                    </div>
                </button>
                <button class="list-group-item list-group-item-action d-flex align-items-center" data-action="view" data-tenant-id="${tenantId}">
                    <i class="bi bi-eye text-primary me-3 fs-5"></i>
                    <div>
                        <div class="fw-medium">View Full Profile</div>
                        <div class="text-muted small">Open the 360 tenant profile</div>
                    </div>
                </button>
            </div>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button class="btn btn-light" onclick="closeModal()">Close</button>
        </div>
    `;
    openModal(html);
    document.querySelectorAll('[data-action]').forEach(el => {
        el.addEventListener('click', function() {
            const action = this.dataset.action;
            const id = this.dataset.tenantId;
            closeModal();
            handleTenantAction(action, id, '');
        });
    });
}

// ─── Action: Terminate Lease ────────────────────────────────────────────────

async function terminateLease(tenantId) {
    if (!confirm('Are you sure you want to terminate this lease? This action cannot be undone.')) return;
    try {
        const tenant = await api.tenants.get(tenantId);
        if (tenant.active_lease) {
            await api.leases.update(tenant.active_lease.id, { status: 'terminated' });
            toast('Lease terminated successfully.', 'ok');
            render_tenants();
        } else {
            toast('No active lease to terminate.', 'warn');
        }
    } catch (err) {
        toast(`Termination failed: ${err.message}`, 'err');
    }
}

// ─── Action: Archive Tenant ──────────────────────────────────────────────────

async function archiveTenant(tenantId) {
    if (!confirm('Archive this tenant? They will be hidden from the active directory.')) return;
    try {
        await api.tenants.update(tenantId, { is_archived: true });
        toast('Tenant archived.', 'ok');
        render_tenants();
    } catch (err) {
        toast(`Archive failed: ${err.message}`, 'err');
    }
}

// ─── Onboarding Wizard ──────────────────────────────────────────────────────

function openOnboardTenantModal() {
    const html = `
        <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">Onboard New Tenant</h5>
            <button type="button" class="btn-close" onclick="closeModal()"></button>
        </div>
        <div class="modal-body">
            <form id="tenantOnboardForm">
                <h6 class="text-primary fw-bold mb-3">1. Identity</h6>
                <div class="row g-2 mb-3">
                    <div class="col-md-6"><label class="form-label small">First Name</label><input type="text" id="onboardFirstName" class="form-control" required></div>
                    <div class="col-md-6"><label class="form-label small">Last Name</label><input type="text" id="onboardLastName" class="form-control" required></div>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-md-4"><label class="form-label small">NRC</label><input type="text" id="onboardNrc" class="form-control" placeholder="123456/78/9"></div>
                    <div class="col-md-4"><label class="form-label small">Date of Birth</label><input type="date" id="onboardDob" class="form-control"></div>
                    <div class="col-md-4"><label class="form-label small">Gender</label>
                        <select id="onboardGender" class="form-select"><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select>
                    </div>
                </div>
                <div class="mb-3"><label class="form-label small">Nationality</label><input type="text" id="onboardNationality" class="form-control" value="Zambian"></div>

                <h6 class="text-primary fw-bold mb-3 mt-4">2. Contact</h6>
                <div class="row g-2 mb-3">
                    <div class="col-md-6"><label class="form-label small">Phone</label><input type="text" id="onboardPhone" class="form-control" required></div>
                    <div class="col-md-6"><label class="form-label small">Email</label><input type="email" id="onboardEmail" class="form-control" required></div>
                </div>
                <div class="mb-3"><label class="form-label small">Address</label><input type="text" id="onboardAddress" class="form-control"></div>

                <h6 class="text-primary fw-bold mb-3 mt-4">3. Next of Kin</h6>
                <div class="row g-2 mb-3">
                    <div class="col-md-4"><label class="form-label small">Full Name</label><input type="text" id="onboardNokName" class="form-control"></div>
                    <div class="col-md-4"><label class="form-label small">Relationship</label><input type="text" id="onboardNokRelation" class="form-control"></div>
                    <div class="col-md-4"><label class="form-label small">Phone</label><input type="text" id="onboardNokPhone" class="form-control"></div>
                </div>
                <div class="mb-3"><label class="form-label small">Email</label><input type="email" id="onboardNokEmail" class="form-control"></div>

                <h6 class="text-primary fw-bold mb-3 mt-4">4. Property & Unit</h6>
                <div class="row g-2 mb-3">
                    <div class="col-md-4"><label class="form-label small">Property</label>
                        <select id="onboardProperty" class="form-select" required><option value="">Select Property</option></select>
                    </div>
                    <div class="col-md-4"><label class="form-label small">Unit</label>
                        <select id="onboardUnit" class="form-select" required><option value="">Select Unit</option></select>
                    </div>
                    <div class="col-md-4"><label class="form-label small">Occupants</label>
                        <input type="number" id="onboardOccupants" class="form-control" value="1" min="1">
                    </div>
                </div>
                <div class="mb-3"><label class="form-label small">Move‑in Date</label><input type="date" id="onboardMoveIn" class="form-control"></div>

                <h6 class="text-primary fw-bold mb-3 mt-4">5. Contract</h6>
                <div class="row g-2 mb-3">
                    <div class="col-md-4"><label class="form-label small">Start Date</label><input type="date" id="onboardStart" class="form-control" required></div>
                    <div class="col-md-4"><label class="form-label small">End Date (optional)</label><input type="date" id="onboardEnd" class="form-control"></div>
                    <div class="col-md-4"><label class="form-label small">Monthly Rent (ZMW)</label>
                        <input type="number" step="0.01" id="onboardRent" class="form-control" placeholder="Auto from unit">
                    </div>
                </div>
                <div class="mb-3"><label class="form-label small">Temporary Password</label>
                    <input type="password" id="onboardPassword" class="form-control" minlength="8" required>
                </div>
                <div class="text-muted small"><i class="bi bi-info-circle"></i> If rent is left blank, the unit's default rent will be used.</div>
            </form>
        </div>
        <div class="modal-footer border-0 pt-0">
            <button class="btn btn-light" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" id="confirmOnboardBtn">Onboard Tenant</button>
        </div>
    `;
    openModal(html);
    loadPropertiesForOnboard();
    document.getElementById('confirmOnboardBtn').addEventListener('click', submitOnboardTenant);
}

async function loadPropertiesForOnboard() {
    try {
        const res = await api.properties.list();
        const props = res.results || res || [];
        const sel = document.getElementById('onboardProperty');
        if (sel) {
            if (props.length === 0) {
                sel.innerHTML = '<option value="">No properties available</option>';
                toast('Create a property first.', 'warn');
            } else {
                sel.innerHTML = '<option value="">Select Property...</option>' +
                    props.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            }
        }
        document.getElementById('onboardProperty')?.addEventListener('change', function() {
            loadUnitsForOnboard(this.value);
        });
    } catch (e) {
        toast('Could not load properties.', 'err');
    }
}

async function loadUnitsForOnboard(propertyId) {
    const unitSelect = document.getElementById('onboardUnit');
    const rentInput = document.getElementById('onboardRent');
    if (!unitSelect) return;
    if (!propertyId) {
        unitSelect.innerHTML = '<option value="">Select Unit</option>';
        if (rentInput) rentInput.value = '';
        return;
    }
    try {
        const response = await api.units.listByProperty(propertyId);
        const units = response.results || response || [];
        const available = units.filter(u => {
            const status = (u.status || '').toLowerCase();
            return status === 'vacant' || status === 'available';
        });
        if (available.length === 0) {
            unitSelect.innerHTML = '<option value="">No available units</option>';
            if (rentInput) rentInput.value = '';
        } else {
            unitSelect.innerHTML = available.map(u => {
                const rent = u.rent_amount || u.monthly_rent || 0;
                return `<option value="${u.id}" data-rent="${rent}" data-unit-number="${u.unit_number}">${u.unit_number} (ZMW ${rent})</option>`;
            }).join('');
            unitSelect.addEventListener('change', function() {
                const sel = this.options[this.selectedIndex];
                const rent = sel?.getAttribute('data-rent') || '';
                if (rentInput) rentInput.value = rent;
            });
            unitSelect.dispatchEvent(new Event('change'));
        }
    } catch (err) {
        unitSelect.innerHTML = '<option value="">Error loading units</option>';
        toast('Could not load units.', 'err');
    }
}

async function submitOnboardTenant() {
    const form = document.getElementById('tenantOnboardForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const password = document.getElementById('onboardPassword').value;
    if (password.length < 8) {
        toast('Password must be at least 8 characters.', 'err');
        return;
    }

    const propertyId = document.getElementById('onboardProperty').value;
    const unitSelect = document.getElementById('onboardUnit');
    const unitId = unitSelect.value;
    const unitNumber = unitSelect.options[unitSelect.selectedIndex]?.getAttribute('data-unit-number') || '';

    if (!propertyId || !unitId || !unitNumber) {
        toast('Please select a property and a valid unit.', 'err');
        return;
    }

    const nextOfKin = {
        full_name: document.getElementById('onboardNokName').value.trim(),
        relationship: document.getElementById('onboardNokRelation').value.trim(),
        phone: document.getElementById('onboardNokPhone').value.trim(),
        email: document.getElementById('onboardNokEmail').value.trim(),
    };

    const payload = {
        first_name: document.getElementById('onboardFirstName').value.trim(),
        last_name: document.getElementById('onboardLastName').value.trim(),
        email: document.getElementById('onboardEmail').value.trim(),
        phone: document.getElementById('onboardPhone').value.trim(),
        nrc_passport: document.getElementById('onboardNrc').value.trim(),
        password: password,
        date_of_birth: document.getElementById('onboardDob').value || null,
        gender: document.getElementById('onboardGender').value,
        nationality: document.getElementById('onboardNationality').value.trim() || 'Zambian',
        address: document.getElementById('onboardAddress').value.trim(),
        next_of_kin: nextOfKin,
        occupants: parseInt(document.getElementById('onboardOccupants').value) || 1,
        move_in_date: document.getElementById('onboardMoveIn').value || null,
        property_id: propertyId,
        unit_number: unitNumber,
        monthly_rent: parseFloat(document.getElementById('onboardRent').value) || null,
        employer_name: '',
        employer_phone: '',
        notes: '',
        emergency_contact_name: nextOfKin.full_name || '',
        emergency_contact_phone: nextOfKin.phone || '',
        emergency_contact_relation: nextOfKin.relationship || '',
    };

    const btn = document.getElementById('confirmOnboardBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Onboarding...';

    try {
        await api.tenants.create(payload);
        closeModal();
        toast('Tenant onboarded successfully.', 'ok');
        render_tenants();
    } catch (err) {
        let msg = err.message || 'Onboarding failed.';
        if (err.data && typeof err.data === 'object') {
            const errors = Object.entries(err.data)
                .filter(([key]) => key !== 'detail' && key !== 'message')
                .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join('\n');
            if (errors) msg = errors;
            else if (err.data.detail) msg = err.data.detail;
            else if (err.data.message) msg = err.data.message;
        }
        toast(`Onboarding failed:\n${msg}`, 'err');
        console.error('Onboarding error:', err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ─── Delegated Event Listener for All Action Buttons ──────────────────
document.addEventListener('click', function(e) {
    const target = e.target.closest('[data-action]');
    if (target) {
        const profile = target.closest('.tenant-profile');
        if (profile) {
            e.preventDefault();
            const action = target.dataset.action;
            const tenantId = target.dataset.tenantId;
            const tenantName = target.dataset.tenantName || '';
            handleTenantAction(action, tenantId, tenantName);
        }
    }
});

// ─── Expose to global ──────────────────────────────────────────────────

window.render_tenants = render_tenants;
window.openTenantProfile = openTenantProfile;
window.openOnboardTenantModal = openOnboardTenantModal;
window.openEditTenantModal = openEditTenantModal;
window.openContractModal = openContractModal;
window.openChangeTermsModal = openChangeTermsModal;
window.openAssignUnitModal = openAssignUnitModal;
window.openRenewContractModal = openRenewContractModal;
window.openMoreActions = openMoreActions;
window.loadAvailableUnitsForProp = loadAvailableUnitsForProp;
window.terminateLease = terminateLease;
window.archiveTenant = archiveTenant;
window.verifyNRC = verifyNRC;
window.uploadContractDocument = uploadContractDocument;