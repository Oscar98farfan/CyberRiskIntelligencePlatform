/**
 * escaneo.js
 * ─────────────────────────────────────────────────────────────
 * Conecta el cuestionario existente (assets/js/cyberrisk.js) con la
 * plataforma multi-empresa. NO duplica el cuestionario: solo reemplaza
 * la función global runAnalysis() que usa el botón "Analizar".
 *
 * Flujo al pulsar "Analizar":
 *   1. INSERT en escaneos (Supabase) con el payload → estado 'pendiente'.
 *      RLS lo bloquea si la empresa no tiene autorización vigente.
 *   2. POST {API_URL}/api/escaneos/<id>/analizar con el token del usuario.
 *      La API corre el modelo y guarda los hallazgos en Supabase.
 *   3. Se muestra el dashboard de siempre (renderDashboard) y un enlace
 *      al dashboard histórico de la empresa.
 *
 * Funciones globales de cyberrisk.js que se reutilizan:
 *   buildPayload(), showLoading(), renderDashboard()
 * ─────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase-client.js';
import { requerirSesion, obtenerEmpresaActual, tieneAutorizacionVigente } from './auth.js';
import { API_URL, RUTAS } from './config.js';
import { el } from './ui.js';

let empresa = null;

/* ── Arranque: validar sesión, empresa y permisos ── */
(async function iniciar() {
  try {
    await requerirSesion();
    empresa = await obtenerEmpresaActual();
    if (!empresa || !(await tieneAutorizacionVigente(empresa.id))) {
      return window.location.replace(RUTAS.onboarding);
    }
    pintarEmpresaEnHeader();

    /* Un "lector" puede ver resultados, pero no lanzar escaneos (RLS igual lo bloquearía) */
    if (!['dueno', 'admin'].includes(empresa.rol)) {
      const boton = document.getElementById('run-btn');
      if (boton) {
        boton.disabled = true;
        boton.title = 'Tu rol en la empresa es de solo lectura';
      }
      setEstado('SOLO LECTURA');
    }
  } catch (err) {
    if (!String(err.message).startsWith('Sin sesión')) console.error(err);
  }
})();

/** Muestra la empresa y un enlace al dashboard en la cabecera del módulo */
function pintarEmpresaEnHeader() {
  const header = document.querySelector('.cr-hdr');
  if (!header) return;
  header.append(
    el('a', { href: RUTAS.dashboard, class: 'cr-empresa-link', title: 'Volver a mi dashboard' },
      `◂ ${empresa.nombre}`));
}

function setEstado(texto) {
  const estado = document.getElementById('cr-status-text');
  if (estado) estado.textContent = texto;
}

/* ═══════════ Reemplazo de runAnalysis (el botón llama runAnalysis(event)) ═══════════ */
window.runAnalysis = async function runAnalysis(event) {
  event?.preventDefault();
  event?.stopPropagation();

  const payload = buildPayload();           // global de cyberrisk.js
  if (!payload.length) {
    alert('Debes agregar al menos un sistema a evaluar.');
    return;
  }
  if (!empresa) {
    alert('No se encontró la empresa. Recarga la página.');
    return;
  }

  showLoading(true);                        // global de cyberrisk.js
  setEstado('GUARDANDO ESCANEO…');

  /* 1. Guardar el escaneo en Supabase */
  const { data: escaneo, error } = await supabase
    .from('escaneos')
    .insert({ empresa_id: empresa.id, origen: 'cuestionario', payload })
    .select('id')
    .single();

  if (error) {
    showLoading(false);
    setEstado('ERROR');
    alert('No se pudo guardar el escaneo. Verifica que la empresa tenga la autorización vigente.\n\n' + error.message);
    return;
  }

  /* 2. Pedir a la API que lo analice */
  setEstado('EJECUTANDO MODELO…');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const respuesta = await fetch(`${API_URL}/api/escaneos/${escaneo.id}/analizar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      setEstado('ERROR');
      alert(datos.error || `Error del servidor (${respuesta.status}).`);
      return;
    }

    /* 3. Mostrar resultados con el dashboard existente */
    window.mlResult = datos.resultados;
    renderDashboard(datos.resultados);      // global de cyberrisk.js
    setEstado('ANÁLISIS GUARDADO');
    mostrarAvisoGuardado();
  } catch (err) {
    console.error(err);
    setEstado('SIN CONEXIÓN CON LA API');
    alert('No se pudo conectar con el motor de análisis.\n' +
          '¿Está corriendo la API (flask run) en ' + API_URL + '?\n\n' +
          'El escaneo quedó guardado como "pendiente" en tu historial.');
  } finally {
    showLoading(false);
  }
};

/** Aviso con enlace al dashboard histórico, arriba del dashboard de resultados */
function mostrarAvisoGuardado() {
  document.getElementById('cr-aviso-guardado')?.remove();
  const dash = document.getElementById('cr-dashboard');
  if (!dash) return;
  dash.prepend(
    el('div', { id: 'cr-aviso-guardado', class: 'cr-aviso-guardado', role: 'status' },
      el('span', {}, '✔ Análisis guardado en el historial de tu empresa.'),
      el('a', { href: RUTAS.dashboard }, 'Ver mi dashboard →')));
}
