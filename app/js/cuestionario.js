/**
 * cuestionario.js — "Lo que el agente no ve"
 * ─────────────────────────────────────────────────────────────
 * Paso 1: casillas con las tecnologías más usadas por PYMEs
 *         (../data/cuestionario-tecnologias.json) + buscador sobre el
 *         catálogo completo del modelo (../data/tech-catalog.json).
 * Paso 2: una fila por tecnología con respuestas prellenadas que se
 *         cambian con un clic (Sí/No) y la importancia en 4 botones.
 * Paso 3: guarda el escaneo en Supabase, lo analiza con la API y abre
 *         el dashboard.
 *
 * Preguntas que ya NO se hacen (se derivan):
 *   - impacto en integridad/disponibilidad y sensibilidad → de la importancia
 *     (mismo criterio que usa el agente en ml/mapeo_agente.py)
 *   - reference_count → 1 (ningún cliente sabe responderla)
 * ─────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase-client.js';
import { requerirSesion, obtenerEmpresaActual, tieneAutorizacionVigente } from './auth.js';
import { API_URL, RUTAS } from './config.js';
import { el, mostrarAlerta, traducirError } from './ui.js';

const MAX_TECNOLOGIAS = 50;              // límite de la API por escaneo
const PREGUNTAS = [
  { id: 'internet',     texto: 'Visible desde internet', ayuda: 'Se puede abrir desde fuera de la empresa sin VPN' },
  { id: 'navegador',    texto: 'Se usa en el navegador', ayuda: 'Tiene una página web o panel de administración' },
  { id: 'login',        texto: 'Pide contraseña',        ayuda: 'Hay que iniciar sesión para usarlo' },
  { id: 'dispositivos', texto: 'Controla equipos',       ayuda: 'Maneja equipos físicos: red, cámaras, máquinas' }
];
const IMPORTANCIA = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };
/* importancia → (sensibilidad de datos, impacto integridad, impacto disponibilidad) */
const DERIVADAS = {
  low: ['internal', 'low', 'low'], medium: ['internal', 'medium', 'medium'],
  high: ['confidential', 'high', 'high'], critical: ['confidential', 'high', 'high']
};
const RESPUESTAS_BUSQUEDA = { internet: false, navegador: false, login: true, dispositivos: false };

const $ = id => document.getElementById(id);
const alerta = $('alerta');

let empresa = null;
let catalogo = [];                 // [{vendor, product, cat, nombre, texto}]
const rapidas = new Map();         // clave → tecnología del JSON (casillas)
const seleccion = new Map();       // clave → { clave, nombre, vendor, product, grupo, respuestas, importancia }
const clave = (vendor, product) => `${vendor}|${product}`;

/* ═════════════ Arranque ═════════════ */
(async function iniciar() {
  try {
    await requerirSesion();
    empresa = await obtenerEmpresaActual();
    if (!empresa || !(await tieneAutorizacionVigente(empresa.id))) {
      return window.location.replace(RUTAS.onboarding);
    }
    $('nombre-empresa').textContent = empresa.nombre;
    if (!['dueno', 'admin'].includes(empresa.rol)) {
      mostrarAlerta(alerta, 'Tu rol es de solo lectura: puedes ver el cuestionario, pero no enviar análisis.', 'info');
    }

    const [lista, cat] = await Promise.all([
      fetch('../data/cuestionario-tecnologias.json').then(r => r.json()),
      fetch('../data/tech-catalog.json').then(r => r.json())
    ]);
    pintarGrupos(lista.grupos);
    prepararCatalogo(cat.catalog);
    pintarRespuestas();
  } catch (err) {
    if (!String(err.message).startsWith('Sin sesión')) mostrarAlerta(alerta, traducirError(err));
  }
})();

/* ═════════════ Paso 1: casillas ═════════════ */
function pintarGrupos(grupos) {
  $('grupos').replaceChildren(...grupos.map(g => el('fieldset', { class: 'app-grupo' },
    el('legend', {}, el('strong', { class: 'app-text-bright' }, g.titulo), el('span', { class: 'app-muted app-small' }, ` · ${g.descripcion}`)),
    el('div', { class: 'app-chips' }, g.tecnologias.map(t => {
      const k = clave(t.vendor, t.product);
      rapidas.set(k, { ...t, grupo: g.titulo });
      const caja = el('input', { type: 'checkbox', value: k });
      caja.addEventListener('change', () => {
        if (caja.checked) agregar({ ...rapidas.get(k), respuestas: { ...t.respuestas } });
        else quitar(k);
      });
      return el('label', { class: 'app-chip', title: t.ayuda || '' },
        caja, el('span', {}, t.nombre), t.ayuda ? el('small', {}, t.ayuda) : null);
    })))));
}

