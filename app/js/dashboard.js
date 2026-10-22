/**
 * dashboard.js
 * ─────────────────────────────────────────────────────────────
 * Dashboard de la empresa activa. Todas las consultas pasan por RLS:
 * Supabase solo devuelve datos de empresas en las que el usuario es miembro.
 *
 * Idea central — "estado actual":
 *   Se toma el ÚLTIMO escaneo completado de CADA equipo (y el último del
 *   cuestionario manual). Sus hallazgos se agrupan por tecnología + equipo,
 *   para hablar de problemas ("Chrome en PC-CAJA") y no de escenarios sueltos.
 *
 * Textos (niveles, fallas, acciones): data/recomendaciones.json
 * Acciones contra la API: agregar equipo (código del agente) y reintentar
 * escaneos pendientes o con error.
 * ─────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase-client.js';
import {
  requerirSesion, listarMisEmpresas, obtenerEmpresaActual,
  fijarEmpresaActual, tieneAutorizacionVigente, cerrarSesion
} from './auth.js';
import { RUTAS, API_URL, API_HEADERS } from './config.js';
import { el, mostrarAlerta, formatearFecha, traducirError } from './ui.js';

/* ═════════════ Constantes de presentación ═════════════ */
const CLASE_NIVEL = { 1: 'green', 2: 'cyan', 3: 'amber', 4: 'red', 5: 'red' };
const ESTADOS = { pendiente: 'Pendiente', procesando: 'Procesando', completado: 'Completado', error: 'Con error' };
const ROLES = { dueno: 'Dueño', admin: 'Administrador', lector: 'Lector' };
const TIPOS = { servidor: 'Servidor', estacion: 'Estación', portatil: 'Portátil', red: 'Equipo de red', nube: 'Nube', otro: 'Otro' };
const CRITICIDAD = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };
const CLAVE_MANUAL = 'cuestionario';          // agrupa los escaneos sin equipo (cuestionario)
const NOMBRE_MANUAL = 'Nube y equipos sin agente';
const MAX_PRIORIDADES = 8;

/** Nombre corto en español de cada tipo de falla (el modelo las da en inglés) */
const NOMBRE_FALLA = {
  'Command Injection': 'Inyección de comandos', 'Database Injection': 'Inyección en base de datos',
  'Xss Injection': 'Scripts maliciosos en páginas (XSS)', 'Information Disclosure': 'Fuga de información',
  'Authentication': 'Fallas de autenticación', 'Authorization': 'Fallas de autorización',
  'Access Control': 'Control de acceso débil', 'Privilege Management': 'Escalada de privilegios',
  'Buffer Overflow': 'Desbordamiento de memoria', 'Memory Corruption': 'Corrupción de memoria',
  'Resource Exhaustion': 'Saturación del servicio', 'Input Validation': 'Validación de datos débil',
  'Path Traversal': 'Acceso indebido a archivos', 'Unrestricted Upload': 'Subida de archivos peligrosos'
};

const $ = id => document.getElementById(id);
const alerta = $('alerta');

let empresaActual = null;
let TEXTOS = { niveles: {}, fallas: {}, categorias: {} };   // data/recomendaciones.json
const datos = { escaneos: [], activos: [], vigentes: new Map(), grupos: [] };

const puedeEditar = () => ['dueno', 'admin'].includes(empresaActual?.rol);
const claseNivel = t => CLASE_NIVEL[t] || 'muted';
const textoNivel = t => TEXTOS.niveles[String(Math.min(t || 0, 4))] || {};
const nombreNivel = t => textoNivel(t).nombre || 'Sin datos';
const categoria = c => TEXTOS.categorias[c] || TEXTOS.categorias._por_defecto || { nombre: 'Tecnología', acciones: [] };
const traducirFalla = f => NOMBRE_FALLA[f] || f;

/* ═════════════ Arranque ═════════════ */
$('btn-salir').addEventListener('click', cerrarSesion);
$('detalle-cerrar').addEventListener('click', () => $('detalle').close());

