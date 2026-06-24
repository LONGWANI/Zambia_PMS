async function render_maintenance() {
  if (typeof showLoader === 'function') showLoader();
  try {
    const data = await api.maintenance.list();
    const requests = data.results || data;
    const open = requests.filter(r => r.status === 'open').length;
    
    const html = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h2 class="fs-4 fw-bold text-slate-900 mb-1">Maintenance Queue</h2>
            <div class="text-muted fs-6">${open} requests require your attention</div>
        </div>
        <button class="btn-primary d-flex align-items-center gap-2" onclick="openCreateMaintenanceModal()">
            <i class="bi bi-plus-lg"></i> New Request
        </button>
      </div>
      
      <div class="saas-card p-0">
          <div class="table-responsive border-0">
              <table class="saas-table">
                  <thead>
                      <tr>
                          <th>Issue Details</th>
                          <th>Tenant / Unit</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Reported</th>
                          <th class="text-end">Actions</th>
                      </tr>
                  </thead>
                  <tbody>
                    ${requests.map(r => `
                      <tr>
                        <td>
                            <div class="fw-semibold text-slate-900">${r.title}</div>
                            <div class="text-muted" style="font-size: 12px;">${r.property_name}</div>
                        </td>
                        <td>
                            <div class="fw-medium">${r.tenant_name}</div>
                            <div class="text-muted" style="font-size: 12px;">Unit ${r.unit_number}</div>
                        </td>
                        <td><span class="badge ${r.priority === 'emergency' || r.priority === 'high' ? 'badge-danger' : r.priority === 'medium' ? 'badge-warning' : 'badge-primary'}">${r.priority.toUpperCase()}</span></td>
                        <td><span class="badge ${r.status === 'resolved' ? 'badge-success' : 'badge-warning'}">${r.status.toUpperCase()}</span></td>
                        <td class="text-muted">${r.created_at?.slice(0,10)}</td>
                        <td class="text-end">
                            ${r.status !== 'resolved' ? `<button class="btn-outline btn-sm" onclick="resolveRequest('${r.id}')">Resolve</button>` : `<span class="text-success"><i class="bi bi-check2-circle fs-5"></i></span>`}
                        </td>
                      </tr>`).join('')}
                  </tbody>
              </table>
          </div>
      </div>`;
    document.getElementById('contentWorkspace').innerHTML = html; 
  } catch (err) {
    document.getElementById('contentWorkspace').innerHTML = `<div class="alert alert-danger m-4">Error: ${err.message}</div>`;
  }
}

async function openCreateMaintenanceModal() {
  try {
      const tenants = await api.tenants.list();
      const tenantOptions = tenants.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
      
      openModal(`
        <div class="modal-box p-4 bg-white rounded-3 shadow">
            <div class="modal-hd d-flex justify-content-between align-items-center mb-3">
                <h5 class="fw-bold m-0 text-slate-900">File Maintenance Request</h5>
                <button class="btn-close" onclick="closeModal()"></button>
            </div>
            <div class="modal-bd">
                <div class="mb-3">
                    <label class="form-label text-slate-700 fw-medium small mb-1">Issue Title *</label>
                    <input class="form-control" id="maint_title" placeholder="e.g. Broken HVAC Unit">
                </div>
                <div class="mb-3">
                    <label class="form-label text-slate-700 fw-medium small mb-1">Description</label>
                    <textarea class="form-control" id="maint_description" rows="3" placeholder="Provide details..."></textarea>
                </div>
                <div class="row g-3 mb-3">
                    <div class="col-md-6">
                        <label class="form-label text-slate-700 fw-medium small mb-1">Tenant *</label>
                        <select class="form-select" id="maint_tenant">${tenantOptions}</select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label text-slate-700 fw-medium small mb-1">Priority Level</label>
                        <select class="form-select" id="maint_priority">
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="emergency">Emergency</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="modal-ft d-flex justify-content-end gap-2 pt-2">
                <button class="btn btn-light border" onclick="closeModal()">Cancel</button>
                <button class="btn btn-teal text-white px-4" onclick="submitMaintenance()">Submit Request</button>
            </div>
        </div>`);
  } catch(err) {
      toast(`Failed to load dependency elements: ${err.message}`, 'err');
  }
}

async function submitMaintenance() {
    const titleValue = document.getElementById('maint_title').value.trim();
    const descValue = document.getElementById('maint_description').value.trim();
    const tenantId = document.getElementById('maint_tenant').value;
    const priorityValue = document.getElementById('maint_priority').value;

    if (!titleValue || !tenantId) {
        toast('Issue Title and Tenant are required fields.', 'warn');
        return;
    }

    const payload = {
        title: titleValue,
        description: descValue,
        tenant_id: tenantId,
        priority: priorityValue
    };

    try {
        await api.maintenance.create(payload);
        closeModal();
        toast('Maintenance request successfully filed', 'ok');
        await render_maintenance();
    } catch (err) {
        toast(`Failed to file request: ${err.message}`, 'err');
    }
}

async function resolveRequest(requestId) {
    if (!confirm('Mark this maintenance issue as fully resolved?')) return;

    try {
        await api.maintenance.update(requestId, { status: 'resolved' });
        toast('Issue marked as resolved', 'ok');
        await render_maintenance(); 
    } catch (err) {
        toast(`Resolution failed: ${err.message}`, 'err');
    }
}

// BIND TO GLOBAL SCOPE
window.render_maintenance = render_maintenance;
window.openCreateMaintenanceModal = openCreateMaintenanceModal;
window.submitMaintenance = submitMaintenance;
window.resolveRequest = resolveRequest;