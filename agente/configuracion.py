"""
configuracion.py — Guarda el enlace del agente en el equipo del cliente.
═══════════════════════════════════════════════════════════════════
Archivo:  %APPDATA%\\CyberRisk\\agente.json   (Linux/macOS: ~/.config/cyberrisk)

El token del agente se guarda CIFRADO con DPAPI de Windows (solo lo puede
descifrar el mismo usuario en el mismo equipo). En otros sistemas se guarda
con permisos de solo-usuario.
═══════════════════════════════════════════════════════════════════
"""

import base64
import json
import os
import sys
from pathlib import Path

# URL de la API por defecto (se puede cambiar en la pantalla de enlace)
API_URL_PREDETERMINADA = "http://127.0.0.1:5000"

ES_WINDOWS = sys.platform.startswith("win")


def _carpeta():
    if ES_WINDOWS:
        return Path(os.environ.get("APPDATA", Path.home())) / "CyberRisk"
    return Path.home() / ".config" / "cyberrisk"


RUTA = _carpeta() / "agente.json"


# ── DPAPI (Windows) ──────────────────────────────────────────────
if ES_WINDOWS:
    import ctypes
    from ctypes import wintypes

    class _DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    def _blob(datos):
        buf = ctypes.create_string_buffer(datos, len(datos))
        return _DATA_BLOB(len(datos), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf

    def _dpapi(datos, cifrar):
        entrada, _buf = _blob(datos)
        salida = _DATA_BLOB()
        fn = ctypes.windll.crypt32.CryptProtectData if cifrar else ctypes.windll.crypt32.CryptUnprotectData
        if not fn(ctypes.byref(entrada), None, None, None, None, 0, ctypes.byref(salida)):
            raise OSError("DPAPI falló")
        try:
            return ctypes.string_at(salida.pbData, salida.cbData)
        finally:
            ctypes.windll.kernel32.LocalFree(salida.pbData)


def _proteger(texto):
    if ES_WINDOWS:
        return "dpapi:" + base64.b64encode(_dpapi(texto.encode(), True)).decode()
    return "plano:" + texto


def _desproteger(valor):
    if valor.startswith("dpapi:") and ES_WINDOWS:
        return _dpapi(base64.b64decode(valor[6:]), False).decode()
    if valor.startswith("plano:"):
        return valor[6:]
    return None


# ── API pública ──────────────────────────────────────────────────
def cargar():
    """Devuelve {'api_url', 'token', 'agente_id', 'empresa'} o None si no está enlazado."""
    try:
        datos = json.loads(RUTA.read_text(encoding="utf-8"))
        datos["token"] = _desproteger(datos.pop("token_protegido"))
        return datos if datos.get("token") else None
    except (OSError, ValueError, KeyError):
        return None


def guardar(api_url, token, agente_id, empresa):
    RUTA.parent.mkdir(parents=True, exist_ok=True)
    RUTA.write_text(json.dumps({
        "api_url": api_url, "agente_id": agente_id, "empresa": empresa,
        "token_protegido": _proteger(token),
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    if not ES_WINDOWS:
        os.chmod(RUTA, 0o600)


def borrar():
    try:
        RUTA.unlink()
    except OSError:
        pass
