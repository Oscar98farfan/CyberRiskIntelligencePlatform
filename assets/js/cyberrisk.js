'use strict';

/* ==========================================
   ESTADO GLOBAL
========================================== */
let TECH_CATALOG = [];
let QUESTIONS = [];
let selectedTechs = [];
let currentTechIndex = 0;

/* ==========================================
   INIT
========================================== */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const catalogData = await fetchJSON('/data/tech-catalog.json');
    const questionData = await fetchJSON('/data/questions-config.json');

    TECH_CATALOG = catalogData.catalog || [];
    QUESTIONS = questionData.questions || [];

    loadCategories();

    document.getElementById('catalog-loader').style.display = 'none';
    document.getElementById('catalog-form').style.display = 'block';
    document.getElementById('cr-status-text').textContent = 'DATOS CARGADOS';
  } catch (error) {
    console.error(error);
    document.getElementById('cr-status-text').textContent = 'ERROR DE CARGA';
  }
}

/* ==========================================
   CATÁLOGO
========================================== */
function loadCategories() {
  const selCat = document.getElementById('sel-cat');
  const categories = [...new Set(TECH_CATALOG.map(x => x.cat))];
  categories.forEach(cat => {
    selCat.innerHTML += `<option value="${cat}">${cat}</option>`;
  });
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'sel-cat') loadVendors(e.target.value);
  if (e.target.id === 'sel-vendor') loadProducts(document.getElementById('sel-cat').value, e.target.value);
  if (e.target.id === 'sel-product') document.getElementById('add-tech-btn').disabled = false;
});

function loadVendors(cat) {
  const selVendor = document.getElementById('sel-vendor');
  selVendor.innerHTML = '<option value="">Seleccione</option>';
  TECH_CATALOG.filter(x => x.cat === cat).map(x => x.vendor).forEach(v => {
    selVendor.innerHTML += `<option value="${v}">${v}</option>`;
  });
  selVendor.disabled = false;
}

function loadProducts(cat, vendor) {
  const selProduct = document.getElementById('sel-product');
  selProduct.innerHTML = '<option value="">Seleccione</option>';
  const record = TECH_CATALOG.find(x => x.cat === cat && x.vendor === vendor);
  if (!record) return;
  record.products.forEach(product => {
    selProduct.innerHTML += `<option value="${product}">${product}</option>`;
  });
  selProduct.disabled = false;
}

/* ==========================================
   STACK DE TECNOLOGÍAS
========================================== */
function addTech() {
  const tech = {
    cat: document.getElementById('sel-cat').value,
    vendor: document.getElementById('sel-vendor').value,
    product: document.getElementById('sel-product').value,
    description: document.getElementById('inp-desc').value
  };
  selectedTechs.push(tech);
  renderTechCards();
}

function renderTechCards() {
  const container = document.getElementById('tech-cards');
  if (!selectedTechs.length) {
    container.innerHTML = '<div class="cr-no-techs">Ninguna tecnología añadida aún</div>';
    return;
  }
  container.innerHTML = selectedTechs.map((t) => `
    <div class="cr-tech-card">
      <strong>${t.product}</strong>
      <div>${t.vendor}</div>
      <small>${t.cat}</small>
    </div>
  `).join('');
  document.getElementById('tech-count-badge').textContent = selectedTechs.length;
  document.getElementById('fc-techs').textContent = selectedTechs.length;
  document.getElementById('run-btn').disabled = false;
}

/* ==========================================
   CUESTIONARIO
========================================== */
function renderQuestionnaire() {
  if (!selectedTechs.length) return;
  const tech = selectedTechs[currentTechIndex];
  document.getElementById('current-tech-name').textContent = tech.product;
  document.getElementById('question-progress').textContent = `${currentTechIndex + 1} / ${selectedTechs.length}`;
  let html = '';
  QUESTIONS.forEach(q => {
    html += `
      <div class="cr-question-card">
        <div class="cr-question-title">${q.text}</div>
        <select data-tech="${currentTechIndex}" data-question="${q.id}">
          <option value="0">No</option>
          <option value="1">Sí</option>
        </select>
      </div>`;
  });
  document.getElementById('question-container').innerHTML = html;
}

