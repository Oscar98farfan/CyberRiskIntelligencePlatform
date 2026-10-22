/**
 * supabase-client.js
 * ─────────────────────────────────────────────────────────────
 * Crea UNA sola instancia del cliente de Supabase para toda la app.
 * Se importa desde un CDN con versión fija (sin frameworks ni build).
 * La sesión se guarda en el navegador y se renueva automáticamente.
 * ─────────────────────────────────────────────────────────────
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.0/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,      // mantener la sesión al recargar
    autoRefreshToken: true,    // renovar el token antes de que expire
    detectSessionInUrl: true   // necesario para el enlace de "recuperar contraseña"
  }
});
