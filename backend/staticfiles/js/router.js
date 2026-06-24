/**
 * ZambiaPMS – Router & Global Utilities
 * Handles single page application navigation, template loading, and shared UI states.
 */

// Global State Tracker
let currentPage = 'dashboard';

const pageTitles = {
  dashboard: 'Dashboard',
  properties: 'Property Portfolio',
  tenants: 'Tenant Directory',
  payments: 'Financial Ledger',
  maintenance: 'Maintenance Queue',
  reports: 'Analytics & Reports'
};

/**
 * Formats values to Zambian Kwacha (ZMW) currency standard
 * @param {number|string} amount 
 */
function zmw(amount) {
  const numericAmount = parseFloat(amount) || 0;
  return `ZMW ${numericAmount.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Returns an HTML Badge component string based on standard system states
 * @param {string} className 
 * @param {string} text 
 */
function badge(className, text) {
  return `<span class="badge ${className}">${text}</span>`;
}

/**
 * Maps database string keys to customized UI badges
 * @param {string} status 
 */
function statusBadge(status) {
  const lowercaseStatus = (status || '').toLowerCase();
  const badgeMap = {
    active: 'bg-success-subtle text-success border border-success-subtle Active',
    open: 'bg-warning-subtle text-warning border border-warning-subtle Open',
    in_progress: 'bg-primary-subtle text-primary border border-primary-subtle In Progress',
    resolved: 'bg-success-subtle text-success border border-success-subtle Resolved',
    closed: 'bg-secondary-subtle text-secondary border border-secondary-subtle Closed',
    vacant: 'bg-info-subtle text-info border border-info-subtle Vacant',
    confirmed: 'bg-success-subtle text-success border border-success-subtle Confirmed',
    paid: 'bg-success-subtle text-success border border-success-subtle Paid',
    overdue: 'bg-danger-subtle text-danger border border-danger-subtle Overdue',
    arrears: 'bg-danger-subtle text-danger border border-danger-subtle In Arrears'
  };

  const matchedValue = badgeMap[lowercaseStatus] || 'bg-secondary-subtle text-secondary Custom';
  const separationIndex = matchedValue.indexOf(' ');
  const cssClasses = matchedValue.slice(0, separationIndex);
  const displayLabel = matchedValue.slice(separationIndex + 1);

  return badge(cssClasses, displayLabel);
}

/**
 * Maps priority weights to high-contrast warning badges
 * @param {string} priority 
 */
function priorityBadge(priority) {
  const lowercasePriority = (priority || '').toLowerCase();
  const priorityMap = {
    emergency: 'bg-danger text-white Urgent',
    high: 'bg-warning text-dark High',
    medium: 'bg-info text-dark Medium',
    low: 'bg-secondary text-white Low'
  };

  const matchedValue = priorityMap[lowercasePriority] || 'bg-secondary text-white Low';
  const separationIndex = matchedValue.indexOf(' ');
  const cssClasses = matchedValue.slice(0, separationIndex);
  const displayLabel = matchedValue.slice(separationIndex + 1);

  return badge(cssClasses, displayLabel);
}

/**
 * Renders a global ephemeral alert toast message onto the screen
 * @param {string} msg 
 * @param {string} type - 'ok', 'err', or 'warn'
 */
function toast(msg, type = 'ok') {
  const toastWrapper = document.getElementById('toastWrap');
  if (!toastWrapper) return;

  // Ensure consistent container layout inside index.html's target wrapper
  let container = toastWrapper.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    toastWrapper.appendChild(container);
  }

  const toastElement = document.createElement('div');
  let borderClass = 'border-success';
  let iconClass = 'bi-check-circle-fill text-success';
  
  if (type === 'err') {
    borderClass = 'border-danger';
    iconClass = 'bi-x-circle-fill text-danger';
  } else if (type === 'warn') {
    borderClass = 'border-warning';
    iconClass = 'bi-exclamation-triangle-fill text-warning';
  }

  toastElement.className = `toast show align-items-center bg-white border-start border-4 ${borderClass} mb-2`;
  toastElement.setAttribute('role', 'alert');
  toastElement.setAttribute('aria-live', 'assertive');
  toastElement.setAttribute('aria-atomic', 'true');
  
  toastElement.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi ${iconClass}"></i>
        <span class="text-slate-900 fw-medium">${msg}</span>
      </div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  container.appendChild(toastElement);

  // Auto remove after 4 seconds
  setTimeout(() => {
    toastElement.classList.remove('show');
    setTimeout(() => toastElement.remove(), 300);
  }, 4000);

  // Wire close button event manually to prevent dependency failures
  toastElement.querySelector('.btn-close').addEventListener('click', () => {
    toastElement.remove();
  });
}

/**
 * Spawns a structured Bootstrap-aligned modal card onto the interface shell
 * @param {string} htmlMarkup 
 */
function openModal(htmlMarkup) {
  const modalWrapper = document.getElementById('modalWrap');
  if (!modalWrapper) return;

  modalWrapper.style.display = 'flex';
  modalWrapper.className = 'modal fade show';
  modalWrapper.style.backgroundColor = 'rgba(15, 23, 42, 0.6)'; // Smooth backdrop shading
  modalWrapper.innerHTML = `
    <div class="modal-dialog modal-dialog-centered" style="max-width: 500px; width: 100%;">
      <div class="modal-content border-0 shadow-lg p-2" style="border-radius: 12px;">
        ${htmlMarkup}
      </div>
    </div>
  `;

  // Dismiss layout if clicking outside card boundary
  modalWrapper.onclick = (e) => {
    if (e.target === modalWrapper) closeModal();
  };
}

/**
 * Tears down and purges the active global modal container instance
 */
function closeModal() {
  const modalWrapper = document.getElementById('modalWrap');
  if (!modalWrapper) return;
  modalWrapper.style.display = 'none';
  modalWrapper.className = '';
  modalWrapper.innerHTML = '';
}

/**
 * Places a fluid animated placeholder loading spinner inside the content frame
 */
function showLoader() {
  const target = document.getElementById('content');
  if (target) {
    target.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center py-5 text-muted gap-2">
        <div class="spinner-border text-teal" role="status" style="width: 2rem; height: 2rem; --bs-spinner-border-width: 0.2em;"></div>
        <span class="fs-6 fw-medium text-slate-500">Fetching live system layers...</span>
      </div>
    `;
  }
}

