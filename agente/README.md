# Agente CyberRisk (Windows)

Pequeño programa que recolecta **solo metadatos de inventario** del equipo y,
después de que el cliente los revisa y aprueba, los envía a la API de CyberRisk.

| Recolecta | No recolecta nunca |
|---|---|
| Sistema operativo, versión y build | Archivos o documentos |
| Programas instalados (nombre, versión, fabricante) | Contraseñas o credenciales |
| Servicios (nombre y estado) | Correos, mensajes o historial |
| Puertos en escucha y el programa que los usa | Tráfico de red |
| Nombres de procesos (sin parámetros) | Usuarios ni parámetros de procesos |

## Archivos
- `recolector.py` → qué se recolecta (`uv run python recolector.py` imprime el JSON sin enviar nada)
- `cliente_api.py` → llamadas a la API (`/api/agente/enlazar` y `/api/agente/inventario`)
- `configuracion.py` → guarda el enlace en `%APPDATA%\CyberRisk\agente.json` (token cifrado con DPAPI)
- `cyberrisk_agente.py` → ventana: enlace → escanear → vista previa → enviar → resultado
- `build.ps1` → genera `dist\CyberRisk-Agente.exe`

## Probar sin generar el .exe
```powershell
cd agente
uv sync
uv run python cyberrisk_agente.py
```

## Generar el .exe
```powershell
cd agente
.\build.ps1
```
El ejecutable no está firmado: Windows mostrará «Windows protegió su PC» →
«Más información» → «Ejecutar de todas formas». Para distribuir a clientes
conviene firmarlo con un certificado de firma de código.

## Flujo
1. Dashboard → **Agregar equipo** → código de 8 caracteres (vence en 24 h, un solo uso).
2. El agente canjea el código por su token permanente (se guarda cifrado).
3. **Escanear** → vista previa completa → **Enviar**.
4. La API crea/actualiza el activo, traduce el software al catálogo del modelo
   (`data/agente-mapeo.json`), corre el modelo y guarda los hallazgos.
