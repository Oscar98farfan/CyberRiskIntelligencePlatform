/**
 * dashboard.js
 * ─────────────────────────────────────────────────────────────
 * Carga y pinta el dashboard de la empresa activa.
 * Todas las consultas pasan por RLS: Supabase solo devuelve filas
 * de empresas en las que el usuario es miembro.
 *
 * Datos que usa:
 *   escaneos   → historial, último escaneo y evolución
 *   hallazgos  → del último escaneo completado (priorizados por tier/score)
 *   activos    → inventario de equipos (criticidad y exposición editables)
 *
 * Acciones:
 *   "Agregar equipo" → POST {API_URL}/api/agentes → código de enlace para el agente .exe
 * ─────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase-client.js';
import {
  requerirSesion, listarMisEmpresas, obtenerEmpresaActual,
  fijarEmpresaActual, tieneAutorizacionVigente, cerrarSesion
} from './auth.js';
import { RUTAS, API_URL } from './config.js';
import { el, mostrarAlerta, formatearFecha, traducirError } from './ui.js';

/* Niveles de riesgo del modelo (mismo criterio que pages/CyberRisk.html) */
const NIVELES = {
  1: { label: 'Bajo', cls: 'green' },
  2: { label: 'Medio', cls: 'cyan' },
  3: { label: 'Alto', cls: 'amber' },
  4: { label: 'Crítico', cls: 'red' },
  5: { label: 'Crítico', cls: 'red' }
};
const nivel = t => NIVELES[t] || { label: '—', cls: 'muted' };

const ESTADOS = {
  pendiente: 'Pendiente', procesando: 'Procesando',
  completado: 'Completado', error: 'Con error'
};
const ROLES = { dueno: 'Dueño', admin: 'Administrador', lector: 'Lector' };
/* Valores de la base de datos (sin tildes) → texto para mostrar */
const TIPOS = {
  servidor: 'Servidor', estacion: 'Estación', portatil: 'Portátil',
  red: 'Equipo de red', nube: 'Nube', otro: 'Otro'
};
const CRITICIDAD = {
  baja: { label: 'Baja', cls: 'green' }, media: { label: 'Media', cls: 'cyan' },
  alta: { label: 'Alta', cls: 'amber' }, critica: { label: 'Crítica', cls: 'red' }
};

const $ = id => document.getElementById(id);
let empresaActual = null;
const puedeEditar = () => ['dueno', 'admin'].includes(empresaActual?.rol);
const alerta = $('alerta');

document.getElementById('btn-salir').addEventListener('click', cerrarSesion);

/* ═════════════════════════ ARRANQUE ═════════════════════════ */
(async function iniciar() {
  try {
    const sesion = await requerirSesion();
    const usuario = sesion.user;
    $('usuario').textContent = usuario.user_metadata?.nombre || usuario.email;

    const empresa = await obtenerEmpresaActual();
    if (!empresa || !(await tieneAutorizacionVigente(empresa.id))) {
      return window.location.replace(RUTAS.onboarding);
    }
    empresaActual = empresa;
    await pintarSelectorEmpresas(empresa);
    if (puedeEditar()) {
      $('btn-agregar-equipo').hidden = false;
      $('btn-agregar-equipo').addEventListener('click', agregarEquipo);
    }
    await cargarDashboard(empresa);
  } catch (err) {
    if (!String(err.message).startsWith('Sin sesión')) mostrarAlerta(alerta, traducirError(err));
  }
})();

/** Si el usuario tiene varias empresas, muestra un selector */
async function pintarSelectorEmpresas(actual) {
  const empresas = await listarMisEmpresas();
  $('nombre-empresa').textContent = actual.nombre;
  $('rol-usuario').textContent = ROLES[actual.rol] || actual.rol;
  /* Solo dueño/admin pueden lanzar escaneos */
  if (!['dueno', 'admin'].includes(actual.rol)) $('btn-nuevo-escaneo').hidden = true;

  if (empresas.length < 2) return;
  const sel = $('sel-empresa');
  sel.replaceChildren(...empresas.map(e =>
    el('option', { value: e.id, selected: e.id === actual.id }, e.nombre)));
  sel.hidden = false;
  $('nombre-empresa').hidden = true;
  sel.addEventListener('change', () => {
    fijarEmpresaActual(sel.value);
    window.location.reload();
  });
}

