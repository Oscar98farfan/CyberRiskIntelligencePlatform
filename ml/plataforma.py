"""
plataforma.py
═══════════════════════════════════════════════════════════════════
Endpoints de la plataforma multi-empresa (Supabase).

A. CUESTIONARIO (navegador)
   POST /api/escaneos/<id>/analizar      token de sesión del usuario
      El navegador guardó el escaneo (estado 'pendiente'); aquí se valida
      el usuario, se corre el modelo y se guardan los hallazgos.

B. AGENTE INSTALABLE (.exe)
   POST /api/agentes                      token de sesión (dueño/admin)
      Crea un agente y devuelve un CÓDIGO de enlace de un solo uso (24 h).
   POST /api/agente/enlazar               sin sesión: usa el código
      El .exe canjea el código por su TOKEN permanente (se devuelve una vez).
   POST /api/agente/inventario            Authorization: Bearer <token del agente>
      Recibe el inventario aprobado por el cliente, crea/actualiza el activo,
      lo traduce al catálogo (mapeo_agente.py), corre el modelo y guarda todo.

Seguridad:
  - La llave SECRETA de Supabase se lee de ml/.env y solo vive en el servidor.
    Se envía SOLO en el header 'apikey' (requisito de las llaves sb_secret_).
  - Códigos y tokens de agente se guardan únicamente como hash SHA-256.
  - Nada se procesa si la empresa no tiene una autorización de escaneo vigente.
═══════════════════════════════════════════════════════════════════
"""

import functools
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

import requests
from flask import Blueprint, jsonify, request

from mapeo_agente import Mapeador
from predictor import predecir

log = logging.getLogger("cyberrisk.plataforma")

bp = Blueprint("plataforma", __name__, url_prefix="/api")

# ── Configuración (desde ml/.env) ────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
TIMEOUT = 20                      # segundos por llamada a Supabase
MAX_SISTEMAS = 50                 # límite de sistemas por escaneo
MAX_ELEMENTOS_INVENTARIO = 5000   # límite por lista (software, servicios, …)
VIGENCIA_CODIGO = timedelta(hours=24)
ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # sin 0/O ni 1/I para evitar confusiones
ROLES_QUE_ANALIZAN = {"dueno", "admin"}

MAPEADOR = Mapeador()             # reglas de data/agente-mapeo.json (se cargan al arrancar)


class ErrorApi(Exception):
    """Error controlado: se devuelve al cliente con su código HTTP."""

    def __init__(self, mensaje, status=400):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status = status


# ═════════════════════ Utilidades ═════════════════════
def _ahora():
    return datetime.now(timezone.utc)


def _hash(texto):
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


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
    if not auth.startswith("Bearer ") or auth.startswith("Bearer cra_"):
        raise ErrorApi("Falta el token de sesión.", 401)
    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={"apikey": SUPABASE_SECRET_KEY, "Authorization": auth},
        timeout=TIMEOUT,
    )
    if r.status_code != 200:
        raise ErrorApi("Sesión inválida o expirada. Vuelve a iniciar sesión.", 401)
    return r.json()["id"]


def _exigir_rol(empresa_id, user_id):
    miembro = _rest("GET", "miembros", params={
        "empresa_id": f"eq.{empresa_id}", "user_id": f"eq.{user_id}", "select": "rol"})
    if not miembro or miembro[0]["rol"] not in ROLES_QUE_ANALIZAN:
        raise ErrorApi("No tienes permiso para esta acción en la empresa.", 403)


def _exigir_autorizacion(empresa_id):
    vigente = _rest("GET", "autorizaciones", params={
        "empresa_id": f"eq.{empresa_id}", "revocado_en": "is.null", "select": "id", "limit": "1"})
    if not vigente:
        raise ErrorApi("La empresa no tiene una autorización de escaneo vigente.", 403)


