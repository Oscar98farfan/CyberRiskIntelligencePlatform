// // ═══════════════════════════════════════════════════
// // PARSER DE ARCHIVOS .TXT
// // ═══════════════════════════════════════════════════

// function parseTxt(text) {
//   const result = {};
//   let currentSection = null;
//   let currentItem = null;
//   let currentItems = [];

//   const lines = text.split('\n');
//   for (let line of lines) {
//     line = line.trim();
//     if (!line || line.startsWith('#')) continue;

//     // Section header [SECTION]
//     const sectionMatch = line.match(/^\[(.+)\]$/);
//     if (sectionMatch) {
//       if (currentSection && currentItem) {
//         if (!result[currentSection]) result[currentSection] = [];
//         result[currentSection].push({...currentItem});
//         currentItem = null;
//       }
//       currentSection = sectionMatch[1];
//       if (!result[currentSection]) result[currentSection] = [];
//       continue;
//     }

//     // Item separator
//     if (line === '---') {
//       if (currentSection && currentItem) {
//         result[currentSection].push({...currentItem});
//         currentItem = null;
//       }
//       continue;
//     }

//     // Key=Value
//     const kvMatch = line.match(/^([^=]+)=(.*)$/);
//     if (kvMatch) {
//       const key = kvMatch[1].trim();
//       const val = kvMatch[2].trim();

//       // Detect if this section has items (repeated keys)
//       if (currentItem && currentItem[key] !== undefined) {
//         result[currentSection].push({...currentItem});
//         currentItem = {};
//         currentItem[key] = val;
//       } else if (!result[currentSection] || result[currentSection].length === 0) {
//         // First item in section
//         if (!currentItem) currentItem = {};
//         currentItem[key] = val;
//       } else {
//         // Could be a simple key-value section or item
//         if (!currentItem) currentItem = {};
//         currentItem[key] = val;
//       }
//     }
//   }

//   // Flush last item
//   if (currentSection && currentItem) {
//     if (Array.isArray(result[currentSection])) {
//       result[currentSection].push({...currentItem});
//     }
//   }

//   return result;
// }

// // Simpler key-value parser for flat sections
// function parseTxtFlat(text) {
//   const result = {};
//   let currentSection = null;
//   const lines = text.split('\n');

//   for (let line of lines) {
//     const trimmed = line.trim();
//     if (!trimmed || trimmed.startsWith('#')) continue;

//     const sectionMatch = trimmed.match(/^\[(.+)\]$/);
//     if (sectionMatch) {
//       currentSection = sectionMatch[1];
//       if (!result[currentSection]) result[currentSection] = {};
//       continue;
//     }

//     const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
//     if (kvMatch && currentSection) {
//       const key = kvMatch[1].trim();
//       const val = kvMatch[2].trim();
//       if (result[currentSection][key]) {
//         // Already exists — make array
//         if (!Array.isArray(result[currentSection][key])) {
//           result[currentSection][key] = [result[currentSection][key]];
//         }
//         result[currentSection][key].push(val);
//       } else {
//         result[currentSection][key] = val;
//       }
//     }
//   }

//   return result;
// }

// // ═══════════════════════════════════════════════════
// // LOADERS
// // ═══════════════════════════════════════════════════

// async function loadTxt(filename) {
//   const resp = await fetch('content/' + filename);
//   if (!resp.ok) throw new Error('No se pudo leer ' + filename);
//   return await resp.text();
// }

// // ═══════════════════════════════════════════════════
// // CONFIG LOADER
// // ═══════════════════════════════════════════════════

// async function loadConfig() {
//   try {
//     const text = await loadTxt('config.txt');
//     const cfg = parseTxtFlat(text);
//     const meta = cfg['META'] || {};
//     const pages = cfg['PAGINAS'] || {};

//     document.title = (meta.titulo || 'Wiki del Proyecto') + ' — Wiki';
//     document.getElementById('header-meta').textContent =
//       'v' + (meta.version_proyecto || '0.1.0') + ' · ' + (meta.fecha_inicio || '');
//     document.getElementById('si-version').textContent = meta.version_proyecto || '—';
//     document.getElementById('si-fecha').textContent = meta.fecha_inicio || '—';
//     document.getElementById('si-inst').textContent = meta.institucion || '—';
//     document.getElementById('repo-link').textContent = 'Git: ' + (meta.repositorio || '—');
//     document.getElementById('footer-date').textContent = 'Inicio: ' + (meta.fecha_inicio || '—');
//   } catch(e) {
//     console.warn('Config no cargada:', e.message);
//   }
// }

// // ═══════════════════════════════════════════════════
// // RENDER: ACTA DE CONSTITUCIÓN
// // ═══════════════════════════════════════════════════

// async function renderActa() {
//   try {
//     const text = await loadTxt('acta-constitucion.txt');
//     const data = parseTxtFlat(text);
//     const meta = data['META'] || {};
//     const obj = data['OBJETIVO_GENERAL'] || {};
//     const oe = data['OBJETIVOS_ESPECIFICOS'] || {};
//     const alcance = data['ALCANCE'] || {};
//     const entregables = data['ENTREGABLES_ESPERADOS'] || {};
//     const just = data['JUSTIFICACION'] || {};
//     const restricciones = data['RESTRICCIONES'] || {};
//     const supuestos = data['SUPUESTOS'] || {};
//     const cronograma = data['CRONOGRAMA_RESUMEN'] || {};
//     const firmas = data['FIRMAS'] || {};

//     // Parse arrays
//     const parseMulti = (obj) => Object.values(obj).join('\n').split('\n').filter(l => l.trim() && !l.match(/^\d+\./));
//     const parseNumbered = (obj) => {
//       const joined = typeof obj === 'string' ? obj : Object.values(obj).join('\n');
//       return joined.split('\n').filter(l => l.match(/^\d+\./)).map(l => l.replace(/^\d+\.\s*/, ''));
//     };

//     const cronItems = Object.entries(cronograma).map(([k,v]) => {
//       const phaseNum = k.replace('Fase_', '').replace('_', ' ');
//       return { fase: k, texto: typeof v === 'string' ? v : v };
//     });

