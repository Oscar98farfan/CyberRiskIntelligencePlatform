/**
 * ui.js
 * ─────────────────────────────────────────────────────────────
 * Utilidades de interfaz compartidas por todas las páginas.
 *
 * Seguridad: todo el texto que viene del usuario o de la base de datos
 * se inserta con textContent (nunca innerHTML) para evitar XSS.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Crea un elemento DOM de forma segura.
 * @param {string} tag      - Etiqueta HTML (ej: 'div').
 * @param {Object} attrs    - Atributos. 'class', 'text', 'dataset' y on* son especiales.
 * @param {...(Node|string)} children - Hijos (los strings se insertan como texto).
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Muestra un mensaje en una caja de alerta (tipo: 'error' | 'ok' | 'info'). */
export function mostrarAlerta(contenedor, mensaje, tipo = 'error') {
  if (!contenedor) return;
  contenedor.textContent = mensaje;
  contenedor.className = `app-alert app-alert--${tipo}`;
  contenedor.hidden = !mensaje;
}

/** Activa / desactiva un botón mostrando un texto de "cargando". */
export function setCargando(boton, cargando, textoCargando = 'Procesando…') {
  if (!boton) return;
  if (cargando) {
    boton.dataset.textoOriginal = boton.textContent;
    boton.textContent = textoCargando;
    boton.disabled = true;
  } else {
    boton.textContent = boton.dataset.textoOriginal || boton.textContent;
    boton.disabled = false;
  }
}

/**
 * Fecha legible en español de Colombia.
 * @param {string} iso
 * @param {boolean} corta - true: "22 oct 2026" (para tablas); false: incluye la hora.
 */
export function formatearFecha(iso, corta = false) {
  if (!iso) return '—';
  const opciones = corta
    ? { year: 'numeric', month: 'short', day: '2-digit' }
    : { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' };
  return new Date(iso).toLocaleString('es-CO', opciones).replace(/ de /g, ' ');
}

/**
 * Traduce los errores de Supabase Auth a mensajes claros en español.
 * Se basa en el código del error cuando existe, y si no en el mensaje.
 */
export function traducirError(error) {
  if (!error) return '';
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  const mapa = {
    invalid_credentials: 'Correo o contraseña incorrectos.',
    user_already_exists: 'Ya existe una cuenta con ese correo. Inicia sesión.',
    email_exists: 'Ya existe una cuenta con ese correo. Inicia sesión.',
    weak_password: 'La contraseña es muy débil. Usa al menos 8 caracteres con letras y números.',
    over_email_send_rate_limit: 'Se enviaron demasiados correos. Espera unos minutos e intenta de nuevo.',
    over_request_rate_limit: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
    email_address_invalid: 'El correo no es válido.',
    same_password: 'La nueva contraseña debe ser diferente a la anterior.'
  };
  if (mapa[code]) return mapa[code];
  if (msg.includes('invalid login')) return mapa.invalid_credentials;
  if (msg.includes('already registered')) return mapa.user_already_exists;
  if (msg.includes('failed to fetch')) return 'No hay conexión con el servidor. Revisa tu internet.';
  return error.message || 'Ocurrió un error inesperado.';
}

/** Lectura / escritura segura de localStorage (puede fallar en modo privado). */
export const almacen = {
  get(clave) { try { return localStorage.getItem(clave); } catch { return null; } },
  set(clave, valor) { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } },
  del(clave) { try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ } }
};