def endpoint(func):
    """Manejo uniforme de errores y de configuración para todos los endpoints."""
    @functools.wraps(func)
    def envoltura(*args, **kwargs):
        if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
            return jsonify({"error": "La API no tiene configurado Supabase (revisa ml/.env)."}), 500
        try:
            return func(*args, **kwargs)
        except ErrorApi as e:
            return jsonify({"error": e.mensaje}), e.status
        except requests.RequestException:
            log.exception("Sin conexión con Supabase")
            return jsonify({"error": "No se pudo conectar con la base de datos."}), 502
        except Exception:
            log.exception("Error inesperado en %s", func.__name__)
            return jsonify({"error": "Error interno del servidor."}), 500
    return envoltura


# ═════════════════════ Modelo → hallazgos (compartido) ═════════════════════
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
                "detalle": {"product_group": item.get("product"),
                            "attack": esc.get("attack"), "impact": esc.get("impact")},
            })
    return filas


def _ejecutar_modelo_y_guardar(escaneo, payload, extra_resumen=None):
    """
    Corre el modelo sobre el payload, guarda hallazgos y deja el escaneo
    'completado'. Si algo falla, lo deja en 'error' y relanza la excepción.
    Devuelve (resumen, resultados).
    """
    try:
        _validar_payload(payload)
        resultados = []
        for canonical_json in payload:
            resultado = predecir(canonical_json)
            for item in resultado:
                item["original_products"] = canonical_json.get("products", [])
            resultados.extend(resultado)

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
            **(extra_resumen or {}),
        }
        _rest("PATCH", "escaneos", params={"id": f"eq.{escaneo['id']}"}, json={
            "estado": "completado", "resumen": resumen, "completado_en": _ahora().isoformat()})
        if escaneo.get("activo_id"):
            _rest("PATCH", "activos", params={"id": f"eq.{escaneo['activo_id']}"},
                  json={"ultimo_escaneo": _ahora().isoformat()})
        return resumen, resultados
    except Exception as e:
        mensaje = e.mensaje if isinstance(e, ErrorApi) else "Error interno al ejecutar el modelo."
        if not isinstance(e, ErrorApi):
            log.exception("Fallo del modelo en el escaneo %s", escaneo["id"])
        _marcar_error(escaneo["id"], mensaje)
        raise


def _marcar_error(escaneo_id, mensaje):
    """Deja el escaneo en estado 'error' sin romper la respuesta."""
    try:
        _rest("PATCH", "escaneos", params={"id": f"eq.{escaneo_id}", "estado": "eq.procesando"},
              json={"estado": "error", "error": mensaje[:500]})
    except Exception:
        log.exception("No se pudo marcar el escaneo como error")


# ═════════════════════ A. Cuestionario ═════════════════════
@bp.post("/escaneos/<uuid:escaneo_id>/analizar")
@endpoint
def analizar_escaneo(escaneo_id):
    user_id = _usuario_del_token()

    filas = _rest("GET", "escaneos", params={
        "id": f"eq.{escaneo_id}", "select": "id,empresa_id,activo_id,estado,payload"})
    if not filas:
        raise ErrorApi("Escaneo no encontrado.", 404)
    escaneo = filas[0]
    _exigir_rol(escaneo["empresa_id"], user_id)

    # Pasar a 'procesando' solo si estaba pendiente o con error
    # (el filtro por estado evita que dos peticiones lo procesen a la vez)
    tomado = _rest("PATCH", "escaneos", retornar=True, params={
        "id": f"eq.{escaneo_id}", "estado": "in.(pendiente,error)",
    }, json={"estado": "procesando", "error": None})
    if not tomado:
        raise ErrorApi("Este escaneo ya fue procesado o se está procesando.", 409)

    resumen, resultados = _ejecutar_modelo_y_guardar(escaneo, escaneo["payload"])
    # Misma estructura que /analizar, para reutilizar el dashboard existente
    return jsonify({"escaneo_id": str(escaneo_id), "resumen": resumen, "resultados": resultados})