//     // Cronograma phases from text
//     const cronLines = Object.entries(cronograma).map(([k,v]) => `${v}`);

//     const html = `
//       <div class="page-header">
//         <div class="page-eyebrow">// Sprint 1 · Entregable 1</div>
//         <h1 class="page-title">${meta.titulo || 'Acta de Constitución del Proyecto'}</h1>
//         <div class="page-meta">
//           <span>Fecha: ${meta.fecha || '—'}</span>
//           <span>Versión: ${meta.version || '1.0'}</span>
//           <span>Autor: ${meta.autor || '—'}</span>
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Objetivo General</div>
//         <div class="highlight-box">${getVal(data, 'OBJETIVO_GENERAL') || '—'}</div>
//       </div>

//       <div class="section">
//         <div class="section-title">Objetivos Específicos</div>
//         <div class="section-body">
//           <ol class="item-list">
//             ${parseObjEsp(data['OBJETIVOS_ESPECIFICOS']).map(o => `<li>${o}</li>`).join('')}
//           </ol>
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Alcance del Proyecto</div>
//         <div class="two-col">
//           <div class="card">
//             <div class="card-title">✅ Incluye</div>
//             <div class="card-body">
//               <ul class="bullet-list">
//                 ${parseAlcance(data['ALCANCE'], 'INCLUYE').map(i => `<li>${i}</li>`).join('')}
//               </ul>
//             </div>
//           </div>
//           <div class="card">
//             <div class="card-title">🚫 No Incluye</div>
//             <div class="card-body">
//               <ul class="bullet-list">
//                 ${parseAlcance(data['ALCANCE'], 'NO_INCLUYE').map(i => `<li>${i}</li>`).join('')}
//               </ul>
//             </div>
//           </div>
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Entregables Esperados</div>
//         ${parseEntregables(data['ENTREGABLES_ESPERADOS'])}
//       </div>

//       <div class="section">
//         <div class="section-title">Justificación</div>
//         <div class="section-body">${getVal(data, 'JUSTIFICACION') || '—'}</div>
//       </div>

//       <div class="section">
//         <div class="section-title">Restricciones y Supuestos</div>
//         <div class="two-col">
//           <div class="card">
//             <div class="card-title">⚠️ Restricciones</div>
//             <div class="card-body">
//               <ul class="bullet-list">
//                 ${parseItems(data['RESTRICCIONES']).map(i => `<li>${i}</li>`).join('')}
//               </ul>
//             </div>
//           </div>
//           <div class="card">
//             <div class="card-title">💡 Supuestos</div>
//             <div class="card-body">
//               <ul class="bullet-list">
//                 ${parseItems(data['SUPUESTOS']).map(i => `<li>${i}</li>`).join('')}
//               </ul>
//             </div>
//           </div>
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Cronograma Resumido</div>
//         <div class="timeline">
//           ${parseCronograma(data['CRONOGRAMA_RESUMEN'])}
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Aprobación y Firmas</div>
//         <div class="card" style="max-width:400px;">
//           ${Object.entries(data['FIRMAS'] || {}).map(([k,v]) => `
//             <div class="info-row" style="margin-bottom:0.6rem;">
//               <span class="info-key" style="font-size:0.72rem;">${k.replace(/_/g,' ')}</span>
//               <span class="info-val" style="font-size:0.78rem;">${v}</span>
//             </div>
//           `).join('')}
//         </div>
//       </div>
//     `;

//     document.getElementById('content-acta').innerHTML = html;
//     document.getElementById('loading-acta').style.display = 'none';
//     document.getElementById('content-acta').style.display = 'block';

//   } catch(e) {
//     document.getElementById('loading-acta').style.display = 'none';
//     document.getElementById('content-acta').innerHTML = `<div class="error-msg">⚠ Error cargando acta-constitucion.txt: ${e.message}</div>`;
//     document.getElementById('content-acta').style.display = 'block';
//   }
// }

// // ═══════════════════════════════════════════════════
// // RENDER: ANÁLISIS DE INTERESADOS
// // ═══════════════════════════════════════════════════

// async function renderInteresados() {
//   try {
//     const text = await loadTxt('analisis-interesados.txt');
//     const data = parseTxtFlat(text);
//     const meta = data['META'] || {};
//     const desc = data['DESCRIPCION'] || {};
//     const cuadrantes = data['CUADRANTES'] || {};
//     const leyenda = data['LEYENDA_ESTRATEGIAS'] || {};

//     // Parse stakeholders from text
//     const stakeholders = parseStakeholders(text);

//     const badgePoder = (v) => {
//       const cls = v === 'Alto' ? 'badge-alto' : v === 'Medio' ? 'badge-medio' : 'badge-bajo';
//       return `<span class="badge ${cls}">⚡ ${v}</span>`;
//     };
//     const badgeInteres = (v) => {
//       const cls = v === 'Alto' ? 'badge-alto' : v === 'Medio' ? 'badge-medio' : 'badge-bajo';
//       return `<span class="badge ${cls}">👁 ${v}</span>`;
//     };
//     const badgeTipo = (v) => {
//       const cls = v === 'Interno' ? 'badge-interno' : 'badge-externo';
//       return `<span class="badge ${cls}">${v}</span>`;
//     };

//     const shCards = stakeholders.map(sh => `
//       <div class="stakeholder-card">
//         <div class="sh-header">
//           <span class="sh-id">${sh.ID || '—'}</span>
//         </div>
//         <div class="sh-name">${sh.Nombre || '—'}</div>
//         <div class="sh-rol">${sh.Rol || '—'}</div>
//         <div class="sh-badges">
//           ${badgeTipo(sh.Tipo || '—')}
//           ${badgePoder(sh.Poder || '—')}
//           ${badgeInteres(sh.Interes || '—')}
//         </div>
//         <div class="sh-estrategia">📌 ${sh.Estrategia || '—'}</div>
//       </div>
//     `).join('');

