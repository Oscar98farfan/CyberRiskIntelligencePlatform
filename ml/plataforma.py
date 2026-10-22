"""
plataforma.py
═══════════════════════════════════════════════════════════════════
Endpoints de la plataforma multi-empresa (Supabase).

Flujo de un análisis:
  1. El navegador guarda el escaneo en Supabase (estado 'pendiente').
     RLS solo lo permite si el usuario es dueño/admin y la empresa
     tiene una autorización vigente.
  2. El navegador llama  POST /api/escaneos/<id>/analizar  enviando
     su token de sesión:  Authorization: Bearer <access_token>
  3. Esta API:
       a. Verifica el token con Supabase Auth.
       b. Verifica que el usuario sea dueño/admin de la empresa del escaneo.
       c. Marca el escaneo 'procesando' (evita procesarlo dos veces).
       d. Corre predecir() del modelo sobre el payload guardado.
       e. Guarda cada escenario en 'hallazgos' y el resumen en el escaneo,
          que queda 'completado' (o 'error' con el mensaje).

Seguridad:
  - La llave SECRETA de Supabase se lee del archivo ml/.env (nunca va
    al navegador ni a GitHub). Con ella la API escribe hallazgos, cosa
    que RLS no le permite al usuario.
  - La llave secreta se envía SOLO en el header 'apikey' (así lo exige
    Supabase para las llaves nuevas sb_secret_...).
═══════════════════════════════════════════════════════════════════
"""

import logging
import os
from datetime import datetime, timezone

import requests
from flask import Blueprint, jsonify, request

from predictor import predecir

log = logging.getLogger("cyberrisk.plataforma")

bp = Blueprint("plataforma", __name__, url_prefix="/api")

# ── Configuración (desde ml/.env) ────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
TIMEOUT = 20                      # segundos por llamada a Supabase
MAX_SISTEMAS = 50                 # límite de sistemas por escaneo
ROLES_QUE_ANALIZAN = {"dueno", "admin"}


class ErrorApi(Exception):
    """Error controlado: se devuelve al cliente con su código HTTP."""

    def __init__(self, mensaje, status=400):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status = status


# ── Cliente mínimo de Supabase (REST) ────────────────────────────
def _rest(metodo, ruta, *, json=None, params=None, retornar=False):
    """Llama a la API REST de Supabase con la llave secreta."""
    headers = {"apikey": SUPABASE_SECRET_KEY, "Content-Type": "application/json"}
    if retornar:
        headers["Prefer"] = "return=representation"
    r = requests.request(
        metodo, f"{SUPABASE_URL}/rest/v1/{ruta}",
        headers=headers, json=json, params=params, timeout=TIMEOUT,
    )
    if r.status_code >= 400:
        log.error("Supabase %s %s → %s %s", metodo, ruta, r.status_code, r.text[:300])
        raise ErrorApi("Error al comunicarse con la base de datos.", 502)
    return r.json() if r.content else None


