"""
cliente_api.py — Comunicación del agente con la API de CyberRisk.
Usa solo la librería estándar (urllib) para que el .exe sea liviano.
"""

import json
import urllib.error
import urllib.request

from recolector import VERSION_AGENTE


class ErrorConexion(Exception):
    """Mensaje listo para mostrar al usuario."""


def _post(url, cuerpo, token=None, timeout=60):
    datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=datos, method="POST", headers={
        "Content-Type": "application/json",
        "User-Agent": f"CyberRisk-Agente/{VERSION_AGENTE}",
        **({"Authorization": f"Bearer {token}"} if token else {}),
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            mensaje = json.loads(e.read().decode("utf-8")).get("error")
        except ValueError:
            mensaje = None
        raise ErrorConexion(mensaje or f"El servidor respondió con error {e.code}.") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ErrorConexion(
            "No se pudo conectar con el servidor de CyberRisk.\n"
            f"Revisa tu conexión a internet y la dirección del servidor ({url.split('/api/')[0]})."
        ) from e


def enlazar(api_url, codigo, hostname, plataforma):
    """Canjea el código de un solo uso por el token del agente."""
    return _post(f"{api_url.rstrip('/')}/api/agente/enlazar", {
        "codigo": codigo, "hostname": hostname, "plataforma": plataforma, "version": VERSION_AGENTE,
    })


def enviar_inventario(api_url, token, inventario):
    """Envía el inventario aprobado. El modelo puede tardar: timeout amplio."""
    return _post(f"{api_url.rstrip('/')}/api/agente/inventario", inventario, token=token, timeout=600)
