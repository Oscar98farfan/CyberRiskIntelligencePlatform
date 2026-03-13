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
 * Construye el sidebar con dos niveles:
 *   Nivel 1 — Etapa  (colapsable, viene de "stages" en nav.json)
 *   Nivel 2 — Sprint (sublabel dentro de cada etapa)
 *   Nivel 3 — Ítems  (botones de sección con badge de status)
 *
 * @param {Array} sections - Array de secciones de nav.json.
 * @param {Array} stages   - Array de etapas de nav.json (define orden y label).
 */
function buildSidebar(sections, stages = []) {
  const nav = DOM.sidebar();
  if (!nav) return;

  /* Ordenar secciones por "order" */
  const sorted = [...sections].sort((a, b) => (a.order || 0) - (b.order || 0));

  /* Etapas: usar las del JSON o crear una por defecto */
  const stageList = stages.length > 0
    ? stages
    : [{ id: '__default__', label: 'Secciones', icon: '▸' }];

  /* ── Agrupar: stage → sprint → secciones ── */
  const byStage = {};
  stageList.forEach(st => { byStage[st.id] = {}; }); // { stageId: { sprintKey: [secs] } }

  sorted.forEach(sec => {
    const stageId   = sec.stage  || stageList[0].id;
    const sprintKey = `Sprint ${sec.sprint || '?'}`;

    if (!byStage[stageId])            byStage[stageId] = {};
    if (!byStage[stageId][sprintKey]) byStage[stageId][sprintKey] = [];

    byStage[stageId][sprintKey].push(sec);
  });

  /* ── Helpers ── */

  /* Conteo de progreso de un array plano de secciones */
  function countProgress(items) {
    const done = items.filter(s => s.status === 'done').length;
    return { done, total: items.length };
  }

  /* Todas las secciones de una etapa (aplanadas) */
  function flatItems(stageId) {
    return Object.values(byStage[stageId] || {}).flat();
  }

  /* Badge visual de status */
  function statusBadge(status) {
    const map = {
      'done':        { text: '✓ done',        cls: ''         },
      'in-progress': { text: '⏳ in progress', cls: 'progress' },
      'todo':        { text: '○ todo',         cls: 'todo'     },
    };
    const s = map[status] || map['todo'];
    return `<span class="nav-badge ${s.cls}" aria-label="${status}">${s.text}</span>`;
  }

  /* ── Construcción del HTML ── */
  let html = '';

  stageList.forEach(stage => {
    const allItems = flatItems(stage.id);
    if (allItems.length === 0) return; /* omitir etapas vacías */

    const { done, total } = countProgress(allItems);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    /* Encabezado colapsable de etapa */
    html += `
      <div class="stage-header" data-stage="${stage.id}"
           role="button" aria-expanded="true" tabindex="0">
        <span class="stage-arrow">▾</span>
        <span class="stage-label">${stage.label}</span>
        <span class="stage-progress">${done}/${total}</span>
      </div>
      <div class="stage-progress-bar">
        <div class="stage-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="stage-items" data-stage-items="${stage.id}">
    `;

    /* Sublabels de sprint dentro de la etapa */
    const sprintMap = byStage[stage.id];
    Object.entries(sprintMap).forEach(([sprintKey, items]) => {

      html += `<div class="sidebar-section-label">${sprintKey}</div>`;

      items.forEach(sec => {
        html += `
          <button
            class="nav-item"
            data-section-id="${sec.id}"
            data-section-file="${sec.file}"
            aria-label="Ir a ${sec.label}">
            <span class="nav-icon">${sec.icon || '◈'}</span>
            <span class="nav-label">${sec.label}</span>
            ${statusBadge(sec.status)}
          </button>
        `;
      });
    });

    html += `</div>`; /* cierre .stage-items */
  });

  nav.innerHTML = html;

  /* ── Eventos: clic en sección ── */
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.sectionId, btn.dataset.sectionFile);
    });
  });

  /* ── Eventos: colapsar / expandir etapa ── */
  nav.querySelectorAll('.stage-header').forEach(header => {
    const toggle = () => {
      const stageId  = header.dataset.stage;
      const body     = nav.querySelector(`[data-stage-items="${stageId}"]`);
      const expanded = header.getAttribute('aria-expanded') === 'true';

      header.setAttribute('aria-expanded', String(!expanded));
      header.querySelector('.stage-arrow').textContent = expanded ? '▸' : '▾';
      body.classList.toggle('collapsed', expanded);
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
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

  /* Construir sidebar — pasamos stages para definir el orden y labels de etapas */
  buildSidebar(sections || [], App.nav.stages || []);

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
document.addEventListener('DOMContentLoaded', () => {
  init();
  initMobileMenu();
});

/* ─── Manejar navegación con el botón atrás/adelante del navegador ─── */
window.addEventListener('hashchange', () => {
  const hashId  = window.location.hash.replace('#', '');
  const sections = App.nav?.sections || [];
  const target  = sections.find(s => s.id === hashId);
  if (target && target.id !== App.activeSectionId) {
    navigateTo(target.id, target.file);
  }
});

/* ─────────────────────────────────────────
   MENÚ MÓVIL — hamburguesa + drawer
   Se llama desde DOMContentLoaded para
   garantizar que el DOM ya existe.
───────────────────────────────────────── */
function initMobileMenu() {
  const toggle  = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (!toggle || !sidebar || !overlay) return;

  function openMenu() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    toggle.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  /* Botón hamburguesa */
  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeMenu() : openMenu();
  });

  /* Clic en overlay cierra el menú */
  overlay.addEventListener('click', closeMenu);

  /* Tecla Escape */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  /* Al navegar en móvil, cerrar el drawer automáticamente */
  sidebar.addEventListener('click', e => {
    if (e.target.closest('.nav-item') && window.innerWidth <= 800) closeMenu();
  });

  /* Al rotar a landscape / agrandar ventana */
  window.addEventListener('resize', () => {
    if (window.innerWidth > 800) closeMenu();
  });
}