# ═════════════════════ B. Agente ═════════════════════
def _normalizar_codigo(codigo):
    return "".join(ch for ch in str(codigo or "").upper() if ch in ALFABETO_CODIGO)


@bp.post("/agentes")
@endpoint
def crear_agente():
    """Dashboard → crea un agente pendiente y devuelve su código de enlace (se muestra UNA vez)."""
    user_id = _usuario_del_token()
    cuerpo = request.get_json(silent=True) or {}
    empresa_id = str(cuerpo.get("empresa_id") or "")
    if len(empresa_id) != 36:
        raise ErrorApi("Falta la empresa.", 422)
    _exigir_rol(empresa_id, user_id)
    _exigir_autorizacion(empresa_id)

    codigo = "".join(secrets.choice(ALFABETO_CODIGO) for _ in range(8))
    expira = _ahora() + VIGENCIA_CODIGO
    nombre = str(cuerpo.get("nombre") or "").strip()[:120] or "Equipo pendiente de enlace"
    agente = _rest("POST", "agentes", retornar=True, json={
        "empresa_id": empresa_id, "nombre": nombre,
        "codigo_hash": _hash(codigo), "codigo_expira": expira.isoformat(),
    })[0]
    return jsonify({
        "agente_id": agente["id"],
        "codigo": f"{codigo[:4]}-{codigo[4:]}",
        "expira": expira.isoformat(),
    }), 201


@bp.post("/agente/enlazar")
@endpoint
def enlazar_agente():
    """El .exe canjea el código de un solo uso por su token permanente."""
    cuerpo = request.get_json(silent=True) or {}
    codigo = _normalizar_codigo(cuerpo.get("codigo"))
    if len(codigo) != 8:
        raise ErrorApi("El código debe tener 8 caracteres (ej: K7F3-9QXM).", 422)

    filas = _rest("GET", "agentes", params={
        "codigo_hash": f"eq.{_hash(codigo)}", "select": "id,empresa_id,codigo_expira,revocado"})
    if not filas:
        raise ErrorApi("Código inválido o ya utilizado.", 400)
    agente = filas[0]
    if agente["revocado"]:
        raise ErrorApi("Este agente fue revocado. Genera un código nuevo.", 400)
    if datetime.fromisoformat(agente["codigo_expira"]) < _ahora():
        raise ErrorApi("El código venció. Genera uno nuevo en el dashboard.", 400)
    _exigir_autorizacion(agente["empresa_id"])

    token = "cra_" + secrets.token_urlsafe(32)
    tomado = _rest("PATCH", "agentes", retornar=True, params={
        "id": f"eq.{agente['id']}", "codigo_hash": f"eq.{_hash(codigo)}",   # un solo uso, aun con dos clics
    }, json={
        "token_hash": _hash(token), "codigo_hash": None, "codigo_expira": None,
        "enlazado_en": _ahora().isoformat(), "ultimo_contacto": _ahora().isoformat(),
        "nombre": str(cuerpo.get("hostname") or "Equipo")[:120],
        "plataforma": cuerpo.get("plataforma") if cuerpo.get("plataforma") in ("windows", "linux", "macos") else None,
        "version": str(cuerpo.get("version") or "")[:20] or None,
    })
    if not tomado:
        raise ErrorApi("Código inválido o ya utilizado.", 400)

    empresa = _rest("GET", "empresas", params={"id": f"eq.{agente['empresa_id']}", "select": "nombre"})
    return jsonify({"token": token, "agente_id": agente["id"],
                    "empresa": empresa[0]["nombre"] if empresa else None})


def _agente_del_token():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer cra_"):
        raise ErrorApi("Falta el token del agente.", 401)
    filas = _rest("GET", "agentes", params={
        "token_hash": f"eq.{_hash(auth[7:])}", "select": "id,empresa_id,activo_id,revocado"})
    if not filas or filas[0]["revocado"]:
        raise ErrorApi("Agente no reconocido o revocado. Vuelve a enlazarlo.", 401)
    return filas[0]


