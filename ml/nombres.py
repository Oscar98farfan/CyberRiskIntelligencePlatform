"""
nombres.py — Nombres legibles para mostrar al cliente.
═══════════════════════════════════════════════════════════════════
El modelo devuelve solo la CATEGORÍA (ej: "Browser"). Aquí se recupera
la tecnología real que se analizó (ej: "Google Chrome") a partir del
canonical_json enviado y del catálogo:

    resultado del modelo: product_group = "browser"
    canonical enviado:    vendor = "Google", products = ["chrome", ...]
    catálogo:             ("Google", "chrome") → categoría "browser"
    ⇒ tecnología = "Google Chrome"
═══════════════════════════════════════════════════════════════════
"""

import json
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
_DATA = os.path.join(BASE, "..", "data")

with open(os.path.join(_DATA, "tech-catalog.json"), encoding="utf-8") as f:
    _CATEGORIA = {(e["vendor"], p): e["cat"] for e in json.load(f)["catalog"] for p in e["products"]}

with open(os.path.join(_DATA, "agente-mapeo.json"), encoding="utf-8") as f:
    _NOMBRE_REGLA = {(r["vendor"], r["product"]): r["nombre"] for r in json.load(f)["reglas"] if r.get("nombre")}

# Palabras que se escriben con un formato especial
_ESPECIALES = {"sql": "SQL", "os": "OS", "http": "HTTP", "ios": "iOS", "macos": "macOS", "esxi": "ESXi",
               "db2": "DB2", "php": "PHP", "jre": "JRE", "jdk": "JDK", "iis": "IIS", "nas": "NAS", "dc": "DC",
               "esr": "ESR", "xp": "XP", "rt": "RT", "ce": "CE", "vm": "VM", "ui": "UI", "api": "API",
               ".net": ".NET", "365": "365", "node.js": "Node.js", "openjdk": "OpenJDK", "mysql": "MySQL",
               "postgresql": "PostgreSQL", "mongodb": "MongoDB", "mariadb": "MariaDB", "wordpress": "WordPress",
               "gitlab": "GitLab", "github": "GitHub", "vlc": "VLC", "ffmpeg": "FFmpeg", "gimp": "GIMP"}


def _palabra(p):
    if p in _ESPECIALES:
        return _ESPECIALES[p]
    if re.fullmatch(r"\d+h\d", p):          # 22h2 → 22H2
        return p.upper()
    return p[:1].upper() + p[1:]


def nombre_producto(vendor, product):
    """('Microsoft', 'windows_11_25h2') → 'Microsoft Windows 11 25H2'; usa el nombre de la regla si existe."""
    if (vendor, product) in _NOMBRE_REGLA:
        return _NOMBRE_REGLA[(vendor, product)]
    texto = " ".join(_palabra(p) for p in re.split(r"[_\s]+", product.replace("\\", "")) if p)
    if vendor and vendor != "Unknown" and not texto.lower().startswith(vendor.split()[0].lower()):
        texto = f"{vendor.split(' /')[0]} {texto}"
    return texto


def categoria_de(vendor, product):
    return _CATEGORIA.get((vendor, product))


def tecnologia_de_resultado(item, canonical):
    """
    item: un elemento del resultado de predecir() (con 'product' = categoría)
    canonical: el canonical_json que lo originó
    Devuelve (tecnologia, categoria, vendor) legibles.
    """
    vendor = canonical.get("vendor")
    categoria = item.get("product")
    productos = canonical.get("products") or []
    del_grupo = [p for p in productos if categoria_de(vendor, p) == categoria] or productos
    nombres = []
    for p in del_grupo:
        n = nombre_producto(vendor, p)
        if n not in nombres:
            nombres.append(n)
    return " / ".join(nombres) or None, categoria, (vendor if vendor and vendor != "Unknown" else None)