/**
 * Main Client Router. Fetches localized partial templates, appends 
 * elements to DOM workspace, updates UI contextual titles, and triggers domain controller loops.
 * @param {string} page 
 */
async function navigate(page) {
  currentPage = page;
  
  // Dynamic Title Header Syncing
  const titleHeader = document.getElementById('pageTitle');
  if (titleHeader) {
    titleHeader.textContent = pageTitles[page] || page;
  }

  // Visual Sidebar Navigation Tab Active Class Toggling
  document.querySelectorAll('.sidebar-link').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-route') === page) {
      btn.classList.add('active');
    }
  });

  showLoader();

  try {
    // Read clean isolated view fragments asynchronously
    const response = await fetch(`./pages/${page}.html`);
    if (!response.ok) {
      throw new Error(`Failed to load target template frame: ${response.statusText}`);
    }
    
    const htmlFragment = await response.text();
    document.getElementById('content').innerHTML = htmlFragment;

    // Direct callback lookup matching dynamic rendering scopes
    const initializationFn = window[`render_${page}`];
    if (typeof initializationFn === 'function') {
      await initializationFn();
    }
  } catch (err) {
    document.getElementById('content').innerHTML = `
      <div class="alert alert-danger m-4 border-0 d-flex gap-2 align-items-center" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <div><strong>Navigation Exception:</strong> ${err.message || 'The selected module engine is under active refinement.'}</div>
      </div>
    `;
  }
}

// Intercept window events and initialize system interface link anchors
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const selectedRoute = e.currentTarget.getAttribute('data-route');
      if (selectedRoute) {
        navigate(selectedRoute);
      }
    });
  });

  // Default Entry Route
  if (auth.requireAuth()) {
    auth.populateSidebarUser();
    navigate('dashboard');
  }
});

// Bind all foundational utilities to the base global window object execution layer
window.zmw = zmw;
window.badge = badge;
window.statusBadge = statusBadge;
window.priorityBadge = priorityBadge;
window.toast = toast;
window.openModal = openModal;
window.closeModal = closeModal;
window.showLoader = showLoader;
window.navigate = navigate;