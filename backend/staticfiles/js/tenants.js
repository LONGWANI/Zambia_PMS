/**
 * ZambiaPMS – Tenant Directory Logic Module
 * Controls user directory maps, balance tracking loops, and unit linking hooks.
 */

let tenantDirectoryMasterCache = [];

async function render_tenants() {
  const tableBody = document.getElementById('tenantTableBody');
  const subtextWrapper = document.getElementById('tenantSubtext');
  const searchInput = document.getElementById('tenantSearch');
  const statusFilterSelect = document.getElementById('tenantStatusFilter');

  try {
    const serverResult = await api.tenants.list();
    tenantDirectoryMasterCache = serverResult.results || serverResult || [];

    if (subtextWrapper) {
      subtextWrapper.textContent = `Tracking ${tenantDirectoryMasterCache.length} system user account assignments`;
    }

    // Baseline directory generation execution
    executeTenantUIRenderFilter();

    // Attach search query listener
    if (searchInput) {
      searchInput.replaceWith(searchInput.cloneNode(true));
      document.getElementById('tenantSearch').addEventListener('input', executeTenantUIRenderFilter);
    }

    // Attach programmatic state selectors
    if (statusFilterSelect) {
      statusFilterSelect.replaceWith(statusFilterSelect.cloneNode(true));
      document.getElementById('tenantStatusFilter').addEventListener('change', executeTenantUIRenderFilter);
    }

  } catch (err) {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger fw-medium"><i class="bi bi-exclamation-circle me-1"></i> Directory data trace failure: ${err.message}</td></tr>`;
    }
  }
}

/**
 * Reads parameters, extracts state properties, and compiles active rows onto DOM element structures
 */
