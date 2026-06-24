/**
 * ZambiaPMS – Properties Controller Engine
 * Binds property lists, client search filtering, and record processing hooks.
 */

let originalPropertiesCache = [];

async function render_properties() {
  const tableBody = document.getElementById('propertyTableBody');
  const subtextWrapper = document.getElementById('propertySubtext');
  const searchInput = document.getElementById('propertySearch');

  try {
    // Request raw objects from the endpoint layer
    const networkResponse = await api.properties.list();
    originalPropertiesCache = networkResponse.results || networkResponse || [];

    // Calculate portfolio summaries
    const calculatedTotalUnits = originalPropertiesCache.reduce((sum, current) => sum + (parseInt(current.total_units) || 0), 0);
    if (subtextWrapper) {
      subtextWrapper.textContent = `Displaying ${originalPropertiesCache.length} managed buildings across ${calculatedTotalUnits} localized units`;
    }

    // Trigger base UI compilation
    populatePropertiesTable(originalPropertiesCache);

    // Bind real-time search interface triggers
    if (searchInput) {
      searchInput.replaceWith(searchInput.cloneNode(true)); // Wipe dangling duplicate event registrations cleanly
      const freshlyBoundSearch = document.getElementById('propertySearch');
      freshlyBoundSearch.addEventListener('input', (e) => {
        const structuralQuery = e.target.value.toLowerCase().trim();
        const filteredDataset = originalPropertiesCache.filter(item => 
          item.name.toLowerCase().includes(structuralQuery) || 
          (item.city && item.city.toLowerCase().includes(structuralQuery)) ||
          (item.district && item.district.toLowerCase().includes(structuralQuery))
        );
        populatePropertiesTable(filteredDataset);
      });
    }

  } catch (err) {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger fw-medium"><i class="bi bi-exclamation-circle me-1"></i> Data pipeline breakdown: ${err.message}</td></tr>`;
    }
  }
}

/**
 * Builds HTML Table rows into properties viewport container with SaaS styling
 * @param {Array} propertiesList 
 */
function populatePropertiesTable(propertiesList) {
  const tableBody = document.getElementById('propertyTableBody');
  if (!tableBody) return;

  if (propertiesList.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted fw-medium fs-6">No localized matching properties found in portfolio directory.</td></tr>`;
    return;
  }

  tableBody.innerHTML = propertiesList.map(building => {
    const total = parseInt(building.total_units) || 0;
    const occupied = parseInt(building.occupied_units) || (building.occupancy_rate ? Math.round(total * building.occupancy_rate / 100) : 0);
    const vacantCount = total - occupied;
    const computeOccupancyRate = building.occupancy_rate !== undefined ? building.occupancy_rate : (total > 0 ? Math.round((occupied / total) * 100) : 0);
    
    // Determine status badge based on occupancy
    let statusBadgeHTML = '';
    if (computeOccupancyRate > 0 || occupied > 0) {
        statusBadgeHTML = `<span class="badge-status badge-active">Active</span>`;
    } else {
        statusBadgeHTML = `<span class="badge-status badge-vacant">Vacant</span>`;
    }

    return `
      <tr>
        <td class="align-middle">
          <div class="fw-semibold text-slate-900">${building.name}</div>
          <small class="text-muted text-uppercase" style="font-size: 11px;">${building.property_type || 'Residential'}</small>
        </td>
        <td class="align-middle text-slate-700">
          <i class="bi bi-geo-alt text-muted me-1"></i>${building.district || 'Central District'}, ${building.city || 'Lusaka'}
        </td>
        <td class="align-middle fw-medium">
          <span class="text-slate-900">${total}</span> <span class="text-muted" style="font-size:12px;">Units</span>
        </td>
        <td class="align-middle">
            <div class="d-flex align-items-center gap-2">
                <div class="progress flex-grow-1" style="height: 6px; max-width: 100px;">
                    <div class="progress-bar bg-primary" role="progressbar" style="width: ${computeOccupancyRate}%"></div>
                </div>
                <small class="fw-medium">${computeOccupancyRate}%</small>
            </div>
        </td>
        <td class="align-middle">
          ${statusBadgeHTML}
        </td>
        <td class="text-end align-middle">
            <div class="action-group">
                <button class="btn-action view-btn" data-id="${building.id}" title="View Details">
                    <i class="bi bi-eye"></i>
                </button>
                <button class="btn-action edit-btn" data-id="${building.id}" title="Edit Property">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn-action delete delete-btn" data-id="${building.id}" title="Delete Property">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </td>
      </tr>
    `;
  }).join('');

  // Wire up the event listeners for the dynamic buttons after the HTML is rendered
  attachActionListeners();
}

