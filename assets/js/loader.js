/**
 * loader.js
 * Sistema de carga y caché de archivos JSON mediante fetch().
 * Centraliza el acceso a datos y maneja errores de red.
 */

'use strict';

/* ─── Caché en memoria para evitar re-fetches ─── */
const _cache = new Map();

/**
 * Carga un archivo JSON desde la ruta indicada.
 * Usa caché en memoria para evitar peticiones repetidas.
 *
 * @param {string} path - Ruta relativa al archivo JSON (ej: 'data/nav.json').
 * @returns {Promise<Object>} - Datos parseados del JSON.
 * @throws {Error} - Si la red falla o el JSON es inválido.
 */
async function fetchJSON(path) {
  /* Retornar desde caché si ya fue cargado */
  if (_cache.has(path)) {
    return _cache.get(path);
  }

  let response;
  try {
    response = await fetch(path, {
      /* Forzar re-validación en desarrollo; en producción el servidor decide */
      cache: 'no-cache',
      headers: { 'Accept': 'application/json' }
    });
  } catch (networkError) {
    throw new Error(`Error de red al cargar "${path}": ${networkError.message}`);
  }

  if (!response.ok) {
    throw new Error(`No se pudo cargar "${path}" — HTTP ${response.status} ${response.statusText}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    throw new Error(`El archivo "${path}" no es un JSON válido: ${parseError.message}`);
  }

  /* Guardar en caché */
  _cache.set(path, data);
  return data;
}

/**
 * Carga la configuración de navegación principal.
 * @returns {Promise<Object>} - Datos de nav.json.
 */
async function loadNav() {
  return fetchJSON('data/nav.json');
}

/**
 * Carga los datos de una sección específica.
 * @param {string} filePath - Ruta del archivo JSON (viene del nav.json).
 * @returns {Promise<Object>} - Datos de la sección.
 */
async function loadSection(filePath) {
  return fetchJSON(filePath);
}

/**
 * Invalida el caché de una ruta específica (útil en desarrollo).
 * @param {string} path
 */
function invalidateCache(path) {
  _cache.delete(path);
}

/** Limpia todo el caché. */
function clearCache() {
  _cache.clear();
}