/* ═════════════════════════ DATOS ═════════════════════════ */
async function cargarDashboard(empresa) {
  /* Consultas en paralelo */
  const [escaneosRes, activosRes] = await Promise.all([
    supabase.from('escaneos')
      .select('id, creado_en, completado_en, origen, estado, resumen, activo:activos (nombre)')
      .eq('empresa_id', empresa.id)
      .order('creado_en', { ascending: false })
      .limit(30),
    supabase.from('activos')
      .select('id, nombre, tipo, sistema_operativo, version_so, criticidad, expuesto_internet, ultimo_escaneo')
      .eq('empresa_id', empresa.id)
      .order('nombre', { ascending: true })
  ]);
  if (escaneosRes.error) throw escaneosRes.error;
  if (activosRes.error) throw activosRes.error;

  const escaneos = escaneosRes.data;
  const activos = activosRes.data;
  const completados = escaneos.filter(e => e.estado === 'completado');
  const ultimo = completados[0] || null;
  const anterior = completados[1] || null;

  /* Hallazgos del último y del anterior escaneo completado (para comparar) */
  const [hallUltimo, hallAnterior] = await Promise.all([
    ultimo ? cargarHallazgos(ultimo.id) : [],
    anterior ? cargarHallazgos(anterior.id) : []
  ]);

  pintarKpis({ escaneos, activos, ultimo, hallUltimo, hallAnterior });
  pintarHallazgos(hallUltimo, ultimo);
  pintarEvolucion(completados);
  pintarActivos(activos);
  pintarHistorial(escaneos);
}

