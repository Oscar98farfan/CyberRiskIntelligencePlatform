"""
cyberrisk_agente.py — Ventana del Agente CyberRisk (punto de entrada del .exe)
═══════════════════════════════════════════════════════════════════
Pantallas:
  1. ENLACE      → el cliente pega el código del dashboard (una sola vez)
  2. INICIO      → empresa y equipo enlazados · botón "Escanear este equipo"
  3. VISTA PREVIA→ todo lo recolectado, por pestañas + JSON exacto a enviar
                   [Guardar copia]  [Cancelar]  [Enviar a CyberRisk]
  4. RESULTADO   → resumen devuelto por la API

Las tareas lentas (recolectar, enviar) corren en un hilo aparte para que
la ventana no se congele; los resultados vuelven por una cola.
═══════════════════════════════════════════════════════════════════
"""

import json
import queue
import socket
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import cliente_api
import configuracion
import recolector

# Paleta (misma identidad que la web)
C = {"bg": "#0f1a26", "panel": "#142233", "texto": "#c3d5e6", "tenue": "#8ba3ba",
     "claro": "#f0f7ff", "cian": "#00c8e8", "rojo": "#ff5a5a", "ambar": "#ffb627", "verde": "#3ddc84"}
NIVELES = {1: ("Bajo", C["verde"]), 2: ("Medio", C["cian"]), 3: ("Alto", C["ambar"]),
           4: ("Crítico", C["rojo"]), 5: ("Crítico", C["rojo"])}


class AgenteApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Agente CyberRisk")
        self.geometry("860x600")
        self.minsize(720, 520)
        self.configure(bg=C["bg"])
        self._estilos()

        self.cola = queue.Queue()
        self.config_local = configuracion.cargar()
        self.inventario = None

        self.contenedor = tk.Frame(self, bg=C["bg"])
        self.contenedor.pack(fill="both", expand=True, padx=24, pady=20)
        self.after(100, self._revisar_cola)

        if self.config_local:
            self.pantalla_inicio()
        else:
            self.pantalla_enlace()

    # ─────────── utilidades de interfaz ───────────
    def _estilos(self):
        s = ttk.Style(self)
        s.theme_use("clam")
        s.configure(".", background=C["bg"], foreground=C["texto"], fieldbackground=C["panel"], font=("Segoe UI", 10))
        s.configure("TLabel", background=C["bg"], foreground=C["texto"])
        s.configure("Titulo.TLabel", font=("Segoe UI Semibold", 17), foreground=C["claro"])
        s.configure("Tenue.TLabel", foreground=C["tenue"])
        s.configure("TButton", padding=(14, 8), background=C["panel"], foreground=C["claro"], borderwidth=1)
        s.map("TButton", background=[("active", "#1c3048"), ("disabled", C["bg"])],
              foreground=[("disabled", C["tenue"])])
        s.configure("Primario.TButton", background=C["cian"], foreground="#05080c", font=("Segoe UI Semibold", 10))
        s.map("Primario.TButton", background=[("active", "#20e0ff"), ("disabled", "#2f4d6a")])
        s.configure("TEntry", foreground=C["claro"], insertcolor=C["claro"], padding=6)
        s.configure("TNotebook", background=C["bg"], borderwidth=0)
        s.configure("TNotebook.Tab", background=C["panel"], foreground=C["tenue"], padding=(12, 6))
        s.map("TNotebook.Tab", background=[("selected", C["bg"])], foreground=[("selected", C["cian"])])
        s.configure("Treeview", background=C["panel"], fieldbackground=C["panel"], foreground=C["texto"], rowheight=24)
        s.configure("Treeview.Heading", background=C["bg"], foreground=C["tenue"])

    def _limpiar(self):
        for w in self.contenedor.winfo_children():
            w.destroy()

    def _encabezado(self, titulo, subtitulo=""):
        ttk.Label(self.contenedor, text="⬡  CyberRisk · Agente", foreground=C["cian"]).pack(anchor="w")
        ttk.Label(self.contenedor, text=titulo, style="Titulo.TLabel").pack(anchor="w", pady=(6, 2))
        if subtitulo:
            ttk.Label(self.contenedor, text=subtitulo, style="Tenue.TLabel", wraplength=780,
                      justify="left").pack(anchor="w", pady=(0, 14))

    def _en_segundo_plano(self, tarea, al_terminar):
        """Ejecuta tarea() en un hilo; al_terminar(resultado, error) corre en la ventana."""
        def trabajo():
            try:
                self.cola.put((al_terminar, tarea(), None))
            except Exception as e:  # noqa: BLE001 — se muestra al usuario
                self.cola.put((al_terminar, None, e))
        threading.Thread(target=trabajo, daemon=True).start()

    def _revisar_cola(self):
        try:
            while True:
                funcion, resultado, error = self.cola.get_nowait()
                funcion(resultado, error)
        except queue.Empty:
            pass
        self.after(100, self._revisar_cola)

    # ─────────── 1. ENLACE ───────────
    def pantalla_enlace(self):
        self._limpiar()
        self._encabezado("Enlaza este equipo con tu empresa",
                         "En el dashboard de CyberRisk pulsa «Agregar equipo» y copia el código de 8 caracteres. "
                         "Solo se hace una vez por equipo.")
        formulario = tk.Frame(self.contenedor, bg=C["bg"])
        formulario.pack(anchor="w", fill="x")

        ttk.Label(formulario, text="Código de enlace").pack(anchor="w")
        codigo = ttk.Entry(formulario, width=20, font=("Consolas", 16))
        codigo.pack(anchor="w", pady=(4, 12))
        codigo.focus_set()

        ttk.Label(formulario, text="Servidor de CyberRisk", style="Tenue.TLabel").pack(anchor="w")
        servidor = ttk.Entry(formulario, width=50)
        servidor.insert(0, configuracion.API_URL_PREDETERMINADA)
        servidor.pack(anchor="w", pady=(4, 16))

        estado = ttk.Label(formulario, text="", style="Tenue.TLabel")
        boton = ttk.Button(formulario, text="Enlazar equipo", style="Primario.TButton")
        boton.pack(anchor="w")
        estado.pack(anchor="w", pady=10)

        def enlazar():
            cod, url = codigo.get().strip(), servidor.get().strip()
            if len(cod.replace("-", "").replace(" ", "")) != 8:
                messagebox.showwarning("Código", "El código tiene 8 caracteres, por ejemplo K7F3-9QXM.")
                return
            boton.state(["disabled"])
            estado.configure(text="Enlazando…")
            plataforma = "windows" if sys.platform.startswith("win") else None
            self._en_segundo_plano(
                lambda: cliente_api.enlazar(url, cod, socket.gethostname(), plataforma),
                lambda r, e: terminado(r, e, url))

        def terminado(respuesta, error, url):
            boton.state(["!disabled"])
            if error:
                estado.configure(text="")
                messagebox.showerror("No se pudo enlazar", str(error))
                return
            configuracion.guardar(url, respuesta["token"], respuesta["agente_id"], respuesta.get("empresa"))
            self.config_local = configuracion.cargar()
            self.pantalla_inicio()

        boton.configure(command=enlazar)
        codigo.bind("<Return>", lambda _e: enlazar())

    # ─────────── 2. INICIO ───────────
    def pantalla_inicio(self):
        self._limpiar()
        empresa = self.config_local.get("empresa") or "tu empresa"
        self._encabezado(f"Equipo enlazado a {empresa}",
                         "El escaneo recolecta SOLO metadatos de inventario: sistema operativo, programas instalados "
                         "y sus versiones, servicios, puertos en escucha y nombres de procesos.\n"
                         "NUNCA lee archivos, contraseñas, correos ni tráfico de red. Antes de enviar verás "
                         "exactamente lo que se recolectó.")
        ttk.Label(self.contenedor, text=f"Equipo: {socket.gethostname()}").pack(anchor="w")
        ttk.Label(self.contenedor, text=f"Servidor: {self.config_local['api_url']}", style="Tenue.TLabel").pack(anchor="w", pady=(0, 18))

        estado = ttk.Label(self.contenedor, text="", style="Tenue.TLabel")
        boton = ttk.Button(self.contenedor, text="Escanear este equipo", style="Primario.TButton")
        boton.pack(anchor="w")
        estado.pack(anchor="w", pady=10)

        def escanear():
            boton.state(["disabled"])
            estado.configure(text="Recolectando inventario… (puede tardar unos segundos)")
            self._en_segundo_plano(recolector.recolectar, terminado)

        def terminado(inventario, error):
            boton.state(["!disabled"])
            if error:
                estado.configure(text="")
                messagebox.showerror("Error al recolectar", str(error))
                return
            self.inventario = inventario
            self.pantalla_vista_previa()

        boton.configure(command=escanear)

        pie = tk.Frame(self.contenedor, bg=C["bg"])
        pie.pack(side="bottom", fill="x")
        ttk.Button(pie, text="Desenlazar este equipo", command=self._desenlazar).pack(side="right")

    def _desenlazar(self):
        if messagebox.askyesno("Desenlazar", "¿Quitar el enlace de este equipo? Necesitarás un código nuevo para volver a enlazarlo."):
            configuracion.borrar()
            self.config_local = None
            self.pantalla_enlace()

    # ─────────── 3. VISTA PREVIA ───────────
    def pantalla_vista_previa(self):
        self._limpiar()
        inv = self.inventario
        eq = inv["equipo"]
        self._encabezado("Revisa lo que se va a enviar",
                         f"{eq['hostname']} · {eq.get('so') or ''} {eq.get('so_version') or ''} — "
                         f"{len(inv['software'])} programas · {len(inv['servicios'])} servicios · "
                         f"{len(inv['puertos'])} puertos en escucha · {len(inv['procesos'])} procesos")

        pestanas = ttk.Notebook(self.contenedor)
        pestanas.pack(fill="both", expand=True)
        self._tabla(pestanas, "Programas", ("Nombre", "Versión", "Fabricante"),
                    [(s["nombre"], s.get("version") or "", s.get("fabricante") or "") for s in inv["software"]])
        self._tabla(pestanas, "Servicios", ("Servicio", "Nombre visible", "Estado", "Inicio"),
                    [(s["nombre"], s.get("display") or "", s.get("estado") or "", s.get("inicio") or "") for s in inv["servicios"]])
        self._tabla(pestanas, "Puertos", ("Protocolo", "Dirección", "Puerto", "Programa"),
                    [(p["protocolo"], p["direccion"], p["puerto"], p.get("proceso") or "—") for p in inv["puertos"]])
        self._tabla(pestanas, "Procesos", ("Nombre del programa",), [(p,) for p in inv["procesos"]])

        marco_json = tk.Frame(pestanas, bg=C["panel"])
        texto = tk.Text(marco_json, bg=C["panel"], fg=C["texto"], insertbackground=C["claro"],
                        font=("Consolas", 9), wrap="none", borderwidth=0)
        barra = ttk.Scrollbar(marco_json, command=texto.yview)
        texto.configure(yscrollcommand=barra.set)
        barra.pack(side="right", fill="y")
        texto.pack(fill="both", expand=True)
        texto.insert("1.0", json.dumps(inv, indent=2, ensure_ascii=False))
        texto.configure(state="disabled")
        pestanas.add(marco_json, text="JSON exacto a enviar")

        botones = tk.Frame(self.contenedor, bg=C["bg"])
        botones.pack(fill="x", pady=(14, 0))
        self.estado_envio = ttk.Label(botones, text="", style="Tenue.TLabel")
        self.estado_envio.pack(side="left")
        self.boton_enviar = ttk.Button(botones, text="Enviar a CyberRisk", style="Primario.TButton", command=self._enviar)
        self.boton_enviar.pack(side="right")
        ttk.Button(botones, text="Cancelar", command=self.pantalla_inicio).pack(side="right", padx=8)
        ttk.Button(botones, text="Guardar copia…", command=self._guardar_copia).pack(side="right")

    def _tabla(self, pestanas, titulo, columnas, filas):
        marco = tk.Frame(pestanas, bg=C["panel"])
        arbol = ttk.Treeview(marco, columns=columnas, show="headings")
        for col in columnas:
            arbol.heading(col, text=col)
            arbol.column(col, width=160 if len(columnas) > 1 else 600, anchor="w")
        for fila in filas:
            arbol.insert("", "end", values=fila)
        barra = ttk.Scrollbar(marco, command=arbol.yview)
        arbol.configure(yscrollcommand=barra.set)
        barra.pack(side="right", fill="y")
        arbol.pack(fill="both", expand=True)
        pestanas.add(marco, text=f"{titulo} ({len(filas)})")

    def _guardar_copia(self):
        ruta = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON", "*.json")],
                                            initialfile=f"inventario-{self.inventario['equipo']['hostname']}.json")
        if ruta:
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(self.inventario, f, indent=2, ensure_ascii=False)

    def _enviar(self):
        self.boton_enviar.state(["disabled"])
        self.estado_envio.configure(text="Enviando y analizando… (el modelo puede tardar unos minutos)")
        cfg = self.config_local
        self._en_segundo_plano(lambda: cliente_api.enviar_inventario(cfg["api_url"], cfg["token"], self.inventario),
                               self._envio_terminado)

    def _envio_terminado(self, respuesta, error):
        if error:
            self.boton_enviar.state(["!disabled"])
            self.estado_envio.configure(text="")
            messagebox.showerror("No se pudo enviar", str(error))
            return
        self.pantalla_resultado(respuesta)

    # ─────────── 4. RESULTADO ───────────
    def pantalla_resultado(self, respuesta):
        self._limpiar()
        r = respuesta.get("resumen", {})
        nivel, color = NIVELES.get(r.get("tier_max"), ("Sin hallazgos", C["verde"]))
        self._encabezado("Análisis completado",
                         f"Equipo «{respuesta.get('activo', {}).get('nombre', '')}» · "
                         f"{r.get('reconocidos', 0)} tecnologías reconocidas · "
                         f"{r.get('no_reconocidos', 0)} programas aún sin regla de análisis")
        tk.Label(self.contenedor, text=f"Nivel de riesgo: {nivel}", bg=C["bg"], fg=color,
                 font=("Segoe UI Semibold", 22)).pack(anchor="w", pady=(4, 6))
        ttk.Label(self.contenedor, text=f"{r.get('hallazgos', 0)} hallazgos · {r.get('criticos', 0)} críticos").pack(anchor="w")
        ttk.Label(self.contenedor, text="Revisa el detalle y las prioridades en tu dashboard de CyberRisk.",
                  style="Tenue.TLabel").pack(anchor="w", pady=(18, 18))
        ttk.Button(self.contenedor, text="Volver al inicio", command=self.pantalla_inicio).pack(anchor="w")


if __name__ == "__main__":
    AgenteApp().mainloop()