//     const cuadrantesHtml = `
//       <div class="matrix-container">
//         <div class="matrix-grid">
//           <div class="matrix-header" style="background:transparent;"></div>
//           <div class="matrix-header">INTERÉS BAJO</div>
//           <div class="matrix-header">INTERÉS ALTO</div>

//           <div class="matrix-label">PODER ALTO</div>
//           <div class="matrix-cell matrix-q4">
//             <div class="q-title" style="color:#ffd740;">Mantener Satisfechos</div>
//             <div class="q-ids">${(cuadrantes.ALTO_PODER_BAJO_INTERES || '').split(',').join(' · ')}</div>
//           </div>
//           <div class="matrix-cell matrix-q1">
//             <div class="q-title" style="color:var(--accent2);">Gestionar de Cerca</div>
//             <div class="q-ids">${(cuadrantes.ALTO_PODER_ALTO_INTERES || '').split(',').join(' · ')}</div>
//           </div>

//           <div class="matrix-label">PODER BAJO</div>
//           <div class="matrix-cell matrix-q3">
//             <div class="q-title" style="color:var(--text-dim);">Monitorear</div>
//             <div class="q-ids">${(cuadrantes.BAJO_PODER_BAJO_INTERES || '').split(',').join(' · ')}</div>
//           </div>
//           <div class="matrix-cell matrix-q2">
//             <div class="q-title" style="color:var(--accent3);">Mantener Informados</div>
//             <div class="q-ids">${(cuadrantes.BAJO_PODER_ALTO_INTERES || '').split(',').join(' · ')}</div>
//           </div>
//         </div>
//       </div>
//     `;

//     const html = `
//       <div class="page-header">
//         <div class="page-eyebrow">// Sprint 1 · Entregable 2</div>
//         <h1 class="page-title">${meta.titulo || 'Análisis de Interesados'}</h1>
//         <div class="page-meta">
//           <span>Fecha: ${meta.fecha || '—'}</span>
//           <span>Versión: ${meta.version || '1.0'}</span>
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Descripción</div>
//         <div class="section-body">${getVal(data, 'DESCRIPCION') || '—'}</div>
//       </div>

//       <div class="section">
//         <div class="section-title">Matriz de Poder / Interés</div>
//         ${cuadrantesHtml}
//         <div style="font-size:0.72rem; color:var(--text-dim); margin-top:0.8rem; font-family:var(--mono);">
//           Los códigos (S01, S02...) corresponden a los interesados detallados abajo.
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Interesados Identificados</div>
//         <div class="stakeholder-grid">${shCards}</div>
//       </div>

//       <div class="section">
//         <div class="section-title">Leyenda de Estrategias</div>
//         <div style="display:grid; gap:0.6rem;">
//           ${Object.entries(leyenda).map(([k,v]) => `
//             <div class="card" style="display:flex; gap:1rem; align-items:flex-start;">
//               <div style="font-family:var(--mono); font-size:0.65rem; color:var(--accent); min-width:160px;">${k.replace(/_/g,' ')}</div>
//               <div style="font-size:0.83rem; color:var(--text);">${v}</div>
//             </div>
//           `).join('')}
//         </div>
//       </div>
//     `;

//     document.getElementById('content-interesados').innerHTML = html;
//     document.getElementById('loading-interesados').style.display = 'none';
//     document.getElementById('content-interesados').style.display = 'block';

//   } catch(e) {
//     document.getElementById('loading-interesados').style.display = 'none';
//     document.getElementById('content-interesados').innerHTML = `<div class="error-msg">⚠ Error: ${e.message}</div>`;
//     document.getElementById('content-interesados').style.display = 'block';
//   }
// }

// // ═══════════════════════════════════════════════════
// // RENDER: VISIÓN DEL PROYECTO
// // ═══════════════════════════════════════════════════

// async function renderVision() {
//   try {
//     const text = await loadTxt('vision-proyecto.txt');
//     const data = parseTxtFlat(text);
//     const meta = data['META'] || {};

//     const htmlKpis = Object.entries(data['INDICADORES_EXITO'] || {}).map(([k,v]) => `
//       <div class="kpi-card">
//         <div class="kpi-id">${k}</div>
//         <div class="kpi-text">${v}</div>
//       </div>
//     `).join('');

//     const htmlDiffs = Object.entries(data['DIFERENCIADORES_CLAVE'] || {}).map(([k,v]) => {
//       const [title, ...rest] = v.split(':');
//       return `
//         <div class="diff-item">
//           <div class="diff-num">${k}</div>
//           <div class="diff-content">
//             <div class="diff-title">${title.trim()}</div>
//             <div class="diff-desc">${rest.join(':').trim()}</div>
//           </div>
//         </div>
//       `;
//     }).join('');

//     const htmlContrib = Object.entries(data['CONTRIBUCION_ESTRATEGICA'] || {}).map(([k,v]) => `
//       <div class="card">
//         <div class="card-title">${k.replace(/_/g,' ')}</div>
//         <div class="card-body">${v}</div>
//       </div>
//     `).join('');

//     const htmlBeneficios = Object.entries(data['BENEFICIOS_ESPERADOS'] || {}).map(([k,v]) => `
//       <div class="entregable">
//         <span class="e-code">${k}</span>
//         <div>
//           <div class="e-text">${v}</div>
//         </div>
//       </div>
//     `).join('');

//     const htmlProblemas = Object.entries(data['PROBLEMA_QUE_RESUELVE'] || {}).map(([k,v]) => {
//       if (!v || k === Object.keys(data['PROBLEMA_QUE_RESUELVE'])[0]) return '';
//       const [title, ...rest] = v.split(':');
//       return `
//         <div class="diff-item" style="padding:0.6rem 0;">
//           <div class="diff-num" style="font-size:1.5rem;">${k}</div>
//           <div class="diff-content">
//             <div class="diff-title">${title.trim()}</div>
//             <div class="diff-desc">${rest.join(':').trim()}</div>
//           </div>
//         </div>
//       `;
//     }).join('');

