# 🛡️ Plataforma de Inteligencia de Amenazas para PYMEs Colombianas
### Análisis Predictivo de Vulnerabilidades mediante Big Data y Machine Learning

Wiki del proyecto académico — Sprint 1

---

## 📁 Estructura del Proyecto

```
threat-intel-wiki/
├── index.html              ← Aplicación web principal (NO tocar para editar contenido)
├── content/                ← ✏️  ARCHIVOS DE CONTENIDO (editar aquí)
│   ├── config.txt          ← Configuración general del sitio
│   ├── acta-constitucion.txt      ← Acta de Constitución del Proyecto
│   ├── analisis-interesados.txt   ← Análisis de Interesados / Stakeholders
│   └── vision-proyecto.txt        ← Visión del Proyecto
└── README.md
```

---

## ✏️ Cómo Editar el Contenido

**No necesitas tocar el código HTML.** Solo edita los archivos `.txt` en la carpeta `content/`.

### Formato de los archivos .txt

Los archivos usan un formato simple de secciones y clave=valor:

```
[NOMBRE_DE_SECCION]
clave=valor
otra_clave=otro valor
```

### Ejemplo de edición

Para cambiar el objetivo general del proyecto, abre `content/acta-constitucion.txt` y modifica:

```
[OBJETIVO_GENERAL]
Desarrollar una Plataforma de... (tu nuevo texto aquí)
```

Para agregar un nuevo interesado, abre `content/analisis-interesados.txt` y agrega al final de la sección `[INTERESADOS]`:

```
---
ID=S11
Nombre=Nombre del Nuevo Interesado
Rol=Su rol
Tipo=Interno  (o Externo)
Poder=Alto  (Alto / Medio / Bajo)
Interes=Medio
Influencia=Alta
Expectativas=Qué espera del proyecto.
Estrategia=Cómo lo gestionaremos.
```

---

## 🚀 Cómo Ejecutar Localmente

La wiki necesita un servidor web local para leer los archivos `.txt` (por restricciones de seguridad del navegador).

### Opción 1: Python (recomendado)
```bash
cd threat-intel-wiki
python3 -m http.server 8080
# Abrir: http://localhost:8080
```

### Opción 2: Node.js (npx)
```bash
npx serve threat-intel-wiki
```

### Opción 3: VS Code Live Server
Instala la extensión **Live Server** y haz clic derecho en `index.html` → "Open with Live Server".

---

## 🌐 Despliegue en GitHub Pages

1. Sube el repositorio a GitHub
2. Ve a Settings → Pages
3. En "Source" selecciona la rama `main` y la carpeta raíz `/`
4. La wiki estará disponible en `https://[usuario].github.io/[repo]/`

---

## 📋 Entregables Sprint 1

| # | Entregable | Archivo | Estado |
|---|-----------|---------|--------|
| 1 | Acta de Constitución | `content/acta-constitucion.txt` | ✅ Completo |
| 2 | Análisis de Interesados | `content/analisis-interesados.txt` | ✅ Completo |
| 3 | Visión del Proyecto | `content/vision-proyecto.txt` | ✅ Completo |

---

## 👥 Equipo

| Nombre | Rol |
|--------|-----|
| Integrante 1 | Líder de Proyecto / Arquitecto de Datos |
| Integrante 2 | Desarrollador ML / Data Scientist |
| Integrante 3 | Desarrollador Full Stack |
| Integrante 4 | Analista de Seguridad / QA |

---

## 📄 Licencia
Proyecto académico — Uso educativo.
