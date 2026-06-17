'use strict';

/* ==========================================
   ESTADO GLOBAL
========================================== */
let TECH_CATALOG = [];
let FORM_FIELDS = [];
let stackItems = [];   // sistemas agregados (canonical_json[])

// referencias a las instancias de Tom Select
let tsCat, tsVendor, tsProduct;

/* ==========================================
   INIT
========================================== */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const catalogData = await fetchJSON('/data/tech-catalog.json');
    const formData = await fetchJSON('/data/canonical-form-config.json');

    TECH_CATALOG = catalogData.catalog || [];
    FORM_FIELDS = formData.fields || [];

    initSelects();
    loadCategories();
    renderExtraFields();

    document.getElementById('catalog-loader').style.display = 'none';
    document.getElementById('catalog-form').style.display = 'block';
    document.getElementById('cr-status-text').textContent = 'DATOS CARGADOS';
  } catch (error) {
    console.error(error);
    document.getElementById('cr-status-text').textContent = 'ERROR DE CARGA';
  }
}

/* ==========================================
   INICIALIZAR TOM SELECT (buscable)
========================================== */
function initSelects() {
  tsCat = new TomSelect('#sel-cat', {
    placeholder: 'Ecosistema...',
    allowEmptyOption: true,
    onChange: () => onFilterChange('cat')
  });

  tsVendor = new TomSelect('#sel-vendor', {
    placeholder: 'Vendedor...',
    allowEmptyOption: true,
    onChange: () => onFilterChange('vendor')
  });

  tsProduct = new TomSelect('#sel-product', {
    placeholder: 'Producto...',
    allowEmptyOption: true,
    onChange: () => onFilterChange('product')
  });
}

/* ==========================================
   CATÁLOGO — Filtrado cruzado (cat / vendor / product)
   Los 3 selects están siempre habilitados.
   Cada vez que uno cambia, se recalculan las opciones
   de los otros dos según los valores ya seleccionados.
   El usuario puede empezar por cualquiera de los tres.
========================================== */

// Construye lista de "filas planas": una por cada (cat, vendor, producto)
function buildFlatRows() {
  const rows = [];
  TECH_CATALOG.forEach(entry => {
    entry.products.forEach(product => {
      rows.push({ cat: entry.cat, vendor: entry.vendor, product });
    });
  });
  return rows;
}

let FLAT_ROWS = [];

// Carga inicial: llenar los 3 selects con todas las opciones posibles
function loadCategories() {
  FLAT_ROWS = buildFlatRows();

  const cats = [...new Set(FLAT_ROWS.map(r => r.cat))].sort();
  const vendors = [...new Set(FLAT_ROWS.map(r => r.vendor))].sort();
  const products = [...new Set(FLAT_ROWS.map(r => r.product))].sort();

  cats.forEach(c => tsCat.addOption({ value: c, text: c }));
  vendors.forEach(v => tsVendor.addOption({ value: v, text: v }));
  products.forEach(p => tsProduct.addOption({ value: p, text: p }));

  tsCat.refreshOptions(false);
  tsVendor.refreshOptions(false);
  tsProduct.refreshOptions(false);

  tsCat.enable();
  tsVendor.enable();
  tsProduct.enable();
}

// Se llama cuando cualquiera de los 3 selects cambia
function onFilterChange(changed) {
  const cat = tsCat.getValue();
  const vendor = tsVendor.getValue();
  const product = tsProduct.getValue();

  // Filtrar filas según lo seleccionado en los OTROS selects
  const filterFor = (target) => {
    return FLAT_ROWS.filter(r => {
      if (target !== 'cat' && cat && r.cat !== cat) return false;
      if (target !== 'vendor' && vendor && r.vendor !== vendor) return false;
      if (target !== 'product' && product && r.product !== product) return false;
      return true;
    });
  };

  // Recalcular opciones de cat (si no fue el que cambió, o aunque lo sea, según los otros dos)
  updateSelectOptions(tsCat, [...new Set(filterFor('cat').map(r => r.cat))].sort(), cat);
  updateSelectOptions(tsVendor, [...new Set(filterFor('vendor').map(r => r.vendor))].sort(), vendor);
  updateSelectOptions(tsProduct, [...new Set(filterFor('product').map(r => r.product))].sort(), product);

  validateAddButton();
}

// Reemplaza las opciones de un Tom Select, conservando el valor actual si sigue siendo válido
function updateSelectOptions(ts, values, currentValue) {
  const stillValid = currentValue && values.includes(currentValue);

  ts.clearOptions();
  values.forEach(v => ts.addOption({ value: v, text: v }));
  ts.refreshOptions(false);

  if (stillValid) {
    ts.setValue(currentValue, true); // true = silent, evita loop de onChange
  } else if (currentValue) {
    ts.clear(true);
  }
}

/* ==========================================
   CAMPOS EXTRA DEL JSON CANÓNICO (dinámicos)
========================================== */
function renderExtraFields() {
  const container = document.getElementById('extra-fields');
  let html = '';

  FORM_FIELDS.forEach(field => {
    html += `<div class="cr-field" data-field-id="${field.id}">`;
    html += `<label class="cr-label" for="f-${field.id}">${field.label}</label>`;

    switch (field.type) {
      case 'bool':
        html += `
          <div class="cr-select-wrap">
            <select id="f-${field.id}">
              <option value="">— Seleccionar —</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>`;
        break;

      case 'select':
        html += `<div class="cr-select-wrap"><select id="f-${field.id}">`;
        html += `<option value="">— Seleccionar —</option>`;
        (field.options || []).forEach(opt => {
          html += `<option value="${opt.value}">${opt.label}</option>`;
        });
        html += `</select></div>`;
        break;

      case 'number':
        html += `<input type="number" id="f-${field.id}"
                    min="${field.min ?? 0}" value="${field.default ?? 0}" />`;
        break;

      default:
        html += `<input type="text" id="f-${field.id}" />`;
    }

    if (field.help) {
      html += `<div class="cr-field-help">${field.help}</div>`;
    }

    html += `</div>`;
  });

  container.innerHTML = html;
}

/* ==========================================
   VALIDACIÓN DEL BOTÓN AGREGAR
========================================== */
function validateAddButton() {
  const cat = tsCat.getValue();
  const vendor = tsVendor.getValue();
  const product = tsProduct.getValue();

  document.getElementById('add-tech-btn').disabled = !(cat && vendor && product);
}

/* ==========================================
   AGREGAR AL STACK
========================================== */
function addToStack() {
  const cat = tsCat.getValue();
  const vendor = tsVendor.getValue();
  const product = tsProduct.getValue();

  if (!cat || !vendor || !product) {
    alert('Debes seleccionar Clasificación, Vendedor y Producto.');
    return;
  }

  // Construir canonical_json
  const canonical = {
    vendor: vendor,
    products: [product],
    category: cat   // informativo, no lo usa el modelo pero útil para mostrar
  };

  const missing = [];

  FORM_FIELDS.forEach(field => {
    const el = document.getElementById(`f-${field.id}`);
    if (!el) return;

    const raw = el.value;

    if (field.type === 'bool') {
      if (raw === '') { missing.push(field.label); return; }
      canonical[field.id] = raw === 'true';
    } else if (field.type === 'select') {
      if (raw === '') { missing.push(field.label); return; }
      canonical[field.id] = raw;
    } else if (field.type === 'number') {
      canonical[field.id] = Number(raw) || 0;
    } else {
      canonical[field.id] = raw;
    }
  });

  if (missing.length) {
    alert('Faltan campos por seleccionar:\n- ' + missing.join('\n- '));
    return;
  }

  stackItems.push(canonical);
  renderStackCards();
  resetFormFields();
}

function resetFormFields() {
  // Resetear selects de catálogo (Tom Select) y restaurar todas las opciones
  tsCat.clear(true);
  tsVendor.clear(true);
  tsProduct.clear(true);
  onFilterChange('reset');
  document.getElementById('add-tech-btn').disabled = true;

  // Resetear campos extra
  FORM_FIELDS.forEach(field => {
    const el = document.getElementById(`f-${field.id}`);
    if (el) el.value = field.default ?? '';
  });
}

/* ==========================================
   STACK — render / eliminar
========================================== */
function renderStackCards() {
  const container = document.getElementById('tech-cards');

  if (!stackItems.length) {
    container.innerHTML = '<div class="cr-no-techs">Ningún sistema añadido aún</div>';
    document.getElementById('run-btn').disabled = true;
    document.getElementById('tech-count-badge').textContent = 0;
    document.getElementById('fc-techs').textContent = 0;
    return;
  }

  container.innerHTML = stackItems.map((item, i) => `
    <div class="cr-tech-card">
      <strong>${item.products[0]}</strong>
      <div>${item.vendor}</div>
      <small>${item.category} · Criticidad: ${item.business_criticality}</small>
      <button type="button" onclick="removeStackItem(${i})"
        style="margin-top:4px;background:none;border:1px solid var(--red);
               color:var(--red);border-radius:2px;padding:2px 8px;
               font-size:0.6rem;cursor:pointer;width:100%">
        ✕ eliminar
      </button>
    </div>
  `).join('');

  document.getElementById('tech-count-badge').textContent = stackItems.length;
  document.getElementById('fc-techs').textContent = stackItems.length;
  document.getElementById('run-btn').disabled = false;
}

function removeStackItem(index) {
  stackItems.splice(index, 1);
  renderStackCards();
}

