/**
 * ZambiaPMS – Router & Global Utilities
 *
 * Since the project has migrated to Django Template Inheritance, each page is
 * a full server-rendered view.  This file now only provides:
 *   • Shared utility functions (zmw, badge, statusBadge, priorityBadge, toast,
 *     openModal, closeModal, showLoader)
 *   • A navigate() helper that redirects to the correct Django page URL so
 *     that inline onclick handlers in JS-generated HTML can still work.
 *
 * The old SPA DOMContentLoaded (which called navigate('dashboard') on every
 * page load and tried to fetch ./pages/*.html fragments) has been removed —
 * it was causing silent 404 errors and conflicting with the Django template
 * rendering on every page.
 */

// ---------------------------------------------------------------------------
// Page URL map — update these if your Django urlconf uses different paths.
// ---------------------------------------------------------------------------
const PAGE_URL_MAP = {
    dashboard:   '/',
    properties:  '/properties/',
    tenants:     '/tenants/',
    payments:    '/payments/',
    maintenance: '/maintenance/',
    reports:     '/reports/',
};

/**
 * Redirects to a named page.  Used by inline onclick="navigate('x')" calls
 * inside JS-generated HTML where Django template tags are unavailable.
 */
function navigate(page) {
    window.location.href = PAGE_URL_MAP[page] || `/${page}/`;
}

// ---------------------------------------------------------------------------
// Currency formatter
// ---------------------------------------------------------------------------

/**
 * Formats a number as Zambian Kwacha (ZMW).
 * @param {number|string} amount
 */
function zmw(amount) {
    const n = parseFloat(amount) || 0;
    return `ZMW ${n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

/**
 * Returns a <span class="badge ..."> string.
 * @param {string} classes
 * @param {string} text
 */
function badge(classes, text) {
    return `<span class="badge ${classes}">${text}</span>`;
}

/**
 * Maps status strings to appropriately styled Bootstrap badges.
 *
 * FIX: the previous implementation used a single concatenated string for
 * both CSS classes and display label, then split on the FIRST space.  This
 * meant only one CSS class was applied and the rest of the class string was
 * rendered as visible text inside the badge.  The map now uses objects so
 * classes and labels are always cleanly separated.
 *
 * @param {string} status
 */
function statusBadge(status) {
    const key = (status || '').toLowerCase();

    const badgeMap = {
        active:      { classes: 'bg-success-subtle text-success border border-success-subtle',   label: 'Active' },
        open:        { classes: 'bg-warning-subtle text-warning border border-warning-subtle',   label: 'Open' },
        in_progress: { classes: 'bg-primary-subtle text-primary border border-primary-subtle',   label: 'In Progress' },
        resolved:    { classes: 'bg-success-subtle text-success border border-success-subtle',   label: 'Resolved' },
        closed:      { classes: 'bg-secondary-subtle text-secondary border border-secondary-subtle', label: 'Closed' },
        vacant:      { classes: 'bg-info-subtle text-info border border-info-subtle',            label: 'Vacant' },
        confirmed:   { classes: 'bg-success-subtle text-success border border-success-subtle',   label: 'Confirmed' },
        paid:        { classes: 'bg-success-subtle text-success border border-success-subtle',   label: 'Paid' },
        overdue:     { classes: 'bg-danger-subtle text-danger border border-danger-subtle',      label: 'Overdue' },
        arrears:     { classes: 'bg-danger-subtle text-danger border border-danger-subtle',      label: 'In Arrears' },
    };

    const def = badgeMap[key] || { classes: 'bg-secondary-subtle text-secondary', label: status || 'Unknown' };
    return badge(def.classes, def.label);
}

/**
 * Maps priority strings to high-contrast warning badges.
 * @param {string} priority
 */
function priorityBadge(priority) {
    const key = (priority || '').toLowerCase();

    const priorityMap = {
        emergency: { classes: 'bg-danger text-white',     label: 'Urgent' },
        high:      { classes: 'bg-warning text-dark',     label: 'High' },
        medium:    { classes: 'bg-info text-dark',        label: 'Medium' },
        low:       { classes: 'bg-secondary text-white',  label: 'Low' },
    };

    const def = priorityMap[key] || { classes: 'bg-secondary text-white', label: priority || 'Low' };
    return badge(def.classes, def.label);
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

/**
 * Renders an ephemeral toast notification.
 * Targets #toastWrap — matches the id in base.html.
 * @param {string} msg
 * @param {'ok'|'err'|'warn'} type
 */
function toast(msg, type = 'ok') {
    const wrap = document.getElementById('toastWrap');
    if (!wrap) return;

    // Ensure the Bootstrap toast container exists inside the wrapper.
    let container = wrap.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        wrap.appendChild(container);
    }

    const borderClass = type === 'err' ? 'border-danger' : type === 'warn' ? 'border-warning' : 'border-success';
    const iconClass   = type === 'err' ? 'bi-x-circle-fill text-danger'
                      : type === 'warn' ? 'bi-exclamation-triangle-fill text-warning'
                      : 'bi-check-circle-fill text-success';

    const el = document.createElement('div');
    el.className = `toast show align-items-center bg-white border-start border-4 ${borderClass} mb-2`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');
    el.innerHTML = `
        <div class="d-flex">
            <div class="toast-body d-flex align-items-center gap-2">
                <i class="bi ${iconClass}"></i>
                <span class="text-slate-900 fw-medium">${msg}</span>
            </div>
            <button type="button" class="btn-close me-2 m-auto" aria-label="Close"></button>
        </div>`;

    container.appendChild(el);

    el.querySelector('.btn-close').addEventListener('click', () => el.remove());
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4000);
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * Opens the global modal overlay with the provided HTML markup.
 * @param {string} htmlMarkup
 */
function openModal(htmlMarkup) {
    const wrap = document.getElementById('modalWrap');
    if (!wrap) return;

    wrap.innerHTML = `
        <div class="modal-dialog modal-dialog-centered" style="max-width: 520px; width: 100%;">
            <div class="modal-content border-0 shadow-lg p-2" style="border-radius: 12px;">
                ${htmlMarkup}
            </div>
        </div>`;

    wrap.style.display = 'flex';

    // Dismiss when clicking outside the dialog card.
    wrap.onclick = (e) => { if (e.target === wrap) closeModal(); };
}

/**
 * Closes and empties the global modal overlay.
 */
function closeModal() {
    const wrap = document.getElementById('modalWrap');
    if (!wrap) return;
    wrap.style.display = 'none';
    wrap.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

/**
 * Shows a loading spinner inside a specific table body so that the
 * surrounding Django-rendered page structure is never replaced.
 *
 * Pass the tbody element's id and its column span.
 * Call with no arguments for a silent no-op (backward-compatible with old
 * render functions that called showLoader() at the top).
 *
 * @param {string|null} tbodyId
 * @param {number} colSpan
 */
function showLoader(tbodyId = null, colSpan = 6) {
    if (!tbodyId) return; // no-op when called without args
    const el = document.getElementById(tbodyId);
    if (!el) return;
    el.innerHTML = `
        <tr>
            <td colspan="${colSpan}" class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
                Loading...
            </td>
        </tr>`;
}

// ---------------------------------------------------------------------------
// Global exports
// ---------------------------------------------------------------------------
window.navigate        = navigate;
window.zmw             = zmw;
window.badge           = badge;
window.statusBadge     = statusBadge;
window.priorityBadge   = priorityBadge;
window.toast           = toast;
window.openModal       = openModal;
window.closeModal      = closeModal;
window.showLoader      = showLoader;