async function cargarHallazgos(escaneoId) {
  const { data, error } = await supabase.from('hallazgos')
    .select('id, vendor, producto, cwe, severidad, tier, score, activo:activos (nombre)')
    .eq('escaneo_id', escaneoId)
    .order('tier', { ascending: false })
    .order('score', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

/* ═════════════════════════ PINTADO ═════════════════════════ */

function pintarKpis({ escaneos, activos, ultimo, hallUltimo, hallAnterior }) {
  $('kpi-activos').textContent = activos.length;
  $('kpi-escaneos').textContent = escaneos.length;

  if (!ultimo) {
    $('ultimo-escaneo').textContent = escaneos.length
      ? 'Tienes escaneos en proceso. Los resultados aparecerán aquí.'
      : 'Aún no hay escaneos. Pulsa "+ Nuevo escaneo" para hacer el primero.';
    $('kpi-nivel').textContent = 'Sin datos';
    $('kpi-criticos').textContent = '—';
    return;
  }

  $('ultimo-escaneo').textContent = `Último análisis: ${formatearFecha(ultimo.completado_en || ultimo.creado_en)}`;

  const tierMax = Math.max(0, ...hallUltimo.map(h => h.tier || 0));
  const n = nivel(tierMax);
  const kNivel = $('kpi-nivel');
  kNivel.textContent = n.label;
  kNivel.className = `app-kpi__val app-c-${n.cls}`;
  $('kpi-nivel-sub').textContent = `${hallUltimo.length} hallazgos en total`;

  const criticos = hallUltimo.filter(h => h.tier >= 4).length;
  $('kpi-criticos').textContent = criticos;
  $('kpi-criticos').className = `app-kpi__val ${criticos ? 'app-c-red' : 'app-c-green'}`;

  /* Comparación con el escaneo anterior */
  if (hallAnterior.length) {
    const antes = hallAnterior.filter(h => h.tier >= 4).length;
    const delta = criticos - antes;
    $('kpi-criticos-sub').textContent =
      delta === 0 ? 'igual que el escaneo anterior'
        : delta < 0 ? `▼ ${Math.abs(delta)} menos que el anterior`
          : `▲ ${delta} más que el anterior`;
  }
}

function pintarHallazgos(hallazgos, ultimo) {
  const cont = $('hallazgos');
  if (!ultimo) {
    cont.replaceChildren(vacio('Todavía no hay hallazgos. Aparecerán después de tu primer escaneo.'));
    return;
  }
  if (!hallazgos.length) {
    cont.replaceChildren(vacio('Tu último escaneo no encontró hallazgos. ¡Buen trabajo!'));
    return;
  }
  const filas = hallazgos.slice(0, 10).map((h, i) => {
    const n = nivel(h.tier);
    return el('tr', {},
      el('td', { class: 'app-num' }, String(i + 1)),
      el('td', {},
        el('div', { class: 'app-text-bright' }, [h.vendor, h.producto].filter(Boolean).join(' · ') || '—'),
        el('div', { class: 'app-muted app-small' }, h.cwe || '')),
      el('td', {}, h.activo?.nombre || '—'),
      el('td', {}, el('span', { class: `app-badge app-badge--${n.cls}` }, n.label)),
      el('td', { class: 'app-num' }, h.score != null ? Number(h.score).toFixed(2) : '—'));
  });
  cont.replaceChildren(tabla(['#', 'Tecnología / falla', 'Activo', 'Nivel', 'Score'], filas));
}

/** Barras simples: nivel máximo y hallazgos críticos por escaneo (más antiguo → reciente) */
function pintarEvolucion(completados) {
  const cont = $('evolucion');
  if (completados.length < 2) {
    cont.replaceChildren(vacio('Con dos o más escaneos verás aquí cómo cambia tu riesgo en el tiempo.'));
    return;
  }
  const serie = completados.slice(0, 8).reverse();
  const filas = serie.map(e => {
    const tier = e.resumen?.tier_max ?? 0;
    const n = nivel(tier);
    return el('div', { class: 'app-evo' },
      el('span', { class: 'app-evo__fecha app-muted app-small' }, formatearFecha(e.completado_en || e.creado_en, true)),
      el('div', { class: 'app-evo__bar' },
        el('div', { class: `app-evo__fill app-bg-${n.cls}`, style: `width:${(tier / 4) * 100}%` })),
      el('span', { class: `app-small app-c-${n.cls}` }, n.label));
  });
  cont.replaceChildren(...filas);
}

function pintarActivos(activos) {
  const cont = $('activos');
  if (!activos.length) {
    cont.replaceChildren(vacio(puedeEditar()
      ? 'Aún no hay equipos. Pulsa «+ Agregar equipo» e instala el agente en tu primer equipo.'
      : 'Aún no hay equipos registrados.'));
    return;
  }
  const editable = puedeEditar();
  const filas = activos.map(a => el('tr', {},
    el('td', { class: 'app-text-bright' }, a.nombre),
    el('td', {}, TIPOS[a.tipo] || a.tipo),
    el('td', {}, [a.sistema_operativo, a.version_so].filter(Boolean).join(' ') || '—'),
    el('td', {}, editable ? selectorCriticidad(a) : el('span', { class: `app-c-${CRITICIDAD[a.criticidad]?.cls || 'muted'}` },
      CRITICIDAD[a.criticidad]?.label || a.criticidad)),
    el('td', {}, editable ? casillaExpuesto(a) : (a.expuesto_internet ? 'Sí' : 'No')),
    el('td', { class: 'app-nowrap' }, formatearFecha(a.ultimo_escaneo, true))));
  cont.replaceChildren(
    tabla(['Equipo', 'Tipo', 'Sistema', 'Criticidad', 'Expuesto a internet', 'Último escaneo'], filas),
    editable ? el('p', { class: 'app-muted app-small app-nota' },
      'La criticidad y la exposición se tienen en cuenta en el próximo escaneo del equipo.') : null);
}

/* ── Edición de activos (RLS solo lo permite a dueño/admin) ── */
async function actualizarActivo(id, cambios, control, valorAnterior) {
  control.disabled = true;
  const { error } = await supabase.from('activos').update(cambios).eq('id', id);
  control.disabled = false;
  if (error) {
    if (control.type === 'checkbox') control.checked = valorAnterior; else control.value = valorAnterior;
    mostrarAlerta(alerta, 'No se pudo guardar el cambio: ' + traducirError(error));
  }
}

function selectorCriticidad(activo) {
  const sel = el('select', { class: 'app-select app-select--sm', 'aria-label': `Criticidad de ${activo.nombre}` },
    Object.entries(CRITICIDAD).map(([valor, c]) => el('option', { value: valor, selected: valor === activo.criticidad }, c.label)));
  let anterior = activo.criticidad;
  sel.addEventListener('change', async () => {
    await actualizarActivo(activo.id, { criticidad: sel.value }, sel, anterior);
    anterior = sel.value;
  });
  return sel;
}

function casillaExpuesto(activo) {
  const caja = el('input', { type: 'checkbox', class: 'app-checkbox', checked: !!activo.expuesto_internet,
    'aria-label': `¿${activo.nombre} está expuesto a internet?` });
  caja.addEventListener('change', () =>
    actualizarActivo(activo.id, { expuesto_internet: caja.checked }, caja, !caja.checked));
  return caja;
}

/* ── Agregar equipo: pide a la API un código de enlace de un solo uso ── */
async function agregarEquipo() {
  const boton = $('btn-agregar-equipo');
  const panel = $('panel-codigo');
  boton.disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${API_URL}/api/agentes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ empresa_id: empresaActual.id })
    });
    const datos = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(datos.error || `Error del servidor (${resp.status}).`);

    const copiar = el('button', { type: 'button', class: 'app-btn app-btn--ghost' }, 'Copiar');
    copiar.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(datos.codigo); copiar.textContent = 'Copiado ✔'; }
      catch { copiar.textContent = 'Cópialo manualmente'; }
    });
    const cerrar = el('button', { type: 'button', class: 'app-link' }, 'Cerrar');
    cerrar.addEventListener('click', () => { panel.hidden = true; });

    panel.replaceChildren(
      el('div', { class: 'app-codigo__fila' },
        el('div', {},
          el('div', { class: 'app-kpi__label' }, 'Código de enlace'),
          el('div', { class: 'app-codigo__valor' }, datos.codigo)),
        copiar),
      el('ol', { class: 'app-codigo__pasos' },
        el('li', {}, 'En el equipo a analizar, abre ', el('strong', {}, 'CyberRisk-Agente.exe'), '.'),
        el('li', {}, 'Pega este código y pulsa «Enlazar equipo».'),
        el('li', {}, 'Pulsa «Escanear», revisa lo recolectado y envíalo.')),
      el('p', { class: 'app-muted app-small' },
        `Un solo uso · vence el ${formatearFecha(datos.expira)} · al recargar esta página ya no se vuelve a mostrar.`),
      cerrar);
    panel.hidden = false;
  } catch (err) {
    const sinApi = err instanceof TypeError;   // fetch falló: la API no responde
    mostrarAlerta(alerta, sinApi
      ? `No se pudo conectar con la API de CyberRisk (${API_URL}). ¿Está corriendo?`
      : err.message);
  } finally {
    boton.disabled = false;
  }
}

