# 🛡️ CyberRisk Intelligence Platform — Wiki

**Plataforma de Inteligencia de Amenazas para PYMEs Colombianas**
Análisis Predictivo de Vulnerabilidades mediante Big Data y Machine Learning

---

## 📁 Estructura del Proyecto

```
cyberrisk/
├── index.html                    ← Estructura HTML pura (sin contenido)
│
├── assets/
│   ├── css/
│   │   └── main.css              ← Todos los estilos
│   └── js/
│       ├── loader.js             ← Carga y caché de archivos JSON
│       ├── renderer.js           ← Convierte JSON → HTML (un renderer por tipo)
│       └── app.js                ← Controlador principal (navegación, sidebar)
│
├── data/
│   ├── nav.json                  ← Registro central de secciones ← EDITAR AQUÍ
│   └── sections/
│       ├── acta.json             ← Acta de Constitución
│       ├── interesados.json      ← Análisis de Interesados
│       ├── vision.json           ← Visión del Proyecto
│       ├── objetivos.json        ← Objetivos
│       ├── alcance.json          ← Alcance
│       └── metodologia.json      ← Metodología
│
├── dashboards/                   ← Aquí van los dashboards Python exportados
│   └── README.md
│
└── README.md
```

---

## ✏️ Cómo Editar Contenido

**Nunca toques el HTML.** Solo edita los archivos JSON.

### Modificar una sección existente
Abre `data/sections/acta.json` (por ejemplo) y edita el texto de los campos.

### Agregar una sección nueva
**Paso 1 — Crea el JSON:**
```json
// data/sections/riesgos.json
{
  "meta": {
    "id": "riesgos",
    "title": "Análisis de Riesgos",
    "sprint": "Sprint 2",
    "fecha": "2026-04-01",
    "version": "1.0"
  },
  "blocks": [
    {
      "type": "paragraph",
      "label": "Descripción",
      "content": "Identificación y valoración de riesgos del proyecto..."
    }
  ]
}
```

**Paso 2 — Regístrala en `data/nav.json`:**
```json
{
  "id": "riesgos",
  "label": "Análisis de Riesgos",
  "icon": "◈",
  "file": "data/sections/riesgos.json",
  "order": 7,
  "sprint": 2,
  "status": "done"
}
```
¡Listo! La web la mostrará automáticamente.

---

## 📦 Tipos de Bloque Disponibles

| Tipo | Descripción |
|------|-------------|
| `highlight` | Caja destacada (objetivo general, visión) |
| `paragraph` | Párrafo de texto |
| `numbered-list` | Lista numerada (objetivos específicos) |
| `bullet-list` | Lista con viñetas |
| `two-col` | Dos columnas (incluye/no incluye) |
| `deliverables` | Lista de entregables con código y fecha |
| `timeline` | Línea de tiempo de fases |
| `cards-grid` | Cuadrícula de tarjetas |
| `kpi-grid` | Grid de indicadores KPI |
| `differentiators` | Lista de diferenciadores con número grande |
| `stakeholders` | Tarjetas de interesados |
| `stakeholder-matrix` | Matriz de poder/interés 2×2 |
| `signatures` | Panel de firmas/aprobaciones |
| `dashboard` | **iframe para dashboards Python** (Plotly, Dash, etc.) |

### Integrar un Dashboard Python
```json
{
  "type": "dashboard",
  "label": "Dashboard de Amenazas en Tiempo Real",
  "src": "dashboards/amenazas_dashboard.html",
  "height": "650px"
}
```
Exporta tu notebook de Jupyter o tu app Plotly como HTML y ponla en `/dashboards/`.

---

## 🚀 Ejecutar Localmente

Requiere un servidor local (por restricciones CORS de `fetch()`):

```bash
# Python
python3 -m http.server 8080
# Abrir: http://localhost:8080

# Node.js
npx serve .

# VS Code
# Instalar "Live Server" → clic derecho en index.html → "Open with Live Server"
```

## 🌐 Publicar en GitHub Pages

```bash
git add .
git commit -m "feat: nueva sección de riesgos"
git push origin main
# Settings → Pages → Source: main / root
```

---

---

## 🔐 Plataforma con usuarios (Supabase) — carpeta `app/`

Las empresas se registran, autorizan el escaneo y ven su historial de riesgo.

```
app/
├── index.html        ← redirige según la sesión (login / onboarding / dashboard)
├── login.html        ← ingreso y registro (correo + contraseña)
├── reset.html        ← nueva contraseña (enlace del correo)
├── onboarding.html   ← registro de empresa + autorización de escaneo
├── dashboard.html    ← estado, hallazgos priorizados, evolución, activos, historial
├── escaneo.html      ← cuestionario existente, guardado a nombre de la empresa
├── css/app.css
└── js/               ← config.js (URL + llave pública), supabase-client, auth, ui, …
supabase/schema.sql   ← tablas + Row Level Security (cada empresa solo ve lo suyo)
ml/plataforma.py      ← API: análisis del cuestionario y del agente (/api/...)
ml/mapeo_agente.py    ← traduce el inventario del agente al catálogo del modelo
data/agente-mapeo.json← reglas programa/servicio → vendor/product (editable)
agente/               ← agente Windows (.exe): ver agente/README.md
```

### Ejecutar en local
1. **API:** copia `ml/.env.example` como `ml/.env`, pega la *secret key* de Supabase
   (Project Settings → API Keys) y luego:
   ```bash
   cd ml
   uv sync          # instala python-dotenv (nueva dependencia)
   flask run
   ```
2. **Web:** abre `index.html` con Live Server y pulsa **Ingresar**.

> ⚠ `ml/.env` contiene la llave secreta: está en `.gitignore` y nunca debe subirse.

---

## 👥 Equipo

| Nombre | Rol |
|--------|-----|
| Juan Camilo Madero | Líder de Proyecto / Arquitecto de Datos |
| Oscar Daniel Farfan Juanias | Co-Investigador / ML Engineer |

---

## 📄 Stack

- **Frontend:** HTML5 · CSS3 · JavaScript Vanilla
- **Datos:** JSON (contenido) · fetch() (carga dinámica)
- **ML/Backend (futuro):** Python · FastAPI · Scikit-learn · Plotly
- **CI/CD:** GitHub Actions · GitHub Pages