(async function iniciar() {
  try {
    const sesion = await requerirSesion();
    $('usuario').textContent = sesion.user.user_metadata?.nombre || sesion.user.email;

    const empresa = await obtenerEmpresaActual();
    if (!empresa || !(await tieneAutorizacionVigente(empresa.id))) {
      return window.location.replace(RUTAS.onboarding);
    }
    empresaActual = empresa;
    await pintarSelectorEmpresas(empresa);

    if (puedeEditar()) {
      $('btn-agregar-equipo').hidden = false;
      $('btn-nuevo-escaneo').hidden = false;
      $('btn-agregar-equipo').addEventListener('click', agregarEquipo);
    }

    TEXTOS = await fetch('../data/recomendaciones.json').then(r => r.json()).catch(() => TEXTOS);
    await cargarDashboard();
  } catch (err) {
    if (!String(err.message).startsWith('Sin sesión')) mostrarAlerta(alerta, traducirError(err));
  }
})();

async function pintarSelectorEmpresas(actual) {
  const empresas = await listarMisEmpresas();
  $('nombre-empresa').textContent = actual.nombre;
  $('rol-usuario').textContent = ROLES[actual.rol] || actual.rol;
  if (empresas.length < 2) return;
  const sel = $('sel-empresa');
  sel.replaceChildren(...empresas.map(e => el('option', { value: e.id, selected: e.id === actual.id }, e.nombre)));
  sel.hidden = false;
  $('nombre-empresa').hidden = true;
  sel.addEventListener('change', () => { fijarEmpresaActual(sel.value); window.location.reload(); });
}

/* ═════════════ Datos ═════════════ */
async function cargarDashboard() {
  const [escRes, actRes] = await Promise.all([
    supabase.from('escaneos')
      .select('id, creado_en, completado_en, origen, estado, resumen, error, activo_id, activo:activos (nombre)')
      .eq('empresa_id', empresaActual.id)
      .order('creado_en', { ascending: false })
      .limit(100),
    supabase.from('activos')
      .select('id, nombre, tipo, sistema_operativo, version_so, criticidad, expuesto_internet, ultimo_escaneo')
      .eq('empresa_id', empresaActual.id)
      .order('nombre', { ascending: true })
  ]);
  if (escRes.error) throw escRes.error;
  if (actRes.error) throw actRes.error;
  datos.escaneos = escRes.data;
  datos.activos = actRes.data;

  /* Último escaneo completado por equipo (y uno para el cuestionario manual) */
  datos.vigentes = new Map();
  for (const e of datos.escaneos) {
    if (e.estado !== 'completado') continue;
    const clave = e.activo_id || CLAVE_MANUAL;
    if (!datos.vigentes.has(clave)) datos.vigentes.set(clave, e);
  }

  const ids = [...datos.vigentes.values()].map(e => e.id);
  let hallazgos = [];
  if (ids.length) {
    const { data, error } = await supabase.from('hallazgos')
      .select('escaneo_id, activo_id, vendor, producto, tecnologia, categoria, cwe, tier, score')
      .in('escaneo_id', ids)
      .limit(2000);
    if (error) throw error;
    hallazgos = data;
  }
  datos.grupos = agrupar(hallazgos);

  pintarHero();
  pintarPrioridades();
  pintarEquipos();
  pintarEvolucion();
  pintarHistorial();
}