/* ==========================================
   NAVEGACIÓN POR PASOS
========================================== */
function showStep(step) {
  document.querySelectorAll('.cr-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${step}`)?.classList.add('active');
  document.querySelectorAll('.cr-nav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-step${step}`)?.classList.add('active');

  if (step === 3) generateJSON();
}

/* ==========================================
   JSON / PAYLOAD
========================================== */
function buildPayload() {
  // Quitamos 'category' (es solo informativo en UI, no lo espera el modelo)
  return stackItems.map(({ category, ...rest }) => rest);
}

function generateJSON() {
  const payload = buildPayload();
  const text = JSON.stringify(payload, null, 2);
  const outEl = document.getElementById('json-output');
  const dashEl = document.getElementById('json-preview-dash');
  const countEl = document.getElementById('json-records-count');
  if (outEl) outEl.textContent = text;
  if (dashEl) dashEl.textContent = text;
  if (countEl) countEl.textContent = `${payload.length} sistema(s) a evaluar`;
  return payload;
}

function copyJSON() {
  const json = document.getElementById('json-output').textContent;
  navigator.clipboard.writeText(json);
  alert('JSON copiado');
}

/* ==========================================
   RESET / NUEVO ANÁLISIS
========================================== */
function resetAnalysis() {
  stackItems = [];
  renderStackCards();
  resetFormFields();
  showStep(1);
}

/* ==========================================
   ANÁLISIS — llamada al backend
========================================== */


async function runAnalysis(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (stackItems.length === 0) {
    alert('Debes agregar al menos un sistema a evaluar.');
    return;
  }

  showLoading(true);

  try {
    const payload = buildPayload();

    const saveRes = await fetch('http://127.0.0.1:5000/guardar-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const saveData = await saveRes.json();
    console.log('✅ Guardado:', saveData);

    const analRes = await fetch('http://127.0.0.1:5000/analizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: saveData.id })
    });

    if (!analRes.ok) {
      const err = await analRes.text();
      console.error('❌ Error servidor:', err);
      alert('Error del servidor: ' + err);
      return;
    }

    const result = await analRes.json();
    console.log('🧠 Resultado ML:', result);

    window.mlResult = result;
    renderDashboard(result);   // ← era resultList, ahora result

  } catch (error) {
    console.error('❌ Error:', error);
    alert('Error: ' + error.message);
  } finally {
    showLoading(false);
  }
}

/* ==========================================
   LOADING — overlay mientras corre el modelo
========================================== */
function showLoading(visible) {
  let overlay = document.getElementById('ml-loading-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ml-loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.color = '#fff';
    overlay.style.fontFamily = 'inherit';
    overlay.innerHTML = `
      <div style="width:48px;height:48px;border:4px solid rgba(255,255,255,0.25);
                   border-top-color:#fff;border-radius:50%;
                   animation:ml-spin 0.8s linear infinite;margin-bottom:12px;"></div>
      <div id="ml-loading-text" style="font-size:0.9rem;letter-spacing:0.05em;">
        Ejecutando modelo, por favor espera...
      </div>
      <style>
        @keyframes ml-spin { to { transform: rotate(360deg); } }
      </style>
    `;
    document.body.appendChild(overlay);
  }

  overlay.style.display = visible ? 'flex' : 'none';
}

/* ==========================================
   DASHBOARD — reemplaza renderDashboard y
   fetchRecommendations en cyberrisk.js
   Orden: KPIs → barra → tabla detalle →
          recomendaciones → análisis detallado
          (barras + factores horizontal) → JSON
========================================== */

function renderDashboard(resultList) {

  const tierMap = {
    1: { label: 'BAJO', cls: 'green' },
    2: { label: 'MEDIO', cls: 'cyan' },
    3: { label: 'ALTO', cls: 'amber' },
    4: { label: 'CRÍTICO', cls: 'red' },
  };

  // Por cada item del backend, tomar su peor escenario
  const techResults = resultList.map(item => {
    const scenarios = item.top_scenarios || [];
    if (!scenarios.length) return null;

    const worst = scenarios.reduce((a, b) =>
      (b.prediction.tier > a.prediction.tier ||
        (b.prediction.tier === a.prediction.tier &&
          b.prediction.score > a.prediction.score)) ? b : a
    );

    // Nombre legible: producto original que el usuario seleccionó
    const displayName = (item.original_products && item.original_products[0])
      ? item.original_products[0]
      : item.product;

    // CWEs únicos de TODOS los escenarios del producto
    const allCwes = new Set();
    scenarios.forEach(s => (s.asset?.CWE || []).forEach(c => allCwes.add(c)));

    return {
      ...worst,
      _product: item.product,
      _displayName: displayName,
      _allScenarios: scenarios,
      _cweList: [...allCwes]
    };
  }).filter(Boolean);

  if (!techResults.length) {
    console.warn('Sin escenarios en la respuesta.');
    return;
  }

  // Peor tecnología global
  const worst = techResults.reduce((a, b) =>
    (b.prediction.tier > a.prediction.tier ||
      (b.prediction.tier === a.prediction.tier &&
        b.prediction.score > a.prediction.score)) ? b : a
  );

  const globalNivel = tierMap[worst.prediction.tier] || { label: 'DESCONOCIDO', cls: 'cyan' };
  const globalPct = Math.round(worst.prediction.score * 100);

  // ── Meta ──
  document.getElementById('dash-meta').textContent =
    `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · ` +
    `${techResults.length} tecnología(s) evaluada(s) · Exposición global: ${globalNivel.label}`;

  // ── KPIs ──
  const criticalTechs = techResults.filter(t => t.prediction.tier === 4).length;

  document.getElementById('kpi-critical').textContent =
    criticalTechs > 0 ? `⚠ ${criticalTechs}` : 'NO';

  // KPI 2: nivel dinámico del peor caso
  const kpiHigh = document.getElementById('kpi-high');
  kpiHigh.textContent = globalNivel.label;
  kpiHigh.className = `cr-kpi-val ${globalNivel.cls}`;

  document.getElementById('kpi-score').textContent = globalPct + '%';
  document.getElementById('kpi-techs').textContent = stackItems.length;

  // ── Barra de exposición ──
  document.getElementById('exp-score-val').textContent =
    `${globalPct} / 100 — ${globalNivel.label}`;
  const bar = document.getElementById('exp-bar');
  bar.style.width = globalPct + '%';
  bar.style.background =
    worst.prediction.tier === 4 ? 'var(--red)'
      : worst.prediction.tier === 3 ? 'var(--amber)'
        : worst.prediction.tier === 2 ? 'var(--cyan)' : 'var(--green)';

  // ── Tabla detalle: 1 fila por producto con nombre real ──
  const sortedTechs = [...techResults].sort(
    (a, b) => b.prediction.score - a.prediction.score
  );

  document.getElementById('risk-tbody').innerHTML =
    sortedTechs.map(t => {
      const tNivel = tierMap[t.prediction.tier] || { label: '—', cls: 'cyan' };
      const tPct = Math.round(t.prediction.score * 100);
      const vendor = t.asset?.Vendor?.join(', ') || '—';
      const cweTags = t._cweList.length
        ? t._cweList.map(c =>
          `<span class="cr-cwe-tag">${c}</span>`).join('')
        : '<span class="cr-cwe-tag cr-cwe-empty">—</span>';

      return `
        <tr>
          <td class="cr-td-name">${t._displayName}</td>
          <td><div class="cr-cwe-tags">${cweTags}</div></td>
          <td>${vendor}</td>
          <td><span class="cr-score-badge ${tNivel.cls}">${tPct}%</span></td>
          <td><span class="cr-nivel-badge ${tNivel.cls}">${tNivel.label}</span></td>
        </tr>`;
    }).join('');

  // ── Recomendaciones del peor tier ──
  fetchRecommendations(worst.prediction.tier).then(recs => {
    document.getElementById('cr-rec-list').innerHTML =
      recs.map(text => `
        <div class="cr-rec-item">
          <span class="cr-rec-icon">📌</span>
          <span>${text}</span>
        </div>`).join('');
  });

  // ── Gráfica: score por producto (barras horizontales) ──
  document.getElementById('chart-by-tech').innerHTML =
    sortedTechs.map(t => {
      const tPct = Math.round(t.prediction.score * 100);
      const tNivel = tierMap[t.prediction.tier] || { cls: 'cyan' };
      return `
        <div class="cr-hbar-row">
          <span class="cr-hbar-label">${t._displayName}</span>
          <div class="cr-hbar-track">
            <div class="cr-hbar-fill ${tNivel.cls}" style="width:${tPct}%"></div>
          </div>
          <span class="cr-hbar-pct">${tPct}%</span>
        </div>`;
    }).join('');

  // ── Factores: tabla horizontal (una fila por producto) ──
  const factorHeaders = [
    'Vector', 'Complejidad', 'Privilegios',
    'Confidencial.', 'Integridad', 'Disponibilidad'
  ];

  const factorRows = sortedTechs.map(t => {
    const { attack = {}, impact = {} } = t;
    const tNivel = tierMap[t.prediction.tier] || { label: '—', cls: 'cyan' };
    const vals = [
      attack.VectorAtaque?.[0] || '—',
      attack.Complejidad?.[0] || '—',
      attack.Privilegios?.[0] || '—',
      impact.ImpactoConfidencialidad?.[0] || '—',
      impact.ImpactoIntegridad?.[0] || '—',
      impact.ImpactoDisponibilidad?.[0] || '—',
    ];
    const cells = vals.map(v => `
      <td style="padding:0.6rem 0.8rem;border-bottom:1px solid rgba(255,255,255,0.04)">
        <span class="cr-hbar-val ${v === 'High' || v === 'Network' || v === 'None' ? 'red' : 'cyan'
      }" style="font-size:0.62rem">${v}</span>
      </td>`).join('');

    return `
      <tr>
        <td style="padding:0.6rem 0.8rem;border-bottom:1px solid rgba(255,255,255,0.04);
                   white-space:nowrap">
          <span class="cr-td-name" style="font-size:0.82rem">${t._displayName}</span>
          <span class="cr-nivel-badge ${tNivel.cls}"
                style="margin-left:6px;font-size:0.55rem">${tNivel.label}</span>
        </td>
        ${cells}
      </tr>`;
  }).join('');

  document.getElementById('chart-factors').innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:0.78rem">
        <thead>
          <tr>
            <th style="text-align:left;padding:0.55rem 0.8rem;
                       font-family:var(--font-mono);font-size:0.52rem;
                       color:var(--text-dim);letter-spacing:0.1em;
                       text-transform:uppercase;
                       border-bottom:1px solid var(--border);
                       background:var(--bg-2);white-space:nowrap">
              Producto
            </th>
            ${factorHeaders.map(h => `
              <th style="text-align:left;padding:0.55rem 0.8rem;
                         font-family:var(--font-mono);font-size:0.52rem;
                         color:var(--text-dim);letter-spacing:0.1em;
                         text-transform:uppercase;
                         border-bottom:1px solid var(--border);
                         background:var(--bg-2);white-space:nowrap">
                ${h}
              </th>`).join('')}
          </tr>
        </thead>
        <tbody style="background:var(--bg-2)">${factorRows}</tbody>
      </table>
    </div>`;

  // ── JSON preview — payload que envió el usuario (no la respuesta del modelo) ──
  const dashEl = document.getElementById('json-preview-dash');
  if (dashEl) dashEl.textContent = JSON.stringify(buildPayload(), null, 2);

  document.getElementById('cr-main').scrollTop = 0;
}

/* ──────────────────────────────────────────
   fetchRecommendations — carga recomendaciones
   según tier desde questions-config.json
────────────────────────────────────────── */
async function fetchRecommendations(tier) {
  const tierKeyMap = { 4: 'critical', 3: 'high', 2: 'medium', 1: 'low' };
  const key = tierKeyMap[tier] || 'medium';
  try {
    const cfg = await fetchJSON('/data/questions-config.json');
    return cfg.recommendations?.[key] || [];
  } catch {
    return [];
  }
}

// function renderDashboard(resultList) {

//   const tierMap = {
//     1: { label: 'BAJO', cls: 'green' },
//     2: { label: 'MEDIO', cls: 'cyan' },
//     3: { label: 'ALTO', cls: 'amber' },
//     4: { label: 'CRÍTICO', cls: 'red' },
//   };

//   // Por cada tecnología (producto evaluado), tomar solo su PEOR escenario.
//   // Esto evita inflar los KPIs cuando el backend devuelve top_scenarios (ej. 5 por producto).
//   const techResults = resultList.map(item => {
//     const scenarios = item.top_scenarios || [];
//     if (!scenarios.length) return null;

//     const worst = scenarios.reduce((a, b) =>
//       (b.prediction.tier > a.prediction.tier ||
//         (b.prediction.tier === a.prediction.tier && b.prediction.score > a.prediction.score))
//         ? b : a
//     );

//     return { ...worst, _product: item.product, _allScenarios: scenarios };
//   }).filter(Boolean);

//   if (!techResults.length) {
//     console.warn('Sin escenarios en la respuesta.');
//     return;
//   }

//   // Peor tecnología global (para recomendaciones, gráfica de factores, score global)
//   const worst = techResults.reduce((a, b) =>
//     (b.prediction.tier > a.prediction.tier ||
//       (b.prediction.tier === a.prediction.tier && b.prediction.score > a.prediction.score))
//       ? b : a
//   );

//   const nivel = tierMap[worst.prediction.tier] || { label: 'DESCONOCIDO', cls: 'cyan' };

//   // Score global = el del PEOR caso entre todas las tecnologías (no promedio).
//   // Si una tecnología es crítica, el indicador global debe reflejarlo, no diluirlo.
//   const pct = Math.round(worst.prediction.score * 100);
//   const globalTier = worst.prediction.tier;
//   const globalNivel = nivel;

//   // CWEs únicos a los que está expuesta cada tecnología (de TODOS sus escenarios, no solo el peor)
//   techResults.forEach(t => {
//     const allCwes = new Set();
//     (t._allScenarios || []).forEach(s => {
//       (s.asset?.CWE || []).forEach(c => allCwes.add(c));
//     });
//     t._cweList = [...allCwes];
//   });

//   // Meta
//   document.getElementById('dash-meta').textContent =
//     `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · ${techResults.length} tecnología(s) evaluada(s) · Exposición global: ${globalNivel.label}`;

//   // KPIs — uno por tecnología (su peor escenario)
//   const criticalTechs = techResults.filter(t => t.prediction.tier === 4).length;
//   const highTechs = techResults.filter(t => t.prediction.tier === 3).length;

//   document.getElementById('kpi-critical').textContent = criticalTechs > 0 ? `⚠ ${criticalTechs}` : 'NO';
//   document.getElementById('kpi-high').textContent = highTechs;
//   document.getElementById('kpi-score').textContent = pct + '%';
//   document.getElementById('kpi-techs').textContent = stackItems.length;

//   // Barra de exposición global (promedio)
//   document.getElementById('exp-score-val').textContent = `${pct} / 100 — ${globalNivel.label}`;
//   const bar = document.getElementById('exp-bar');
//   bar.style.width = pct + '%';
//   bar.style.background = globalTier === 4 ? 'var(--red)'
//     : globalTier === 3 ? 'var(--amber)'
//       : globalTier === 2 ? 'var(--cyan)' : 'var(--green)';

//   // Gráfica factores (de la tecnología con peor escenario)
//   const { attack = {}, impact = {} } = worst;
//   const factores = {
//     'Vector de Ataque': attack.VectorAtaque?.[0] || '—',
//     'Complejidad': attack.Complejidad?.[0] || '—',
//     'Privilegios': attack.Privilegios?.[0] || '—',
//     'Interacción': attack.InteraccionUsuario?.[0] || '—',
//     'Confidencialidad': impact.ImpactoConfidencialidad?.[0] || '—',
//     'Integridad': impact.ImpactoIntegridad?.[0] || '—',
//     'Disponibilidad': impact.ImpactoDisponibilidad?.[0] || '—',
//   };
//   document.getElementById('chart-factors').innerHTML =
//     Object.entries(factores).map(([k, v]) => `
//       <div class="cr-hbar-row">
//         <span class="cr-hbar-label">${k}</span>
//         <span class="cr-hbar-val ${v === 'High' || v === 'Network' ? 'red' : 'cyan'}">${v}</span>
//       </div>`).join('');

//   // Gráfica score por tecnología (1 barra por tecnología, ordenadas de mayor a menor)
//   const sortedTechs = [...techResults].sort((a, b) => b.prediction.score - a.prediction.score);

//   document.getElementById('chart-by-tech').innerHTML =
//     sortedTechs.map(t => {
//       const tPct = Math.round(t.prediction.score * 100);
//       const tNivel = tierMap[t.prediction.tier] || { cls: 'cyan' };
//       const label = t.asset?.Producto?.[0] || t._product || 'Sistema';
//       return `
//         <div class="cr-hbar-row">
//           <span class="cr-hbar-label">${label}</span>
//           <div class="cr-hbar-track">
//             <div class="cr-hbar-fill ${tNivel.cls}" style="width:${tPct}%"></div>
//           </div>
//           <span class="cr-hbar-pct">${tPct}%</span>
//         </div>`;
//     }).join('');

//   // Tabla — 1 fila por tecnología, mostrando TODOS los CWE a los que está expuesta
//   document.getElementById('risk-tbody').innerHTML =
//     sortedTechs.map(t => {
//       const tNivel = tierMap[t.prediction.tier] || { label: '—', cls: 'cyan' };
//       const tPct = Math.round(t.prediction.score * 100);
//       const producto = t.asset?.Producto?.join(', ') || t._product || '—';
//       const vendor = t.asset?.Vendor?.join(', ') || '—';
//       const cweTags = (t._cweList && t._cweList.length)
//         ? t._cweList.map(c => `<span class="cr-cwe-tag">${c}</span>`).join('')
//         : '<span class="cr-cwe-tag cr-cwe-empty">—</span>';
//       return `
//         <tr>
//           <td class="cr-td-name">${producto}</td>
//           <td><div class="cr-cwe-tags">${cweTags}</div></td>
//           <td>${vendor}</td>
//           <td><span class="cr-score-badge ${tNivel.cls}">${tPct}%</span></td>
//           <td><span class="cr-nivel-badge ${tNivel.cls}">${tNivel.label}</span></td>
//         </tr>`;
//     }).join('');

//   // Recomendaciones — basadas en el tier global (promedio)
//   fetchRecommendations(globalTier).then(recs => {
//     document.getElementById('cr-rec-list').innerHTML =
//       recs.map(text => `
//         <div class="cr-rec-item">
//           <span class="cr-rec-icon">📌</span>
//           <span>${text}</span>
//         </div>`).join('');
//   });

//   // JSON preview — respuesta completa del backend (con todos los escenarios)
//   const dashEl = document.getElementById('json-preview-dash');
//   if (dashEl) dashEl.textContent = JSON.stringify(resultList, null, 2);

//   document.getElementById('cr-main').scrollTop = 0;
// }
// /* Carga recomendaciones según tier desde questions-config (recommendations) */
// async function fetchRecommendations(tier) {
//   const tierKeyMap = { 4: 'critical', 3: 'high', 2: 'medium', 1: 'low' };
//   const key = tierKeyMap[tier] || 'medium';

//   try {
//     const cfg = await fetchJSON('/data/questions-config.json');
//     return cfg.recommendations?.[key] || [];
//   } catch {
//     return [];
//   }
// }

/* ==========================================
   EXPORTS GLOBALES
========================================== */
window.addToStack = addToStack;
window.removeStackItem = removeStackItem;
window.copyJSON = copyJSON;
window.runAnalysis = runAnalysis;
window.generateJSON = generateJSON;
window.buildPayload = buildPayload;
window.showStep = showStep;
window.resetAnalysis = resetAnalysis;
window.showLoading = showLoading;




















// 'use strict';

// /* ==========================================
//    ESTADO GLOBAL
// ========================================== */
// let TECH_CATALOG = [];
// let FORM_FIELDS = [];
// let stackItems = [];   // sistemas agregados (canonical_json[])

// // referencias a las instancias de Tom Select
// let tsCat, tsVendor, tsProduct;

// /* ==========================================
//    INIT
// ========================================== */
// document.addEventListener('DOMContentLoaded', init);

// async function init() {
//   try {
//     const catalogData = await fetchJSON('/data/tech-catalog.json');
//     const formData = await fetchJSON('/data/canonical-form-config.json');

//     TECH_CATALOG = catalogData.catalog || [];
//     FORM_FIELDS = formData.fields || [];

//     initSelects();
//     loadCategories();
//     renderExtraFields();

//     document.getElementById('catalog-loader').style.display = 'none';
//     document.getElementById('catalog-form').style.display = 'block';
//     document.getElementById('cr-status-text').textContent = 'DATOS CARGADOS';
//   } catch (error) {
//     console.error(error);
//     document.getElementById('cr-status-text').textContent = 'ERROR DE CARGA';
//   }
// }

// /* ==========================================
//    INICIALIZAR TOM SELECT (buscable)
// ========================================== */
// function initSelects() {
//   tsCat = new TomSelect('#sel-cat', {
//     placeholder: 'Ecosistema...',
//     allowEmptyOption: true,
//     onChange: () => onFilterChange('cat')
//   });

//   tsVendor = new TomSelect('#sel-vendor', {
//     placeholder: 'Vendedor...',
//     allowEmptyOption: true,
//     onChange: () => onFilterChange('vendor')
//   });

//   tsProduct = new TomSelect('#sel-product', {
//     placeholder: 'Producto...',
//     allowEmptyOption: true,
//     onChange: () => onFilterChange('product')
//   });
// }

// /* ==========================================
//    CATÁLOGO — Filtrado cruzado (cat / vendor / product)
//    Los 3 selects están siempre habilitados.
//    Cada vez que uno cambia, se recalculan las opciones
//    de los otros dos según los valores ya seleccionados.
//    El usuario puede empezar por cualquiera de los tres.
// ========================================== */

// // Construye lista de "filas planas": una por cada (cat, vendor, producto)
// function buildFlatRows() {
//   const rows = [];
//   TECH_CATALOG.forEach(entry => {
//     entry.products.forEach(product => {
//       rows.push({ cat: entry.cat, vendor: entry.vendor, product });
//     });
//   });
//   return rows;
// }

// let FLAT_ROWS = [];

// // Carga inicial: llenar los 3 selects con todas las opciones posibles
// function loadCategories() {
//   FLAT_ROWS = buildFlatRows();

//   const cats = [...new Set(FLAT_ROWS.map(r => r.cat))].sort();
//   const vendors = [...new Set(FLAT_ROWS.map(r => r.vendor))].sort();
//   const products = [...new Set(FLAT_ROWS.map(r => r.product))].sort();

//   cats.forEach(c => tsCat.addOption({ value: c, text: c }));
//   vendors.forEach(v => tsVendor.addOption({ value: v, text: v }));
//   products.forEach(p => tsProduct.addOption({ value: p, text: p }));

//   tsCat.refreshOptions(false);
//   tsVendor.refreshOptions(false);
//   tsProduct.refreshOptions(false);

//   tsCat.enable();
//   tsVendor.enable();
//   tsProduct.enable();
// }

// // Se llama cuando cualquiera de los 3 selects cambia
// function onFilterChange(changed) {
//   const cat = tsCat.getValue();
//   const vendor = tsVendor.getValue();
//   const product = tsProduct.getValue();

//   // Filtrar filas según lo seleccionado en los OTROS selects
//   const filterFor = (target) => {
//     return FLAT_ROWS.filter(r => {
//       if (target !== 'cat' && cat && r.cat !== cat) return false;
//       if (target !== 'vendor' && vendor && r.vendor !== vendor) return false;
//       if (target !== 'product' && product && r.product !== product) return false;
//       return true;
//     });
//   };

//   // Recalcular opciones de cat (si no fue el que cambió, o aunque lo sea, según los otros dos)
//   updateSelectOptions(tsCat, [...new Set(filterFor('cat').map(r => r.cat))].sort(), cat);
//   updateSelectOptions(tsVendor, [...new Set(filterFor('vendor').map(r => r.vendor))].sort(), vendor);
//   updateSelectOptions(tsProduct, [...new Set(filterFor('product').map(r => r.product))].sort(), product);

//   validateAddButton();
// }

// // Reemplaza las opciones de un Tom Select, conservando el valor actual si sigue siendo válido
// function updateSelectOptions(ts, values, currentValue) {
//   const stillValid = currentValue && values.includes(currentValue);

//   ts.clearOptions();
//   values.forEach(v => ts.addOption({ value: v, text: v }));
//   ts.refreshOptions(false);

//   if (stillValid) {
//     ts.setValue(currentValue, true); // true = silent, evita loop de onChange
//   } else if (currentValue) {
//     ts.clear(true);
//   }
// }

// /* ==========================================
//    CAMPOS EXTRA DEL JSON CANÓNICO (dinámicos)
// ========================================== */
// function renderExtraFields() {
//   const container = document.getElementById('extra-fields');
//   let html = '';

//   FORM_FIELDS.forEach(field => {
//     html += `<div class="cr-field" data-field-id="${field.id}">`;
//     html += `<label class="cr-label" for="f-${field.id}">${field.label}</label>`;

//     switch (field.type) {
//       case 'bool':
//         html += `
//           <div class="cr-select-wrap">
//             <select id="f-${field.id}">
//               <option value="">— Seleccionar —</option>
//               <option value="true">Sí</option>
//               <option value="false">No</option>
//             </select>
//           </div>`;
//         break;

//       case 'select':
//         html += `<div class="cr-select-wrap"><select id="f-${field.id}">`;
//         html += `<option value="">— Seleccionar —</option>`;
//         (field.options || []).forEach(opt => {
//           html += `<option value="${opt.value}">${opt.label}</option>`;
//         });
//         html += `</select></div>`;
//         break;

//       case 'number':
//         html += `<input type="number" id="f-${field.id}"
//                     min="${field.min ?? 0}" value="${field.default ?? 0}" />`;
//         break;

//       default:
//         html += `<input type="text" id="f-${field.id}" />`;
//     }

//     if (field.help) {
//       html += `<div class="cr-field-help">${field.help}</div>`;
//     }

//     html += `</div>`;
//   });

//   container.innerHTML = html;
// }

// /* ==========================================
//    VALIDACIÓN DEL BOTÓN AGREGAR
// ========================================== */
// function validateAddButton() {
//   const cat = tsCat.getValue();
//   const vendor = tsVendor.getValue();
//   const product = tsProduct.getValue();

//   document.getElementById('add-tech-btn').disabled = !(cat && vendor && product);
// }

// /* ==========================================
//    AGREGAR AL STACK
// ========================================== */
// function addToStack() {
//   const cat = tsCat.getValue();
//   const vendor = tsVendor.getValue();
//   const product = tsProduct.getValue();

//   if (!cat || !vendor || !product) {
//     alert('Debes seleccionar Clasificación, Vendedor y Producto.');
//     return;
//   }

//   // Construir canonical_json
//   const canonical = {
//     vendor: vendor,
//     products: [product],
//     category: cat   // informativo, no lo usa el modelo pero útil para mostrar
//   };

//   const missing = [];

//   FORM_FIELDS.forEach(field => {
//     const el = document.getElementById(`f-${field.id}`);
//     if (!el) return;

//     const raw = el.value;

//     if (field.type === 'bool') {
//       if (raw === '') { missing.push(field.label); return; }
//       canonical[field.id] = raw === 'true';
//     } else if (field.type === 'select') {
//       if (raw === '') { missing.push(field.label); return; }
//       canonical[field.id] = raw;
//     } else if (field.type === 'number') {
//       canonical[field.id] = Number(raw) || 0;
//     } else {
//       canonical[field.id] = raw;
//     }
//   });

//   if (missing.length) {
//     alert('Faltan campos por seleccionar:\n- ' + missing.join('\n- '));
//     return;
//   }

//   stackItems.push(canonical);
//   renderStackCards();
//   resetFormFields();
// }

// function resetFormFields() {
//   // Resetear selects de catálogo (Tom Select) y restaurar todas las opciones
//   tsCat.clear(true);
//   tsVendor.clear(true);
//   tsProduct.clear(true);
//   onFilterChange('reset');
//   document.getElementById('add-tech-btn').disabled = true;

//   // Resetear campos extra
//   FORM_FIELDS.forEach(field => {
//     const el = document.getElementById(`f-${field.id}`);
//     if (el) el.value = field.default ?? '';
//   });
// }

// /* ==========================================
//    STACK — render / eliminar
// ========================================== */
// function renderStackCards() {
//   const container = document.getElementById('tech-cards');

//   if (!stackItems.length) {
//     container.innerHTML = '<div class="cr-no-techs">Ningún sistema añadido aún</div>';
//     document.getElementById('run-btn').disabled = true;
//     document.getElementById('tech-count-badge').textContent = 0;
//     document.getElementById('fc-techs').textContent = 0;
//     return;
//   }

//   container.innerHTML = stackItems.map((item, i) => `
//     <div class="cr-tech-card">
//       <strong>${item.products[0]}</strong>
//       <div>${item.vendor}</div>
//       <small>${item.category} · Criticidad: ${item.business_criticality}</small>
//       <button type="button" onclick="removeStackItem(${i})"
//         style="margin-top:4px;background:none;border:1px solid var(--red);
//                color:var(--red);border-radius:2px;padding:2px 8px;
//                font-size:0.6rem;cursor:pointer;width:100%">
//         ✕ eliminar
//       </button>
//     </div>
//   `).join('');

//   document.getElementById('tech-count-badge').textContent = stackItems.length;
//   document.getElementById('fc-techs').textContent = stackItems.length;
//   document.getElementById('run-btn').disabled = false;
// }

// function removeStackItem(index) {
//   stackItems.splice(index, 1);
//   renderStackCards();
// }

// /* ==========================================
//    NAVEGACIÓN POR PASOS
// ========================================== */
// function showStep(step) {
//   document.querySelectorAll('.cr-panel').forEach(p => p.classList.remove('active'));
//   document.getElementById(`panel-${step}`)?.classList.add('active');
//   document.querySelectorAll('.cr-nav-btn').forEach(btn => btn.classList.remove('active'));
//   document.getElementById(`btn-step${step}`)?.classList.add('active');

//   if (step === 3) generateJSON();
// }

// /* ==========================================
//    JSON / PAYLOAD
// ========================================== */
// function buildPayload() {
//   // Quitamos 'category' (es solo informativo en UI, no lo espera el modelo)
//   return stackItems.map(({ category, ...rest }) => rest);
// }

// function generateJSON() {
//   const payload = buildPayload();
//   const text = JSON.stringify(payload, null, 2);
//   const outEl = document.getElementById('json-output');
//   const dashEl = document.getElementById('json-preview-dash');
//   const countEl = document.getElementById('json-records-count');
//   if (outEl) outEl.textContent = text;
//   if (dashEl) dashEl.textContent = text;
//   if (countEl) countEl.textContent = `${payload.length} sistema(s) a evaluar`;
//   return payload;
// }

// function copyJSON() {
//   const json = document.getElementById('json-output').textContent;
//   navigator.clipboard.writeText(json);
//   alert('JSON copiado');
// }

// /* ==========================================
//    RESET / NUEVO ANÁLISIS
// ========================================== */
// function resetAnalysis() {
//   stackItems = [];
//   renderStackCards();
//   resetFormFields();
//   showStep(1);
// }

// /* ==========================================
//    ANÁLISIS — llamada al backend
// ========================================== */


// async function runAnalysis(event) {
//   if (event) {
//     event.preventDefault();
//     event.stopPropagation();
//   }

//   if (stackItems.length === 0) {
//     alert('Debes agregar al menos un sistema a evaluar.');
//     return;
//   }

//   showLoading(true);

//   try {
//     const payload = buildPayload();

//     const saveRes = await fetch('http://127.0.0.1:5000/guardar-json', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });
//     const saveData = await saveRes.json();
//     console.log('✅ Guardado:', saveData);

//     const analRes = await fetch('http://127.0.0.1:5000/analizar', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ id: saveData.id })
//     });

//     if (!analRes.ok) {
//       const err = await analRes.text();
//       console.error('❌ Error servidor:', err);
//       alert('Error del servidor: ' + err);
//       return;
//     }

//     const result = await analRes.json();
//     console.log('🧠 Resultado ML:', result);

//     window.mlResult = result;
//     renderDashboard(result);   // ← era resultList, ahora result

//   } catch (error) {
//     console.error('❌ Error:', error);
//     alert('Error: ' + error.message);
//   } finally {
//     showLoading(false);
//   }
// }

// /* ==========================================
//    LOADING — overlay mientras corre el modelo
// ========================================== */
// function showLoading(visible) {
//   let overlay = document.getElementById('ml-loading-overlay');

//   if (!overlay) {
//     overlay = document.createElement('div');
//     overlay.id = 'ml-loading-overlay';
//     overlay.style.position = 'fixed';
//     overlay.style.inset = '0';
//     overlay.style.background = 'rgba(0,0,0,0.6)';
//     overlay.style.display = 'flex';
//     overlay.style.flexDirection = 'column';
//     overlay.style.alignItems = 'center';
//     overlay.style.justifyContent = 'center';
//     overlay.style.zIndex = '9999';
//     overlay.style.color = '#fff';
//     overlay.style.fontFamily = 'inherit';
//     overlay.innerHTML = `
//       <div style="width:48px;height:48px;border:4px solid rgba(255,255,255,0.25);
//                    border-top-color:#fff;border-radius:50%;
//                    animation:ml-spin 0.8s linear infinite;margin-bottom:12px;"></div>
//       <div id="ml-loading-text" style="font-size:0.9rem;letter-spacing:0.05em;">
//         Ejecutando modelo, por favor espera...
//       </div>
//       <style>
//         @keyframes ml-spin { to { transform: rotate(360deg); } }
//       </style>
//     `;
//     document.body.appendChild(overlay);
//   }

//   overlay.style.display = visible ? 'flex' : 'none';
// }

// /* ==========================================
//    DASHBOARD
// ========================================== */
// function renderDashboard(resultList) {

//   const tierMap = {
//     1: { label: 'BAJO', cls: 'green' },
//     2: { label: 'MEDIO', cls: 'cyan' },
//     3: { label: 'ALTO', cls: 'amber' },
//     4: { label: 'CRÍTICO', cls: 'red' },
//   };

//   // Por cada tecnología (producto evaluado), tomar solo su PEOR escenario.
//   // Esto evita inflar los KPIs cuando el backend devuelve top_scenarios (ej. 5 por producto).
//   const techResults = resultList.map(item => {
//     const scenarios = item.top_scenarios || [];
//     if (!scenarios.length) return null;

//     const worst = scenarios.reduce((a, b) =>
//       (b.prediction.tier > a.prediction.tier ||
//         (b.prediction.tier === a.prediction.tier && b.prediction.score > a.prediction.score))
//         ? b : a
//     );

//     return { ...worst, _product: item.product, _allScenarios: scenarios };
//   }).filter(Boolean);

//   if (!techResults.length) {
//     console.warn('Sin escenarios en la respuesta.');
//     return;
//   }

//   // Peor tecnología global (para recomendaciones y gráfica de factores)
//   const worst = techResults.reduce((a, b) =>
//     (b.prediction.tier > a.prediction.tier ||
//       (b.prediction.tier === a.prediction.tier && b.prediction.score > a.prediction.score))
//       ? b : a
//   );

//   const nivel = tierMap[worst.prediction.tier] || { label: 'DESCONOCIDO', cls: 'cyan' };

//   // Score global = promedio del peor escenario de cada tecnología
//   const avgScore = techResults.reduce((sum, t) => sum + t.prediction.score, 0) / techResults.length;
//   const pct = Math.round(avgScore * 100);

//   // Tier global representativo, basado en el score promedio
//   const globalTier = avgScore >= 0.75 ? 4 : avgScore >= 0.5 ? 3 : avgScore >= 0.25 ? 2 : 1;
//   const globalNivel = tierMap[globalTier];

//   // Meta
//   document.getElementById('dash-meta').textContent =
//     `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · ${techResults.length} tecnología(s) evaluada(s) · Exposición global: ${globalNivel.label}`;

//   // KPIs — uno por tecnología (su peor escenario)
//   const criticalTechs = techResults.filter(t => t.prediction.tier === 4).length;
//   const highTechs = techResults.filter(t => t.prediction.tier === 3).length;

//   document.getElementById('kpi-critical').textContent = criticalTechs > 0 ? `⚠ ${criticalTechs}` : 'NO';
//   document.getElementById('kpi-high').textContent = highTechs;
//   document.getElementById('kpi-score').textContent = pct + '%';
//   document.getElementById('kpi-techs').textContent = stackItems.length;

//   // Barra de exposición global (promedio)
//   document.getElementById('exp-score-val').textContent = `${pct} / 100 — ${globalNivel.label}`;
//   const bar = document.getElementById('exp-bar');
//   bar.style.width = pct + '%';
//   bar.style.background = globalTier === 4 ? 'var(--red)'
//     : globalTier === 3 ? 'var(--amber)'
//       : globalTier === 2 ? 'var(--cyan)' : 'var(--green)';

//   // Gráfica factores (de la tecnología con peor escenario)
//   const { attack = {}, impact = {} } = worst;
//   const factores = {
//     'Vector de Ataque': attack.VectorAtaque?.[0] || '—',
//     'Complejidad': attack.Complejidad?.[0] || '—',
//     'Privilegios': attack.Privilegios?.[0] || '—',
//     'Interacción': attack.InteraccionUsuario?.[0] || '—',
//     'Confidencialidad': impact.ImpactoConfidencialidad?.[0] || '—',
//     'Integridad': impact.ImpactoIntegridad?.[0] || '—',
//     'Disponibilidad': impact.ImpactoDisponibilidad?.[0] || '—',
//   };
//   document.getElementById('chart-factors').innerHTML =
//     Object.entries(factores).map(([k, v]) => `
//       <div class="cr-hbar-row">
//         <span class="cr-hbar-label">${k}</span>
//         <span class="cr-hbar-val ${v === 'High' || v === 'Network' ? 'red' : 'cyan'}">${v}</span>
//       </div>`).join('');

//   // Gráfica score por tecnología (1 barra por tecnología, ordenadas de mayor a menor)
//   const sortedTechs = [...techResults].sort((a, b) => b.prediction.score - a.prediction.score);

//   document.getElementById('chart-by-tech').innerHTML =
//     sortedTechs.map(t => {
//       const tPct = Math.round(t.prediction.score * 100);
//       const tNivel = tierMap[t.prediction.tier] || { cls: 'cyan' };
//       const label = t.asset?.Producto?.[0] || t._product || 'Sistema';
//       return `
//         <div class="cr-hbar-row">
//           <span class="cr-hbar-label">${label}</span>
//           <div class="cr-hbar-track">
//             <div class="cr-hbar-fill ${tNivel.cls}" style="width:${tPct}%"></div>
//           </div>
//           <span class="cr-hbar-pct">${tPct}%</span>
//         </div>`;
//     }).join('');

//   // Tabla — 1 fila por tecnología (su peor escenario)
//   document.getElementById('risk-tbody').innerHTML =
//     sortedTechs.map(t => {
//       const tNivel = tierMap[t.prediction.tier] || { label: '—', cls: 'cyan' };
//       const tPct = Math.round(t.prediction.score * 100);
//       const producto = t.asset?.Producto?.join(', ') || t._product || '—';
//       const vendor = t.asset?.Vendor?.join(', ') || '—';
//       const cwe = t.asset?.CWE?.join(', ') || '—';
//       return `
//         <tr>
//           <td>${producto}</td>
//           <td>${cwe}</td>
//           <td>${vendor}</td>
//           <td><span class="cr-score-badge ${tNivel.cls}">${tPct}%</span></td>
//           <td><span class="cr-nivel-badge ${tNivel.cls}">${tNivel.label}</span></td>
//         </tr>`;
//     }).join('');

//   // Recomendaciones — basadas en el tier global (promedio)
//   fetchRecommendations(globalTier).then(recs => {
//     document.getElementById('cr-rec-list').innerHTML =
//       recs.map(text => `
//         <div class="cr-rec-item">
//           <span class="cr-rec-icon">📌</span>
//           <span>${text}</span>
//         </div>`).join('');
//   });

//   // JSON preview — respuesta completa del backend (con todos los escenarios)
//   const dashEl = document.getElementById('json-preview-dash');
//   if (dashEl) dashEl.textContent = JSON.stringify(resultList, null, 2);

//   document.getElementById('cr-main').scrollTop = 0;
// }
// /* Carga recomendaciones según tier desde questions-config (recommendations) */
// async function fetchRecommendations(tier) {
//   const tierKeyMap = { 4: 'critical', 3: 'high', 2: 'medium', 1: 'low' };
//   const key = tierKeyMap[tier] || 'medium';

//   try {
//     const cfg = await fetchJSON('/data/questions-config.json');
//     return cfg.recommendations?.[key] || [];
//   } catch {
//     return [];
//   }
// }

// /* ==========================================
//    EXPORTS GLOBALES
// ========================================== */
// window.addToStack = addToStack;
// window.removeStackItem = removeStackItem;
// window.copyJSON = copyJSON;
// window.runAnalysis = runAnalysis;
// window.generateJSON = generateJSON;
// window.buildPayload = buildPayload;
// window.showStep = showStep;
// window.resetAnalysis = resetAnalysis;
// window.showLoading = showLoading;






















// 'use strict';

// /* ==========================================
//    ESTADO GLOBAL
// ========================================== */
// let TECH_CATALOG = [];
// let FORM_FIELDS = [];
// let stackItems = [];   // sistemas agregados (canonical_json[])

// // referencias a las instancias de Tom Select
// let tsCat, tsVendor, tsProduct;

// /* ==========================================
//    INIT
// ========================================== */
// document.addEventListener('DOMContentLoaded', init);

// async function init() {
//   try {
//     const catalogData = await fetchJSON('/data/tech-catalog.json');
//     const formData = await fetchJSON('/data/canonical-form-config.json');

//     TECH_CATALOG = catalogData.catalog || [];
//     FORM_FIELDS = formData.fields || [];

//     initSelects();
//     loadCategories();
//     renderExtraFields();

//     document.getElementById('catalog-loader').style.display = 'none';
//     document.getElementById('catalog-form').style.display = 'block';
//     document.getElementById('cr-status-text').textContent = 'DATOS CARGADOS';
//   } catch (error) {
//     console.error(error);
//     document.getElementById('cr-status-text').textContent = 'ERROR DE CARGA';
//   }
// }

// /* ==========================================
//    INICIALIZAR TOM SELECT (buscable)
// ========================================== */
// function initSelects() {
//   tsCat = new TomSelect('#sel-cat', {
//     placeholder: 'Ecosistema...',
//     allowEmptyOption: true,
//     onChange: () => onFilterChange('cat')
//   });

//   tsVendor = new TomSelect('#sel-vendor', {
//     placeholder: 'Vendedor...',
//     allowEmptyOption: true,
//     onChange: () => onFilterChange('vendor')
//   });

//   tsProduct = new TomSelect('#sel-product', {
//     placeholder: 'Producto...',
//     allowEmptyOption: true,
//     onChange: () => onFilterChange('product')
//   });
// }

// /* ==========================================
//    CATÁLOGO — Filtrado cruzado (cat / vendor / product)
//    Los 3 selects están siempre habilitados.
//    Cada vez que uno cambia, se recalculan las opciones
//    de los otros dos según los valores ya seleccionados.
//    El usuario puede empezar por cualquiera de los tres.
// ========================================== */

// // Construye lista de "filas planas": una por cada (cat, vendor, producto)
// function buildFlatRows() {
//   const rows = [];
//   TECH_CATALOG.forEach(entry => {
//     entry.products.forEach(product => {
//       rows.push({ cat: entry.cat, vendor: entry.vendor, product });
//     });
//   });
//   return rows;
// }

// let FLAT_ROWS = [];

// // Carga inicial: llenar los 3 selects con todas las opciones posibles
// function loadCategories() {
//   FLAT_ROWS = buildFlatRows();

//   const cats = [...new Set(FLAT_ROWS.map(r => r.cat))].sort();
//   const vendors = [...new Set(FLAT_ROWS.map(r => r.vendor))].sort();
//   const products = [...new Set(FLAT_ROWS.map(r => r.product))].sort();

//   cats.forEach(c => tsCat.addOption({ value: c, text: c }));
//   vendors.forEach(v => tsVendor.addOption({ value: v, text: v }));
//   products.forEach(p => tsProduct.addOption({ value: p, text: p }));

//   tsCat.refreshOptions(false);
//   tsVendor.refreshOptions(false);
//   tsProduct.refreshOptions(false);

//   tsCat.enable();
//   tsVendor.enable();
//   tsProduct.enable();
// }

// // Se llama cuando cualquiera de los 3 selects cambia
// function onFilterChange(changed) {
//   const cat = tsCat.getValue();
//   const vendor = tsVendor.getValue();
//   const product = tsProduct.getValue();

//   // Filtrar filas según lo seleccionado en los OTROS selects
//   const filterFor = (target) => {
//     return FLAT_ROWS.filter(r => {
//       if (target !== 'cat' && cat && r.cat !== cat) return false;
//       if (target !== 'vendor' && vendor && r.vendor !== vendor) return false;
//       if (target !== 'product' && product && r.product !== product) return false;
//       return true;
//     });
//   };

//   // Recalcular opciones de cat (si no fue el que cambió, o aunque lo sea, según los otros dos)
//   updateSelectOptions(tsCat, [...new Set(filterFor('cat').map(r => r.cat))].sort(), cat);
//   updateSelectOptions(tsVendor, [...new Set(filterFor('vendor').map(r => r.vendor))].sort(), vendor);
//   updateSelectOptions(tsProduct, [...new Set(filterFor('product').map(r => r.product))].sort(), product);

//   validateAddButton();
// }

// // Reemplaza las opciones de un Tom Select, conservando el valor actual si sigue siendo válido
// function updateSelectOptions(ts, values, currentValue) {
//   const stillValid = currentValue && values.includes(currentValue);

//   ts.clearOptions();
//   values.forEach(v => ts.addOption({ value: v, text: v }));
//   ts.refreshOptions(false);

//   if (stillValid) {
//     ts.setValue(currentValue, true); // true = silent, evita loop de onChange
//   } else if (currentValue) {
//     ts.clear(true);
//   }
// }

// /* ==========================================
//    CAMPOS EXTRA DEL JSON CANÓNICO (dinámicos)
// ========================================== */
// function renderExtraFields() {
//   const container = document.getElementById('extra-fields');
//   let html = '';

//   FORM_FIELDS.forEach(field => {
//     html += `<div class="cr-field" data-field-id="${field.id}">`;
//     html += `<label class="cr-label" for="f-${field.id}">${field.label}</label>`;

//     switch (field.type) {
//       case 'bool':
//         html += `
//           <div class="cr-select-wrap">
//             <select id="f-${field.id}">
//               <option value="">— Seleccionar —</option>
//               <option value="true">Sí</option>
//               <option value="false">No</option>
//             </select>
//           </div>`;
//         break;

//       case 'select':
//         html += `<div class="cr-select-wrap"><select id="f-${field.id}">`;
//         html += `<option value="">— Seleccionar —</option>`;
//         (field.options || []).forEach(opt => {
//           html += `<option value="${opt.value}">${opt.label}</option>`;
//         });
//         html += `</select></div>`;
//         break;

//       case 'number':
//         html += `<input type="number" id="f-${field.id}"
//                     min="${field.min ?? 0}" value="${field.default ?? 0}" />`;
//         break;

//       default:
//         html += `<input type="text" id="f-${field.id}" />`;
//     }

//     if (field.help) {
//       html += `<div class="cr-field-help">${field.help}</div>`;
//     }

//     html += `</div>`;
//   });

//   container.innerHTML = html;
// }

// /* ==========================================
//    VALIDACIÓN DEL BOTÓN AGREGAR
// ========================================== */
// function validateAddButton() {
//   const cat = tsCat.getValue();
//   const vendor = tsVendor.getValue();
//   const product = tsProduct.getValue();

//   document.getElementById('add-tech-btn').disabled = !(cat && vendor && product);
// }

// /* ==========================================
//    AGREGAR AL STACK
// ========================================== */
// function addToStack() {
//   const cat = tsCat.getValue();
//   const vendor = tsVendor.getValue();
//   const product = tsProduct.getValue();

//   if (!cat || !vendor || !product) {
//     alert('Debes seleccionar Clasificación, Vendedor y Producto.');
//     return;
//   }

//   // Construir canonical_json
//   const canonical = {
//     vendor: vendor,
//     products: [product],
//     category: cat   // informativo, no lo usa el modelo pero útil para mostrar
//   };

//   const missing = [];

//   FORM_FIELDS.forEach(field => {
//     const el = document.getElementById(`f-${field.id}`);
//     if (!el) return;

//     const raw = el.value;

//     if (field.type === 'bool') {
//       if (raw === '') { missing.push(field.label); return; }
//       canonical[field.id] = raw === 'true';
//     } else if (field.type === 'select') {
//       if (raw === '') { missing.push(field.label); return; }
//       canonical[field.id] = raw;
//     } else if (field.type === 'number') {
//       canonical[field.id] = Number(raw) || 0;
//     } else {
//       canonical[field.id] = raw;
//     }
//   });

//   if (missing.length) {
//     alert('Faltan campos por seleccionar:\n- ' + missing.join('\n- '));
//     return;
//   }

//   stackItems.push(canonical);
//   renderStackCards();
//   resetFormFields();
// }

// function resetFormFields() {
//   // Resetear selects de catálogo (Tom Select) y restaurar todas las opciones
//   tsCat.clear(true);
//   tsVendor.clear(true);
//   tsProduct.clear(true);
//   onFilterChange('reset');
//   document.getElementById('add-tech-btn').disabled = true;

//   // Resetear campos extra
//   FORM_FIELDS.forEach(field => {
//     const el = document.getElementById(`f-${field.id}`);
//     if (el) el.value = field.default ?? '';
//   });
// }

// /* ==========================================
//    STACK — render / eliminar
// ========================================== */
// function renderStackCards() {
//   const container = document.getElementById('tech-cards');

//   if (!stackItems.length) {
//     container.innerHTML = '<div class="cr-no-techs">Ningún sistema añadido aún</div>';
//     document.getElementById('run-btn').disabled = true;
//     document.getElementById('tech-count-badge').textContent = 0;
//     document.getElementById('fc-techs').textContent = 0;
//     return;
//   }

//   container.innerHTML = stackItems.map((item, i) => `
//     <div class="cr-tech-card">
//       <strong>${item.products[0]}</strong>
//       <div>${item.vendor}</div>
//       <small>${item.category} · Criticidad: ${item.business_criticality}</small>
//       <button type="button" onclick="removeStackItem(${i})"
//         style="margin-top:4px;background:none;border:1px solid var(--red);
//                color:var(--red);border-radius:2px;padding:2px 8px;
//                font-size:0.6rem;cursor:pointer;width:100%">
//         ✕ eliminar
//       </button>
//     </div>
//   `).join('');

//   document.getElementById('tech-count-badge').textContent = stackItems.length;
//   document.getElementById('fc-techs').textContent = stackItems.length;
//   document.getElementById('run-btn').disabled = false;
// }

// function removeStackItem(index) {
//   stackItems.splice(index, 1);
//   renderStackCards();
// }

// /* ==========================================
//    NAVEGACIÓN POR PASOS
// ========================================== */
// function showStep(step) {
//   document.querySelectorAll('.cr-panel').forEach(p => p.classList.remove('active'));
//   document.getElementById(`panel-${step}`)?.classList.add('active');
//   document.querySelectorAll('.cr-nav-btn').forEach(btn => btn.classList.remove('active'));
//   document.getElementById(`btn-step${step}`)?.classList.add('active');

//   if (step === 3) generateJSON();
// }

// /* ==========================================
//    JSON / PAYLOAD
// ========================================== */
// function buildPayload() {
//   // Quitamos 'category' (es solo informativo en UI, no lo espera el modelo)
//   return stackItems.map(({ category, ...rest }) => rest);
// }

// function generateJSON() {
//   const payload = buildPayload();
//   const text = JSON.stringify(payload, null, 2);
//   const outEl = document.getElementById('json-output');
//   const dashEl = document.getElementById('json-preview-dash');
//   const countEl = document.getElementById('json-records-count');
//   if (outEl) outEl.textContent = text;
//   if (dashEl) dashEl.textContent = text;
//   if (countEl) countEl.textContent = `${payload.length} sistema(s) a evaluar`;
//   return payload;
// }

// function copyJSON() {
//   const json = document.getElementById('json-output').textContent;
//   navigator.clipboard.writeText(json);
//   alert('JSON copiado');
// }

// /* ==========================================
//    RESET / NUEVO ANÁLISIS
// ========================================== */
// function resetAnalysis() {
//   stackItems = [];
//   renderStackCards();
//   resetFormFields();
//   showStep(1);
// }

// /* ==========================================
//    ANÁLISIS — llamada al backend
// ========================================== */


// async function runAnalysis(event) {
//   if (event) {
//     event.preventDefault();
//     event.stopPropagation();
//   }

//   if (stackItems.length === 0) {
//     alert('Debes agregar al menos un sistema a evaluar.');
//     return;
//   }

//   showLoading(true);

//   try {
//     const payload = buildPayload();

//     const saveRes = await fetch('http://127.0.0.1:5000/guardar-json', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });
//     const saveData = await saveRes.json();
//     console.log('✅ Guardado:', saveData);

//     const analRes = await fetch('http://127.0.0.1:5000/analizar', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ id: saveData.id })
//     });

//     if (!analRes.ok) {
//       const err = await analRes.text();
//       console.error('❌ Error servidor:', err);
//       alert('Error del servidor: ' + err);
//       return;
//     }

//     const result = await analRes.json();
//     console.log('🧠 Resultado ML:', result);

//     window.mlResult = result;
//     renderDashboard(result);   // ← era resultList, ahora result

//   } catch (error) {
//     console.error('❌ Error:', error);
//     alert('Error: ' + error.message);
//   } finally {
//     showLoading(false);
//   }
// }

// /* ==========================================
//    LOADING — overlay mientras corre el modelo
// ========================================== */
// function showLoading(visible) {
//   let overlay = document.getElementById('ml-loading-overlay');

//   if (!overlay) {
//     overlay = document.createElement('div');
//     overlay.id = 'ml-loading-overlay';
//     overlay.style.position = 'fixed';
//     overlay.style.inset = '0';
//     overlay.style.background = 'rgba(0,0,0,0.6)';
//     overlay.style.display = 'flex';
//     overlay.style.flexDirection = 'column';
//     overlay.style.alignItems = 'center';
//     overlay.style.justifyContent = 'center';
//     overlay.style.zIndex = '9999';
//     overlay.style.color = '#fff';
//     overlay.style.fontFamily = 'inherit';
//     overlay.innerHTML = `
//       <div style="width:48px;height:48px;border:4px solid rgba(255,255,255,0.25);
//                    border-top-color:#fff;border-radius:50%;
//                    animation:ml-spin 0.8s linear infinite;margin-bottom:12px;"></div>
//       <div id="ml-loading-text" style="font-size:0.9rem;letter-spacing:0.05em;">
//         Ejecutando modelo, por favor espera...
//       </div>
//       <style>
//         @keyframes ml-spin { to { transform: rotate(360deg); } }
//       </style>
//     `;
//     document.body.appendChild(overlay);
//   }

//   overlay.style.display = visible ? 'flex' : 'none';
// }

// /* ==========================================
//    DASHBOARD
// ========================================== */
// function renderDashboard(resultList) {

//   // Aplanar: cada escenario lleva su _product de origen
//   let scenarios = [];

//   resultList.forEach(item => {
//     (item.top_scenarios || []).forEach(s => {
//       scenarios.push({ ...s, _product: item.product });
//     });
//   });

//   if (!scenarios.length) {
//     console.warn('Sin escenarios en la respuesta.');
//     return;
//   }

//   // Escenario de mayor riesgo (peor caso global)
//   const worst = scenarios.reduce((a, b) =>
//     (b.prediction.tier > a.prediction.tier ||
//       (b.prediction.tier === a.prediction.tier && b.prediction.score > a.prediction.score))
//       ? b : a
//   );

//   const tierMap = {
//     1: { label: 'BAJO', cls: 'green' },
//     2: { label: 'MEDIO', cls: 'cyan' },
//     3: { label: 'ALTO', cls: 'amber' },
//     4: { label: 'CRÍTICO', cls: 'red' },
//   };

//   const nivel = tierMap[worst.prediction.tier] || { label: 'DESCONOCIDO', cls: 'cyan' };
//   const score = worst.prediction.score;
//   const pct = Math.round(score * 100);

//   // Meta
//   document.getElementById('dash-meta').textContent =
//     `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · Tier ${worst.prediction.tier} — ${nivel.label} · ${scenarios.length} escenario(s) evaluados`;

//   // KPIs
//   const criticalCount = scenarios.filter(s => s.asset?.Severidad?.includes('Critical')).length;
//   document.getElementById('kpi-critical').textContent = criticalCount > 0 ? `⚠ ${criticalCount}` : 'NO';
//   document.getElementById('kpi-high').textContent = scenarios.filter(s => s.prediction.tier >= 3).length;
//   document.getElementById('kpi-score').textContent = (score * 100).toFixed(0) + '%';
//   document.getElementById('kpi-techs').textContent = stackItems.length;

//   // Barra de exposición (peor escenario)
//   document.getElementById('exp-score-val').textContent = `${pct} / 100 — ${nivel.label}`;
//   const bar = document.getElementById('exp-bar');
//   bar.style.width = pct + '%';
//   bar.style.background = worst.prediction.tier === 4 ? 'var(--red)'
//     : worst.prediction.tier === 3 ? 'var(--amber)'
//       : worst.prediction.tier === 2 ? 'var(--cyan)' : 'var(--green)';

//   // Gráfica factores (del peor escenario)
//   const { attack = {}, impact = {} } = worst;
//   const factores = {
//     'Vector de Ataque': attack.VectorAtaque?.[0] || '—',
//     'Complejidad': attack.Complejidad?.[0] || '—',
//     'Privilegios': attack.Privilegios?.[0] || '—',
//     'Interacción': attack.InteraccionUsuario?.[0] || '—',
//     'Confidencialidad': impact.ImpactoConfidencialidad?.[0] || '—',
//     'Integridad': impact.ImpactoIntegridad?.[0] || '—',
//     'Disponibilidad': impact.ImpactoDisponibilidad?.[0] || '—',
//   };
//   document.getElementById('chart-factors').innerHTML =
//     Object.entries(factores).map(([k, v]) => `
//       <div class="cr-hbar-row">
//         <span class="cr-hbar-label">${k}</span>
//         <span class="cr-hbar-val ${v === 'High' || v === 'Network' ? 'red' : 'cyan'}">${v}</span>
//       </div>`).join('');

//   // Gráfica score por escenario (top 10)
//   document.getElementById('chart-by-tech').innerHTML =
//     scenarios.slice(0, 10).map(s => {
//       const sPct = Math.round(s.prediction.score * 100);
//       const sNivel = tierMap[s.prediction.tier] || { cls: 'cyan' };
//       const label = s.asset?.Producto?.[0] || s._product || 'Sistema';
//       return `
//         <div class="cr-hbar-row">
//           <span class="cr-hbar-label">${label}</span>
//           <div class="cr-hbar-track">
//             <div class="cr-hbar-fill ${sNivel.cls}" style="width:${sPct}%"></div>
//           </div>
//           <span class="cr-hbar-pct">${sPct}%</span>
//         </div>`;
//     }).join('');

//   // Tabla — todos los escenarios
//   document.getElementById('risk-tbody').innerHTML =
//     scenarios.map(s => {
//       const sNivel = tierMap[s.prediction.tier] || { label: '—', cls: 'cyan' };
//       const sPct = Math.round(s.prediction.score * 100);
//       const producto = s.asset?.Producto?.join(', ') || s._product || '—';
//       const vendor = s.asset?.Vendor?.join(', ') || '—';
//       const cwe = s.asset?.CWE?.join(', ') || '—';
//       return `
//         <tr>
//           <td>${producto}</td>
//           <td>${cwe}</td>
//           <td>${vendor}</td>
//           <td><span class="cr-score-badge ${sNivel.cls}">${sPct}%</span></td>
//           <td><span class="cr-nivel-badge ${sNivel.cls}">${sNivel.label}</span></td>
//         </tr>`;
//     }).join('');

//   // Recomendaciones — basadas en el peor tier
//   fetchRecommendations(worst.prediction.tier).then(recs => {
//     document.getElementById('cr-rec-list').innerHTML =
//       recs.map(text => `
//         <div class="cr-rec-item">
//           <span class="cr-rec-icon">📌</span>
//           <span>${text}</span>
//         </div>`).join('');
//   });

//   // JSON preview — respuesta completa del backend
//   const dashEl = document.getElementById('json-preview-dash');
//   if (dashEl) dashEl.textContent = JSON.stringify(resultList, null, 2);

//   document.getElementById('cr-main').scrollTop = 0;
// }

// /* Carga recomendaciones según tier desde questions-config (recommendations) */
// async function fetchRecommendations(tier) {
//   const tierKeyMap = { 4: 'critical', 3: 'high', 2: 'medium', 1: 'low' };
//   const key = tierKeyMap[tier] || 'medium';

//   try {
//     const cfg = await fetchJSON('/data/questions-config.json');
//     return cfg.recommendations?.[key] || [];
//   } catch {
//     return [];
//   }
// }

// /* ==========================================
//    EXPORTS GLOBALES
// ========================================== */
// window.addToStack = addToStack;
// window.removeStackItem = removeStackItem;
// window.copyJSON = copyJSON;
// window.runAnalysis = runAnalysis;
// window.generateJSON = generateJSON;
// window.buildPayload = buildPayload;
// window.showStep = showStep;
// window.resetAnalysis = resetAnalysis;
// window.showLoading = showLoading;























// 'use strict';

// /* ==========================================
//    ESTADO GLOBAL
// ========================================== */
// let TECH_CATALOG = [];
// let FORM_FIELDS = [];
// let stackItems = [];   // sistemas agregados (canonical_json[])

// // referencias a las instancias de Tom Select
// let tsCat, tsVendor, tsProduct;

// /* ==========================================
//    INIT
// ========================================== */
// document.addEventListener('DOMContentLoaded', init);

// async function init() {
//   try {
//     const catalogData = await fetchJSON('/data/tech-catalog.json');
//     const formData = await fetchJSON('/data/canonical-form-config.json');

//     TECH_CATALOG = catalogData.catalog || [];
//     FORM_FIELDS = formData.fields || [];

//     initSelects();
//     loadCategories();
//     renderExtraFields();

//     document.getElementById('catalog-loader').style.display = 'none';
//     document.getElementById('catalog-form').style.display = 'block';
//     document.getElementById('cr-status-text').textContent = 'DATOS CARGADOS';
//   } catch (error) {
//     console.error(error);
//     document.getElementById('cr-status-text').textContent = 'ERROR DE CARGA';
//   }
// }

// /* ==========================================
//    INICIALIZAR TOM SELECT (buscable)
// ========================================== */
// function initSelects() {
//   tsCat = new TomSelect('#sel-cat', {
//     placeholder: 'Seleccione clasificación...',
//     allowEmptyOption: true,
//     onChange: (value) => loadVendors(value)
//   });

//   tsVendor = new TomSelect('#sel-vendor', {
//     placeholder: '— Primero selecciona clasificación —',
//     allowEmptyOption: true,
//     onChange: (value) => loadProducts(tsCat.getValue(), value)
//   });
//   tsVendor.disable();

//   tsProduct = new TomSelect('#sel-product', {
//     placeholder: '— Primero selecciona vendedor —',
//     allowEmptyOption: true,
//     onChange: () => validateAddButton()
//   });
//   tsProduct.disable();
// }

// /* ==========================================
//    CATÁLOGO — Clasificación / Vendedor / Producto
// ========================================== */
// function loadCategories() {
//   const categories = [...new Set(TECH_CATALOG.map(x => x.cat))];
//   categories.forEach(cat => {
//     tsCat.addOption({ value: cat, text: cat });
//   });
//   tsCat.refreshOptions(false);
// }

// function loadVendors(cat) {
//   tsVendor.clear();
//   tsVendor.clearOptions();

//   if (!cat) {
//     tsVendor.disable();
//     resetProductSelect();
//     validateAddButton();
//     return;
//   }

//   const vendors = [...new Set(
//     TECH_CATALOG.filter(x => x.cat === cat).map(x => x.vendor)
//   )];

//   vendors.forEach(v => tsVendor.addOption({ value: v, text: v }));
//   tsVendor.refreshOptions(false);
//   tsVendor.enable();

//   resetProductSelect();
//   validateAddButton();
// }

// function loadProducts(cat, vendor) {
//   tsProduct.clear();
//   tsProduct.clearOptions();

//   if (!cat || !vendor) {
//     tsProduct.disable();
//     validateAddButton();
//     return;
//   }

//   const record = TECH_CATALOG.find(x => x.cat === cat && x.vendor === vendor);
//   if (!record) {
//     tsProduct.disable();
//     validateAddButton();
//     return;
//   }

//   record.products.forEach(product => {
//     tsProduct.addOption({ value: product, text: product });
//   });
//   tsProduct.refreshOptions(false);
//   tsProduct.enable();
//   validateAddButton();
// }

// function resetProductSelect() {
//   tsProduct.clear();
//   tsProduct.clearOptions();
//   tsProduct.disable();
// }

// /* ==========================================
//    CAMPOS EXTRA DEL JSON CANÓNICO (dinámicos)
// ========================================== */
// function renderExtraFields() {
//   const container = document.getElementById('extra-fields');
//   let html = '';

//   FORM_FIELDS.forEach(field => {
//     html += `<div class="cr-field" data-field-id="${field.id}">`;
//     html += `<label class="cr-label" for="f-${field.id}">${field.label}</label>`;

//     switch (field.type) {
//       case 'bool':
//         html += `
//           <div class="cr-select-wrap">
//             <select id="f-${field.id}">
//               <option value="">— Seleccionar —</option>
//               <option value="true">Sí</option>
//               <option value="false">No</option>
//             </select>
//           </div>`;
//         break;

//       case 'select':
//         html += `<div class="cr-select-wrap"><select id="f-${field.id}">`;
//         html += `<option value="">— Seleccionar —</option>`;
//         (field.options || []).forEach(opt => {
//           html += `<option value="${opt.value}">${opt.label}</option>`;
//         });
//         html += `</select></div>`;
//         break;

//       case 'number':
//         html += `<input type="number" id="f-${field.id}"
//                     min="${field.min ?? 0}" value="${field.default ?? 0}" />`;
//         break;

//       default:
//         html += `<input type="text" id="f-${field.id}" />`;
//     }

//     if (field.help) {
//       html += `<div class="cr-field-help">${field.help}</div>`;
//     }

//     html += `</div>`;
//   });

//   container.innerHTML = html;
// }

// /* ==========================================
//    VALIDACIÓN DEL BOTÓN AGREGAR
// ========================================== */
// function validateAddButton() {
//   const cat = tsCat.getValue();
//   const vendor = tsVendor.getValue();
//   const product = tsProduct.getValue();

//   document.getElementById('add-tech-btn').disabled = !(cat && vendor && product);
// }

// /* ==========================================
//    AGREGAR AL STACK
// ========================================== */
// function addToStack() {
//   const cat = tsCat.getValue();
//   const vendor = tsVendor.getValue();
//   const product = tsProduct.getValue();

//   if (!cat || !vendor || !product) {
//     alert('Debes seleccionar Clasificación, Vendedor y Producto.');
//     return;
//   }

//   // Construir canonical_json
//   const canonical = {
//     vendor: vendor,
//     products: [product],
//     category: cat   // informativo, no lo usa el modelo pero útil para mostrar
//   };

//   const missing = [];

//   FORM_FIELDS.forEach(field => {
//     const el = document.getElementById(`f-${field.id}`);
//     if (!el) return;

//     const raw = el.value;

//     if (field.type === 'bool') {
//       if (raw === '') { missing.push(field.label); return; }
//       canonical[field.id] = raw === 'true';
//     } else if (field.type === 'select') {
//       if (raw === '') { missing.push(field.label); return; }
//       canonical[field.id] = raw;
//     } else if (field.type === 'number') {
//       canonical[field.id] = Number(raw) || 0;
//     } else {
//       canonical[field.id] = raw;
//     }
//   });

//   if (missing.length) {
//     alert('Faltan campos por seleccionar:\n- ' + missing.join('\n- '));
//     return;
//   }

//   stackItems.push(canonical);
//   renderStackCards();
//   resetFormFields();
// }

// function resetFormFields() {
//   // Resetear selects de catálogo (Tom Select)
//   tsCat.clear();
//   tsVendor.clear();
//   tsVendor.clearOptions();
//   tsVendor.disable();
//   tsProduct.clear();
//   tsProduct.clearOptions();
//   tsProduct.disable();
//   document.getElementById('add-tech-btn').disabled = true;

//   // Resetear campos extra
//   FORM_FIELDS.forEach(field => {
//     const el = document.getElementById(`f-${field.id}`);
//     if (el) el.value = field.default ?? '';
//   });
// }

// /* ==========================================
//    STACK — render / eliminar
// ========================================== */
// function renderStackCards() {
//   const container = document.getElementById('tech-cards');

//   if (!stackItems.length) {
//     container.innerHTML = '<div class="cr-no-techs">Ningún sistema añadido aún</div>';
//     document.getElementById('run-btn').disabled = true;
//     document.getElementById('tech-count-badge').textContent = 0;
//     document.getElementById('fc-techs').textContent = 0;
//     return;
//   }

//   container.innerHTML = stackItems.map((item, i) => `
//     <div class="cr-tech-card">
//       <strong>${item.products[0]}</strong>
//       <div>${item.vendor}</div>
//       <small>${item.category} · Criticidad: ${item.business_criticality}</small>
//       <button type="button" onclick="removeStackItem(${i})"
//         style="margin-top:4px;background:none;border:1px solid var(--red);
//                color:var(--red);border-radius:2px;padding:2px 8px;
//                font-size:0.6rem;cursor:pointer;width:100%">
//         ✕ eliminar
//       </button>
//     </div>
//   `).join('');

//   document.getElementById('tech-count-badge').textContent = stackItems.length;
//   document.getElementById('fc-techs').textContent = stackItems.length;
//   document.getElementById('run-btn').disabled = false;
// }

// function removeStackItem(index) {
//   stackItems.splice(index, 1);
//   renderStackCards();
// }

// /* ==========================================
//    NAVEGACIÓN POR PASOS
// ========================================== */
// function showStep(step) {
//   document.querySelectorAll('.cr-panel').forEach(p => p.classList.remove('active'));
//   document.getElementById(`panel-${step}`)?.classList.add('active');
//   document.querySelectorAll('.cr-nav-btn').forEach(btn => btn.classList.remove('active'));
//   document.getElementById(`btn-step${step}`)?.classList.add('active');

//   if (step === 3) generateJSON();
// }

// /* ==========================================
//    JSON / PAYLOAD
// ========================================== */
// function buildPayload() {
//   // Quitamos 'category' (es solo informativo en UI, no lo espera el modelo)
//   return stackItems.map(({ category, ...rest }) => rest);
// }

// function generateJSON() {
//   const payload = buildPayload();
//   const text = JSON.stringify(payload, null, 2);
//   const outEl = document.getElementById('json-output');
//   const dashEl = document.getElementById('json-preview-dash');
//   const countEl = document.getElementById('json-records-count');
//   if (outEl) outEl.textContent = text;
//   if (dashEl) dashEl.textContent = text;
//   if (countEl) countEl.textContent = `${payload.length} sistema(s) a evaluar`;
//   return payload;
// }

// function copyJSON() {
//   const json = document.getElementById('json-output').textContent;
//   navigator.clipboard.writeText(json);
//   alert('JSON copiado');
// }

// /* ==========================================
//    RESET / NUEVO ANÁLISIS
// ========================================== */
// function resetAnalysis() {
//   stackItems = [];
//   renderStackCards();
//   resetFormFields();
//   showStep(1);
// }

// /* ==========================================
//    ANÁLISIS — llamada al backend
// ========================================== */


// async function runAnalysis(event) {
//   if (event) {
//     event.preventDefault();
//     event.stopPropagation();
//   }

//   if (stackItems.length === 0) {
//     alert('Debes agregar al menos un sistema a evaluar.');
//     return;
//   }

//   showLoading(true);

//   try {
//     const payload = buildPayload();

//     const saveRes = await fetch('http://127.0.0.1:5000/guardar-json', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });
//     const saveData = await saveRes.json();
//     console.log('✅ Guardado:', saveData);

//     const analRes = await fetch('http://127.0.0.1:5000/analizar', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ id: saveData.id })
//     });

//     if (!analRes.ok) {
//       const err = await analRes.text();
//       console.error('❌ Error servidor:', err);
//       alert('Error del servidor: ' + err);
//       return;
//     }

//     const result = await analRes.json();
//     console.log('🧠 Resultado ML:', result);

//     window.mlResult = result;
//     renderDashboard(result);   // ← era resultList, ahora result

//   } catch (error) {
//     console.error('❌ Error:', error);
//     alert('Error: ' + error.message);
//   } finally {
//     showLoading(false);
//   }
// }

// /* ==========================================
//    LOADING — overlay mientras corre el modelo
// ========================================== */
// function showLoading(visible) {
//   let overlay = document.getElementById('ml-loading-overlay');

//   if (!overlay) {
//     overlay = document.createElement('div');
//     overlay.id = 'ml-loading-overlay';
//     overlay.style.position = 'fixed';
//     overlay.style.inset = '0';
//     overlay.style.background = 'rgba(0,0,0,0.6)';
//     overlay.style.display = 'flex';
//     overlay.style.flexDirection = 'column';
//     overlay.style.alignItems = 'center';
//     overlay.style.justifyContent = 'center';
//     overlay.style.zIndex = '9999';
//     overlay.style.color = '#fff';
//     overlay.style.fontFamily = 'inherit';
//     overlay.innerHTML = `
//       <div style="width:48px;height:48px;border:4px solid rgba(255,255,255,0.25);
//                    border-top-color:#fff;border-radius:50%;
//                    animation:ml-spin 0.8s linear infinite;margin-bottom:12px;"></div>
//       <div id="ml-loading-text" style="font-size:0.9rem;letter-spacing:0.05em;">
//         Ejecutando modelo, por favor espera...
//       </div>
//       <style>
//         @keyframes ml-spin { to { transform: rotate(360deg); } }
//       </style>
//     `;
//     document.body.appendChild(overlay);
//   }

//   overlay.style.display = visible ? 'flex' : 'none';
// }

// /* ==========================================
//    DASHBOARD
// ========================================== */
// function renderDashboard(resultList) {

//   // Aplanar: cada escenario lleva su _product de origen
//   let scenarios = [];

//   resultList.forEach(item => {
//     (item.top_scenarios || []).forEach(s => {
//       scenarios.push({ ...s, _product: item.product });
//     });
//   });

//   if (!scenarios.length) {
//     console.warn('Sin escenarios en la respuesta.');
//     return;
//   }

//   // Escenario de mayor riesgo (peor caso global)
//   const worst = scenarios.reduce((a, b) =>
//     (b.prediction.tier > a.prediction.tier ||
//       (b.prediction.tier === a.prediction.tier && b.prediction.score > a.prediction.score))
//       ? b : a
//   );

//   const tierMap = {
//     1: { label: 'BAJO', cls: 'green' },
//     2: { label: 'MEDIO', cls: 'cyan' },
//     3: { label: 'ALTO', cls: 'amber' },
//     4: { label: 'CRÍTICO', cls: 'red' },
//   };

//   const nivel = tierMap[worst.prediction.tier] || { label: 'DESCONOCIDO', cls: 'cyan' };
//   const score = worst.prediction.score;
//   const pct = Math.round(score * 100);

//   // Meta
//   document.getElementById('dash-meta').textContent =
//     `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · Tier ${worst.prediction.tier} — ${nivel.label} · ${scenarios.length} escenario(s) evaluados`;

//   // KPIs
//   const criticalCount = scenarios.filter(s => s.asset?.Severidad?.includes('Critical')).length;
//   document.getElementById('kpi-critical').textContent = criticalCount > 0 ? `⚠ ${criticalCount}` : 'NO';
//   document.getElementById('kpi-high').textContent = scenarios.filter(s => s.prediction.tier >= 3).length;
//   document.getElementById('kpi-score').textContent = (score * 100).toFixed(0) + '%';
//   document.getElementById('kpi-techs').textContent = stackItems.length;

//   // Barra de exposición (peor escenario)
//   document.getElementById('exp-score-val').textContent = `${pct} / 100 — ${nivel.label}`;
//   const bar = document.getElementById('exp-bar');
//   bar.style.width = pct + '%';
//   bar.style.background = worst.prediction.tier === 4 ? 'var(--red)'
//     : worst.prediction.tier === 3 ? 'var(--amber)'
//       : worst.prediction.tier === 2 ? 'var(--cyan)' : 'var(--green)';

//   // Gráfica factores (del peor escenario)
//   const { attack = {}, impact = {} } = worst;
//   const factores = {
//     'Vector de Ataque': attack.VectorAtaque?.[0] || '—',
//     'Complejidad': attack.Complejidad?.[0] || '—',
//     'Privilegios': attack.Privilegios?.[0] || '—',
//     'Interacción': attack.InteraccionUsuario?.[0] || '—',
//     'Confidencialidad': impact.ImpactoConfidencialidad?.[0] || '—',
//     'Integridad': impact.ImpactoIntegridad?.[0] || '—',
//     'Disponibilidad': impact.ImpactoDisponibilidad?.[0] || '—',
//   };
//   document.getElementById('chart-factors').innerHTML =
//     Object.entries(factores).map(([k, v]) => `
//       <div class="cr-hbar-row">
//         <span class="cr-hbar-label">${k}</span>
//         <span class="cr-hbar-val ${v === 'High' || v === 'Network' ? 'red' : 'cyan'}">${v}</span>
//       </div>`).join('');

//   // Gráfica score por escenario (top 10)
//   document.getElementById('chart-by-tech').innerHTML =
//     scenarios.slice(0, 10).map(s => {
//       const sPct = Math.round(s.prediction.score * 100);
//       const sNivel = tierMap[s.prediction.tier] || { cls: 'cyan' };
//       const label = s.asset?.Producto?.[0] || s._product || 'Sistema';
//       return `
//         <div class="cr-hbar-row">
//           <span class="cr-hbar-label">${label}</span>
//           <div class="cr-hbar-track">
//             <div class="cr-hbar-fill ${sNivel.cls}" style="width:${sPct}%"></div>
//           </div>
//           <span class="cr-hbar-pct">${sPct}%</span>
//         </div>`;
//     }).join('');

//   // Tabla — todos los escenarios
//   document.getElementById('risk-tbody').innerHTML =
//     scenarios.map(s => {
//       const sNivel = tierMap[s.prediction.tier] || { label: '—', cls: 'cyan' };
//       const sPct = Math.round(s.prediction.score * 100);
//       const producto = s.asset?.Producto?.join(', ') || s._product || '—';
//       const vendor = s.asset?.Vendor?.join(', ') || '—';
//       const cwe = s.asset?.CWE?.join(', ') || '—';
//       return `
//         <tr>
//           <td>${producto}</td>
//           <td>${cwe}</td>
//           <td>${vendor}</td>
//           <td><span class="cr-score-badge ${sNivel.cls}">${sPct}%</span></td>
//           <td><span class="cr-nivel-badge ${sNivel.cls}">${sNivel.label}</span></td>
//         </tr>`;
//     }).join('');

//   // Recomendaciones — basadas en el peor tier
//   fetchRecommendations(worst.prediction.tier).then(recs => {
//     document.getElementById('cr-rec-list').innerHTML =
//       recs.map(text => `
//         <div class="cr-rec-item">
//           <span class="cr-rec-icon">📌</span>
//           <span>${text}</span>
//         </div>`).join('');
//   });

//   // JSON preview — respuesta completa del backend
//   const dashEl = document.getElementById('json-preview-dash');
//   if (dashEl) dashEl.textContent = JSON.stringify(resultList, null, 2);

//   document.getElementById('cr-main').scrollTop = 0;
// }

// /* Carga recomendaciones según tier desde questions-config (recommendations) */
// async function fetchRecommendations(tier) {
//   const tierKeyMap = { 4: 'critical', 3: 'high', 2: 'medium', 1: 'low' };
//   const key = tierKeyMap[tier] || 'medium';

//   try {
//     const cfg = await fetchJSON('/data/questions-config.json');
//     return cfg.recommendations?.[key] || [];
//   } catch {
//     return [];
//   }
// }

// /* ==========================================
//    EXPORTS GLOBALES
// ========================================== */
// window.addToStack = addToStack;
// window.removeStackItem = removeStackItem;
// window.copyJSON = copyJSON;
// window.runAnalysis = runAnalysis;
// window.generateJSON = generateJSON;
// window.buildPayload = buildPayload;
// window.showStep = showStep;
// window.resetAnalysis = resetAnalysis;
// window.showLoading = showLoading;
























// 'use strict';

// /* ==========================================
//    ESTADO GLOBAL
// ========================================== */
// let TECH_CATALOG = [];
// let FORM_FIELDS = [];
// let stackItems = [];   // sistemas agregados (canonical_json[])


// /* ==========================================
//    INIT
// ========================================== */
// document.addEventListener('DOMContentLoaded', init);

// async function init() {
//   try {
//     const catalogData = await fetchJSON('/data/tech-catalog.json');
//     const formData = await fetchJSON('/data/canonical-form-config.json');

//     TECH_CATALOG = catalogData.catalog || [];
//     FORM_FIELDS = formData.fields || [];

//     loadCategories();
//     renderExtraFields();

//     document.getElementById('catalog-loader').style.display = 'none';
//     document.getElementById('catalog-form').style.display = 'block';
//     document.getElementById('cr-status-text').textContent = 'DATOS CARGADOS';
//   } catch (error) {
//     console.error(error);
//     document.getElementById('cr-status-text').textContent = 'ERROR DE CARGA';
//   }
// }

// /* ==========================================
//    CATÁLOGO — Clasificación / Vendedor / Producto
// ========================================== */
// function loadCategories() {
//   const selCat = document.getElementById('sel-cat');
//   const categories = [...new Set(TECH_CATALOG.map(x => x.cat))];
//   categories.forEach(cat => {
//     selCat.innerHTML += `<option value="${cat}">${cat}</option>`;
//   });
// }

// document.addEventListener('change', (e) => {
//   if (e.target.id === 'sel-cat') loadVendors(e.target.value);
//   if (e.target.id === 'sel-vendor') loadProducts(document.getElementById('sel-cat').value, e.target.value);
//   if (e.target.id === 'sel-product') validateAddButton();
// });

// function loadVendors(cat) {
//   const selVendor = document.getElementById('sel-vendor');
//   selVendor.innerHTML = '<option value="">Seleccione</option>';
//   TECH_CATALOG.filter(x => x.cat === cat).map(x => x.vendor).forEach(v => {
//     selVendor.innerHTML += `<option value="${v}">${v}</option>`;
//   });
//   selVendor.disabled = false;

//   // resetear producto
//   const selProduct = document.getElementById('sel-product');
//   selProduct.innerHTML = '<option value="">— Primero selecciona vendedor —</option>';
//   selProduct.disabled = true;
//   validateAddButton();
// }

// function loadProducts(cat, vendor) {
//   const selProduct = document.getElementById('sel-product');
//   selProduct.innerHTML = '<option value="">Seleccione</option>';
//   const record = TECH_CATALOG.find(x => x.cat === cat && x.vendor === vendor);
//   if (!record) return;
//   record.products.forEach(product => {
//     selProduct.innerHTML += `<option value="${product}">${product}</option>`;
//   });
//   selProduct.disabled = false;
//   validateAddButton();
// }

// /* ==========================================
//    CAMPOS EXTRA DEL JSON CANÓNICO (dinámicos)
// ========================================== */
// function renderExtraFields() {
//   const container = document.getElementById('extra-fields');
//   let html = '';

//   FORM_FIELDS.forEach(field => {
//     html += `<div class="cr-field" data-field-id="${field.id}">`;
//     html += `<label class="cr-label" for="f-${field.id}">${field.label}</label>`;

//     switch (field.type) {
//       case 'bool':
//         html += `
//           <div class="cr-select-wrap">
//             <select id="f-${field.id}">
//               <option value="">— Seleccionar —</option>
//               <option value="true">Sí</option>
//               <option value="false">No</option>
//             </select>
//           </div>`;
//         break;

//       case 'select':
//         html += `<div class="cr-select-wrap"><select id="f-${field.id}">`;
//         html += `<option value="">— Seleccionar —</option>`;
//         (field.options || []).forEach(opt => {
//           html += `<option value="${opt.value}">${opt.label}</option>`;
//         });
//         html += `</select></div>`;
//         break;

//       case 'number':
//         html += `<input type="number" id="f-${field.id}"
//                     min="${field.min ?? 0}" value="${field.default ?? 0}" />`;
//         break;

//       default:
//         html += `<input type="text" id="f-${field.id}" />`;
//     }

//     if (field.help) {
//       html += `<div class="cr-field-help">${field.help}</div>`;
//     }

//     html += `</div>`;
//   });

//   container.innerHTML = html;
// }

// /* ==========================================
//    VALIDACIÓN DEL BOTÓN AGREGAR
// ========================================== */
// function validateAddButton() {
//   const cat = document.getElementById('sel-cat').value;
//   const vendor = document.getElementById('sel-vendor').value;
//   const product = document.getElementById('sel-product').value;

//   document.getElementById('add-tech-btn').disabled = !(cat && vendor && product);
// }

// /* ==========================================
//    AGREGAR AL STACK
// ========================================== */
// function addToStack() {
//   const cat = document.getElementById('sel-cat').value;
//   const vendor = document.getElementById('sel-vendor').value;
//   const product = document.getElementById('sel-product').value;

//   if (!cat || !vendor || !product) {
//     alert('Debes seleccionar Clasificación, Vendedor y Producto.');
//     return;
//   }

//   // Construir canonical_json
//   const canonical = {
//     vendor: vendor,
//     products: [product],
//     category: cat   // informativo, no lo usa el modelo pero útil para mostrar
//   };

//   const missing = [];

//   FORM_FIELDS.forEach(field => {
//     const el = document.getElementById(`f-${field.id}`);
//     if (!el) return;

//     const raw = el.value;

//     if (field.type === 'bool') {
//       if (raw === '') { missing.push(field.label); return; }
//       canonical[field.id] = raw === 'true';
//     } else if (field.type === 'select') {
//       if (raw === '') { missing.push(field.label); return; }
//       canonical[field.id] = raw;
//     } else if (field.type === 'number') {
//       canonical[field.id] = Number(raw) || 0;
//     } else {
//       canonical[field.id] = raw;
//     }
//   });

//   if (missing.length) {
//     alert('Faltan campos por seleccionar:\n- ' + missing.join('\n- '));
//     return;
//   }

//   stackItems.push(canonical);
//   renderStackCards();
//   resetFormFields();
// }

// function resetFormFields() {
//   // Resetear selects de catálogo
//   document.getElementById('sel-cat').value = '';
//   document.getElementById('sel-vendor').value = '';
//   document.getElementById('sel-product').value = '';
//   document.getElementById('sel-vendor').innerHTML = '<option value="">— Primero selecciona clasificación —</option>';
//   document.getElementById('sel-product').innerHTML = '<option value="">— Primero selecciona vendedor —</option>';
//   document.getElementById('sel-vendor').disabled = true;
//   document.getElementById('sel-product').disabled = true;
//   document.getElementById('add-tech-btn').disabled = true;

//   // Resetear campos extra
//   FORM_FIELDS.forEach(field => {
//     const el = document.getElementById(`f-${field.id}`);
//     if (el) el.value = field.default ?? '';
//   });
// }

// /* ==========================================
//    STACK — render / eliminar
// ========================================== */
// function renderStackCards() {
//   const container = document.getElementById('tech-cards');

//   if (!stackItems.length) {
//     container.innerHTML = '<div class="cr-no-techs">Ningún sistema añadido aún</div>';
//     document.getElementById('run-btn').disabled = true;
//     document.getElementById('tech-count-badge').textContent = 0;
//     document.getElementById('fc-techs').textContent = 0;
//     return;
//   }

//   container.innerHTML = stackItems.map((item, i) => `
//     <div class="cr-tech-card">
//       <strong>${item.products[0]}</strong>
//       <div>${item.vendor}</div>
//       <small>${item.category} · Criticidad: ${item.business_criticality}</small>
//       <button type="button" onclick="removeStackItem(${i})"
//         style="margin-top:4px;background:none;border:1px solid var(--red);
//                color:var(--red);border-radius:2px;padding:2px 8px;
//                font-size:0.6rem;cursor:pointer;width:100%">
//         ✕ eliminar
//       </button>
//     </div>
//   `).join('');

//   document.getElementById('tech-count-badge').textContent = stackItems.length;
//   document.getElementById('fc-techs').textContent = stackItems.length;
//   document.getElementById('run-btn').disabled = false;
// }

// function removeStackItem(index) {
//   stackItems.splice(index, 1);
//   renderStackCards();
// }

// /* ==========================================
//    NAVEGACIÓN POR PASOS
// ========================================== */
// function showStep(step) {
//   document.querySelectorAll('.cr-panel').forEach(p => p.classList.remove('active'));
//   document.getElementById(`panel-${step}`)?.classList.add('active');
//   document.querySelectorAll('.cr-nav-btn').forEach(btn => btn.classList.remove('active'));
//   document.getElementById(`btn-step${step}`)?.classList.add('active');

//   if (step === 3) generateJSON();
// }

// /* ==========================================
//    JSON / PAYLOAD
// ========================================== */
// function buildPayload() {
//   // Quitamos 'category' (es solo informativo en UI, no lo espera el modelo)
//   return stackItems.map(({ category, ...rest }) => rest);
// }

// function generateJSON() {
//   const payload = buildPayload();
//   const text = JSON.stringify(payload, null, 2);
//   const outEl = document.getElementById('json-output');
//   const dashEl = document.getElementById('json-preview-dash');
//   const countEl = document.getElementById('json-records-count');
//   if (outEl) outEl.textContent = text;
//   if (dashEl) dashEl.textContent = text;
//   if (countEl) countEl.textContent = `${payload.length} sistema(s) a evaluar`;
//   return payload;
// }

// function copyJSON() {
//   const json = document.getElementById('json-output').textContent;
//   navigator.clipboard.writeText(json);
//   alert('JSON copiado');
// }

// /* ==========================================
//    RESET / NUEVO ANÁLISIS
// ========================================== */
// function resetAnalysis() {
//   stackItems = [];
//   renderStackCards();
//   resetFormFields();
//   showStep(1);
// }

// /* ==========================================
//    ANÁLISIS — llamada al backend
// ========================================== */


// async function runAnalysis(event) {
//   if (event) {
//     event.preventDefault();
//     event.stopPropagation();
//   }

//   if (stackItems.length === 0) {
//     alert('Debes agregar al menos un sistema a evaluar.');
//     return;
//   }

//   try {
//     const payload = buildPayload();

//     const saveRes = await fetch('http://127.0.0.1:5000/guardar-json', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });
//     const saveData = await saveRes.json();
//     console.log('✅ Guardado:', saveData);

//     const analRes = await fetch('http://127.0.0.1:5000/analizar', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ id: saveData.id })
//     });

//     if (!analRes.ok) {
//       const err = await analRes.text();
//       console.error('❌ Error servidor:', err);
//       alert('Error del servidor: ' + err);
//       return;
//     }

//     const result = await analRes.json();
//     console.log('🧠 Resultado ML:', result);

//     window.mlResult = result;
//     renderDashboard(result);   // ← era resultList, ahora result

//   } catch (error) {
//     console.error('❌ Error:', error);
//     alert('Error: ' + error.message);
//   }
// }

// /* ==========================================
//    DASHBOARD
//    El backend devuelve una lista agrupada por producto:
//    [
//      { "product": "windows_server", "top_scenarios": [ {prediction, asset, attack, impact}, ... ] },
//      { "product": "active_directory", "top_scenarios": [ ... ] },
//      ...
//    ]
//    Aplanamos todos los escenarios de todos los productos
//    para los KPIs/tabla globales.
// ========================================== */
// function renderDashboard(resultList) {

//   // Aplanar: cada escenario lleva su _product de origen
//   let scenarios = [];

//   resultList.forEach(item => {
//     (item.top_scenarios || []).forEach(s => {
//       scenarios.push({ ...s, _product: item.product });
//     });
//   });

//   if (!scenarios.length) {
//     console.warn('Sin escenarios en la respuesta.');
//     return;
//   }

//   // Escenario de mayor riesgo (peor caso global)
//   const worst = scenarios.reduce((a, b) =>
//     (b.prediction.tier > a.prediction.tier ||
//       (b.prediction.tier === a.prediction.tier && b.prediction.score > a.prediction.score))
//       ? b : a
//   );

//   const tierMap = {
//     1: { label: 'BAJO', cls: 'green' },
//     2: { label: 'MEDIO', cls: 'cyan' },
//     3: { label: 'ALTO', cls: 'amber' },
//     4: { label: 'CRÍTICO', cls: 'red' },
//   };

//   const nivel = tierMap[worst.prediction.tier] || { label: 'DESCONOCIDO', cls: 'cyan' };
//   const score = worst.prediction.score;
//   const pct = Math.round(score * 100);

//   // Meta
//   document.getElementById('dash-meta').textContent =
//     `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · Tier ${worst.prediction.tier} — ${nivel.label} · ${scenarios.length} escenario(s) evaluados`;

//   // KPIs
//   const criticalCount = scenarios.filter(s => s.asset?.Severidad?.includes('Critical')).length;
//   document.getElementById('kpi-critical').textContent = criticalCount > 0 ? `⚠ ${criticalCount}` : 'NO';
//   document.getElementById('kpi-high').textContent = scenarios.filter(s => s.prediction.tier >= 3).length;
//   document.getElementById('kpi-score').textContent = (score * 100).toFixed(0) + '%';
//   document.getElementById('kpi-techs').textContent = stackItems.length;

//   // Barra de exposición (peor escenario)
//   document.getElementById('exp-score-val').textContent = `${pct} / 100 — ${nivel.label}`;
//   const bar = document.getElementById('exp-bar');
//   bar.style.width = pct + '%';
//   bar.style.background = worst.prediction.tier === 4 ? 'var(--red)'
//     : worst.prediction.tier === 3 ? 'var(--amber)'
//       : worst.prediction.tier === 2 ? 'var(--cyan)' : 'var(--green)';

//   // Gráfica factores (del peor escenario)
//   const { attack = {}, impact = {} } = worst;
//   const factores = {
//     'Vector de Ataque': attack.VectorAtaque?.[0] || '—',
//     'Complejidad': attack.Complejidad?.[0] || '—',
//     'Privilegios': attack.Privilegios?.[0] || '—',
//     'Interacción': attack.InteraccionUsuario?.[0] || '—',
//     'Confidencialidad': impact.ImpactoConfidencialidad?.[0] || '—',
//     'Integridad': impact.ImpactoIntegridad?.[0] || '—',
//     'Disponibilidad': impact.ImpactoDisponibilidad?.[0] || '—',
//   };
//   document.getElementById('chart-factors').innerHTML =
//     Object.entries(factores).map(([k, v]) => `
//       <div class="cr-hbar-row">
//         <span class="cr-hbar-label">${k}</span>
//         <span class="cr-hbar-val ${v === 'High' || v === 'Network' ? 'red' : 'cyan'}">${v}</span>
//       </div>`).join('');

//   // Gráfica score por escenario (top 10)
//   document.getElementById('chart-by-tech').innerHTML =
//     scenarios.slice(0, 10).map(s => {
//       const sPct = Math.round(s.prediction.score * 100);
//       const sNivel = tierMap[s.prediction.tier] || { cls: 'cyan' };
//       const label = s.asset?.Producto?.[0] || s._product || 'Sistema';
//       return `
//         <div class="cr-hbar-row">
//           <span class="cr-hbar-label">${label}</span>
//           <div class="cr-hbar-track">
//             <div class="cr-hbar-fill ${sNivel.cls}" style="width:${sPct}%"></div>
//           </div>
//           <span class="cr-hbar-pct">${sPct}%</span>
//         </div>`;
//     }).join('');

//   // Tabla — todos los escenarios
//   document.getElementById('risk-tbody').innerHTML =
//     scenarios.map(s => {
//       const sNivel = tierMap[s.prediction.tier] || { label: '—', cls: 'cyan' };
//       const sPct = Math.round(s.prediction.score * 100);
//       const producto = s.asset?.Producto?.join(', ') || s._product || '—';
//       const vendor = s.asset?.Vendor?.join(', ') || '—';
//       const cwe = s.asset?.CWE?.join(', ') || '—';
//       return `
//         <tr>
//           <td>${producto}</td>
//           <td>${cwe}</td>
//           <td>${vendor}</td>
//           <td><span class="cr-score-badge ${sNivel.cls}">${sPct}%</span></td>
//           <td><span class="cr-nivel-badge ${sNivel.cls}">${sNivel.label}</span></td>
//         </tr>`;
//     }).join('');

//   // Recomendaciones — basadas en el peor tier
//   fetchRecommendations(worst.prediction.tier).then(recs => {
//     document.getElementById('cr-rec-list').innerHTML =
//       recs.map(text => `
//         <div class="cr-rec-item">
//           <span class="cr-rec-icon">📌</span>
//           <span>${text}</span>
//         </div>`).join('');
//   });

//   // JSON preview — respuesta completa del backend
//   const dashEl = document.getElementById('json-preview-dash');
//   if (dashEl) dashEl.textContent = JSON.stringify(resultList, null, 2);

//   document.getElementById('cr-main').scrollTop = 0;
// }

// /* Carga recomendaciones según tier desde questions-config (recommendations) */
// async function fetchRecommendations(tier) {
//   const tierKeyMap = { 4: 'critical', 3: 'high', 2: 'medium', 1: 'low' };
//   const key = tierKeyMap[tier] || 'medium';

//   try {
//     const cfg = await fetchJSON('/data/questions-config.json');
//     return cfg.recommendations?.[key] || [];
//   } catch {
//     return [];
//   }
// }


// /* Carga recomendaciones según tier desde questions-config (recommendations) */
// async function fetchRecommendations(tier) {
//   const tierKeyMap = { 4: 'critical', 3: 'high', 2: 'medium', 1: 'low' };
//   const key = tierKeyMap[tier] || 'medium';

//   try {
//     const cfg = await fetchJSON('/data/questions-config.json');
//     return cfg.recommendations?.[key] || [];
//   } catch {
//     return [];
//   }
// }

// /* ==========================================
//    EXPORTS GLOBALES
// ========================================== */
// window.addToStack = addToStack;
// window.removeStackItem = removeStackItem;
// window.copyJSON = copyJSON;
// window.runAnalysis = runAnalysis;
// window.generateJSON = generateJSON;
// window.buildPayload = buildPayload;
// window.showStep = showStep;
// window.resetAnalysis = resetAnalysis;















































// /* ==========================================
//    DASHBOARD
//    El backend devuelve una LISTA de escenarios (uno o más
//    por cada producto evaluado). Tomamos el de mayor riesgo
//    para los KPIs globales y mostramos todos en la tabla.
// ========================================== */

// /* ==========================================
//    DASHBOARD
//    El backend SIEMPRE devuelve una lista, un resultado
//    por cada sistema del stack.
// ========================================== */
// function renderDashboard(resultList) {
//   const scenarios = resultList;

//   if (!scenarios.length) {
//     console.warn('Sin escenarios en la respuesta.');
//     return;
//   }

//   const worst = scenarios.reduce((a, b) =>
//     (b.prediction.tier > a.prediction.tier ||
//       (b.prediction.tier === a.prediction.tier && b.prediction.score > a.prediction.score))
//       ? b : a
//   );

//   const tierMap = {
//     1: { label: 'BAJO', cls: 'green' },
//     2: { label: 'MEDIO', cls: 'cyan' },
//     3: { label: 'ALTO', cls: 'amber' },
//     4: { label: 'CRÍTICO', cls: 'red' },
//   };

//   const nivel = tierMap[worst.prediction.tier] || { label: 'DESCONOCIDO', cls: 'cyan' };
//   const score = worst.prediction.score;
//   const pct = Math.round(score * 100);

//   document.getElementById('dash-meta').textContent =
//     `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · Tier ${worst.prediction.tier} — ${nivel.label} · ${scenarios.length} escenario(s) evaluados`;

//   const criticalCount = scenarios.filter(s => s.asset?.Severidad?.includes('Critical')).length;
//   document.getElementById('kpi-critical').textContent = criticalCount > 0 ? `⚠ ${criticalCount}` : 'NO';
//   document.getElementById('kpi-high').textContent = scenarios.filter(s => s.prediction.tier >= 3).length;
//   document.getElementById('kpi-score').textContent = (score * 100).toFixed(0) + '%';
//   document.getElementById('kpi-techs').textContent = stackItems.length;

//   document.getElementById('exp-score-val').textContent = `${pct} / 100 — ${nivel.label}`;
//   const bar = document.getElementById('exp-bar');
//   bar.style.width = pct + '%';
//   bar.style.background = worst.prediction.tier === 4 ? 'var(--red)'
//     : worst.prediction.tier === 3 ? 'var(--amber)'
//       : worst.prediction.tier === 2 ? 'var(--cyan)' : 'var(--green)';

//   const { attack = {}, impact = {} } = worst;
//   const factores = {
//     'Vector de Ataque': attack.VectorAtaque?.[0] || '—',
//     'Complejidad': attack.Complejidad?.[0] || '—',
//     'Privilegios': attack.Privilegios?.[0] || '—',
//     'Interacción': attack.InteraccionUsuario?.[0] || '—',
//     'Confidencialidad': impact.ImpactoConfidencialidad?.[0] || '—',
//     'Integridad': impact.ImpactoIntegridad?.[0] || '—',
//     'Disponibilidad': impact.ImpactoDisponibilidad?.[0] || '—',
//   };
//   document.getElementById('chart-factors').innerHTML =
//     Object.entries(factores).map(([k, v]) => `
//       <div class="cr-hbar-row">
//         <span class="cr-hbar-label">${k}</span>
//         <span class="cr-hbar-val ${v === 'High' || v === 'Network' ? 'red' : 'cyan'}">${v}</span>
//       </div>`).join('');

//   document.getElementById('chart-by-tech').innerHTML =
//     scenarios.slice(0, 10).map(s => {
//       const sPct = Math.round(s.prediction.score * 100);
//       const sNivel = tierMap[s.prediction.tier] || { cls: 'cyan' };
//       const label = s.asset?.Producto?.[0] || 'Sistema';
//       return `
//         <div class="cr-hbar-row">
//           <span class="cr-hbar-label">${label}</span>
//           <div class="cr-hbar-track">
//             <div class="cr-hbar-fill ${sNivel.cls}" style="width:${sPct}%"></div>
//           </div>
//           <span class="cr-hbar-pct">${sPct}%</span>
//         </div>`;
//     }).join('');

//   document.getElementById('risk-tbody').innerHTML =
//     scenarios.map(s => {
//       const sNivel = tierMap[s.prediction.tier] || { label: '—', cls: 'cyan' };
//       const sPct = Math.round(s.prediction.score * 100);
//       const producto = s.asset?.Producto?.join(', ') || '—';
//       const vendor = s.asset?.Vendor?.join(', ') || '—';
//       const cwe = s.asset?.CWE?.join(', ') || '—';
//       return `
//         <tr>
//           <td>${producto}</td>
//           <td>${cwe}</td>
//           <td>${vendor}</td>
//           <td><span class="cr-score-badge ${sNivel.cls}">${sPct}%</span></td>
//           <td><span class="cr-nivel-badge ${sNivel.cls}">${sNivel.label}</span></td>
//         </tr>`;
//     }).join('');

//   fetchRecommendations(worst.prediction.tier).then(recs => {
//     document.getElementById('cr-rec-list').innerHTML =
//       recs.map(text => `
//         <div class="cr-rec-item">
//           <span class="cr-rec-icon">📌</span>
//           <span>${text}</span>
//         </div>`).join('');
//   });

//   const dashEl = document.getElementById('json-preview-dash');
//   if (dashEl) dashEl.textContent = JSON.stringify(resultList, null, 2);

//   document.getElementById('cr-main').scrollTop = 0;
// }



// function renderDashboard(resultList) {
//   const scenarios = resultList;

//   if (!scenarios.length) {
//     console.warn('Sin escenarios en la respuesta.');
//     return;
//   }

//   const worst = scenarios.reduce((a, b) =>
//     (b.prediction.tier > a.prediction.tier ||
//       (b.prediction.tier === a.prediction.tier && b.prediction.score > a.prediction.score))
//       ? b : a
//   );

//   resultList.forEach(item => {
//     if (item.top_scenarios) {
//       scenarios.push(...item.top_scenarios.map(s => ({ ...s, _product: item.product })));
//     } else {
//       scenarios.push(item);
//     }
//   });

//   if (!scenarios.length) {
//     console.warn('Sin escenarios en la respuesta.');
//     return;
//   }


//   const tierMap = {
//     1: { label: 'BAJO', cls: 'green' },
//     2: { label: 'MEDIO', cls: 'cyan' },
//     3: { label: 'ALTO', cls: 'amber' },
//     4: { label: 'CRÍTICO', cls: 'red' },
//   };

//   const nivel = tierMap[worst.prediction.tier] || { label: 'DESCONOCIDO', cls: 'cyan' };
//   const score = worst.prediction.score;
//   const pct = Math.round(score * 100);

//   // Meta
//   document.getElementById('dash-meta').textContent =
//     `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · Tier ${worst.prediction.tier} — ${nivel.label} · ${scenarios.length} escenario(s) evaluados`;

//   // KPIs
//   const criticalCount = scenarios.filter(s => s.asset?.Severidad?.includes('Critical')).length;
//   document.getElementById('kpi-critical').textContent = criticalCount > 0 ? `⚠ ${criticalCount}` : 'NO';
//   document.getElementById('kpi-high').textContent = scenarios.filter(s => s.prediction.tier >= 3).length;
//   document.getElementById('kpi-score').textContent = (score * 100).toFixed(0) + '%';
//   document.getElementById('kpi-techs').textContent = stackItems.length;

//   // Barra de exposición (peor escenario)
//   document.getElementById('exp-score-val').textContent = `${pct} / 100 — ${nivel.label}`;
//   const bar = document.getElementById('exp-bar');
//   bar.style.width = pct + '%';
//   bar.style.background = worst.prediction.tier === 4 ? 'var(--red)'
//     : worst.prediction.tier === 3 ? 'var(--amber)'
//       : worst.prediction.tier === 2 ? 'var(--cyan)' : 'var(--green)';

//   // Gráfica factores (del peor escenario)
//   const { attack = {}, impact = {} } = worst;
//   const factores = {
//     'Vector de Ataque': attack.VectorAtaque?.[0] || '—',
//     'Complejidad': attack.Complejidad?.[0] || '—',
//     'Privilegios': attack.Privilegios?.[0] || '—',
//     'Interacción': attack.InteraccionUsuario?.[0] || '—',
//     'Confidencialidad': impact.ImpactoConfidencialidad?.[0] || '—',
//     'Integridad': impact.ImpactoIntegridad?.[0] || '—',
//     'Disponibilidad': impact.ImpactoDisponibilidad?.[0] || '—',
//   };
//   document.getElementById('chart-factors').innerHTML =
//     Object.entries(factores).map(([k, v]) => `
//       <div class="cr-hbar-row">
//         <span class="cr-hbar-label">${k}</span>
//         <span class="cr-hbar-val ${v === 'High' || v === 'Network' ? 'red' : 'cyan'}">${v}</span>
//       </div>`).join('');

//   // Gráfica score por escenario (top 10)
//   document.getElementById('chart-by-tech').innerHTML =
//     scenarios.slice(0, 10).map(s => {
//       const sPct = Math.round(s.prediction.score * 100);
//       const sNivel = tierMap[s.prediction.tier] || { cls: 'cyan' };
//       const label = s.asset?.Producto?.[0] || s._product || 'Sistema';
//       return `
//         <div class="cr-hbar-row">
//           <span class="cr-hbar-label">${label}</span>
//           <div class="cr-hbar-track">
//             <div class="cr-hbar-fill ${sNivel.cls}" style="width:${sPct}%"></div>
//           </div>
//           <span class="cr-hbar-pct">${sPct}%</span>
//         </div>`;
//     }).join('');

//   // Tabla — todos los escenarios
//   document.getElementById('risk-tbody').innerHTML =
//     scenarios.map(s => {
//       const sNivel = tierMap[s.prediction.tier] || { label: '—', cls: 'cyan' };
//       const sPct = Math.round(s.prediction.score * 100);
//       const producto = s.asset?.Producto?.join(', ') || s._product || '—';
//       const vendor = s.asset?.Vendor?.join(', ') || '—';
//       const cwe = s.asset?.CWE?.join(', ') || '—';
//       return `
//         <tr>
//           <td>${producto}</td>
//           <td>${cwe}</td>
//           <td>${vendor}</td>
//           <td><span class="cr-score-badge ${sNivel.cls}">${sPct}%</span></td>
//           <td><span class="cr-nivel-badge ${sNivel.cls}">${sNivel.label}</span></td>
//         </tr>`;
//     }).join('');

//   // Recomendaciones — basadas en el peor tier
//   fetchRecommendations(worst.prediction.tier).then(recs => {
//     document.getElementById('cr-rec-list').innerHTML =
//       recs.map(text => `
//         <div class="cr-rec-item">
//           <span class="cr-rec-icon">📌</span>
//           <span>${text}</span>
//         </div>`).join('');
//   });

//   // JSON preview
//   const dashEl = document.getElementById('json-preview-dash');
//   if (dashEl) dashEl.textContent = JSON.stringify(resultList, null, 2);

//   document.getElementById('cr-main').scrollTop = 0;
// }
















// 'use strict';

// /* ==========================================
//    ESTADO GLOBAL
// ========================================== */
// let TECH_CATALOG = [];
// let QUESTIONS = [];
// let selectedTechs = [];
// let currentTechIndex = 0;

// /* ==========================================
//    INIT
// ========================================== */
// document.addEventListener('DOMContentLoaded', init);

// async function init() {
//   try {
//     const catalogData = await fetchJSON('/data/tech-catalog.json');
//     const questionData = await fetchJSON('/data/questions-config.json');

//     TECH_CATALOG = catalogData.catalog || [];
//     QUESTIONS = questionData.questions || [];

//     loadCategories();

//     document.getElementById('catalog-loader').style.display = 'none';
//     document.getElementById('catalog-form').style.display = 'block';
//     document.getElementById('cr-status-text').textContent = 'DATOS CARGADOS';
//   } catch (error) {
//     console.error(error);
//     document.getElementById('cr-status-text').textContent = 'ERROR DE CARGA';
//   }
// }

// /* ==========================================
//    CATÁLOGO
// ========================================== */
// function loadCategories() {
//   const selCat = document.getElementById('sel-cat');
//   const categories = [...new Set(TECH_CATALOG.map(x => x.cat))];
//   categories.forEach(cat => {
//     selCat.innerHTML += `<option value="${cat}">${cat}</option>`;
//   });
// }

// document.addEventListener('change', (e) => {
//   if (e.target.id === 'sel-cat') loadVendors(e.target.value);
//   if (e.target.id === 'sel-vendor') loadProducts(document.getElementById('sel-cat').value, e.target.value);
//   if (e.target.id === 'sel-product') document.getElementById('add-tech-btn').disabled = false;
// });

// function loadVendors(cat) {
//   const selVendor = document.getElementById('sel-vendor');
//   selVendor.innerHTML = '<option value="">Seleccione</option>';
//   TECH_CATALOG.filter(x => x.cat === cat).map(x => x.vendor).forEach(v => {
//     selVendor.innerHTML += `<option value="${v}">${v}</option>`;
//   });
//   selVendor.disabled = false;
// }

// function loadProducts(cat, vendor) {
//   const selProduct = document.getElementById('sel-product');
//   selProduct.innerHTML = '<option value="">Seleccione</option>';
//   const record = TECH_CATALOG.find(x => x.cat === cat && x.vendor === vendor);
//   if (!record) return;
//   record.products.forEach(product => {
//     selProduct.innerHTML += `<option value="${product}">${product}</option>`;
//   });
//   selProduct.disabled = false;
// }

// /* ==========================================
//    STACK DE TECNOLOGÍAS
// ========================================== */

// // function addTech() {
// //   const tech = {
// //     cat: document.getElementById('sel-cat').value,
// //     vendor: document.getElementById('sel-vendor').value,
// //     product: document.getElementById('sel-product').value,
// //     description: document.getElementById('inp-desc').value
// //   };
// //   selectedTechs.push(tech);
// //   renderTechCards();
// // }

// function addTech() {
//   const cat = document.getElementById('sel-cat').value;
//   const vendor = document.getElementById('sel-vendor').value;
//   const product = document.getElementById('sel-product').value;

//   // Validar que los tres estén seleccionados
//   if (!cat || !vendor || !product) {
//     alert('Debes seleccionar Clasificación, Vendedor y Producto.');
//     return;
//   }

//   const tech = {
//     cat, vendor, product,
//     description: document.getElementById('inp-desc').value
//   };
//   selectedTechs.push(tech);
//   renderTechCards();
// }


// // function renderTechCards() {
// //   const container = document.getElementById('tech-cards');
// //   if (!selectedTechs.length) {
// //     container.innerHTML = '<div class="cr-no-techs">Ninguna tecnología añadida aún</div>';
// //     return;
// //   }
// //   container.innerHTML = selectedTechs.map((t) => `
// //     <div class="cr-tech-card">
// //       <strong>${t.product}</strong>
// //       <div>${t.vendor}</div>
// //       <small>${t.cat}</small>
// //     </div>
// //   `).join('');
// //   document.getElementById('tech-count-badge').textContent = selectedTechs.length;
// //   document.getElementById('fc-techs').textContent = selectedTechs.length;
// //   document.getElementById('run-btn').disabled = false;
// // }

// function renderTechCards() {
//   const container = document.getElementById('tech-cards');
//   if (!selectedTechs.length) {
//     container.innerHTML = '<div class="cr-no-techs">Ninguna tecnología añadida aún</div>';
//     document.getElementById('run-btn').disabled = true;
//     return;
//   }
//   container.innerHTML = selectedTechs.map((t, i) => `
//     <div class="cr-tech-card">
//       <strong>${t.product}</strong>
//       <div>${t.vendor}</div>
//       <small>${t.cat}</small>
//       <button type="button" onclick="removeTech(${i})"
//         style="margin-top:4px;background:none;border:1px solid var(--red);
//                color:var(--red);border-radius:2px;padding:2px 8px;
//                font-size:0.6rem;cursor:pointer;width:100%">
//         ✕ eliminar
//       </button>
//     </div>
//   `).join('');
//   document.getElementById('tech-count-badge').textContent = selectedTechs.length;
//   document.getElementById('fc-techs').textContent = selectedTechs.length;
//   document.getElementById('run-btn').disabled = false;
// }

// function removeTech(index) {
//   selectedTechs.splice(index, 1);
//   renderTechCards();
// }
// window.removeTech = removeTech;


// /* ==========================================
//    CUESTIONARIO
// ========================================== */
// function renderQuestionnaire() {
//   if (!selectedTechs.length) return;
//   const tech = selectedTechs[currentTechIndex];
//   document.getElementById('current-tech-name').textContent = tech.product;
//   document.getElementById('question-progress').textContent = `${currentTechIndex + 1} / ${selectedTechs.length}`;
//   let html = '';
//   QUESTIONS.forEach(q => {
//     html += `
//       <div class="cr-question-card">
//         <div class="cr-question-title">${q.text}</div>
//         <select data-tech="${currentTechIndex}" data-question="${q.id}">
//           <option value="0">No</option>
//           <option value="1">Sí</option>
//         </select>
//       </div>`;
//   });
//   document.getElementById('question-container').innerHTML = html;
// }

// function nextTech() {
//   if (currentTechIndex < selectedTechs.length - 1) {
//     currentTechIndex++;
//     renderQuestionnaire();
//   }
// }

// function previousTech() {
//   if (currentTechIndex > 0) {
//     currentTechIndex--;
//     renderQuestionnaire();
//   }
// }

// /* ==========================================
//    NAVEGACIÓN POR PASOS
// ========================================== */
// function showStep(step) {
//   document.querySelectorAll('.cr-panel').forEach(p => p.classList.remove('active'));
//   document.getElementById(`panel-${step}`)?.classList.add('active');
//   document.querySelectorAll('.cr-nav-btn').forEach(btn => btn.classList.remove('active'));
//   document.getElementById(`btn-step${step}`)?.classList.add('active');
//   if (step === 2 && selectedTechs.length) renderQuestionnaire();
//   if (step === 3) generateJSON();
// }

// /* ==========================================
//    JSON / PAYLOAD
// ========================================== */
// function buildPayload() {
//   return selectedTechs.map((tech, index) => {
//     const answers = {};
//     QUESTIONS.forEach(q => {
//       const control = document.querySelector(`[data-tech="${index}"][data-question="${q.id}"]`);
//       // answers[q.id] = control ? Number(control.value) : 0;
//       answers[q.id] = control ? (control.value === "1" ? "Si" : "No") : "No";
//     });
//     return {
//       technology: tech.product,
//       vendor: tech.vendor,
//       category: tech.cat,
//       description: tech.description,
//       ...answers
//     };
//   });
// }

// function generateJSON() {
//   const payload = buildPayload();
//   const text = JSON.stringify(payload, null, 2);
//   const outEl = document.getElementById('json-output');
//   const dashEl = document.getElementById('json-preview-dash');
//   const countEl = document.getElementById('json-records-count');
//   if (outEl) outEl.textContent = text;
//   if (dashEl) dashEl.textContent = text;
//   if (countEl) countEl.textContent = `${payload.length} registros · ${selectedTechs.length} tecnologías`;
//   return payload;
// }

// function copyJSON() {
//   const json = document.getElementById('json-output').textContent;
//   navigator.clipboard.writeText(json);
//   alert('JSON copiado');
// }

// function resetAnalysis() {
//   // Limpiar estado
//   selectedTechs = [];
//   currentTechIndex = 0;

//   // Resetear UI del stack
//   renderTechCards();

//   // Resetear selects
//   document.getElementById('sel-cat').value = '';
//   document.getElementById('sel-vendor').value = '';
//   document.getElementById('sel-product').value = '';
//   document.getElementById('sel-vendor').disabled = true;
//   document.getElementById('sel-product').disabled = true;
//   document.getElementById('add-tech-btn').disabled = true;
//   document.getElementById('inp-desc').value = '';

//   // Volver al paso 1
//   showStep(1);
//   document.getElementById('btn-step1').classList.add('active');

//   // Ocultar dashboard, mostrar empty
//   // document.getElementById('cr-dashboard').style.display = 'none';
//   // document.getElementById('cr-empty').style.display = '';
// }
// window.resetAnalysis = resetAnalysis;

// /* ==========================================
//    ANÁLISIS — llamada al backend
// ========================================== */
// async function runAnalysis(event) {
//   // Detener cualquier submit o navegación
//   if (event) {
//     event.preventDefault();
//     event.stopPropagation();
//   }

//   if (selectedTechs.length === 0) {
//     alert('Debes agregar al menos una tecnología.');
//     return;
//   }

//   try {
//     const payload = buildPayload();

//     // 1. Guardar JSON en el backend
//     const saveRes = await fetch('http://127.0.0.1:5000/guardar-json', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });
//     const saveData = await saveRes.json();
//     console.log('✅ Guardado:', saveData);

//     // 2. Ejecutar análisis ML
//     const analRes = await fetch('http://127.0.0.1:5000/analizar', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ id: saveData.id })
//     });

//     if (!analRes.ok) {
//       const err = await analRes.text();
//       console.error('❌ Error servidor:', err);
//       alert('Error del servidor: ' + err);
//       return;
//     }

//     const result = await analRes.json();
//     console.log('🧠 Resultado ML:', result);

//     window.mlResult = result;

//     // 3. Renderizar dashboard — UNA SOLA VEZ
//     renderDashboard(result);

//   } catch (error) {
//     console.error('❌ Error:', error);
//     alert('Error: ' + error.message);
//   }
// }

// /* ==========================================
//    DASHBOARD
// ========================================== */
// function renderDashboard(result) {
//   // const empty = document.getElementById('cr-empty');
//   // const dash = document.getElementById('cr-dashboard');

//   // Ocultar empty, mostrar dashboard
//   // empty.style.display = 'none';
//   // dash.style.display = 'block';

//   const { prediction, asset, attack, impact } = result;
//   const tier = prediction.tier;
//   const score = prediction.score;

//   const tierMap = {
//     1: { label: 'BAJO', cls: 'green' },
//     2: { label: 'MEDIO', cls: 'cyan' },
//     3: { label: 'ALTO', cls: 'amber' },
//     4: { label: 'CRÍTICO', cls: 'red' },
//   };
//   const nivel = tierMap[tier] || { label: 'DESCONOCIDO', cls: 'cyan' };

//   // Meta
//   document.getElementById('dash-meta').textContent =
//     `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · Tier ${tier} — ${nivel.label}`;

//   // KPIs
//   document.getElementById('kpi-critical').textContent = asset.Severidad?.includes('Critical') ? '⚠ SÍ' : 'NO';
//   document.getElementById('kpi-high').textContent = tier >= 3 ? '⚠ SÍ' : 'NO';
//   document.getElementById('kpi-score').textContent = (score * 100).toFixed(0) + '%';
//   document.getElementById('kpi-techs').textContent = selectedTechs.length;

//   // Barra de exposición
//   const pct = Math.round(score * 100);
//   document.getElementById('exp-score-val').textContent = `${pct} / 100 — ${nivel.label}`;
//   const bar = document.getElementById('exp-bar');
//   bar.style.width = pct + '%';
//   bar.style.background = tier === 4 ? 'var(--red)' : tier === 3 ? 'var(--amber)' : tier === 2 ? 'var(--cyan)' : 'var(--green)';

//   // Gráfica factores
//   const factores = {
//     'Vector de Ataque': attack.VectorAtaque?.[0] || '—',
//     'Complejidad': attack.Complejidad?.[0] || '—',
//     'Privilegios': attack.Privilegios?.[0] || '—',
//     'Interacción': attack.InteraccionUsuario?.[0] || '—',
//     'Confidencialidad': impact.ImpactoConfidencialidad?.[0] || '—',
//     'Integridad': impact.ImpactoIntegridad?.[0] || '—',
//     'Disponibilidad': impact.ImpactoDisponibilidad?.[0] || '—',
//   };
//   document.getElementById('chart-factors').innerHTML =
//     Object.entries(factores).map(([k, v]) => `
//       <div class="cr-hbar-row">
//         <span class="cr-hbar-label">${k}</span>
//         <span class="cr-hbar-val ${v === 'High' || v === 'Network' ? 'red' : 'cyan'}">${v}</span>
//       </div>`).join('');

//   // Gráfica score por tecnología
//   document.getElementById('chart-by-tech').innerHTML =
//     selectedTechs.map(t => `
//       <div class="cr-hbar-row">
//         <span class="cr-hbar-label">${t.product}</span>
//         <div class="cr-hbar-track">
//           <div class="cr-hbar-fill ${nivel.cls}" style="width:${pct}%"></div>
//         </div>
//         <span class="cr-hbar-pct">${pct}%</span>
//       </div>`).join('');

//   // Tabla
//   document.getElementById('risk-tbody').innerHTML =
//     selectedTechs.map(t => `
//       <tr>
//         <td>${t.product}</td>
//         <td>${t.cat}</td>
//         <td>${t.vendor}</td>
//         <td><span class="cr-score-badge ${nivel.cls}">${(score * 100).toFixed(0)}%</span></td>
//         <td><span class="cr-nivel-badge ${nivel.cls}">${nivel.label}</span></td>
//       </tr>`).join('');

//   // Recomendaciones
//   const recs = [];
//   if (asset.Severidad?.includes('Critical'))
//     recs.push({ icon: '🔴', text: 'Vulnerabilidad crítica detectada — aplicar parches inmediatamente.' });
//   if (attack.VectorAtaque?.includes('Network'))
//     recs.push({ icon: '🌐', text: 'Vector de ataque remoto — revisar reglas de firewall y segmentación de red.' });
//   if (impact.ImpactoConfidencialidad?.includes('High'))
//     recs.push({ icon: '🔐', text: 'Alto impacto en confidencialidad — cifrar datos sensibles y revisar permisos.' });
//   if (impact.ImpactoDisponibilidad?.includes('High'))
//     recs.push({ icon: '⚡', text: 'Alto impacto en disponibilidad — implementar plan de continuidad y backups.' });
//   if (attack.Privilegios?.includes('None'))
//     recs.push({ icon: '⚠️', text: 'No requiere privilegios previos — superficie de ataque amplia, reforzar autenticación.' });
//   if (!recs.length)
//     recs.push({ icon: '✅', text: 'No se detectaron vectores críticos inmediatos. Mantener monitoreo continuo.' });

//   document.getElementById('cr-rec-list').innerHTML =
//     recs.map(r => `
//       <div class="cr-rec-item">
//         <span class="cr-rec-icon">${r.icon}</span>
//         <span>${r.text}</span>
//       </div>`).join('');

//   // JSON preview
//   const dashEl = document.getElementById('json-preview-dash');
//   if (dashEl) dashEl.textContent = JSON.stringify(window.mlResult, null, 2);

//   // Scroll al inicio
//   document.getElementById('cr-main').scrollTop = 0;
// }

// /* ==========================================
//    EXPORTS GLOBALES
// ========================================== */
// window.addTech = addTech;
// window.copyJSON = copyJSON;
// window.runAnalysis = runAnalysis;
// window.generateJSON = generateJSON;
// window.buildPayload = buildPayload;
// window.showStep = showStep;
// window.nextTech = nextTech;
// window.previousTech = previousTech;