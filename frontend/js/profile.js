/**
 * Editable Profile Module for ZambiaPMS
 * Uses PATCH /api/auth/me/ with FormData for avatar uploads.
 */

async function render_profile() {
    try {
        const user = await api.profile.get();
        const content = document.getElementById('contentWorkspace');
        if (!content) return;

        // Split full_name into first and last for form fields
        const nameParts = (user.full_name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        content.innerHTML = `
            <div class="container-fluid py-4">
                <div class="row g-4">
                    <div class="col-lg-4">
                        <div class="card border-0 shadow-sm text-center p-4">
                            <div class="position-relative d-inline-block mx-auto mb-3">
                                <img src="${user.avatar || '/static/images/default-avatar.png'}" 
                                     id="avatarPreview" 
                                     class="rounded-circle img-thumbnail" 
                                     style="width: 130px; height: 130px; object-fit: cover;">
                            </div>
                            <h5 class="fw-bold mb-1">${user.full_name}</h5>
                            <span class="badge bg-primary text-capitalize mb-3">${user.role}</span>
                            <div>
                                <input type="file" id="avatarInput" class="d-none" accept="image/*" onchange="previewAvatar(this)">
                                <button class="btn btn-sm btn-outline-primary" onclick="document.getElementById('avatarInput').click()">
                                    <i class="bi bi-upload me-1"></i> Change Avatar
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-8">
                        <div class="card border-0 shadow-sm p-4">
                            <h5 class="fw-bold mb-4">Edit Profile Details</h5>
                            <form id="profileForm" onsubmit="saveProfileChanges(event)">
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label small fw-medium">First Name</label>
                                        <input type="text" id="profFirstName" class="form-control" value="${firstName}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-medium">Last Name</label>
                                        <input type="text" id="profLastName" class="form-control" value="${lastName}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-medium">Email Address</label>
                                        <input type="email" id="profEmail" class="form-control" value="${user.email || ''}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-medium">Phone Number</label>
                                        <input type="text" id="profPhone" class="form-control" value="${user.phone || ''}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-medium">NRC / Passport Number</label>
                                        <input type="text" id="profNRC" class="form-control" value="${user.nrc_passport || ''}">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-medium">Physical Address</label>
                                        <input type="text" id="profAddress" class="form-control" value="${user.physical_address || ''}">
                                    </div>
                                </div>

                                ${user.role === 'tenant' ? `
                                    <h6 class="fw-bold text-danger mt-4 mb-3"><i class="bi bi-telephone-plus me-1"></i> Emergency Contact</h6>
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label small">Contact Name</label>
                                            <input type="text" id="profEmergName" class="form-control" value="${user.emergency_contact_name || ''}">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label small">Contact Phone</label>
                                            <input type="text" id="profEmergPhone" class="form-control" value="${user.emergency_contact_phone || ''}">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label small">Relationship</label>
                                            <input type="text" id="profEmergRel" class="form-control" value="${user.emergency_contact_relation || ''}">
                                        </div>
                                    </div>
                                ` : ''}

                                <div class="text-end mt-4">
                                    <button type="submit" class="btn btn-primary px-4"><i class="bi bi-save me-1"></i> Save Profile Changes</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        toast(`Failed to load profile: ${err.message}`, 'err');
    }
}

async function saveProfileChanges(e) {
    e.preventDefault();
    try {
        const formData = new FormData();
        formData.append('first_name', document.getElementById('profFirstName').value.trim());
        formData.append('last_name', document.getElementById('profLastName').value.trim());
        formData.append('phone', document.getElementById('profPhone').value.trim());
        formData.append('nrc_passport', document.getElementById('profNRC').value.trim());
        formData.append('physical_address', document.getElementById('profAddress').value.trim());

        const emergName = document.getElementById('profEmergName');
        if (emergName) {
            formData.append('emergency_contact_name', emergName.value.trim());
            formData.append('emergency_contact_phone', document.getElementById('profEmergPhone').value.trim());
            formData.append('emergency_contact_relation', document.getElementById('profEmergRel').value.trim());
        }

        // Avatar file if selected
        const avatarInput = document.getElementById('avatarInput');
        if (avatarInput && avatarInput.files.length > 0) {
            formData.append('avatar', avatarInput.files[0]);
        }

        await api.profile.update(formData);
        toast('Profile updated successfully!', 'ok');
        // Refresh the view to show updated avatar and data
        await render_profile();
    } catch (err) {
        toast(`Update failed: ${err.message}`, 'err');
    }
}

// Preview avatar image before upload
function previewAvatar(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('avatarPreview');
            if (preview) preview.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}