/**
 * login.js
 * ─────────────────────────────────────────────────────────────
 * Controla la página de login / registro.
 *  - Si ya hay sesión, salta directo a la página que corresponda.
 *  - Ingresar:     supabase.auth.signInWithPassword
 *  - Crear cuenta: supabase.auth.signUp (el nombre va en user_metadata)
 *  - Olvidé mi contraseña: envía un enlace que abre reset.html
 * ─────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase-client.js';
import { rutaSegunEstado, obtenerSesion } from './auth.js';
import { RUTAS } from './config.js';
import { mostrarAlerta, setCargando, traducirError } from './ui.js';

const alerta = document.getElementById('alerta');
const formIngresar = document.getElementById('form-ingresar');
const formRegistro = document.getElementById('form-registro');
const tabIngresar = document.getElementById('tab-ingresar');
const tabRegistro = document.getElementById('tab-registro');

/* ── Si ya inició sesión, no tiene sentido mostrar el login ── */
obtenerSesion().then(async sesion => {
  if (sesion) window.location.replace(await rutaSegunEstado());
});

/* ── Pestañas ── */
function mostrarPestana(cual) {
  const esIngresar = cual === 'ingresar';
  tabIngresar.classList.toggle('is-active', esIngresar);
  tabRegistro.classList.toggle('is-active', !esIngresar);
  tabIngresar.setAttribute('aria-selected', String(esIngresar));
  tabRegistro.setAttribute('aria-selected', String(!esIngresar));
  formIngresar.hidden = !esIngresar;
  formRegistro.hidden = esIngresar;
  mostrarAlerta(alerta, '');
}
tabIngresar.addEventListener('click', () => mostrarPestana('ingresar'));
tabRegistro.addEventListener('click', () => mostrarPestana('registro'));

/* ── Validaciones simples del lado del cliente (Supabase valida de nuevo) ── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function passwordValida(p) {
  return p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
}

/* ── Ingresar ── */
formIngresar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = formIngresar.querySelector('button[type="submit"]');
  const email = formIngresar.email.value.trim().toLowerCase();
  const password = formIngresar.password.value;

  if (!EMAIL_RE.test(email) || !password) {
    return mostrarAlerta(alerta, 'Escribe tu correo y contraseña.');
  }

  setCargando(boton, true, 'Ingresando…');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setCargando(boton, false);

  if (error) return mostrarAlerta(alerta, traducirError(error));
  window.location.replace(await rutaSegunEstado());
});

/* ── Crear cuenta ── */
formRegistro.addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = formRegistro.querySelector('button[type="submit"]');
  const nombre = formRegistro.nombre.value.trim();
  const email = formRegistro.email.value.trim().toLowerCase();
  const password = formRegistro.password.value;
  const password2 = formRegistro.password2.value;

  if (nombre.length < 3) return mostrarAlerta(alerta, 'Escribe tu nombre completo.');
  if (!EMAIL_RE.test(email)) return mostrarAlerta(alerta, 'El correo no es válido.');
  if (!passwordValida(password)) {
    return mostrarAlerta(alerta, 'La contraseña debe tener mínimo 8 caracteres, con letras y números.');
  }
  if (password !== password2) return mostrarAlerta(alerta, 'Las contraseñas no coinciden.');

  setCargando(boton, true, 'Creando cuenta…');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre } }   // queda en auth.users.raw_user_meta_data
  });
  setCargando(boton, false);

  if (error) return mostrarAlerta(alerta, traducirError(error));

  /* Con "Confirm email" desactivado, signUp ya devuelve sesión.
     Si en el futuro se activa, el usuario debe confirmar su correo primero. */
  if (data.session) {
    window.location.replace(RUTAS.onboarding);
  } else {
    mostrarPestana('ingresar');
    mostrarAlerta(alerta, 'Cuenta creada. Revisa tu correo para confirmarla y luego ingresa.', 'ok');
  }
});

/* ── Olvidé mi contraseña ── */
document.getElementById('btn-olvide').addEventListener('click', async () => {
  const email = formIngresar.email.value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return mostrarAlerta(alerta, 'Escribe tu correo arriba y vuelve a pulsar "¿Olvidaste tu contraseña?".', 'info');
  }
  /* El enlace del correo abrirá reset.html en esta misma carpeta */
  const redirectTo = new URL(RUTAS.reset, window.location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return mostrarAlerta(alerta, traducirError(error));
  mostrarAlerta(alerta, 'Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.', 'ok');
});