function executeTenantUIRenderFilter() {
  const searchQuery = (document.getElementById('tenantSearch')?.value || '').toLowerCase().trim();
  const activeFilterStatus = document.getElementById('tenantStatusFilter')?.value || 'all';
  const tableBody = document.getElementById('tenantTableBody');

  if (!tableBody) return;

  const subsetData = tenantDirectoryMasterCache.filter(tenant => {
    const matchesSearch = 
      tenant.full_name.toLowerCase().includes(searchQuery) ||
      (tenant.email && tenant.email.toLowerCase().includes(searchQuery)) ||
      (tenant.phone && tenant.phone.includes(searchQuery)) ||
      (tenant.unit_number && tenant.unit_number.toLowerCase().includes(searchQuery));

    const currentBalance = parseFloat(tenant.balance) || 0;
    let matchesStatus = true;

    if (activeFilterStatus === 'arrears') {
      matchesStatus = currentBalance > 0;
    } else if (activeFilterStatus === 'active') {
      matchesStatus = currentBalance <= 0;
    }

    return matchesSearch && matchesStatus;
  });

  if (subsetData.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted fw-medium fs-6">No database profiles match search parameters.</td></tr>`;
    return;
  }

  tableBody.innerHTML = subsetData.map(user => {
    const computedBalance = parseFloat(user.balance) || 0;
    const operationalStatusKey = computedBalance > 0 ? 'arrears' : 'active';

    return `
      <tr>
        <td class="align-middle">
          <div class="fw-semibold text-slate-900">${user.full_name}</div>
          <div class="text-muted small" style="font-family: monospace;">NRC: ${user.nrc_number || 'Not Registered'}</div>
        </td>
        <td class="align-middle text-slate-800">
          <div class="fw-medium">${user.property_name || 'Individual Contract'}</div>
          <div class="text-muted small">Unit Spec: ${user.unit_number || 'Pending Assignment'}</div>
        </td>
        <td class="align-middle" style="font-size: 13px;">
          <div class="text-slate-800 fw-medium"><i class="bi bi-telephone text-muted me-1"></i>${user.phone || '—'}</div>
          <div class="text-muted text-lowercase"><i class="bi bi-envelope text-muted me-1"></i>${user.email || '—'}</div>
        </td>
        <td class="align-middle">
          ${statusBadge(operationalStatusKey)}
        </td>
        <td class="align-middle fw-bold style="font-family: monospace;" style="color: ${computedBalance > 0 ? 'var(--red)' : 'var(--green)'};">
          ${zmw(computedBalance)}
        </td>
        <td class="text-end align-middle">
          <button class="btn btn-sm btn-light border px-3" onclick="toast('Opening encrypted lease workspace context', 'warn')">
            <i class="bi bi-file-earmark-text me-1"></i> Lease
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Builds user onboarding form container matching layout scopes cleanly
 */
async function openOnboardTenantModal() {
  try {
    const systemProperties = await api.properties.list();
    const cleanBuildingOptions = systemProperties.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

    openModal(`
      <div class="modal-header border-0 pb-2">
        <h5 class="modal-title fw-bold text-slate-900 fs-5">Onboard New Tenant</h5>
        <button type="button" class="btn-close fs-7" onclick="closeModal()"></button>
      </div>
      <div class="modal-body border-0 py-1" style="max-height: 70vh; overflow-y: auto;">
        <form id="tenantOnboardingForm" class="d-flex flex-column gap-3">
          <div>
            <label class="form-label text-slate-700 fw-medium small mb-1">Full Legal Name *</label>
            <input type="text" class="form-control" id="modalTenantName" placeholder="e.g., Banji Mwape" required>
          </div>
          <div class="row g-2">
            <div class="col-6">
              <label class="form-label text-slate-700 fw-medium small mb-1">Email Coordinates *</label>
              <input type="email" class="form-control" id="modalTenantEmail" placeholder="name@domain.zm" required>
            </div>
            <div class="col-6">
              <label class="form-label text-slate-700 fw-medium small mb-1">Mobile Line *</label>
              <input type="tel" class="form-control" id="modalTenantPhone" placeholder="0977000000" required>
            </div>
          </div>
          <div>
            <label class="form-label text-slate-700 fw-medium small mb-1">National Registration Card (NRC) *</label>
            <input type="text" class="form-control" id="modalTenantNRC" placeholder="000000/00/0" required>
          </div>
          <div class="row g-2">
            <div class="col-6">
              <label class="form-label text-slate-700 fw-medium small mb-1">Assign Property *</label>
              <select class="form-select" id="modalTenantProperty" required>
                <option value="" disabled selected>Select Building</option>
                ${cleanBuildingOptions}
              </select>
            </div>
            <div class="col-6">
              <label class="form-label text-slate-700 fw-medium small mb-1">Target Unit *</label>
              <select class="form-select" id="modalTenantUnit" required disabled>
                <option value="" disabled selected>Select property first</option>
              </select>
            </div>
          </div>
          <div>
            <label class="form-label text-slate-700 fw-medium small mb-1">Initial Portal Passcode Configuration *</label>
            <input type="password" class="form-control" id="modalTenantPassword" placeholder="Minimum 6 characters" required>
          </div>
        </form>
      </div>
      <div class="modal-footer border-0 pt-3 d-flex justify-content-end gap-2">
        <button type="button" class="btn btn-light border px-4" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-teal text-white px-4" onclick="submitOnboardTenant()">Onboard User</button>
      </div>
    `);

    // Dynamically retrieve associated child units upon choosing specific structural entities
    const buildingSelector = document.getElementById('modalTenantProperty');
    if (buildingSelector) {
      buildingSelector.addEventListener('change', async (e) => {
        const selectedBuildingId = e.target.value;
        const unitSelector = document.getElementById('modalTenantUnit');
        
        if (!selectedBuildingId || !unitSelector) return;

        unitSelector.disabled = true;
        unitSelector.innerHTML = `<option value="" disabled selected>Loading open units...</option>`;

        try {
          // Look up explicit structural components matching endpoints
          const unitDataTrace = await api.units.list(`?property_id=${selectedBuildingId}`);
          if (unitDataTrace && unitDataTrace.length > 0) {
            unitSelector.innerHTML = '<option value="" disabled selected>Select Unit ID</option>' + 
              unitDataTrace.map(u => `<option value="${u.id}">Unit ${u.unit_number} (${u.status || 'Vacant'})</option>`).join('');
            unitSelector.disabled = false;
          } else {
            unitSelector.innerHTML = `<option value="" disabled selected>No vacant options found</option>`;
          }
        } catch (unitErr) {
          unitSelector.innerHTML = `<option value="" disabled selected>Error tracing details</option>`;
        }
      });
    }

  } catch (err) {
    toast(`Form generator dependency system failure: ${err.message}`, 'err');
  }
}

/**
 * Packages structural parameters, checks constraints, and processes backend tenant registration
 */
async function submitOnboardTenant() {
  const structuralFormInstance = document.getElementById('tenantOnboardingForm');
  if (structuralFormInstance && !structuralFormInstance.checkValidity()) {
    structuralFormInstance.reportValidity();
    return;
  }

  const nameVal = document.getElementById('modalTenantName').value.trim();
  const emailVal = document.getElementById('modalTenantEmail').value.trim();
  const phoneVal = document.getElementById('modalTenantPhone').value.trim();
  const nrcVal = document.getElementById('modalTenantNRC').value.trim();
  const propertyIdVal = document.getElementById('modalTenantProperty').value;
  const unitIdVal = document.getElementById('modalTenantUnit').value;
  const passwordVal = document.getElementById('modalTenantPassword').value;

  const structuralPayload = {
    full_name: nameVal,
    email: emailVal,
    phone: phoneVal,
    nrc_number: nrcVal,
    property_id: propertyIdVal,
    unit_id: unitIdVal,
    password: passwordVal
  };

  try {
    await api.tenants.create(structuralPayload);
    closeModal();
    toast(`Account deployment configuration complete: "${nameVal}"`, 'ok');
    await render_tenants();
  } catch (err) {
    toast(`Tenant deployment error exception: ${err.message}`, 'err');
  }
}

// Bind handlers explicitly to workspace scopes
window.render_tenants = render_tenants;
window.openOnboardTenantModal = openOnboardTenantModal;
window.submitOnboardTenant = submitOnboardTenant;