function pintarHistorial(escaneos) {
  const cont = $('historial');
  if (!escaneos.length) {
    cont.replaceChildren(vacio('Sin escaneos todavía.'));
    return;
  }
  const filas = escaneos.map(e => {
    const n = nivel(e.resumen?.tier_max);
    return el('tr', {},
      el('td', { class: 'app-nowrap' }, formatearFecha(e.creado_en, true)),
      el('td', {}, e.origen === 'agente' ? 'Agente' : 'Cuestionario'),
      el('td', {}, e.activo?.nombre || 'Toda la empresa'),
      el('td', {}, el('span', { class: `app-badge app-badge--${e.estado === 'error' ? 'red' : 'muted'}` },
        ESTADOS[e.estado] || e.estado)),
      el('td', {}, e.estado === 'completado' ? el('span', { class: `app-c-${n.cls}` }, n.label) : '—'));
  });
  cont.replaceChildren(tabla(['Fecha', 'Origen', 'Alcance', 'Estado', 'Nivel'], filas));
}

/* ── Helpers de pintado ── */
function tabla(encabezados, filas) {
  return el('div', { class: 'app-table-wrap' },
    el('table', { class: 'app-table' },
      el('thead', {}, el('tr', {}, encabezados.map(h => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, filas)));
}
function vacio(texto) {
  return el('p', { class: 'app-empty' }, texto);
}