/* ═════════════ Buscador del catálogo completo ═════════════ */
const normalizar = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-./]+/g, ' ');

function nombreLegible(vendor, product) {
  const texto = product.replace(/\\/g, '').split(/[_\s]+/).filter(Boolean)
    .map(p => /^\d+h\d$/.test(p) ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)).join(' ');
  return vendor && vendor !== 'Unknown' && !texto.toLowerCase().startsWith(vendor.split(' ')[0].toLowerCase())
    ? `${vendor.split(' /')[0]} ${texto}` : texto;
}

function prepararCatalogo(entradas) {
  catalogo = entradas.flatMap(e => e.products.map(p => {
    const nombre = nombreLegible(e.vendor, p);
    return { vendor: e.vendor, product: p, cat: e.cat, nombre, texto: normalizar(`${nombre} ${e.vendor} ${p}`) };
  }));
  let espera;
  $('buscar').addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(buscar, 150);
  });
}

function buscar() {
  const q = normalizar($('buscar').value.trim());
  const cont = $('resultados');
  if (q.length < 2) { cont.replaceChildren(); return; }
  const palabras = q.split(/\s+/);
  const encontrados = catalogo.filter(c => palabras.every(p => c.texto.includes(p))).slice(0, 15);
  if (!encontrados.length) {
    cont.replaceChildren(el('p', { class: 'app-muted app-small' },
      'No está en el catálogo del modelo. Cuando conectemos la base de vulnerabilidades (CVE) se podrá analizar.'));
    return;
  }
  cont.replaceChildren(...encontrados.map(c => {
    const k = clave(c.vendor, c.product);
    const ya = seleccion.has(k);
    const b = el('button', { type: 'button', class: 'app-resultado', disabled: ya },
      el('span', {}, `${ya ? '✔' : '+'} ${c.nombre}`),
      el('small', { class: 'app-muted' }, c.vendor === 'Unknown' ? c.product : c.vendor));
    b.addEventListener('click', () => {
      const rapida = rapidas.get(k);
      agregar(rapida
        ? { ...rapida, respuestas: { ...rapida.respuestas } }
        : { nombre: c.nombre, vendor: c.vendor, product: c.product, grupo: 'Agregada desde el buscador',
            respuestas: { ...RESPUESTAS_BUSQUEDA }, importancia: 'medium' });
      buscar();
    });
    return b;
  }));
}

/* ═════════════ Selección ═════════════ */
function agregar(t) {
  const k = clave(t.vendor, t.product);
  if (seleccion.has(k)) return;
  if (seleccion.size >= MAX_TECNOLOGIAS) {
    mostrarAlerta(alerta, `Máximo ${MAX_TECNOLOGIAS} tecnologías por análisis.`);
    sincronizarCasilla(k, false);
    return;
  }
  seleccion.set(k, { clave: k, nombre: t.nombre, vendor: t.vendor, product: t.product, grupo: t.grupo,
                     respuestas: t.respuestas, importancia: t.importancia || 'medium' });
  sincronizarCasilla(k, true);
  pintarRespuestas();
}

function quitar(k) {
  seleccion.delete(k);
  sincronizarCasilla(k, false);
  pintarRespuestas();
}

function sincronizarCasilla(k, marcada) {
  const caja = document.querySelector(`.app-chip input[value="${CSS.escape(k)}"]`);
  if (caja) caja.checked = marcada;
}

/* ═════════════ Paso 2: respuestas ═════════════ */
function pintarRespuestas() {
  const cont = $('respuestas');
  const items = [...seleccion.values()];
  $('contador').textContent = `${items.length} ${items.length === 1 ? 'tecnología seleccionada' : 'tecnologías seleccionadas'}`;
  $('btn-analizar').disabled = !items.length || !['dueno', 'admin'].includes(empresa?.rol);

  if (!items.length) {
    cont.replaceChildren(el('p', { class: 'app-empty' }, 'Marca al menos una tecnología en el paso 1.'));
    return;
  }
  cont.replaceChildren(
    el('div', { class: 'app-filas' },
      el('div', { class: 'app-fila app-fila--cabecera', 'aria-hidden': 'true' },
        el('span', {}, 'Tecnología'),
        ...PREGUNTAS.map(p => el('span', { title: p.ayuda }, p.texto)),
        el('span', {}, 'Importancia para el negocio'), el('span', {})),
      items.map(filaRespuestas)));
}

