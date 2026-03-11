/**
 * app.js
 * Controlador principal de la aplicación.
 * Orquesta: carga de nav → construcción del sidebar → navegación → render de secciones.
 *
 * Dependencias (cargadas antes en HTML):
 *   - loader.js   (fetchJSON, loadNav, loadSection)
 *   - renderer.js (renderSection)
 */

'use strict';

/* ─────────────────────────────────────────
   ESTADO GLOBAL DE LA APP
───────────────────────────────────────── */
const App = {
  nav:             null,   // Datos de nav.json
  activeSectionId: null,   // ID de la sección activa
  isLoading:       false,  // Flag para evitar cargas simultáneas
};

/* ─────────────────────────────────────────
   REFERENCIAS A DOM
───────────────────────────────────────── */
const DOM = {
  sidebar:    () => document.getElementById('sidebar-nav'),
  content:    () => document.getElementById('app-content'),
  headerMeta: () => document.getElementById('header-meta'),
  footerYear: () => document.getElementById('footer-year'),
  footerRepo: () => document.getElementById('footer-repo'),
  infoVersion:() => document.getElementById('info-version'),
  infoSprint: () => document.getElementById('info-sprint'),
  infoStatus: () => document.getElementById('info-status'),
};

/* ─────────────────────────────────────────
   UI HELPERS
───────────────────────────────────────── */

/** Muestra el spinner de carga en el área de contenido. */
function showLoading(msg = 'Cargando...') {
  DOM.content().innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <span>${msg}</span>
    </div>
  `;
}

/** Muestra un error en el área de contenido. */
function showError(msg) {
  DOM.content().innerHTML = `
    <div class="error-state">⚠ ${msg}</div>
  `;
}

/** Marca el ítem activo en el sidebar. */
function setActiveNav(id) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sectionId === id);
  });
}

/* ─────────────────────────────────────────
   CONSTRUCCIÓN DEL SIDEBAR
───────────────────────────────────────── */

/**
 * Construye los ítems de navegación a partir del nav.json.
 * @param {Array} sections - Array de objetos de sección del nav.json.
 */
function buildSidebar(sections) {
  const nav = DOM.sidebar();
  if (!nav) return;

  /* Ordenar por campo "order" */
  const sorted = [...sections].sort((a, b) => (a.order || 0) - (b.order || 0));

  /* Agrupar por sprint */
  const bySprint = sorted.reduce((acc, sec) => {
    const key = `Sprint ${sec.sprint || '?'}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(sec);
    return acc;
  }, {});

  let html = '';

  for (const [sprintLabel, items] of Object.entries(bySprint)) {
    html += `<div class="sidebar-section-label">${sprintLabel}</div>`;

    for (const sec of items) {
      const badge = sec.status === 'done'
        ? '<span class="nav-badge">✓ done</span>'
        : '';
      html += `
        <button
          class="nav-item"
          data-section-id="${sec.id}"
          data-section-file="${sec.file}"
          aria-label="Ir a ${sec.label}">
          <span class="nav-icon">${sec.icon || '◈'}</span>
          <span>${sec.label}</span>
          ${badge}
        </button>
      `;
    }
  }

  nav.innerHTML = html;

  /* Asignar eventos de clic */
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.sectionId, btn.dataset.sectionFile);
    });
  });
}

/* ─────────────────────────────────────────
   LLENADO DE META HEADER / FOOTER / SIDEBAR INFO
───────────────────────────────────────── */
function populateMeta(project) {
  if (!project) return;

  /* Header */
  const hm = DOM.headerMeta();
  if (hm) hm.textContent = `v${project.version || '—'} · ${project.sprint || ''}`;

  /* Footer */
  const fy = DOM.footerYear();
  if (fy) fy.textContent = new Date().getFullYear();

  const fr = DOM.footerRepo();
  if (fr && project.repo) {
    fr.href        = project.repo;
    fr.textContent = project.repo.replace('https://', '');
  }

  /* Sidebar info panel */
  const iv = DOM.infoVersion();
  if (iv) iv.textContent = project.version || '—';

  const isp = DOM.infoSprint();
  if (isp) isp.textContent = project.sprint || '—';

  const ist = DOM.infoStatus();
  if (ist) ist.textContent = project.status || '—';
}

/* ─────────────────────────────────────────
   NAVEGACIÓN
───────────────────────────────────────── */

/**
 * Navega a una sección: carga el JSON y renderiza el contenido.
 * @param {string} id       - ID de la sección (para la URL hash y el estado).
 * @param {string} filePath - Ruta al archivo JSON de la sección.
 */
async function navigateTo(id, filePath) {
  if (App.isLoading || App.activeSectionId === id) return;

  App.isLoading       = true;
  App.activeSectionId = id;

  /* Actualizar URL hash sin recargar la página */
  history.replaceState(null, '', `#${id}`);

  /* Marcar activo en sidebar */
  setActiveNav(id);

  /* Mostrar carga */
  showLoading(`Cargando ${id}…`);

  try {
    const data = await loadSection(filePath);
    const html = renderSection(data);
    DOM.content().innerHTML = html;
  } catch (err) {
    console.error('[App] Error cargando sección:', err);
    showError(`No se pudo cargar la sección "${id}". <br><small>${err.message}</small>`);
  } finally {
    App.isLoading = false;
  }
}

/* ─────────────────────────────────────────
   INICIALIZACIÓN
───────────────────────────────────────── */

/**
 * Punto de entrada principal.
 * 1. Carga nav.json
 * 2. Construye sidebar
 * 3. Navega a la sección inicial (hash o primera)
 */
async function init() {
  /* Mostrar carga inicial */
  showLoading('Iniciando plataforma…');

  try {
    App.nav = await loadNav();
  } catch (err) {
    showError(`No se pudo cargar la configuración de navegación.<br><small>${err.message}</small>`);
    return;
  }

  const { project, sections } = App.nav;

  /* Rellenar meta */
  populateMeta(project);

  /* Construir sidebar */
  buildSidebar(sections || []);

  /* Determinar sección inicial: hash de la URL o la primera */
  const hashId = window.location.hash.replace('#', '');
  const sorted = [...(sections || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

  const initial = sorted.find(s => s.id === hashId) || sorted[0];

  if (initial) {
    await navigateTo(initial.id, initial.file);
  } else {
    showError('No se encontraron secciones configuradas en nav.json.');
  }
}

/* ─── Lanzar cuando el DOM esté listo ─── */
document.addEventListener('DOMContentLoaded', init);

/* ─── Manejar navegación con el botón atrás/adelante del navegador ─── */
window.addEventListener('hashchange', () => {
  const hashId  = window.location.hash.replace('#', '');
  const sections = App.nav?.sections || [];
  const target  = sections.find(s => s.id === hashId);
  if (target && target.id !== App.activeSectionId) {
    navigateTo(target.id, target.file);
  }
});