//     const html = `
//       <div class="page-header">
//         <div class="page-eyebrow">// Sprint 1 · Entregable 3</div>
//         <h1 class="page-title">${meta.titulo || 'Visión del Proyecto'}</h1>
//         <div class="page-meta">
//           <span>Fecha: ${meta.fecha || '—'}</span>
//           <span>Versión: ${meta.version || '1.0'}</span>
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Declaración de Visión</div>
//         <div class="highlight-box" style="font-size:1rem; line-height:1.8; color:var(--text-bright);">
//           "${getVal(data, 'DECLARACION_VISION') || '—'}"
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Problema que Resuelve</div>
//         <div class="section-body" style="margin-bottom:1rem;">${getFirstVal(data['PROBLEMA_QUE_RESUELVE'])}</div>
//         ${htmlProblemas}
//       </div>

//       <div class="section">
//         <div class="section-title">Solución Propuesta</div>
//         <div class="section-body">
//           <ul class="bullet-list">
//             ${parseItems(data['SOLUCION_PROPUESTA']).map(i => `<li>${i}</li>`).join('')}
//           </ul>
//         </div>
//       </div>

//       <div class="section">
//         <div class="section-title">Contribución Estratégica</div>
//         <div class="two-col">${htmlContrib}</div>
//       </div>

//       <div class="section">
//         <div class="section-title">Beneficios Esperados</div>
//         ${htmlBeneficios}
//       </div>

//       <div class="section">
//         <div class="section-title">Indicadores de Éxito (KPIs)</div>
//         <div class="kpi-grid">${htmlKpis}</div>
//       </div>

//       <div class="section">
//         <div class="section-title">Diferenciadores Clave</div>
//         ${htmlDiffs}
//       </div>

//       <div class="section">
//         <div class="section-title">Visión Futura (3-5 años)</div>
//         <div class="section-body">
//           <ul class="bullet-list">
//             ${parseItems(data['VISION_FUTURA']).map(i => `<li>${i}</li>`).join('')}
//           </ul>
//         </div>
//       </div>
//     `;

//     document.getElementById('content-vision').innerHTML = html;
//     document.getElementById('loading-vision').style.display = 'none';
//     document.getElementById('content-vision').style.display = 'block';

//   } catch(e) {
//     document.getElementById('loading-vision').style.display = 'none';
//     document.getElementById('content-vision').innerHTML = `<div class="error-msg">⚠ Error: ${e.message}</div>`;
//     document.getElementById('content-vision').style.display = 'block';
//   }
// }

// // ═══════════════════════════════════════════════════
// // HELPERS
// // ═══════════════════════════════════════════════════

// function getVal(data, section) {
//   const s = data[section];
//   if (!s) return '';
//   const vals = Object.values(s);
//   return vals.join(' ');
// }

// function getFirstVal(obj) {
//   if (!obj) return '';
//   return Object.values(obj)[0] || '';
// }

// function parseObjEsp(obj) {
//   if (!obj) return [];
//   return Object.values(obj).join('\n').split('\n')
//     .filter(l => l.match(/^\d+\./))
//     .map(l => l.replace(/^\d+\.\s*/, ''));
// }

// function parseAlcance(obj, key) {
//   if (!obj) return [];
//   // Find the value for INCLUYE or NO_INCLUYE
//   const raw = obj[key] || obj[key.replace('_', ' ')] || '';
//   if (!raw) {
//     // Try from joined values
//     const joined = Object.entries(obj)
//       .filter(([k]) => k.startsWith(key.split('_')[0]))
//       .map(([k,v]) => v).join('\n');
//     return joined.split('\n').filter(l => l.match(/^-\s/)).map(l => l.replace(/^-\s*/, ''));
//   }
//   return raw.split('\n').filter(l => l.match(/^-\s/)).map(l => l.replace(/^-\s*/, ''));
// }

// function parseItems(obj) {
//   if (!obj) return [];
//   const joined = Object.values(obj).join('\n');
//   return joined.split('\n')
//     .filter(l => l.trim() && l.match(/^[-\d•·]/))
//     .map(l => l.replace(/^[-•·\d]+[\.\s]*/, '').trim())
//     .filter(l => l);
// }

// function parseEntregables(obj) {
//   if (!obj) return '<div class="error-msg">Sin datos</div>';
//   return Object.entries(obj).map(([k,v]) => {
//     const match = v.match(/(.+)\((.+)\)/);
//     const text = match ? match[1].trim() : v;
//     const date = match ? match[2].trim() : '';
//     return `
//       <div class="entregable">
//         <span class="e-code">${k}</span>
//         <div>
//           <div class="e-text">${text}</div>
//           ${date ? `<div class="e-date">📅 ${date}</div>` : ''}
//         </div>
//       </div>
//     `;
//   }).join('');
// }

// function parseCronograma(obj) {
//   if (!obj) return '';
//   return Object.entries(obj).map(([k,v]) => {
//     const match = v.match(/(.+):\s*(Semanas? .+)/i);
//     const name = match ? match[1].trim() : v.split(':')[0];
//     const weeks = match ? match[2].trim() : v.split(':')[1] || '';
//     return `
//       <div class="tl-item">
//         <div class="tl-phase">${k.replace(/_/g, ' ')}</div>
//         <div class="tl-name">${name}</div>
//         <div class="tl-weeks">${weeks}</div>
//       </div>
//     `;
//   }).join('');
// }

// function parseStakeholders(text) {
//   const stakeholders = [];
//   let current = null;
//   const lines = text.split('\n');
//   let inSection = false;

//   for (let line of lines) {
//     const trimmed = line.trim();
//     if (trimmed === '[INTERESADOS]') { inSection = true; continue; }
//     if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed !== '[INTERESADOS]') {
//       if (current) { stakeholders.push(current); current = null; }
//       inSection = false;
//       continue;
//     }
//     if (!inSection) continue;

//     if (trimmed === '---') {
//       if (current) { stakeholders.push(current); current = null; }
//       continue;
//     }

//     const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
//     if (kvMatch) {
//       if (!current) current = {};
//       current[kvMatch[1].trim()] = kvMatch[2].trim();
//     }
//   }
//   if (current) stakeholders.push(current);
//   return stakeholders;
// }

// // ═══════════════════════════════════════════════════
// // NAVIGATION
// // ═══════════════════════════════════════════════════

