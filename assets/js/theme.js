/**
 * theme.js — Cambio de tema OSCURO / CLARO para toda la plataforma.
 * ─────────────────────────────────────────────────────────────────
 * Uso: cargar en el <head> SIN defer ni module, para que el tema se
 * aplique antes de pintar la página (evita el "parpadeo"):
 *     <link rel="stylesheet" href="…/assets/css/theme.css" />
 *     <script src="…/assets/js/theme.js"></script>
 *
 * - Prioridad: elección guardada del usuario → preferencia del sistema.
 * - El botón se inserta solo en la cabecera de la página (wiki, módulo
 *   de escaneo o dashboard). Si no hay cabecera, queda flotando.
 * - Al cambiar, emite el evento 'cr:tema' (lo usa el wiki para redibujar
 *   las gráficas, que no leen CSS automáticamente).
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var CLAVE = 'cr.tema';
  var raiz = document.documentElement;

  function leerGuardado() {
    try { return localStorage.getItem(CLAVE); } catch (e) { return null; }
  }
  function guardar(tema) {
    try { localStorage.setItem(CLAVE, tema); } catch (e) { /* sin almacenamiento */ }
  }
  function temaInicial() {
    var guardado = leerGuardado();
    if (guardado === 'light' || guardado === 'dark') return guardado;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light' : 'dark';
  }

  function aplicar(tema) {
    raiz.setAttribute('data-theme', tema);
    var boton = document.getElementById('cr-theme-toggle');
    if (boton) {
      var aClaro = tema === 'dark';
      boton.textContent = aClaro ? '☀' : '☾';
      boton.setAttribute('aria-label', aClaro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
      boton.title = boton.getAttribute('aria-label');
    }
  }

  /* 1. Aplicar de inmediato (antes de que se pinte el body) */
  aplicar(temaInicial());

  /* API pública mínima */
  window.CRTema = {
    actual: function () { return raiz.getAttribute('data-theme'); },
    alternar: function () {
      var nuevo = this.actual() === 'dark' ? 'light' : 'dark';
      guardar(nuevo);
      aplicar(nuevo);
      document.dispatchEvent(new CustomEvent('cr:tema', { detail: { tema: nuevo } }));
    }
  };

  /* 2. Insertar el botón cuando exista el DOM */
  function insertarBoton() {
    if (document.getElementById('cr-theme-toggle')) return;
    var boton = document.createElement('button');
    boton.type = 'button';
    boton.id = 'cr-theme-toggle';
    boton.className = 'cr-theme-toggle';
    boton.addEventListener('click', function () { window.CRTema.alternar(); });

    /* Cabeceras conocidas, en orden de preferencia */
    var destino =
      document.querySelector('.app-topbar__user') ||   // dashboard de la plataforma
      document.querySelector('.cr-hdr') ||             // módulo de escaneo
      document.getElementById('app-header');           // wiki

    if (destino) {
      if (destino.classList.contains('app-topbar__user')) destino.prepend(boton);
      else destino.appendChild(boton);
    } else {
      boton.classList.add('cr-theme-toggle--float');
      document.body.appendChild(boton);
    }
    aplicar(window.CRTema.actual());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertarBoton);
  } else {
    insertarBoton();
  }
})();
