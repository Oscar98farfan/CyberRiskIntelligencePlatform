/**
 * config.js
 * ─────────────────────────────────────────────────────────────
 * Configuración pública de la plataforma CyberRisk.
 *
 * ⚠ Aquí SOLO van valores que pueden ser públicos:
 *   - La URL del proyecto Supabase.
 *   - La llave "publishable" (antes "anon"). Es segura en el navegador
 *     porque Row Level Security (RLS) decide qué puede ver cada usuario.
 *
 * ✖ NUNCA pongas aquí la llave secreta / service_role. Esa vive solo en
 *   el .env de la API Flask (nunca se sube a GitHub).
 * ─────────────────────────────────────────────────────────────
 */

export const SUPABASE_URL = 'https://vpnfkclwcmzhnwiiwapy.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gGJ7W8ulAoq6XMN6PYKjlg_PEGCJpGR';

/* URL de la API de análisis (Flask + modelo ML).
   En local: http://127.0.0.1:5000 · Con túnel: la URL https del túnel. */
export const API_URL = 'http://127.0.0.1:5000';

/* Versión de los términos de autorización de escaneo.
   Si cambias el texto de la autorización, sube esta versión: las empresas
   deberán aceptar de nuevo y queda registro de qué versión aceptó cada una. */
export const TERMINOS_VERSION = 'v1.0-2026-10';

/* Rutas internas (relativas, para que funcione igual en local y en GitHub Pages) */
export const RUTAS = {
  login:      'login.html',
  onboarding: 'onboarding.html',
  dashboard:  'dashboard.html',
  reset:      'reset.html',
  wiki:       '../index.html'
};