/**
 * Attaches event listeners to the dynamically generated action buttons
 */
function attachActionListeners() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            // Assuming your router captures this structure
            window.location.href = `/pages/property-details.html?id=${id}`; 
        });
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            toast('Edit configuration modal triggering for ID: ' + id, 'info');
            // openEditPropertyModal(id); 
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (confirm('Are you sure you want to remove this property and all its units?')) {
                await executeDeleteProperty(id);
            }
        });
    });
}

/**
 * Executes the delete request to the backend via the API layer
 */
async function executeDeleteProperty(propertyId) {
    try {
        if (api.properties && typeof api.properties.delete === 'function') {
            await api.properties.delete(propertyId);
            toast('Property successfully deleted', 'ok');
            await render_properties(); // Refresh the table
        } else {
            console.warn("api.properties.delete is not bound correctly.");
            toast('API connection error: Could not execute delete', 'err');
        }
    } catch (err) {
        toast(`Failed to delete property: ${err.message}`, 'err');
    }
}

/**
 * Spawns structured modal capture payload container matching pages/properties.html setup
 */
function openCreatePropertyModal() {
  openModal(`
    <div class="modal-header border-0 pb-2">
      <h5 class="modal-title fw-bold text-slate-900 fs-5">Add Portfolio Property</h5>
      <button type="button" class="btn-close fs-7" onclick="closeModal()"></button>
    </div>
    <div class="modal-body border-0 py-2">
      <form id="propertyCreationForm" class="d-flex flex-column gap-3">
        <div>
          <label class="form-label text-slate-700 fw-medium small mb-1">Property Name *</label>
          <input type="text" class="form-control" id="modalPropName" placeholder="e.g., Mukuba Heights Block A" required>
        </div>
        <div>
          <label class="form-label text-slate-700 fw-medium small mb-1">Street Address *</label>
          <input type="text" class="form-control" id="modalPropAddress" placeholder="e.g., Plot 4826, Great East Road" required>
        </div>
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label text-slate-700 fw-medium small mb-1">City *</label>
            <input type="text" class="form-control" id="modalPropCity" value="Lusaka" required>
          </div>
          <div class="col-6">
            <label class="form-label text-slate-700 fw-medium small mb-1">District / Province</label>
            <input type="text" class="form-control" id="modalPropDistrict" placeholder="e.g., Lusaka Central">
          </div>
        </div>
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label text-slate-700 fw-medium small mb-1">Classification Type</label>
            <select class="form-select" id="modalPropType">
              <option value="residential" selected>Residential</option>
              <option value="commercial">Commercial</option>
              <option value="mixed">Mixed-Use Structure</option>
            </select>
          </div>
          <div class="col-6">
            <label class="form-label text-slate-700 fw-medium small mb-1">Total Unit Count *</label>
            <input type="number" class="form-control" id="modalPropUnits" min="1" max="500" value="4" required>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-footer border-0 pt-3 d-flex justify-content-end gap-2">
      <button type="button" class="btn btn-light border text-slate-700 px-4" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-teal text-white px-4" onclick="submitAddProperty()">Save Record</button>
    </div>
  `);
}

/**
 * Validates, compiles data, and ships payload structure back down to system API endpoint
 */
async function submitAddProperty() {
  const propertyForm = document.getElementById('propertyCreationForm');
  if (propertyForm && !propertyForm.checkValidity()) {
    propertyForm.reportValidity();
    return;
  }

  const nameValue = document.getElementById('modalPropName').value.trim();
  const addressValue = document.getElementById('modalPropAddress').value.trim();
  const cityValue = document.getElementById('modalPropCity').value.trim();
  const districtValue = document.getElementById('modalPropDistrict').value.trim();
  const typeValue = document.getElementById('modalPropType').value;
  const unitsValue = parseInt(document.getElementById('modalPropUnits').value) || 1;

  const requestPayload = {
    name: nameValue,
    address: addressValue,
    city: cityValue,
    district: districtValue,
    property_type: typeValue,
    total_units: unitsValue
  };

  try {
    await api.properties.create(requestPayload);
    closeModal();
    toast(`Successfully recorded structural profile: "${nameValue}"`, 'ok');
    await render_properties(); // Reload live data trace cleanly
  } catch (err) {
    toast(`Record generation execution exception: ${err.message}`, 'err');
  }
}

// Bind handlers to root window scope configuration maps
window.render_properties = render_properties;
window.openCreatePropertyModal = openCreatePropertyModal;
window.submitAddProperty = submitAddProperty;