function filaRespuestas(t) {
  const interruptores = PREGUNTAS.map(p => {
    const b = el('button', { type: 'button', class: 'app-toggle', 'aria-pressed': String(t.respuestas[p.id]),
                             'aria-label': `${p.texto}: ${t.nombre}`, title: p.ayuda },
      el('span', { class: 'app-toggle__movil' }, p.texto), t.respuestas[p.id] ? 'Sí' : 'No');
    b.addEventListener('click', () => {
      t.respuestas[p.id] = !t.respuestas[p.id];
      b.setAttribute('aria-pressed', String(t.respuestas[p.id]));
      b.lastChild.textContent = t.respuestas[p.id] ? 'Sí' : 'No';
    });
    return b;
  });

  const segmentos = el('div', { class: 'app-segmentos', role: 'radiogroup', 'aria-label': `Importancia de ${t.nombre}` },
    Object.entries(IMPORTANCIA).map(([valor, texto]) => {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(t.importancia === valor),
                               class: `app-seg app-seg--${valor}` }, texto);
      b.addEventListener('click', () => {
        t.importancia = valor;
        b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      });
      return b;
    }));

  const quitarBtn = el('button', { type: 'button', class: 'app-quitar', 'aria-label': `Quitar ${t.nombre}`, title: 'Quitar' }, '✕');
  quitarBtn.addEventListener('click', () => quitar(t.clave));

  return el('div', { class: 'app-fila' },
    el('div', { class: 'app-fila__nombre' }, el('strong', { class: 'app-text-bright' }, t.nombre),
      el('span', { class: 'app-muted app-small' }, t.grupo)),
    ...interruptores, segmentos, quitarBtn);
}

$('importancia-todas').addEventListener('change', e => {
  if (!e.target.value) return;
  seleccion.forEach(t => { t.importancia = e.target.value; });
  pintarRespuestas();
  e.target.value = '';
});

/* ═════════════ Paso 3: analizar ═════════════ */
function construirPayload() {
  return [...seleccion.values()].map(t => {
    const [sensibilidad, integridad, disponibilidad] = DERIVADAS[t.importancia];
    return {
      vendor: t.vendor,
      products: [t.product],
      accessible_from_browser: t.respuestas.navegador,
      internet_exposed: t.respuestas.internet,
      internal_use: !t.respuestas.internet,
      controls_devices: t.respuestas.dispositivos,
      requires_login: t.respuestas.login,
      business_criticality: t.importancia,
      data_sensitivity: sensibilidad,
      integrity_impact: integridad,
      availability_impact: disponibilidad,
      reference_count: 1
    };
  });
}

function cargando(visible, texto = '') {
  $('cargando').hidden = !visible;
  $('cargando-texto').textContent = texto;
}

$('btn-analizar').addEventListener('click', async () => {
  const payload = construirPayload();
  if (!payload.length) return;
  $('btn-analizar').disabled = true;
  cargando(true, 'Guardando…');

  /* 1. Guardar (RLS exige dueño/admin y autorización vigente) */
  const { data: escaneo, error } = await supabase.from('escaneos')
    .insert({ empresa_id: empresa.id, origen: 'cuestionario', payload })
    .select('id').single();
  if (error) {
    cargando(false);
    $('btn-analizar').disabled = false;
    return mostrarAlerta(alerta, 'No se pudo guardar el análisis: ' + traducirError(error));
  }

  /* 2. Analizar con la API y abrir el dashboard */
  cargando(true, `Analizando ${payload.length} ${payload.length === 1 ? 'tecnología' : 'tecnologías'} con el modelo…`);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${API_URL}/api/escaneos/${escaneo.id}/analizar`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.error || `Error del servidor (${resp.status}).`);
    window.location.href = RUTAS.dashboard;
  } catch (err) {
    cargando(false);
    $('btn-analizar').disabled = false;
    const sinApi = err instanceof TypeError;
    mostrarAlerta(alerta, (sinApi
      ? `No se pudo conectar con la API (${API_URL}). ¿Está corriendo?`
      : err.message) + ' El análisis quedó guardado como pendiente: puedes reintentarlo desde el historial del dashboard.');
  }
});
