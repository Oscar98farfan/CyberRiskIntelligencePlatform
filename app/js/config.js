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

/* URL pública de la API (túnel ngrok o servidor en la nube), SIN "/" al final.
   Ej: 'https://cyberrisk-oscar.ngrok-free.app'. Vacía = usar la API local. */
const API_PUBLICA = 'https://placate-shredding-ranger.ngrok-free.dev';

/* URL de la API de análisis (Flask + modelo ML) que usa toda la plataforma */
export const API_URL = API_PUBLICA || 'http://127.0.0.1:5000';

/* Cabeceras extra para cada llamada a la API.
   ngrok (plan gratis) muestra una página de aviso a los navegadores; esta
   cabecera la salta. En la API local o en otro servidor simplemente se ignora. */
export const API_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

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
