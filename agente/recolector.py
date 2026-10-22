"""
recolector.py — Recolección del inventario del equipo (SOLO LECTURA)
═══════════════════════════════════════════════════════════════════
Qué recolecta (y nada más):
  - equipo:    nombre del equipo, sistema operativo, versión, build, arquitectura
  - software:  programas instalados → nombre, versión, fabricante
  - servicios: nombre, nombre visible, estado, tipo de inicio
  - puertos:   puertos en escucha → protocolo, dirección, puerto, programa
  - procesos:  SOLO el nombre del ejecutable (sin parámetros: pueden contener claves)

Qué NO recolecta: archivos, documentos, contraseñas, correos, historial,
tráfico de red, usuarios ni parámetros de los procesos.

No necesita permisos de administrador (sin ellos, algunos puertos pueden
aparecer sin el nombre del programa).
═══════════════════════════════════════════════════════════════════
"""

import platform
import socket
import sys
from datetime import datetime, timezone

import psutil

VERSION_AGENTE = "0.1.0"
ES_WINDOWS = sys.platform.startswith("win")

if ES_WINDOWS:
    import winreg


# ─────────────────────────── Equipo / SO ───────────────────────────
def _leer_valor(clave, nombre):
    try:
        return winreg.QueryValueEx(clave, nombre)[0]
    except OSError:
        return None


def info_equipo():
    equipo = {
        "hostname": socket.gethostname(),
        "so": f"{platform.system()} {platform.release()}",
        "so_version": platform.version(),
        "so_build": None,
        "arquitectura": platform.machine(),
    }
    if ES_WINDOWS:
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") as k:
                producto = _leer_valor(k, "ProductName") or "Windows"
                build = str(_leer_valor(k, "CurrentBuild") or "")
                ubr = _leer_valor(k, "UBR")
                # Windows 11 sigue diciendo "Windows 10" en el registro: se corrige por el número de build
                if build.isdigit() and int(build) >= 22000 and "Windows 10" in producto:
                    producto = producto.replace("Windows 10", "Windows 11")
                equipo["so"] = producto
                equipo["so_version"] = _leer_valor(k, "DisplayVersion") or _leer_valor(k, "ReleaseId")
                equipo["so_build"] = f"{build}.{ubr}" if ubr is not None else build
        except OSError:
            pass
    return equipo


# ─────────────────────────── Software ───────────────────────────
_RUTA_DESINSTALAR = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"


def _software_windows():
    vistos, lista = set(), []
    fuentes = [
        (winreg.HKEY_LOCAL_MACHINE, winreg.KEY_WOW64_64KEY),
        (winreg.HKEY_LOCAL_MACHINE, winreg.KEY_WOW64_32KEY),
        (winreg.HKEY_CURRENT_USER, 0),
    ]
    for raiz, vista in fuentes:
        try:
            base = winreg.OpenKey(raiz, _RUTA_DESINSTALAR, 0, winreg.KEY_READ | vista)
        except OSError:
            continue
        with base:
            for i in range(winreg.QueryInfoKey(base)[0]):
                try:
                    with winreg.OpenKey(base, winreg.EnumKey(base, i)) as k:
                        nombre = _leer_valor(k, "DisplayName")
                        if not nombre:
                            continue
                        # Omitir componentes internos y parches (no son "programas" para el usuario)
                        if _leer_valor(k, "SystemComponent") == 1 or _leer_valor(k, "ParentKeyName"):
                            continue
                        if str(_leer_valor(k, "ReleaseType") or "").lower() in ("update", "hotfix", "security update"):
                            continue
                        version = _leer_valor(k, "DisplayVersion")
                        clave = (str(nombre).strip().lower(), str(version or ""))
                        if clave in vistos:
                            continue
                        vistos.add(clave)
                        lista.append({"nombre": str(nombre).strip(),
                                      "version": str(version) if version else None,
                                      "fabricante": _leer_valor(k, "Publisher")})
                except OSError:
                    continue
    return sorted(lista, key=lambda s: s["nombre"].lower())


def software_instalado():
    return _software_windows() if ES_WINDOWS else []   # Linux/macOS: próxima versión


# ─────────────────────────── Servicios ───────────────────────────
def servicios():
    if not ES_WINDOWS:
        return []
    lista = []
    for s in psutil.win_service_iter():
        try:
            lista.append({"nombre": s.name(), "display": s.display_name(),
                          "estado": s.status(), "inicio": s.start_type()})
        except (psutil.Error, OSError):
            continue
    return sorted(lista, key=lambda s: s["nombre"].lower())


# ─────────────────────────── Puertos ───────────────────────────
def _nombre_proceso(pid):
    if not pid:
        return None
    try:
        return psutil.Process(pid).name()
    except (psutil.Error, OSError):
        return None


def puertos_en_escucha():
    try:
        conexiones = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, OSError):
        return []
    vistos, lista = set(), []
    for c in conexiones:
        if not c.laddr:
            continue
        es_tcp = c.type == socket.SOCK_STREAM
        if es_tcp and c.status != psutil.CONN_LISTEN:
            continue                      # solo puertos abiertos esperando conexiones
        if not es_tcp and c.raddr:
            continue
        clave = ("tcp" if es_tcp else "udp", c.laddr.ip, c.laddr.port)
        if clave in vistos:
            continue
        vistos.add(clave)
        lista.append({"protocolo": clave[0], "direccion": c.laddr.ip, "puerto": c.laddr.port,
                      "proceso": _nombre_proceso(c.pid)})
    return sorted(lista, key=lambda p: (p["protocolo"], p["puerto"]))


# ─────────────────────────── Procesos ───────────────────────────
def procesos():
    nombres = set()
    for p in psutil.process_iter(["name"]):
        nombre = p.info.get("name")
        if nombre:
            nombres.add(nombre)
    return sorted(nombres, key=str.lower)


# ─────────────────────────── Todo junto ───────────────────────────
def recolectar():
    """Devuelve el inventario completo, exactamente como se enviará."""
    return {
        "agente": {"version": VERSION_AGENTE, "plataforma": "windows" if ES_WINDOWS else sys.platform},
        "recolectado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "equipo": info_equipo(),
        "software": software_instalado(),
        "servicios": servicios(),
        "puertos": puertos_en_escucha(),
        "procesos": procesos(),
    }


if __name__ == "__main__":
    import json
    print(json.dumps(recolectar(), indent=2, ensure_ascii=False))
