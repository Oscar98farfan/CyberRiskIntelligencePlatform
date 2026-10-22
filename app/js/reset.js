/**
 * reset.js
 * Supabase abre esta página con una sesión temporal de recuperación
 * (detectSessionInUrl la toma de la URL). Aquí se fija la nueva contraseña.
 */

import { supabase } from './supabase-client.js';
import { RUTAS } from './config.js';
import { mostrarAlerta, setCargando, traducirError } from './ui.js';

const form = document.getElementById('form-reset');
const alerta = document.getElementById('alerta');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = form.querySelector('button[type="submit"]');
  const password = form.password.value;

  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return mostrarAlerta(alerta, 'Mínimo 8 caracteres, con letras y números.');
  }
  if (password !== form.password2.value) return mostrarAlerta(alerta, 'Las contraseñas no coinciden.');

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    return mostrarAlerta(alerta, 'El enlace expiró o ya fue usado. Pide uno nuevo desde el login.');
  }

  setCargando(boton, true, 'Guardando…');
  const { error } = await supabase.auth.updateUser({ password });
  setCargando(boton, false);
  if (error) return mostrarAlerta(alerta, traducirError(error));

  mostrarAlerta(alerta, 'Contraseña actualizada. Entrando…', 'ok');
  setTimeout(() => window.location.replace('index.html'), 1200);
});

/* Enlace directo al login si el usuario llegó aquí por error */
if (!window.location.hash && !window.location.search) {
  mostrarAlerta(alerta, `Abre esta página desde el enlace del correo, o vuelve al login (${RUTAS.login}).`, 'info');
}
