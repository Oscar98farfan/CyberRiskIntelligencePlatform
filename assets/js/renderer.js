/**
 * renderer.js
 * Convierte bloques JSON en HTML.
 * Para agregar un nuevo tipo de bloque:
 *   1. Agrega el tipo en tu JSON de sección.
 *   2. Crea una función renderNombreTipo(block) aquí.
 *   3. Registrala en el objeto RENDERERS al final.
 */

'use strict';

/* ─────────────────────────────────────────
   UTILIDADES
───────────────────────────────────────── */

/** Envuelve cualquier bloque en el contenedor estándar con su etiqueta. */
function wrapBlock(label, innerHtml) {
  return `
    <div class="content-block">
      ${label ? `<div class="block-label">${label}</div>` : ''}
      ${innerHtml}
    </div>
  `;
}

/** Escapa caracteres HTML para prevenir XSS en contenido de texto. */
function esc(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─────────────────────────────────────────
   RENDERIZADORES POR TIPO
───────────────────────────────────────── */

/** Caja destacada (highlight) — para objetivos generales, visiones, declaraciones. */
function renderHighlight(block) {
  return wrapBlock(block.label, `
    <div class="highlight-box">${esc(block.content)}</div>
  `);
}

/** Párrafo de texto simple. */
function renderParagraph(block) {
  return wrapBlock(block.label, `
    <p class="paragraph-text">${esc(block.content)}</p>
  `);
}

/** Lista numerada (objetivos específicos, pasos, etc.) */
function renderNumberedList(block) {
  const items = (block.items || [])
    .map(item => `<li>${esc(item)}</li>`)
    .join('');
  return wrapBlock(block.label, `
    <ol class="numbered-list">${items}</ol>
  `);
}

/** Lista con viñetas (→). */
function renderBulletList(block) {
  const items = (block.items || [])
    .map(item => `<li>${esc(item)}</li>`)
    .join('');
  return wrapBlock(block.label, `
    <ul class="bullet-list">${items}</ul>
  `);
}

/** Dos columnas (incluye / no incluye, restricciones / supuestos). */
function renderTwoCol(block) {
  const cols = (block.cols || []).map(col => {
    const variant = esc(col.variant || '');
    const items = (col.items || [])
      .map(item => `<li>${esc(item)}</li>`)
      .join('');
    return `
      <div class="col-card ${variant}">
        <div class="col-card-title">${esc(col.icon || '')} ${esc(col.title)}</div>
        <ul class="col-card-list">${items}</ul>
      </div>
    `;
  }).join('');
  return wrapBlock(block.label, `<div class="two-col-grid">${cols}</div>`);
}

/** Lista de entregables con código y fecha. */
function renderDeliverables(block) {
  const items = (block.items || []).map(item => `
    <div class="deliverable-item">
      <span class="deliverable-code">${esc(item.code)}</span>
      <div>
        <div class="deliverable-text">${esc(item.text)}</div>
        ${item.date ? `<div class="deliverable-date">📅 ${esc(item.date)}</div>` : ''}
      </div>
    </div>
  `).join('');
  return wrapBlock(block.label, items);
}

/** Timeline de fases. */
function renderTimeline(block) {
  const phases = (block.phases || []).map(phase => `
    <div class="tl-item">
      <div class="tl-id">${esc(phase.id)}</div>
      <div class="tl-name">${esc(phase.name)}</div>
      <div class="tl-weeks">${esc(phase.weeks)}</div>
    </div>
  `).join('');
  return wrapBlock(block.label, `<div class="timeline">${phases}</div>`);
}

/** Cuadrícula de tarjetas genéricas (contribución estratégica, stack, etc.) */
function renderCardsGrid(block) {
  const cards = (block.items || []).map(item => `
    <div class="card-item">
      <div class="card-title">${esc(item.title)}</div>
      <div class="card-body">${esc(item.content)}</div>
    </div>
  `).join('');
  return wrapBlock(block.label, `<div class="cards-grid">${cards}</div>`);
}

/** Grid de KPIs. */
function renderKpiGrid(block) {
  const kpis = (block.items || []).map(kpi => `
    <div class="kpi-card">
      <div class="kpi-id">${esc(kpi.id)}</div>
      <div class="kpi-text">${esc(kpi.text)}</div>
    </div>
  `).join('');
  return wrapBlock(block.label, `<div class="kpi-grid">${kpis}</div>`);
}

/** Lista de diferenciadores con número grande. */
function renderDifferentiators(block) {
  const items = (block.items || []).map(item => `
    <div class="diff-item">
      <div class="diff-num">${esc(item.num)}</div>
      <div>
        <div class="diff-title">${esc(item.title)}</div>
        <div class="diff-desc">${esc(item.desc)}</div>
      </div>
    </div>
  `).join('');
  return wrapBlock(block.label, items);
}

/** Grid de stakeholders. */
function renderStakeholders(block) {
  const cards = (block.items || []).map(sh => {
    const poderClass  = `badge-${(sh.poder  || '').toLowerCase()}`;
    const interesClass = `badge-${(sh.interes || '').toLowerCase()}`;
    const tipoClass   = `badge-${(sh.tipo   || '').toLowerCase()}`;
    return `
      <div class="sh-card">
        <span class="sh-id">${esc(sh.id)}</span>
        <div class="sh-name">${esc(sh.nombre)}</div>
        <div class="sh-rol">${esc(sh.rol)}</div>
        <div class="sh-badges">
          <span class="badge ${tipoClass}">${esc(sh.tipo)}</span>
          <span class="badge ${poderClass}">⚡ ${esc(sh.poder)}</span>
          <span class="badge ${interesClass}">👁 ${esc(sh.interes)}</span>
        </div>
        <div class="sh-estrategia">📌 ${esc(sh.estrategia)}</div>
      </div>
    `;
  }).join('');
  return wrapBlock(block.label, `<div class="stakeholder-grid">${cards}</div>`);
}

/** Matriz de poder/interés (2x2). */
function renderStakeholderMatrix(block) {
  const q = block.quadrants || {};

  function renderQ(key, cssClass) {
    const quadrant = q[key] || { label: '', ids: [] };
    return `
      <div class="matrix-cell ${cssClass}">
        <div class="q-name">${esc(quadrant.label)}</div>
        <div class="q-ids">${(quadrant.ids || []).join(' · ')}</div>
      </div>
    `;
  }

  const html = `
    <div class="matrix-wrap">
      <div class="matrix-grid">
        <div class="matrix-head" style="background:transparent;"></div>
        <div class="matrix-head">INTERÉS BAJO</div>
        <div class="matrix-head">INTERÉS ALTO</div>

        <div class="matrix-label">PODER ALTO</div>
        ${renderQ('high_power_low_interest', 'q-satisfy')}
        ${renderQ('high_power_high_interest', 'q-manage')}

        <div class="matrix-label">PODER BAJO</div>
        ${renderQ('low_power_low_interest', 'q-monitor')}
        ${renderQ('low_power_high_interest', 'q-inform')}
      </div>
    </div>
  `;
  return wrapBlock(block.label, html);
}

/** Firmas / aprobaciones. */
function renderSignatures(block) {
  const entries = (block.entries || []).map(e => `
    <div class="signature-item">
      <div class="sig-role">${esc(e.role)}</div>
      <div class="sig-name">${esc(e.name)}</div>
    </div>
  `).join('');
  return wrapBlock(block.label, `<div class="signatures-grid">${entries}</div>`);
}

/**
 * Dashboard integrado (para futuros dashboards Python/Plotly exportados como HTML).
 * Simplemente embebe el archivo indicado en un iframe responsivo.
 *
 * JSON esperado:
 *   { "type": "dashboard", "label": "...", "src": "dashboards/mi_dashboard.html", "height": "600px" }
 */
function renderDashboard(block) {
  const src    = esc(block.src || '');
  const height = esc(block.height || '520px');
  if (!src) {
    return wrapBlock(block.label, `
      <div class="error-state">⚠ No se especificó el campo "src" para el dashboard.</div>
    `);
  }
  return wrapBlock(block.label, `
    <iframe
      src="${src}"
      style="width:100%; height:${height}; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface);"
      loading="lazy"
      sandbox="allow-scripts allow-same-origin"
      title="${block.label || 'Dashboard'}">
    </iframe>
  `);
}

/* ─────────────────────────────────────────
   AGREGAR ESTA FUNCIÓN A renderer.js
   justo antes del objeto RENDERERS
 
   Bloque JSON esperado:
   {
     "type": "table",
     "label": "Título de la tabla",
     "headers": ["Col A", "Col B", "Col C"],
     "rows": [
       ["valor 1", "valor 2", "valor 3"],
       ["valor 4", "valor 5", "valor 6"]
     ],
     "footer": ["", "TOTAL", "COP $X"]   ← opcional
   }
─────────────────────────────────────────── */
 
/** Tabla de datos con encabezados, filas y fila de totales opcional. */
function renderTable(block) {
  const headers = block.headers || [];
  const rows    = block.rows    || [];
  const footer  = block.footer  || null;
 
  /* ── Encabezados ── */
  const thead = headers
    .map(h => `<th class="tbl-th">${esc(h)}</th>`)
    .join('');
 
  /* ── Filas de datos ── */
  const tbody = rows.map((row, i) => {
    const cells = row
      .map(cell => `<td class="tbl-td">${esc(cell)}</td>`)
      .join('');
    return `<tr class="tbl-tr ${i % 2 === 1 ? 'tbl-tr-alt' : ''}">${cells}</tr>`;
  }).join('');
 
  /* ── Fila de totales (footer) ── */
  const tfoot = footer
    ? `<tfoot><tr>${footer.map(cell => `<td class="tbl-footer">${esc(cell)}</td>`).join('')}</tr></tfoot>`
    : '';
 
  const html = `
    <div class="tbl-scroll">
      <table class="tbl">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
        ${tfoot}
      </table>
    </div>
  `;
 
  return wrapBlock(block.label, html);
}
 
/* ─────────────────────────────────────────
   TAMBIÉN AGREGAR EN EL OBJETO RENDERERS:
 
   const RENDERERS = {
     // ... los que ya tienes ...
     'table': renderTable,   ← agregar esta línea
   };
─────────────────────────────────────────── */



/* ─────────────────────────────────────────
   AGREGAR ESTA FUNCIÓN A renderer.js
   justo antes del objeto RENDERERS
─────────────────────────────────────────

   Bloque JSON esperado:
   {
     "type": "gantt",
     "label": "Etapa 1 — Planeación (Semanas 1–8)",
     "weeks_total": 8,
     "week_offset": 0,
     "activities": [
       {
         "id": "A1",
         "name": "Identificar fuentes de información",
         "color": "blue",
         "weeks": [1, 2]
       }
     ]
   }

   Colores disponibles en "color":
     "blue"   → azul claro  (actividades ML / datos)
     "green"  → verde claro (actividades de desarrollo web)
     "salmon" → salmón      (documentación)
─────────────────────────────────────────── */

/** Diagrama de Gantt por semanas. */
function renderGantt(block) {
  const weeks  = block.weeks_total || 8;
  const offset = block.week_offset || 0;
  const acts   = block.activities  || [];

  /* Mapa de color → clase CSS */
  const COLOR_CLASS = {
    blue:   'gantt-blue',
    green:  'gantt-green',
    salmon: 'gantt-salmon',
  };

  /* ── Encabezado de columnas ── */
  let headerCells = '<th class="gantt-th gantt-name-col"></th>';
  for (let w = 1; w <= weeks; w++) {
    headerCells += `<th class="gantt-th">S${w + offset}</th>`;
  }

  /* ── Filas de actividades ── */
  let rows = '';
  acts.forEach(act => {
    const weekSet = new Set(act.weeks || []);
    const colorCls = COLOR_CLASS[act.color] || 'gantt-blue';

    let cells = `<td class="gantt-name-col">
      <span class="gantt-act-id">${esc(act.id)}</span>
      ${esc(act.name)}
    </td>`;

    for (let w = 1; w <= weeks; w++) {
      const absW = w + offset;
      if (weekSet.has(absW)) {
        cells += `<td><div class="gantt-cell ${colorCls}"></div></td>`;
      } else {
        cells += `<td></td>`;
      }
    }

    rows += `<tr>${cells}</tr>`;
  });

  /* ── HTML completo ── */
  const html = `
    <div class="gantt-legend">
      <span class="gantt-legend-item"><span class="gantt-dot gantt-blue"></span>ML / Datos</span>
      <span class="gantt-legend-item"><span class="gantt-dot gantt-green"></span>Desarrollo Web</span>
      <span class="gantt-legend-item"><span class="gantt-dot gantt-salmon"></span>Documentación</span>
    </div>
    <div class="gantt-scroll">
      <table class="gantt-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  return wrapBlock(block.label, html);
}



/* ─────────────────────────────────────────
   REGISTRO CENTRAL DE RENDERERS
   Para añadir un nuevo tipo:
     1. Escribe la función renderMiTipo(block)
     2. Agrégala aquí con la clave del tipo
───────────────────────────────────────── */
const RENDERERS = {
  'highlight':          renderHighlight,
  'paragraph':          renderParagraph,
  'numbered-list':      renderNumberedList,
  'bullet-list':        renderBulletList,
  'two-col':            renderTwoCol,
  'deliverables':       renderDeliverables,
  'timeline':           renderTimeline,
  'cards-grid':         renderCardsGrid,
  'kpi-grid':           renderKpiGrid,
  'differentiators':    renderDifferentiators,
  'stakeholders':       renderStakeholders,
  'stakeholder-matrix': renderStakeholderMatrix,
  'signatures':         renderSignatures,
  'dashboard':          renderDashboard,
  'gantt':              renderGantt,
  'table':              renderTable,
};

/**
 * Renderiza un bloque individual.
 * @param {Object} block - Objeto del array "blocks" del JSON de sección.
 * @returns {string} HTML resultante.
 */
function renderBlock(block) {
  const renderFn = RENDERERS[block.type];
  if (!renderFn) {
    return `<div class="error-state">Tipo de bloque desconocido: <code>${esc(block.type)}</code></div>`;
  }
  return renderFn(block);
}

/**
 * Genera el HTML completo de una sección a partir de sus datos JSON.
 * @param {Object} sectionData - Objeto parseado del archivo JSON de sección.
 * @returns {string} HTML completo de la sección.
 */
function renderSection(sectionData) {
  const meta   = sectionData.meta   || {};
  const blocks = sectionData.blocks || [];
  const autores = Array.isArray(meta.autores) ? meta.autores.join(' · ') : (meta.autores || '');

  const header = `
    <div class="page-header">
      <div class="page-eyebrow">${esc(meta.sprint || '')}</div>
      <h1 class="page-title">${esc(meta.title || '')}</h1>
      <div class="page-meta">
        ${meta.fecha   ? `<span>Fecha: ${esc(meta.fecha)}</span>` : ''}
        ${meta.version ? `<span>v${esc(meta.version)}</span>` : ''}
        ${autores      ? `<span>${esc(autores)}</span>` : ''}
      </div>
    </div>
  `;

  const body = blocks.map(renderBlock).join('');
  return `<div class="section-content">${header}${body}</div>`;
}