/** Agrupa escenarios del modelo en "problemas": tecnología + equipo */
function agrupar(hallazgos) {
  const nombreEquipo = id => datos.activos.find(a => a.id === id)?.nombre || NOMBRE_MANUAL;
  const mapa = new Map();
  for (const h of hallazgos) {
    const tecnologia = h.tecnologia || [h.vendor, h.producto].filter(Boolean).join(' · ') || 'Tecnología';
    const clave = `${h.activo_id || CLAVE_MANUAL}|${tecnologia}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, { tecnologia, equipo: nombreEquipo(h.activo_id), categoria: h.categoria,
                        tier: 0, score: 0, fallas: new Set(), escenarios: 0 });
    }
    const g = mapa.get(clave);
    g.tier = Math.max(g.tier, h.tier || 0);
    g.score = Math.max(g.score, Number(h.score) || 0);
    g.escenarios += 1;
    (h.cwe || '').split(',').map(s => s.trim()).filter(Boolean).forEach(f => g.fallas.add(f));
  }
  return [...mapa.values()].sort((a, b) => b.tier - a.tier || b.score - a.score);
}

/* ═════════════ 1. Estado actual (hero) ═════════════ */
function pintarHero() {
  const hero = $('hero');
  const grupos = datos.grupos;
  const ultimo = datos.escaneos.find(e => e.estado === 'completado');

  const estadisticas = el('div', { class: 'app-hero__stats' },
    stat(datos.activos.length, datos.activos.length === 1 ? 'equipo' : 'equipos'),
    stat(datos.escaneos.length, datos.escaneos.length === 1 ? 'escaneo' : 'escaneos'),
    stat(ultimo ? formatearFecha(ultimo.completado_en || ultimo.creado_en, true) : '—', 'último análisis'));

  if (!grupos.length) {
    hero.className = 'app-hero';
    hero.replaceChildren(
      el('div', { class: 'app-hero__main' },
        el('span', { class: 'app-kpi__label' }, 'Riesgo actual de tu empresa'),
        el('strong', { class: 'app-hero__nivel' }, 'Sin datos todavía'),
        el('p', {}, puedeEditar()
          ? 'Pulsa «+ Agregar equipo» e instala el agente en un equipo para recibir tu primer diagnóstico.'
          : 'Cuando se analice el primer equipo verás aquí el estado de seguridad.')),
      estadisticas);
    return;
  }

  const tierMax = Math.max(...grupos.map(g => g.tier));
  const n4 = grupos.filter(g => g.tier >= 4).length;
  const n3 = grupos.filter(g => g.tier === 3).length;
  const top = grupos[0];

  const resumen = [];
  if (n4) resumen.push(`${n4} ${n4 === 1 ? 'tecnología' : 'tecnologías'} en nivel crítico`);
  if (n3) resumen.push(`${n3} en nivel alto`);

  hero.className = `app-hero app-hero--${claseNivel(tierMax)}`;
  hero.replaceChildren(
    el('div', { class: 'app-hero__main' },
      el('span', { class: 'app-kpi__label' }, 'Riesgo actual de tu empresa'),
      el('strong', { class: `app-hero__nivel app-c-${claseNivel(tierMax)}` }, nombreNivel(tierMax)),
      el('p', {}, resumen.length ? `Tienes ${resumen.join(' y ')}. ` : '', textoNivel(tierMax).explicacion || ''),
      el('p', { class: 'app-hero__accion' },
        el('span', { class: 'app-muted' }, 'Empieza por: '),
        el('strong', {}, top.tecnologia), ` en ${top.equipo}`,
        textoNivel(top.tier).plazo ? ` — ${textoNivel(top.tier).plazo.toLowerCase()}.` : '.')),
    estadisticas,
    leyenda());
}

function stat(valor, etiqueta) {
  return el('div', { class: 'app-hero__stat' }, el('strong', {}, String(valor)), el('span', {}, etiqueta));
}

function leyenda() {
  return el('ul', { class: 'app-leyenda', 'aria-label': 'Qué significa cada nivel' },
    [4, 3, 2, 1].map(t => el('li', {},
      el('span', { class: `app-dot app-bg-${claseNivel(t)}` }),
      el('strong', {}, nombreNivel(t)), ` · ${textoNivel(t).plazo || ''}`)));
}

/* ═════════════ 2. Qué atender primero ═════════════ */
function pintarPrioridades() {
  const cont = $('prioridades');
  const grupos = datos.grupos;
  if (!grupos.length) {
    cont.replaceChildren(vacio('Aquí aparecerán, en orden, las tecnologías que debes atender primero.'));
    return;
  }
  const items = grupos.map((g, i) => itemPrioridad(g, i));
  const lista = el('ol', { class: 'app-prioridades' }, items.slice(0, MAX_PRIORIDADES));
  cont.replaceChildren(lista);
  const ocultos = items.slice(MAX_PRIORIDADES);
  if (ocultos.length) {
    const mas = el('button', { type: 'button', class: 'app-link app-mas' }, `Ver ${ocultos.length} más`);
    mas.addEventListener('click', () => { lista.append(...ocultos); mas.remove(); });
    cont.append(mas);
  }
}

function itemPrioridad(g, i) {
  const cat = categoria(g.categoria);
  const fallas = [...g.fallas];
  return el('li', {},
    el('details', { class: `app-prio app-prio--${claseNivel(g.tier)}`, open: i === 0 },
      el('summary', {},
        el('span', { class: 'app-prio__num' }, String(i + 1)),
        el('span', { class: 'app-prio__titulo' },
          el('strong', { class: 'app-text-bright' }, g.tecnologia),
          el('span', { class: 'app-muted app-small' }, `${g.equipo} · ${cat.nombre}`)),
        el('span', { class: `app-badge app-badge--${claseNivel(g.tier)}` }, nombreNivel(g.tier)),
        el('span', { class: 'app-prio__plazo app-small app-muted' }, textoNivel(g.tier).plazo || '')),
      el('div', { class: 'app-prio__cuerpo' },
        cat.por_que ? el('p', {}, el('strong', {}, 'Por qué importa: '), cat.por_que) : null,
        fallas.length ? el('div', {},
          el('strong', {}, 'Qué podría pasar:'),
          el('ul', {}, fallas.slice(0, 5).map(f =>
            el('li', {}, el('span', { class: 'app-text-bright' }, traducirFalla(f)),
              TEXTOS.fallas[f] ? ` — ${TEXTOS.fallas[f]}` : '')))) : null,
        cat.acciones?.length ? el('div', {},
          el('strong', {}, 'Qué hacer:'),
          el('ol', {}, cat.acciones.map(a => el('li', {}, a)))) : null,
        el('p', { class: 'app-muted app-small' },
          `Score del modelo: ${g.score.toFixed(2)} · ${g.escenarios} escenarios de ataque evaluados`))));
}

/* ═════════════ 3a. Equipos ═════════════ */
function pintarEquipos() {
  const cont = $('activos');
  const tarjetas = datos.activos.map(tarjetaEquipo);
  const manual = datos.vigentes.get(CLAVE_MANUAL);
  if (manual) tarjetas.push(tarjetaManual(manual));

  if (!tarjetas.length) {
    cont.replaceChildren(vacio(puedeEditar()
      ? 'Aún no hay equipos. Pulsa «+ Agregar equipo» e instala el agente en tu primer equipo.'
      : 'Aún no hay equipos registrados.'));
    return;
  }
  cont.replaceChildren(
    el('div', { class: 'app-equipos' }, tarjetas),
    puedeEditar() ? el('p', { class: 'app-muted app-small app-nota' },
      'La importancia y la exposición a internet se tienen en cuenta en el próximo escaneo del equipo.') : null);
}

/** Nivel del último escaneo de un equipo y su tendencia respecto al anterior */
function nivelYTendencia(clave) {
  const completados = datos.escaneos.filter(e => e.estado === 'completado' && (e.activo_id || CLAVE_MANUAL) === clave);
  const actual = completados[0]?.resumen?.tier_max ?? null;
  const previo = completados[1]?.resumen?.tier_max ?? null;
  let tendencia = null;
  if (actual != null && previo != null) {
    tendencia = actual < previo ? '▼ mejoró' : actual > previo ? '▲ empeoró' : '= sin cambios';
  }
  return { actual, tendencia, ultimo: completados[0] };
}

function tarjetaEquipo(a) {
  const { actual, tendencia, ultimo } = nivelYTendencia(a.id);
  const editable = puedeEditar();
  return el('article', { class: `app-equipo app-equipo--${claseNivel(actual)}` },
    el('div', { class: 'app-equipo__head' },
      el('div', {},
        el('strong', { class: 'app-text-bright' }, a.nombre),
        el('div', { class: 'app-muted app-small' },
          [TIPOS[a.tipo] || a.tipo, [a.sistema_operativo, a.version_so].filter(Boolean).join(' ')].filter(Boolean).join(' · '))),
      el('span', { class: `app-badge app-badge--${claseNivel(actual)}` }, actual ? nombreNivel(actual) : 'Sin analizar')),
    el('div', { class: 'app-small app-muted' },
      `Último escaneo: ${formatearFecha(a.ultimo_escaneo, true)}`, tendencia ? ` · ${tendencia}` : ''),
    el('div', { class: 'app-equipo__campos' },
      el('label', {}, el('span', { class: 'app-small app-muted' }, 'Importancia para el negocio'),
        editable ? selectorCriticidad(a) : el('span', {}, CRITICIDAD[a.criticidad] || a.criticidad)),
      el('label', { class: 'app-equipo__check' },
        editable ? casillaExpuesto(a) : el('span', {}, a.expuesto_internet ? '✔' : '—'),
        el('span', { class: 'app-small' }, 'Expuesto a internet'))),
    ultimo ? botonDetalle(ultimo, 'Ver último escaneo') : null);
}

function tarjetaManual(escaneo) {
  const { actual, tendencia } = nivelYTendencia(CLAVE_MANUAL);
  return el('article', { class: `app-equipo app-equipo--${claseNivel(actual)}` },
    el('div', { class: 'app-equipo__head' },
      el('div', {},
        el('strong', { class: 'app-text-bright' }, NOMBRE_MANUAL),
        el('div', { class: 'app-muted app-small' }, 'Sitio web, nube, red y servidores marcados en el cuestionario')),
      el('span', { class: `app-badge app-badge--${claseNivel(actual)}` }, actual ? nombreNivel(actual) : '—')),
    el('div', { class: 'app-small app-muted' },
      `Último: ${formatearFecha(escaneo.completado_en || escaneo.creado_en, true)}`, tendencia ? ` · ${tendencia}` : ''),
    botonDetalle(escaneo, 'Ver evaluación'));
}

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
  const sel = el('select', { class: 'app-select app-select--sm', 'aria-label': `Importancia de ${activo.nombre}` },
    Object.entries(CRITICIDAD).map(([v, n]) => el('option', { value: v, selected: v === activo.criticidad }, n)));
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
  caja.addEventListener('change', () => actualizarActivo(activo.id, { expuesto_internet: caja.checked }, caja, !caja.checked));
  return caja;
}

/* ── Agregar equipo: código de enlace de un solo uso para el agente ── */
async function agregarEquipo() {
  const boton = $('btn-agregar-equipo');
  const panel = $('panel-codigo');
  boton.disabled = true;
  try {
    const respuesta = await llamarApi('/api/agentes', { empresa_id: empresaActual.id });
    const copiar = el('button', { type: 'button', class: 'app-btn app-btn--ghost' }, 'Copiar');
    copiar.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(respuesta.codigo); copiar.textContent = 'Copiado ✔'; }
      catch { copiar.textContent = 'Cópialo manualmente'; }
    });
    const cerrar = el('button', { type: 'button', class: 'app-link' }, 'Cerrar');
    cerrar.addEventListener('click', () => { panel.hidden = true; });
    panel.replaceChildren(
      el('div', { class: 'app-codigo__fila' },
        el('div', {}, el('div', { class: 'app-kpi__label' }, 'Código de enlace'),
          el('div', { class: 'app-codigo__valor' }, respuesta.codigo)),
        copiar),
      el('ol', { class: 'app-codigo__pasos' },
        el('li', {}, 'En el equipo a analizar, abre ', el('strong', {}, 'CyberRisk-Agente.exe'), '.'),
        el('li', {}, 'Pega este código y pulsa «Enlazar equipo».'),
        el('li', {}, 'Pulsa «Escanear», revisa lo recolectado y envíalo.')),
      el('p', { class: 'app-muted app-small' },
        `Un solo uso · vence el ${formatearFecha(respuesta.expira)} · al recargar esta página ya no se vuelve a mostrar.`),
      cerrar);
    panel.hidden = false;
  } catch (err) {
    mostrarAlerta(alerta, err.message);
  } finally {
    boton.disabled = false;
  }
}

/** POST a la API con el token del usuario; lanza Error con mensaje legible */
async function llamarApi(ruta, cuerpo) {
  const { data: { session } } = await supabase.auth.getSession();
  let resp;
  try {
    resp = await fetch(`${API_URL}${ruta}`, {
      method: 'POST',
      headers: { ...API_HEADERS, 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
  } catch {
    throw new Error(`No se pudo conectar con la API de CyberRisk (${API_URL}). ¿Está corriendo?`);
  }
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || `Error del servidor (${resp.status}).`);
  return json;
}

/* ═════════════ 3b. Evolución ═════════════ */
function pintarEvolucion() {
  const cont = $('evolucion');
  const completados = datos.escaneos.filter(e => e.estado === 'completado' && e.resumen?.tier_max != null);
  if (completados.length < 2) {
    cont.replaceChildren(vacio('Con dos o más escaneos verás aquí cómo cambia tu riesgo en el tiempo.'));
    return;
  }
  const serie = completados.slice(0, 10).reverse();
  cont.replaceChildren(...serie.map(e => {
    const t = e.resumen.tier_max;
    return el('div', { class: 'app-evo' },
      el('span', { class: 'app-evo__fecha app-small' },
        el('span', {}, formatearFecha(e.completado_en || e.creado_en, true)),
        el('span', { class: 'app-muted' }, e.activo?.nombre || NOMBRE_MANUAL)),
      el('div', { class: 'app-evo__bar' },
        el('div', { class: `app-evo__fill app-bg-${claseNivel(t)}`, style: `width:${(Math.min(t, 4) / 4) * 100}%` })),
      el('span', { class: `app-small app-c-${claseNivel(t)}` }, nombreNivel(t)));
  }));
}

/* ═════════════ 4. Historial ═════════════ */
function pintarHistorial() {
  const cont = $('historial');
  if (!datos.escaneos.length) {
    cont.replaceChildren(vacio('Sin escaneos todavía.'));
    return;
  }
  const filas = datos.escaneos.slice(0, 30).map(e => {
    const t = e.resumen?.tier_max;
    const acciones = el('td', { class: 'app-nowrap' }, botonDetalle(e, 'Ver detalle'));
    if (puedeEditar() && (e.estado === 'pendiente' || e.estado === 'error')) {
      acciones.append(' · ', botonReintentar(e));
    }
    const claseEstado = e.estado === 'error' ? 'red' : e.estado === 'completado' ? 'muted' : 'amber';
    return el('tr', {},
      el('td', { class: 'app-nowrap' }, formatearFecha(e.creado_en)),
      el('td', {}, e.origen === 'agente' ? 'Agente' : 'Cuestionario'),
      el('td', {}, e.activo?.nombre || NOMBRE_MANUAL),
      el('td', {}, el('span', { class: `app-badge app-badge--${claseEstado}` }, ESTADOS[e.estado] || e.estado)),
      el('td', {}, e.estado === 'completado' && t != null ? el('span', { class: `app-c-${claseNivel(t)}` }, nombreNivel(t)) : '—'),
      acciones);
  });
  cont.replaceChildren(tabla(['Fecha', 'Origen', 'Equipo', 'Estado', 'Nivel', ''], filas));
}

function botonReintentar(escaneo) {
  const b = el('button', { type: 'button', class: 'app-link' }, 'Reintentar');
  b.addEventListener('click', async () => {
    b.disabled = true;
    b.textContent = 'Analizando…';
    try {
      await llamarApi(`/api/escaneos/${escaneo.id}/analizar`);
      await cargarDashboard();
    } catch (err) {
      mostrarAlerta(alerta, err.message);
      b.disabled = false;
      b.textContent = 'Reintentar';
    }
  });
  return b;
}

/* ═════════════ Detalle de un escaneo ═════════════ */
function botonDetalle(escaneo, texto) {
  const b = el('button', { type: 'button', class: 'app-link' }, texto);
  b.addEventListener('click', () => abrirDetalle(escaneo));
  return b;
}

async function abrirDetalle(escaneo) {
  const cuerpo = $('detalle-cuerpo');
  cuerpo.replaceChildren(el('p', { class: 'app-muted' }, 'Cargando…'));
  $('detalle').showModal();

  const { data, error } = await supabase.from('escaneos')
    .select('payload, inventario').eq('id', escaneo.id).single();
  if (error) {
    cuerpo.replaceChildren(el('p', {}, traducirError(error)));
    return;
  }
  const r = escaneo.resumen || {};
  const inv = data.inventario;
  const mapeo = r.mapeo;

  const bloques = [
    el('dl', { class: 'app-dl' },
      dato('Fecha', formatearFecha(escaneo.creado_en)),
      dato('Origen', escaneo.origen === 'agente' ? 'Agente instalado' : 'Cuestionario manual'),
      dato('Equipo', escaneo.activo?.nombre || NOMBRE_MANUAL),
      dato('Estado', ESTADOS[escaneo.estado] || escaneo.estado),
      escaneo.estado === 'completado' ? dato('Nivel', nombreNivel(r.tier_max)) : null,
      r.hallazgos != null ? dato('Escenarios evaluados', String(r.hallazgos)) : null)
  ];
  if (escaneo.error) bloques.push(el('div', { class: 'app-alert app-alert--error' }, escaneo.error));

  if (inv) {
    bloques.push(el('p', { class: 'app-small' },
      `Recolectado: ${inv.software?.length || 0} programas · ${inv.servicios?.length || 0} servicios · `,
      `${inv.puertos?.length || 0} puertos en escucha · ${inv.procesos?.length || 0} procesos`,
      inv.equipo?.so ? ` · ${inv.equipo.so} ${inv.equipo.so_version || ''}` : ''));
  }

  if (mapeo) {
    bloques.push(
      el('h3', { class: 'app-h3' }, `Tecnologías analizadas (${mapeo.reconocidos.length})`),
      el('ul', { class: 'app-lista' }, mapeo.reconocidos.map(x =>
        el('li', {}, el('strong', {}, x.evidencia), el('span', { class: 'app-muted app-small' }, ` → ${x.vendor} / ${x.product}`)))),
      el('details', {},
        el('summary', {}, `Programas que aún no se pueden analizar (${mapeo.no_reconocidos.length})`),
        el('p', { class: 'app-muted app-small' },
          'No están en el catálogo del modelo. Se cubrirán con el cruce contra la base pública de vulnerabilidades (CVE).'),
        el('ul', { class: 'app-lista app-lista--cols' }, mapeo.no_reconocidos.map(n => el('li', {}, n)))));
  } else if (Array.isArray(data.payload) && data.payload.length) {
    bloques.push(
      el('h3', { class: 'app-h3' }, 'Tecnologías evaluadas'),
      el('ul', { class: 'app-lista' }, data.payload.map(s =>
        el('li', {}, el('strong', {}, s.vendor), ` · ${(s.products || []).join(', ')}`))));
  }
  cuerpo.replaceChildren(...bloques);
}

function dato(nombre, valor) {
  return el('div', {}, el('dt', {}, nombre), el('dd', {}, valor));
}

/* ═════════════ Helpers ═════════════ */
function tabla(encabezados, filas) {
  return el('div', { class: 'app-table-wrap' },
    el('table', { class: 'app-table' },
      el('thead', {}, el('tr', {}, encabezados.map(h => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, filas)));
}
function vacio(texto) {
  return el('p', { class: 'app-empty' }, texto);
}