// const loaded = { acta: false, interesados: false, vision: false };

// function switchPage(pageId) {
//   // Update nav buttons
//   document.querySelectorAll('.nav-btn').forEach(btn => {
//     btn.classList.toggle('active', btn.dataset.page === pageId);
//   });

//   // Update sidebar links
//   document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
//     link.classList.toggle('active', link.dataset.page === pageId);
//   });

//   // Update pages
//   document.querySelectorAll('.page').forEach(p => {
//     p.classList.toggle('active', p.id === 'page-' + pageId);
//   });

//   // Lazy load
//   if (!loaded[pageId]) {
//     loaded[pageId] = true;
//     if (pageId === 'acta') renderActa();
//     if (pageId === 'interesados') renderInteresados();
//     if (pageId === 'vision') renderVision();
//   }
// }

// // Bind navigation
// document.querySelectorAll('.nav-btn, .sidebar-link[data-page]').forEach(el => {
//   el.addEventListener('click', () => switchPage(el.dataset.page));
// });

// // ═══════════════════════════════════════════════════
// // INIT
// // ═══════════════════════════════════════════════════
// loadConfig();
// loaded.acta = true;
// renderActa();










// ═══════════════════════════════════════════════════
// PARSER DE ARCHIVOS .TXT
// ═══════════════════════════════════════════════════

function parseTxt(text) {
  const result = {};
  let currentSection = null;
  let currentItem = null;
  let currentItems = [];

  const lines = text.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    // Section header [SECTION]
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      if (currentSection && currentItem) {
        if (!result[currentSection]) result[currentSection] = [];
        result[currentSection].push({...currentItem});
        currentItem = null;
      }
      currentSection = sectionMatch[1];
      if (!result[currentSection]) result[currentSection] = [];
      continue;
    }

    // Item separator
    if (line === '---') {
      if (currentSection && currentItem) {
        result[currentSection].push({...currentItem});
        currentItem = null;
      }
      continue;
    }

    // Key=Value
    const kvMatch = line.match(/^([^=]+)=(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();

      // Detect if this section has items (repeated keys)
      if (currentItem && currentItem[key] !== undefined) {
        result[currentSection].push({...currentItem});
        currentItem = {};
        currentItem[key] = val;
      } else if (!result[currentSection] || result[currentSection].length === 0) {
        // First item in section
        if (!currentItem) currentItem = {};
        currentItem[key] = val;
      } else {
        // Could be a simple key-value section or item
        if (!currentItem) currentItem = {};
        currentItem[key] = val;
      }
    }
  }

  // Flush last item
  if (currentSection && currentItem) {
    if (Array.isArray(result[currentSection])) {
      result[currentSection].push({...currentItem});
    }
  }

  return result;
}

