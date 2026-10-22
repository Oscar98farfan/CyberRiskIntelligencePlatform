/**
 * auth.js
 * ─────────────────────────────────────────────────────────────
 * Funciones de sesión y "guardas" de navegación.
 *
 * Flujo de un usuario:
 *   sin sesión                      → login.html
 *   con sesión, sin empresa         → onboarding.html (paso 1)
 *   con empresa, sin autorización   → onboarding.html (paso 2)
 *   todo listo                      → dashboard.html
 *
 * Importante: estas guardas solo mejoran la experiencia. La seguridad
 * REAL está en la base de datos (RLS): aunque alguien se salte una
 * redirección, Supabase no le devolverá datos que no le pertenecen.
 * ─────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase-client.js';
import { RUTAS } from './config.js';
import { almacen } from './ui.js';

const CLAVE_EMPRESA = 'cr.empresaActual';

/** Devuelve la sesión actual o null. */
export async function obtenerSesion() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Exige sesión: si no hay, redirige al login y corta la ejecución. */
export async function requerirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion) {
    window.location.replace(RUTAS.login);
    throw new Error('Sin sesión: redirigiendo al login');
  }
  return sesion;
}

/**
 * Lista las empresas a las que pertenece el usuario, con su rol.
 * RLS ya filtra: solo llegan las empresas del usuario.
 */
export async function listarMisEmpresas() {
  const { data, error } = await supabase
    .from('miembros')
    .select('rol, empresa:empresas (id, nombre, nit, sector, tamano, ciudad)')
    .order('creado_en', { ascending: true });
  if (error) throw error;
  return (data || []).filter(m => m.empresa).map(m => ({ ...m.empresa, rol: m.rol }));
}

/**
 * Devuelve la empresa "activa" del usuario (la última elegida,
 * o la primera si no hay ninguna elegida). null si no tiene empresas.
 */
export async function obtenerEmpresaActual() {
  const empresas = await listarMisEmpresas();
  if (!empresas.length) return null;
  const elegida = almacen.get(CLAVE_EMPRESA);
  return empresas.find(e => e.id === elegida) || empresas[0];
}

export function fijarEmpresaActual(id) {
  almacen.set(CLAVE_EMPRESA, id);
}

/** ¿La empresa tiene una autorización de escaneo vigente? */
export async function tieneAutorizacionVigente(empresaId) {
  const { count, error } = await supabase
    .from('autorizaciones')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .is('revocado_en', null);
  if (error) throw error;
  return count > 0;
}

/**
 * Decide a qué página debe ir el usuario según su estado.
 * @returns {Promise<string>} ruta destino
 */
export async function rutaSegunEstado() {
  const sesion = await obtenerSesion();
  if (!sesion) return RUTAS.login;
  const empresa = await obtenerEmpresaActual();
  if (!empresa) return RUTAS.onboarding;
  if (!(await tieneAutorizacionVigente(empresa.id))) return RUTAS.onboarding;
  return RUTAS.dashboard;
}

/** Cierra la sesión y vuelve al login. */
export async function cerrarSesion() {
  await supabase.auth.signOut();
  almacen.del(CLAVE_EMPRESA);
  window.location.replace(RUTAS.login);
}
