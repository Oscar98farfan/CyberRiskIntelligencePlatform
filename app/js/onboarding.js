/**
 * onboarding.js
 * ─────────────────────────────────────────────────────────────
 * Paso 1 → INSERT en empresas. Un trigger en la base de datos agrega
 *          automáticamente al usuario como "dueno" en miembros.
 * Paso 2 → INSERT en autorizaciones con la versión de los términos.
 *          RLS solo lo permite si el usuario es dueño de la empresa.
 * ─────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase-client.js';
import {
  requerirSesion, obtenerEmpresaActual, fijarEmpresaActual,
  tieneAutorizacionVigente, cerrarSesion
} from './auth.js';
import { RUTAS, TERMINOS_VERSION } from './config.js';
import { mostrarAlerta, setCargando, traducirError } from './ui.js';

const alerta = document.getElementById('alerta');
const formEmpresa = document.getElementById('form-empresa');
const formAutorizacion = document.getElementById('form-autorizacion');

let empresa = null;   // empresa en la que se está trabajando

document.getElementById('btn-salir').addEventListener('click', cerrarSesion);
document.getElementById('version-terminos').textContent = TERMINOS_VERSION;

/** Cambia la vista entre el paso 1 y el 2 */
function irAPaso(n) {
  formEmpresa.hidden = n !== 1;
  formAutorizacion.hidden = n !== 2;
  document.getElementById('paso-ind-1').classList.toggle('is-active', n === 1);
  document.getElementById('paso-ind-2').classList.toggle('is-active', n === 2);
  if (n === 2) document.getElementById('nombre-empresa').textContent = empresa.nombre;
  mostrarAlerta(alerta, '');
}

/* ── Arranque: decidir en qué paso empieza el usuario ── */
(async function iniciar() {
  try {
    await requerirSesion();
    empresa = await obtenerEmpresaActual();
    if (!empresa) return irAPaso(1);
    if (await tieneAutorizacionVigente(empresa.id)) {
      return window.location.replace(RUTAS.dashboard);
    }
    irAPaso(2);
  } catch (err) {
    if (!String(err.message).startsWith('Sin sesión')) mostrarAlerta(alerta, traducirError(err));
  }
})();

/* ── Paso 1: crear empresa ── */
formEmpresa.addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = formEmpresa.querySelector('button[type="submit"]');
  const datos = {
    nombre: formEmpresa.nombre.value.trim(),
    nit: formEmpresa.nit.value.trim() || null,
    ciudad: formEmpresa.ciudad.value.trim() || null,
    sector: formEmpresa.sector.value || null,
    tamano: formEmpresa.tamano.value || null
  };

  if (datos.nombre.length < 2) return mostrarAlerta(alerta, 'Escribe el nombre de la empresa.');
  if (!datos.sector || !datos.tamano) return mostrarAlerta(alerta, 'Selecciona el sector y el tamaño.');
  if (datos.nit && !/^[0-9.\-\s]{5,20}$/.test(datos.nit)) {
    return mostrarAlerta(alerta, 'El NIT solo puede tener números, puntos y guion.');
  }

  setCargando(boton, true, 'Guardando…');
  /* creado_por lo pone la base de datos con auth.uid() */
  const { data, error } = await supabase
    .from('empresas')
    .insert(datos)
    .select('id, nombre')
    .single();
  setCargando(boton, false);

  if (error) return mostrarAlerta(alerta, traducirError(error));
  empresa = data;
  fijarEmpresaActual(empresa.id);
  irAPaso(2);
});

/* ── Paso 2: autorizar escaneo ── */
formAutorizacion.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!formAutorizacion.acepto.checked) {
    return mostrarAlerta(alerta, 'Debes marcar la casilla para autorizar el análisis.');
  }
  const boton = formAutorizacion.querySelector('button[type="submit"]');
  const { data: { user } } = await supabase.auth.getUser();

  setCargando(boton, true, 'Registrando…');
  const { error } = await supabase.from('autorizaciones').insert({
    empresa_id: empresa.id,
    user_id: user.id,
    version_terminos: TERMINOS_VERSION
  });
  setCargando(boton, false);

  if (error) return mostrarAlerta(alerta, traducirError(error));
  window.location.replace(RUTAS.dashboard);
});