def _validar_inventario(inv):
    if not isinstance(inv, dict):
        raise ErrorApi("Inventario inválido.", 422)
    equipo = inv.get("equipo")
    if not isinstance(equipo, dict) or not isinstance(equipo.get("hostname"), str) or not equipo["hostname"].strip():
        raise ErrorApi("El inventario no trae el nombre del equipo.", 422)
    for lista in ("software", "servicios", "puertos", "procesos"):
        valor = inv.get(lista, [])
        if not isinstance(valor, list) or len(valor) > MAX_ELEMENTOS_INVENTARIO:
            raise ErrorApi(f"La lista '{lista}' es inválida o demasiado grande.", 422)


def _tipo_de_equipo(equipo):
    return "servidor" if "server" in (equipo.get("so") or "").lower() else "estacion"


@bp.post("/agente/inventario")
@endpoint
def recibir_inventario():
    agente = _agente_del_token()
    empresa_id = agente["empresa_id"]
    _exigir_autorizacion(empresa_id)

    inv = request.get_json(silent=True)
    _validar_inventario(inv)
    equipo = inv["equipo"]
    hostname = equipo["hostname"].strip()[:120]
    datos_so = {"sistema_operativo": (equipo.get("so") or "")[:120] or None,
                "version_so": " ".join(x for x in (equipo.get("so_version"), equipo.get("so_build")) if x)[:60] or None}

    # 1. Activo: el ya enlazado al agente, o uno con ese nombre, o uno nuevo
    activo = None
    campos = "id,nombre,criticidad,expuesto_internet"
    if agente.get("activo_id"):
        filas = _rest("GET", "activos", params={"id": f"eq.{agente['activo_id']}", "select": campos})
        activo = filas[0] if filas else None
    if not activo:
        filas = _rest("GET", "activos", params={
            "empresa_id": f"eq.{empresa_id}", "nombre": f"eq.{hostname}", "select": campos})
        activo = filas[0] if filas else None
    if activo:
        _rest("PATCH", "activos", params={"id": f"eq.{activo['id']}"}, json=datos_so)
    else:
        activo = _rest("POST", "activos", retornar=True, json={
            "empresa_id": empresa_id, "nombre": hostname, "tipo": _tipo_de_equipo(equipo), **datos_so,
        })[0]

    agente_info = inv.get("agente") or {}
    _rest("PATCH", "agentes", params={"id": f"eq.{agente['id']}"}, json={
        "activo_id": activo["id"], "nombre": hostname, "ultimo_contacto": _ahora().isoformat(),
        "version": str(agente_info.get("version") or "")[:20] or None,
    })

    # 2. Traducir inventario → canonical_json
    canonical, detalle = MAPEADOR.mapear(inv, activo)
    extra = {"reconocidos": len(detalle["reconocidos"]),
             "no_reconocidos": len(detalle["no_reconocidos"]), "mapeo": detalle}

    # 3. Guardar el escaneo (ya en 'procesando': lo procesa esta misma petición)
    escaneo = _rest("POST", "escaneos", retornar=True, json={
        "empresa_id": empresa_id, "activo_id": activo["id"], "origen": "agente",
        "estado": "procesando", "payload": canonical, "inventario": inv,
    })[0]

    if not canonical:
        resumen = {"tier_max": None, "score_max": None, "hallazgos": 0, "criticos": 0, "sistemas": 0, **extra}
        _rest("PATCH", "escaneos", params={"id": f"eq.{escaneo['id']}"}, json={
            "estado": "completado", "resumen": resumen, "completado_en": _ahora().isoformat()})
    else:
        resumen, _ = _ejecutar_modelo_y_guardar(escaneo, canonical, extra)

    resumen_corto = {k: v for k, v in resumen.items() if k != "mapeo"}
    return jsonify({"escaneo_id": escaneo["id"], "activo": {"id": activo["id"], "nombre": activo["nombre"]},
                    "resumen": resumen_corto})