def _usuario_del_token():
    """Valida el token de sesión del navegador y devuelve el id del usuario."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise ErrorApi("Falta el token de sesión.", 401)
    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={"apikey": SUPABASE_SECRET_KEY, "Authorization": auth},
        timeout=TIMEOUT,
    )
    if r.status_code != 200:
        raise ErrorApi("Sesión inválida o expirada. Vuelve a iniciar sesión.", 401)
    return r.json()["id"]


def _validar_payload(payload):
    """El payload debe ser la lista de canonical_json del cuestionario/agente."""
    if not isinstance(payload, list) or not payload:
        raise ErrorApi("El escaneo no tiene sistemas para analizar.", 422)
    if len(payload) > MAX_SISTEMAS:
        raise ErrorApi(f"Máximo {MAX_SISTEMAS} sistemas por escaneo.", 422)
    for item in payload:
        if not isinstance(item, dict) or not item.get("vendor") or not isinstance(item.get("products"), list):
            raise ErrorApi("Formato de sistema inválido (se requiere 'vendor' y 'products').", 422)


def _primero(lista):
    return lista[0] if isinstance(lista, list) and lista else None


def _a_hallazgos(resultados, escaneo):
    """Convierte la salida de predecir() en filas para la tabla hallazgos."""
    filas = []
    for item in resultados:
        for esc in item.get("top_scenarios", []):
            pred = esc.get("prediction", {})
            asset = esc.get("asset", {})
            filas.append({
                "escaneo_id": escaneo["id"],
                "empresa_id": escaneo["empresa_id"],
                "activo_id": escaneo.get("activo_id"),
                "vendor": _primero(asset.get("Vendor")),
                "producto": _primero(asset.get("Producto")),
                "cwe": ", ".join(asset.get("CWE") or []) or None,
                "severidad": _primero(asset.get("Severidad")),
                "tier": int(pred["tier"]) if pred.get("tier") is not None else None,
                "score": round(float(pred["score"]), 4) if pred.get("score") is not None else None,
                "detalle": {
                    "product_group": item.get("product"),
                    "attack": esc.get("attack"),
                    "impact": esc.get("impact"),
                },
            })
    return filas


def _ahora():
    return datetime.now(timezone.utc).isoformat()


# ── Endpoint ─────────────────────────────────────────────────────
@bp.post("/escaneos/<uuid:escaneo_id>/analizar")
def analizar_escaneo(escaneo_id):
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        return jsonify({"error": "La API no tiene configurado Supabase (revisa ml/.env)."}), 500

    escaneo = None
    try:
        user_id = _usuario_del_token()

        # 1. Escaneo
        filas = _rest("GET", "escaneos", params={
            "id": f"eq.{escaneo_id}",
            "select": "id,empresa_id,activo_id,estado,payload",
        })
        if not filas:
            raise ErrorApi("Escaneo no encontrado.", 404)
        escaneo = filas[0]

        # 2. Permiso: el usuario debe ser dueño/admin de esa empresa
        miembro = _rest("GET", "miembros", params={
            "empresa_id": f"eq.{escaneo['empresa_id']}",
            "user_id": f"eq.{user_id}",
            "select": "rol",
        })
        if not miembro or miembro[0]["rol"] not in ROLES_QUE_ANALIZAN:
            escaneo = None  # no tocar un escaneo ajeno en el manejo de errores
            raise ErrorApi("No tienes permiso para analizar este escaneo.", 403)

        # 3. Pasar a 'procesando' solo si estaba pendiente o con error
        #    (el filtro por estado evita que dos peticiones lo procesen a la vez)
        tomado = _rest("PATCH", "escaneos", retornar=True, params={
            "id": f"eq.{escaneo_id}",
            "estado": "in.(pendiente,error)",
        }, json={"estado": "procesando", "error": None})
        if not tomado:
            escaneo = None
            raise ErrorApi("Este escaneo ya fue procesado o se está procesando.", 409)

        # 4. Modelo
        payload = escaneo["payload"]
        _validar_payload(payload)
        resultados = []
        for canonical_json in payload:
            resultado = predecir(canonical_json)
            for item in resultado:
                item["original_products"] = canonical_json.get("products", [])
            resultados.extend(resultado)

        # 5. Guardar hallazgos y resumen
        hallazgos = _a_hallazgos(resultados, escaneo)
        if hallazgos:
            _rest("POST", "hallazgos", json=hallazgos)

        tiers = [h["tier"] for h in hallazgos if h["tier"] is not None]
        scores = [h["score"] for h in hallazgos if h["score"] is not None]
        resumen = {
            "tier_max": max(tiers) if tiers else None,
            "score_max": max(scores) if scores else None,
            "hallazgos": len(hallazgos),
            "criticos": sum(1 for t in tiers if t >= 4),
            "sistemas": len(payload),
        }
        _rest("PATCH", "escaneos", params={"id": f"eq.{escaneo_id}"}, json={
            "estado": "completado", "resumen": resumen, "completado_en": _ahora(),
        })
        if escaneo.get("activo_id"):
            _rest("PATCH", "activos", params={"id": f"eq.{escaneo['activo_id']}"},
                  json={"ultimo_escaneo": _ahora()})

        # Misma estructura que /analizar, para reutilizar el dashboard existente
        return jsonify({"escaneo_id": str(escaneo_id), "resumen": resumen, "resultados": resultados})

    except ErrorApi as e:
        _marcar_error(escaneo, e.mensaje)
        return jsonify({"error": e.mensaje}), e.status
    except requests.RequestException:
        log.exception("Sin conexión con Supabase")
        _marcar_error(escaneo, "Sin conexión con la base de datos.")
        return jsonify({"error": "No se pudo conectar con la base de datos."}), 502
    except Exception:
        log.exception("Error inesperado analizando el escaneo %s", escaneo_id)
        _marcar_error(escaneo, "Error interno al ejecutar el modelo.")
        return jsonify({"error": "Error interno al ejecutar el modelo."}), 500


def _marcar_error(escaneo, mensaje):
    """Deja el escaneo en estado 'error' (si ya se había tomado) sin romper la respuesta."""
    if not escaneo:
        return
    try:
        _rest("PATCH", "escaneos", params={"id": f"eq.{escaneo['id']}", "estado": "eq.procesando"},
              json={"estado": "error", "error": mensaje[:500]})
    except Exception:
        log.exception("No se pudo marcar el escaneo como error")