// Parser para secciones clave=valor y texto plano
// Soporta:  clave=valor  y  texto sin "=" (guardado como _text)
function parseTxtFlat(text) {
  const result = {};
  let currentSection = null;
  const lines = text.split('\n');

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Encabezado de seccion [NOMBRE]
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }

    if (!currentSection) continue;

    // Linea con clave=valor
    const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      if (result[currentSection][key] !== undefined) {
        if (!Array.isArray(result[currentSection][key])) {
          result[currentSection][key] = [result[currentSection][key]];
        }
        result[currentSection][key].push(val);
      } else {
        result[currentSection][key] = val;
      }
    } else {
      // Texto plano sin "=" acumulado en _text
      if (result[currentSection]['_text']) {
        result[currentSection]['_text'] += ' ' + trimmed;
      } else {
        result[currentSection]['_text'] = trimmed;
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════
// LOADERS
// ═══════════════════════════════════════════════════

async function loadTxt(filename) {
  const resp = await fetch('content/' + filename);
  if (!resp.ok) throw new Error('No se pudo leer ' + filename);
  return await resp.text();
}

// ═══════════════════════════════════════════════════
// CONFIG LOADER
// ═══════════════════════════════════════════════════

async function loadConfig() {
  try {
    const text = await loadTxt('config.txt');
    const cfg = parseTxtFlat(text);
    const meta = cfg['META'] || {};
    const pages = cfg['PAGINAS'] || {};

    document.title = (meta.titulo || 'Wiki del Proyecto') + ' — Wiki';
    document.getElementById('header-meta').textContent =
      'v' + (meta.version_proyecto || '0.1.0') + ' · ' + (meta.fecha_inicio || '');
    document.getElementById('si-version').textContent = meta.version_proyecto || '—';
    document.getElementById('si-fecha').textContent = meta.fecha_inicio || '—';
    document.getElementById('si-inst').textContent = meta.institucion || '—';
    document.getElementById('repo-link').textContent = 'Git: ' + (meta.repositorio || '—');
    document.getElementById('footer-date').textContent = 'Inicio: ' + (meta.fecha_inicio || '—');
  } catch(e) {
    console.warn('Config no cargada:', e.message);
  }
}

// ═══════════════════════════════════════════════════
// RENDER: ACTA DE CONSTITUCIÓN
// ═══════════════════════════════════════════════════

async function renderActa() {
  try {
    const text = await loadTxt('acta-constitucion.txt');
    const data = parseTxtFlat(text);
    const meta = data['META'] || {};
    const obj = data['OBJETIVO_GENERAL'] || {};
    const oe = data['OBJETIVOS_ESPECIFICOS'] || {};
    const alcance = data['ALCANCE'] || {};
    const entregables = data['ENTREGABLES_ESPERADOS'] || {};
    const just = data['JUSTIFICACION'] || {};
    const restricciones = data['RESTRICCIONES'] || {};
    const supuestos = data['SUPUESTOS'] || {};
    const cronograma = data['CRONOGRAMA_RESUMEN'] || {};
    const firmas = data['FIRMAS'] || {};

    // Parse arrays
    const parseMulti = (obj) => Object.values(obj).join('\n').split('\n').filter(l => l.trim() && !l.match(/^\d+\./));
    const parseNumbered = (obj) => {
      const joined = typeof obj === 'string' ? obj : Object.values(obj).join('\n');
      return joined.split('\n').filter(l => l.match(/^\d+\./)).map(l => l.replace(/^\d+\.\s*/, ''));
    };

    const cronItems = Object.entries(cronograma).map(([k,v]) => {
      const phaseNum = k.replace('Fase_', '').replace('_', ' ');
      return { fase: k, texto: typeof v === 'string' ? v : v };
    });

    // Cronograma phases from text
    const cronLines = Object.entries(cronograma).map(([k,v]) => `${v}`);

    const html = `
      <div class="page-header">
        <div class="page-eyebrow">// Sprint 1 · Entregable 1</div>
        <h1 class="page-title">${meta.titulo || 'Acta de Constitución del Proyecto'}</h1>
        <div class="page-meta">
          <span>Fecha: ${meta.fecha || '—'}</span>
          <span>Versión: ${meta.version || '1.0'}</span>
          <span>Autor: ${meta.autor || '—'}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Objetivo General</div>
        <div class="highlight-box">${getVal(data, 'OBJETIVO_GENERAL') || '—'}</div>
      </div>

      <div class="section">
        <div class="section-title">Objetivos Específicos</div>
        <div class="section-body">
          <ol class="item-list">
            ${parseObjEsp(data['OBJETIVOS_ESPECIFICOS']).map(o => `<li>${o}</li>`).join('')}
          </ol>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Alcance del Proyecto</div>
        <div class="two-col">
          <div class="card">
            <div class="card-title">✅ Incluye</div>
            <div class="card-body">
              <ul class="bullet-list">
                ${parseAlcance(data['ALCANCE'], 'INCLUYE').map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          </div>
          <div class="card">
            <div class="card-title">🚫 No Incluye</div>
            <div class="card-body">
              <ul class="bullet-list">
                ${parseAlcance(data['ALCANCE'], 'NO_INCLUYE').map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Entregables Esperados</div>
        ${parseEntregables(data['ENTREGABLES_ESPERADOS'])}
      </div>

      <div class="section">
        <div class="section-title">Justificación</div>
        <div class="section-body">${getVal(data, 'JUSTIFICACION') || '—'}</div>
      </div>

      <div class="section">
        <div class="section-title">Restricciones y Supuestos</div>
        <div class="two-col">
          <div class="card">
            <div class="card-title">⚠️ Restricciones</div>
            <div class="card-body">
              <ul class="bullet-list">
                ${parseItems(data['RESTRICCIONES']).map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          </div>
          <div class="card">
            <div class="card-title">💡 Supuestos</div>
            <div class="card-body">
              <ul class="bullet-list">
                ${parseItems(data['SUPUESTOS']).map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Cronograma Resumido</div>
        <div class="timeline">
          ${parseCronograma(data['CRONOGRAMA_RESUMEN'])}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Aprobación y Firmas</div>
        <div class="card" style="max-width:400px;">
          ${Object.entries(data['FIRMAS'] || {}).map(([k,v]) => `
            <div class="info-row" style="margin-bottom:0.6rem;">
              <span class="info-key" style="font-size:0.72rem;">${k.replace(/_/g,' ')}</span>
              <span class="info-val" style="font-size:0.78rem;">${v}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('content-acta').innerHTML = html;
    document.getElementById('loading-acta').style.display = 'none';
    document.getElementById('content-acta').style.display = 'block';

  } catch(e) {
    document.getElementById('loading-acta').style.display = 'none';
    document.getElementById('content-acta').innerHTML = `<div class="error-msg">⚠ Error cargando acta-constitucion.txt: ${e.message}</div>`;
    document.getElementById('content-acta').style.display = 'block';
  }
}

// ═══════════════════════════════════════════════════
// RENDER: ANÁLISIS DE INTERESADOS
// ═══════════════════════════════════════════════════

async function renderInteresados() {
  try {
    const text = await loadTxt('analisis-interesados.txt');
    const data = parseTxtFlat(text);
    const meta = data['META'] || {};
    const desc = data['DESCRIPCION'] || {};
    const cuadrantes = data['CUADRANTES'] || {};
    const leyenda = data['LEYENDA_ESTRATEGIAS'] || {};

    // Parse stakeholders from text
    const stakeholders = parseStakeholders(text);

    const badgePoder = (v) => {
      const cls = v === 'Alto' ? 'badge-alto' : v === 'Medio' ? 'badge-medio' : 'badge-bajo';
      return `<span class="badge ${cls}">⚡ ${v}</span>`;
    };
    const badgeInteres = (v) => {
      const cls = v === 'Alto' ? 'badge-alto' : v === 'Medio' ? 'badge-medio' : 'badge-bajo';
      return `<span class="badge ${cls}">👁 ${v}</span>`;
    };
    const badgeTipo = (v) => {
      const cls = v === 'Interno' ? 'badge-interno' : 'badge-externo';
      return `<span class="badge ${cls}">${v}</span>`;
    };

    const shCards = stakeholders.map(sh => `
      <div class="stakeholder-card">
        <div class="sh-header">
          <span class="sh-id">${sh.ID || '—'}</span>
        </div>
        <div class="sh-name">${sh.Nombre || '—'}</div>
        <div class="sh-rol">${sh.Rol || '—'}</div>
        <div class="sh-badges">
          ${badgeTipo(sh.Tipo || '—')}
          ${badgePoder(sh.Poder || '—')}
          ${badgeInteres(sh.Interes || '—')}
        </div>
        <div class="sh-estrategia">📌 ${sh.Estrategia || '—'}</div>
      </div>
    `).join('');

    const cuadrantesHtml = `
      <div class="matrix-container">
        <div class="matrix-grid">
          <div class="matrix-header" style="background:transparent;"></div>
          <div class="matrix-header">INTERÉS BAJO</div>
          <div class="matrix-header">INTERÉS ALTO</div>

          <div class="matrix-label">PODER ALTO</div>
          <div class="matrix-cell matrix-q4">
            <div class="q-title" style="color:#ffd740;">Mantener Satisfechos</div>
            <div class="q-ids">${(cuadrantes.ALTO_PODER_BAJO_INTERES || '').split(',').join(' · ')}</div>
          </div>
          <div class="matrix-cell matrix-q1">
            <div class="q-title" style="color:var(--accent2);">Gestionar de Cerca</div>
            <div class="q-ids">${(cuadrantes.ALTO_PODER_ALTO_INTERES || '').split(',').join(' · ')}</div>
          </div>

          <div class="matrix-label">PODER BAJO</div>
          <div class="matrix-cell matrix-q3">
            <div class="q-title" style="color:var(--text-dim);">Monitorear</div>
            <div class="q-ids">${(cuadrantes.BAJO_PODER_BAJO_INTERES || '').split(',').join(' · ')}</div>
          </div>
          <div class="matrix-cell matrix-q2">
            <div class="q-title" style="color:var(--accent3);">Mantener Informados</div>
            <div class="q-ids">${(cuadrantes.BAJO_PODER_ALTO_INTERES || '').split(',').join(' · ')}</div>
          </div>
        </div>
      </div>
    `;

    const html = `
      <div class="page-header">
        <div class="page-eyebrow">// Sprint 1 · Entregable 2</div>
        <h1 class="page-title">${meta.titulo || 'Análisis de Interesados'}</h1>
        <div class="page-meta">
          <span>Fecha: ${meta.fecha || '—'}</span>
          <span>Versión: ${meta.version || '1.0'}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Descripción</div>
        <div class="section-body">${getVal(data, 'DESCRIPCION') || '—'}</div>
      </div>

      <div class="section">
        <div class="section-title">Matriz de Poder / Interés</div>
        ${cuadrantesHtml}
        <div style="font-size:0.72rem; color:var(--text-dim); margin-top:0.8rem; font-family:var(--mono);">
          Los códigos (S01, S02...) corresponden a los interesados detallados abajo.
        </div>
      </div>

      <div class="section">
        <div class="section-title">Interesados Identificados</div>
        <div class="stakeholder-grid">${shCards}</div>
      </div>

      <div class="section">
        <div class="section-title">Leyenda de Estrategias</div>
        <div style="display:grid; gap:0.6rem;">
          ${Object.entries(leyenda).map(([k,v]) => `
            <div class="card" style="display:flex; gap:1rem; align-items:flex-start;">
              <div style="font-family:var(--mono); font-size:0.65rem; color:var(--accent); min-width:160px;">${k.replace(/_/g,' ')}</div>
              <div style="font-size:0.83rem; color:var(--text);">${v}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('content-interesados').innerHTML = html;
    document.getElementById('loading-interesados').style.display = 'none';
    document.getElementById('content-interesados').style.display = 'block';

  } catch(e) {
    document.getElementById('loading-interesados').style.display = 'none';
    document.getElementById('content-interesados').innerHTML = `<div class="error-msg">⚠ Error: ${e.message}</div>`;
    document.getElementById('content-interesados').style.display = 'block';
  }
}

// ═══════════════════════════════════════════════════
// RENDER: VISIÓN DEL PROYECTO
// ═══════════════════════════════════════════════════

async function renderVision() {
  try {
    const text = await loadTxt('vision-proyecto.txt');
    const data = parseTxtFlat(text);
    const meta = data['META'] || {};

    const htmlKpis = Object.entries(data['INDICADORES_EXITO'] || {}).map(([k,v]) => `
      <div class="kpi-card">
        <div class="kpi-id">${k}</div>
        <div class="kpi-text">${v}</div>
      </div>
    `).join('');

    const htmlDiffs = Object.entries(data['DIFERENCIADORES_CLAVE'] || {}).map(([k,v]) => {
      const [title, ...rest] = v.split(':');
      return `
        <div class="diff-item">
          <div class="diff-num">${k}</div>
          <div class="diff-content">
            <div class="diff-title">${title.trim()}</div>
            <div class="diff-desc">${rest.join(':').trim()}</div>
          </div>
        </div>
      `;
    }).join('');

    const htmlContrib = Object.entries(data['CONTRIBUCION_ESTRATEGICA'] || {}).map(([k,v]) => `
      <div class="card">
        <div class="card-title">${k.replace(/_/g,' ')}</div>
        <div class="card-body">${v}</div>
      </div>
    `).join('');

    const htmlBeneficios = Object.entries(data['BENEFICIOS_ESPERADOS'] || {}).map(([k,v]) => `
      <div class="entregable">
        <span class="e-code">${k}</span>
        <div>
          <div class="e-text">${v}</div>
        </div>
      </div>
    `).join('');

    const htmlProblemas = Object.entries(data['PROBLEMA_QUE_RESUELVE'] || {}).map(([k,v]) => {
      if (!v || k === Object.keys(data['PROBLEMA_QUE_RESUELVE'])[0]) return '';
      const [title, ...rest] = v.split(':');
      return `
        <div class="diff-item" style="padding:0.6rem 0;">
          <div class="diff-num" style="font-size:1.5rem;">${k}</div>
          <div class="diff-content">
            <div class="diff-title">${title.trim()}</div>
            <div class="diff-desc">${rest.join(':').trim()}</div>
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <div class="page-header">
        <div class="page-eyebrow">// Sprint 1 · Entregable 3</div>
        <h1 class="page-title">${meta.titulo || 'Visión del Proyecto'}</h1>
        <div class="page-meta">
          <span>Fecha: ${meta.fecha || '—'}</span>
          <span>Versión: ${meta.version || '1.0'}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Declaración de Visión</div>
        <div class="highlight-box" style="font-size:1rem; line-height:1.8; color:var(--text-bright);">
          "${getVal(data, 'DECLARACION_VISION') || '—'}"
        </div>
      </div>

      <div class="section">
        <div class="section-title">Problema que Resuelve</div>
        <div class="section-body" style="margin-bottom:1rem;">${getFirstVal(data['PROBLEMA_QUE_RESUELVE'])}</div>
        ${htmlProblemas}
      </div>

      <div class="section">
        <div class="section-title">Solución Propuesta</div>
        <div class="section-body">
          <ul class="bullet-list">
            ${parseItems(data['SOLUCION_PROPUESTA']).map(i => `<li>${i}</li>`).join('')}
          </ul>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Contribución Estratégica</div>
        <div class="two-col">${htmlContrib}</div>
      </div>

      <div class="section">
        <div class="section-title">Beneficios Esperados</div>
        ${htmlBeneficios}
      </div>

      <div class="section">
        <div class="section-title">Indicadores de Éxito (KPIs)</div>
        <div class="kpi-grid">${htmlKpis}</div>
      </div>

      <div class="section">
        <div class="section-title">Diferenciadores Clave</div>
        ${htmlDiffs}
      </div>

      <div class="section">
        <div class="section-title">Visión Futura (3-5 años)</div>
        <div class="section-body">
          <ul class="bullet-list">
            ${parseItems(data['VISION_FUTURA']).map(i => `<li>${i}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;

    document.getElementById('content-vision').innerHTML = html;
    document.getElementById('loading-vision').style.display = 'none';
    document.getElementById('content-vision').style.display = 'block';

  } catch(e) {
    document.getElementById('loading-vision').style.display = 'none';
    document.getElementById('content-vision').innerHTML = `<div class="error-msg">⚠ Error: ${e.message}</div>`;
    document.getElementById('content-vision').style.display = 'block';
  }
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

// Retorna el texto de una sección: prioriza _text, luego concatena valores
function getVal(data, section) {
  const s = data[section];
  if (!s) return '';
  if (s['_text']) return s['_text'];
  return Object.entries(s)
    .filter(([k]) => k !== '_text')
    .map(([k, v]) => (Array.isArray(v) ? v.join('\n') : v))
    .join(' ');
}

// Retorna el primer valor de un objeto (útil para intro de sección)
function getFirstVal(obj) {
  if (!obj) return '';
  if (obj['_text']) return obj['_text'];
  return Object.values(obj)[0] || '';
}

// Parsea objetivos numerados (1. texto, 2. texto...)
function parseObjEsp(obj) {
  if (!obj) return [];
  const src = obj['_text']
    ? obj['_text']
    : Object.entries(obj).filter(([k]) => k !== '_text').map(([k,v]) => Array.isArray(v) ? v.join('\n') : v).join('\n');
  return src.split(/(?=\d+\.)/)
    .map(s => s.trim())
    .filter(s => s.match(/^\d+\./))
    .map(s => s.replace(/^\d+\.\s*/, '').trim());
}

// Parsea listas de alcance (líneas que empiezan con -)
function parseAlcance(obj, key) {
  if (!obj) return [];
  const raw = obj[key] || obj[key.replace('_', ' ')] || '';
  const src = raw || Object.entries(obj)
    .filter(([k]) => k !== '_text' && k.toUpperCase().startsWith(key.split('_')[0]))
    .map(([k, v]) => Array.isArray(v) ? v.join('\n') : v)
    .join('\n');
  return src.split('\n').filter(l => l.match(/^[-·•]\s/)).map(l => l.replace(/^[-·•]\s*/, '').trim());
}

// Parsea ítems genéricos (listas con -, números, bullets)
function parseItems(obj) {
  if (!obj) return [];
  const src = obj['_text']
    ? obj['_text']
    : Object.entries(obj).filter(([k]) => k !== '_text').map(([k,v]) => Array.isArray(v) ? v.join('\n') : v).join('\n');
  return src.split('.')
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

// Parsea entregables con código y fecha
function parseEntregables(obj) {
  if (!obj) return '<div class="error-msg">Sin datos</div>';
  return Object.entries(obj)
    .filter(([k]) => k !== '_text')
    .map(([k, v]) => {
      const val = Array.isArray(v) ? v[0] : v;
      const match = val.match(/(.+)\((.+)\)/);
      const text = match ? match[1].trim() : val;
      const date = match ? match[2].trim() : '';
      return `
        <div class="entregable">
          <span class="e-code">${k}</span>
          <div>
            <div class="e-text">${text}</div>
            ${date ? `<div class="e-date">📅 ${date}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
}

// Parsea cronograma en items de timeline
function parseCronograma(obj) {
  if (!obj) return '';
  return Object.entries(obj)
    .filter(([k]) => k !== '_text')
    .map(([k, v]) => {
      const val = Array.isArray(v) ? v[0] : v;
      const match = val.match(/(.+):\s*(Semanas? .+)/i);
      const name  = match ? match[1].trim() : val.split(':')[0];
      const weeks = match ? match[2].trim() : (val.split(':')[1] || '').trim();
      return `
        <div class="tl-item">
          <div class="tl-phase">${k.replace(/_/g, ' ')}</div>
          <div class="tl-name">${name}</div>
          <div class="tl-weeks">${weeks}</div>
        </div>
      `;
    }).join('');
}

function parseStakeholders(text) {
  const stakeholders = [];
  let current = null;
  const lines = text.split('\n');
  let inSection = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[INTERESADOS]') { inSection = true; continue; }
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed !== '[INTERESADOS]') {
      if (current) { stakeholders.push(current); current = null; }
      inSection = false;
      continue;
    }
    if (!inSection) continue;

    if (trimmed === '---') {
      if (current) { stakeholders.push(current); current = null; }
      continue;
    }

    const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (kvMatch) {
      if (!current) current = {};
      current[kvMatch[1].trim()] = kvMatch[2].trim();
    }
  }
  if (current) stakeholders.push(current);
  return stakeholders;
}

// ═══════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════

const loaded = { acta: false, interesados: false, vision: false };

function switchPage(pageId) {
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  // Update sidebar links
  document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === pageId);
  });

  // Update pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-' + pageId);
  });

  // Lazy load
  if (!loaded[pageId]) {
    loaded[pageId] = true;
    if (pageId === 'acta') renderActa();
    if (pageId === 'interesados') renderInteresados();
    if (pageId === 'vision') renderVision();
  }
}

// Bind navigation
document.querySelectorAll('.nav-btn, .sidebar-link[data-page]').forEach(el => {
  el.addEventListener('click', () => switchPage(el.dataset.page));
});

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
loadConfig();
loaded.acta = true;
renderActa();