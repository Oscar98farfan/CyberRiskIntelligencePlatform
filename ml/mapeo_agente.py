"""
mapeo_agente.py
═══════════════════════════════════════════════════════════════════
Traduce el INVENTARIO que envía el agente (.exe) a la lista de
canonical_json que espera el modelo (la misma que arma el cuestionario).

    inventario (software, servicios, puertos, procesos, SO)
        → reglas de data/agente-mapeo.json
        → [{vendor, products[], accessible_from_browser, internet_exposed, ...}]

Las respuestas que el agente NO puede saber se toman del activo
(criticidad y "expuesto a internet", que el cliente define en el
dashboard) o de valores por defecto conservadores, documentados abajo.
═══════════════════════════════════════════════════════════════════
"""

import json
import logging
import os
import re

log = logging.getLogger("cyberrisk.mapeo")

BASE = os.path.dirname(os.path.abspath(__file__))
RUTA_REGLAS = os.path.join(BASE, "..", "data", "agente-mapeo.json")
RUTA_CATALOGO = os.path.join(BASE, "..", "data", "tech-catalog.json")

# Criticidad del activo (dashboard) → respuestas del cuestionario
POR_CRITICIDAD = {
    #            business_criticality, data_sensitivity, integrity, availability
    "baja":     ("low",      "internal",     "low",    "low"),
    "media":    ("medium",   "internal",     "medium", "medium"),
    "alta":     ("high",     "confidential", "high",   "high"),
    "critica":  ("critical", "confidential", "high",   "high"),
}

# Valores por defecto de los atributos que puede ajustar cada regla
ATRIBUTOS_POR_DEFECTO = {
    "accessible_from_browser": False,
    "requires_login": True,
    "controls_devices": False,
}


def _cargar_json(ruta):
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


class Mapeador:
    """Carga reglas y catálogo una vez (al arrancar la API)."""

    def __init__(self, ruta_reglas=RUTA_REGLAS, ruta_catalogo=RUTA_CATALOGO):
        catalogo = _cargar_json(ruta_catalogo)["catalog"]
        self.validos = {(e["vendor"], p) for e in catalogo for p in e["products"]}
        self.productos_windows = {p for (v, p) in self.validos if v == "Microsoft" and p.startswith("windows")}

        self.reglas = []
        for r in _cargar_json(ruta_reglas)["reglas"]:
            if (r["vendor"], r["product"]) not in self.validos:
                log.warning("Regla '%s' ignorada: %s/%s no está en el catálogo", r.get("id"), r["vendor"], r["product"])
                continue
            compiladas = {k: re.compile(r[k], re.IGNORECASE) for k in ("programa", "servicio", "proceso") if r.get(k)}
            self.reglas.append({**r, "_re": compiladas})

    # ── Sistema operativo ──────────────────────────────────────────
    def producto_windows(self, equipo):
        """'Windows 11 Pro' + '23H2' → windows_11_23h2 / windows_11 / windows (el más específico que exista)."""
        nombre = (equipo.get("so") or "").lower()
        version = (equipo.get("so_version") or "").lower().replace(" ", "")
        if "windows" not in nombre:
            return None
        candidatos = []
        m = re.search(r"server\s*(\d{4})", nombre)
        if m:
            candidatos += [f"windows_server_{m.group(1)}", "windows_server"]
        else:
            m = re.search(r"windows\s*(\d+(\.\d)?)", nombre)
            if m:
                base = f"windows_{m.group(1)}"
                if version:
                    candidatos.append(f"{base}_{version}")
                candidatos.append(base)
        candidatos.append("windows")
        return next((c for c in candidatos if c in self.productos_windows), None)

    # ── Inventario completo ────────────────────────────────────────
    def mapear(self, inventario, activo):
        """
        Devuelve (canonical_list, detalle) donde detalle explica qué se
        reconoció y qué no (se guarda con el escaneo para el dashboard).
        """
        software = inventario.get("software") or []
        servicios = inventario.get("servicios") or []
        procesos = inventario.get("procesos") or []
        equipo = inventario.get("equipo") or {}

        textos = {
            "programa": [s.get("nombre") or "" for s in software],
            "servicio": [x for s in servicios for x in (s.get("nombre") or "", s.get("display") or "")],
            "proceso": [p if isinstance(p, str) else "" for p in procesos],
        }

        encontrados = {}          # (vendor, product) → {atributos, regla, evidencia}
        programas_reconocidos = set()

        # 1. Sistema operativo
        prod_so = self.producto_windows(equipo)
        if prod_so:
            encontrados[("Microsoft", prod_so)] = {"atributos": {}, "regla": "sistema_operativo",
                                                  "evidencia": f"{equipo.get('so')} {equipo.get('so_version') or ''}".strip()}

        # 2. Reglas
        for regla in self.reglas:
            for campo, patron in regla["_re"].items():
                coincidencia = next((t for t in textos[campo] if t and patron.search(t)), None)
                if coincidencia:
                    clave = (regla["vendor"], regla["product"])
                    if clave not in encontrados:
                        encontrados[clave] = {"atributos": regla.get("atributos", {}), "regla": regla["id"],
                                              "evidencia": coincidencia}
                    if campo == "programa":
                        programas_reconocidos.add(coincidencia)
                    break

        # 3. Respuestas comunes a partir del activo
        crit = POR_CRITICIDAD.get(activo.get("criticidad") or "media", POR_CRITICIDAD["media"])
        comunes = {
            "internet_exposed": bool(activo.get("expuesto_internet")),
            "internal_use": True,
            "business_criticality": crit[0],
            "data_sensitivity": crit[1],
            "integrity_impact": crit[2],
            "availability_impact": crit[3],
            "reference_count": 1,
        }

        # 4. Agrupar por fabricante + atributos (igual que varias filas del cuestionario)
        grupos = {}
        for (vendor, product), info in encontrados.items():
            atributos = {**ATRIBUTOS_POR_DEFECTO, **info["atributos"]}
            clave = (vendor, tuple(sorted(atributos.items())))
            grupos.setdefault(clave, {"vendor": vendor, "products": [], **atributos, **comunes})
            grupos[clave]["products"].append(product)

        canonical = list(grupos.values())
        detalle = {
            "reconocidos": [
                {"vendor": v, "product": p, "regla": i["regla"], "evidencia": i["evidencia"]}
                for (v, p), i in sorted(encontrados.items())
            ],
            "no_reconocidos": sorted({s.get("nombre") for s in software
                                      if s.get("nombre") and s.get("nombre") not in programas_reconocidos})[:500],
            "supuestos": {
                "internet_exposed": "según el activo (dashboard)",
                "criticidad": activo.get("criticidad") or "media",
            },
        }
        return canonical, detalle