function nextTech() {
  if (currentTechIndex < selectedTechs.length - 1) {
    currentTechIndex++;
    renderQuestionnaire();
  }
}

function previousTech() {
  if (currentTechIndex > 0) {
    currentTechIndex--;
    renderQuestionnaire();
  }
}

/* ==========================================
   NAVEGACIÓN POR PASOS
========================================== */
function showStep(step) {
  document.querySelectorAll('.cr-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${step}`)?.classList.add('active');
  document.querySelectorAll('.cr-nav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-step${step}`)?.classList.add('active');
  if (step === 2 && selectedTechs.length) renderQuestionnaire();
  if (step === 3) generateJSON();
}

/* ==========================================
   JSON / PAYLOAD
========================================== */
function buildPayload() {
  return selectedTechs.map((tech, index) => {
    const answers = {};
    QUESTIONS.forEach(q => {
      const control = document.querySelector(`[data-tech="${index}"][data-question="${q.id}"]`);
      answers[q.id] = control ? Number(control.value) : 0;
    });
    return {
      technology: tech.product,
      vendor: tech.vendor,
      category: tech.cat,
      description: tech.description,
      ...answers
    };
  });
}

function generateJSON() {
  const payload = buildPayload();
  const text = JSON.stringify(payload, null, 2);
  const outEl = document.getElementById('json-output');
  const dashEl = document.getElementById('json-preview-dash');
  const countEl = document.getElementById('json-records-count');
  if (outEl) outEl.textContent = text;
  if (dashEl) dashEl.textContent = text;
  if (countEl) countEl.textContent = `${payload.length} registros · ${selectedTechs.length} tecnologías`;
  return payload;
}

function copyJSON() {
  const json = document.getElementById('json-output').textContent;
  navigator.clipboard.writeText(json);
  alert('JSON copiado');
}

/* ==========================================
   ANÁLISIS — llamada al backend
========================================== */
async function runAnalysis(event) {
  // Detener cualquier submit o navegación
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (selectedTechs.length === 0) {
    alert('Debes agregar al menos una tecnología.');
    return;
  }

  try {
    const payload = buildPayload();

    // 1. Guardar JSON en el backend
    const saveRes = await fetch('http://127.0.0.1:5000/guardar-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const saveData = await saveRes.json();
    console.log('✅ Guardado:', saveData);

    // 2. Ejecutar análisis ML
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

    // 3. Renderizar dashboard — UNA SOLA VEZ
    renderDashboard(result);

  } catch (error) {
    console.error('❌ Error:', error);
    alert('Error: ' + error.message);
  }
}

/* ==========================================
   DASHBOARD
========================================== */
function renderDashboard(result) {
  const empty = document.getElementById('cr-empty');
  const dash = document.getElementById('cr-dashboard');

  // Ocultar empty, mostrar dashboard
  empty.style.display = 'none';
  dash.style.display = 'block';

  const { prediction, asset, attack, impact } = result;
  const tier = prediction.tier;
  const score = prediction.score;

  const tierMap = {
    1: { label: 'BAJO', cls: 'green' },
    2: { label: 'MEDIO', cls: 'cyan' },
    3: { label: 'ALTO', cls: 'amber' },
    4: { label: 'CRÍTICO', cls: 'red' },
  };
  const nivel = tierMap[tier] || { label: 'DESCONOCIDO', cls: 'cyan' };

  // Meta
  document.getElementById('dash-meta').textContent =
    `Análisis ejecutado · ${new Date().toLocaleString('es-CO')} · Tier ${tier} — ${nivel.label}`;

  // KPIs
  document.getElementById('kpi-critical').textContent = asset.Severidad?.includes('Critical') ? '⚠ SÍ' : 'NO';
  document.getElementById('kpi-high').textContent = tier >= 3 ? '⚠ SÍ' : 'NO';
  document.getElementById('kpi-score').textContent = (score * 100).toFixed(0) + '%';
  document.getElementById('kpi-techs').textContent = selectedTechs.length;

  // Barra de exposición
  const pct = Math.round(score * 100);
  document.getElementById('exp-score-val').textContent = `${pct} / 100 — ${nivel.label}`;
  const bar = document.getElementById('exp-bar');
  bar.style.width = pct + '%';
  bar.style.background = tier === 4 ? 'var(--red)' : tier === 3 ? 'var(--amber)' : tier === 2 ? 'var(--cyan)' : 'var(--green)';

  // Gráfica factores
  const factores = {
    'Vector de Ataque': attack.VectorAtaque?.[0] || '—',
    'Complejidad': attack.Complejidad?.[0] || '—',
    'Privilegios': attack.Privilegios?.[0] || '—',
    'Interacción': attack.InteraccionUsuario?.[0] || '—',
    'Confidencialidad': impact.ImpactoConfidencialidad?.[0] || '—',
    'Integridad': impact.ImpactoIntegridad?.[0] || '—',
    'Disponibilidad': impact.ImpactoDisponibilidad?.[0] || '—',
  };
  document.getElementById('chart-factors').innerHTML =
    Object.entries(factores).map(([k, v]) => `
      <div class="cr-hbar-row">
        <span class="cr-hbar-label">${k}</span>
        <span class="cr-hbar-val ${v === 'High' || v === 'Network' ? 'red' : 'cyan'}">${v}</span>
      </div>`).join('');

  // Gráfica score por tecnología
  document.getElementById('chart-by-tech').innerHTML =
    selectedTechs.map(t => `
      <div class="cr-hbar-row">
        <span class="cr-hbar-label">${t.product}</span>
        <div class="cr-hbar-track">
          <div class="cr-hbar-fill ${nivel.cls}" style="width:${pct}%"></div>
        </div>
        <span class="cr-hbar-pct">${pct}%</span>
      </div>`).join('');

  // Tabla
  document.getElementById('risk-tbody').innerHTML =
    selectedTechs.map(t => `
      <tr>
        <td>${t.product}</td>
        <td>${t.cat}</td>
        <td>${t.vendor}</td>
        <td><span class="cr-score-badge ${nivel.cls}">${(score * 100).toFixed(0)}%</span></td>
        <td><span class="cr-nivel-badge ${nivel.cls}">${nivel.label}</span></td>
      </tr>`).join('');

  // Recomendaciones
  const recs = [];
  if (asset.Severidad?.includes('Critical'))
    recs.push({ icon: '🔴', text: 'Vulnerabilidad crítica detectada — aplicar parches inmediatamente.' });
  if (attack.VectorAtaque?.includes('Network'))
    recs.push({ icon: '🌐', text: 'Vector de ataque remoto — revisar reglas de firewall y segmentación de red.' });
  if (impact.ImpactoConfidencialidad?.includes('High'))
    recs.push({ icon: '🔐', text: 'Alto impacto en confidencialidad — cifrar datos sensibles y revisar permisos.' });
  if (impact.ImpactoDisponibilidad?.includes('High'))
    recs.push({ icon: '⚡', text: 'Alto impacto en disponibilidad — implementar plan de continuidad y backups.' });
  if (attack.Privilegios?.includes('None'))
    recs.push({ icon: '⚠️', text: 'No requiere privilegios previos — superficie de ataque amplia, reforzar autenticación.' });
  if (!recs.length)
    recs.push({ icon: '✅', text: 'No se detectaron vectores críticos inmediatos. Mantener monitoreo continuo.' });

  document.getElementById('cr-rec-list').innerHTML =
    recs.map(r => `
      <div class="cr-rec-item">
        <span class="cr-rec-icon">${r.icon}</span>
        <span>${r.text}</span>
      </div>`).join('');

  // JSON preview
  const dashEl = document.getElementById('json-preview-dash');
  if (dashEl) dashEl.textContent = JSON.stringify(window.mlResult, null, 2);

  // Scroll al inicio
  document.getElementById('cr-main').scrollTop = 0;
}

/* ==========================================
   EXPORTS GLOBALES
========================================== */
window.addTech = addTech;
window.copyJSON = copyJSON;
window.runAnalysis = runAnalysis;
window.generateJSON = generateJSON;
window.buildPayload = buildPayload;
window.showStep = showStep;
window.nextTech = nextTech;
window.previousTech = previousTech;