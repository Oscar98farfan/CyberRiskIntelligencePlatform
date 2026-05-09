"""
01_extract_nvd.py
=================
ETL — Extracción, Transformación y Carga de vulnerabilidades desde la API NVD.

Flujo completo:
  E (Extract)   → Descarga todos los CVEs de la API NVD con paginación automática
  T (Transform) → Limpia, normaliza y deriva columnas nuevas
  L (Load)      → Guarda el dataset limpio en formato .parquet y un metadata.json

Uso:
  cd ml/
  uv run python scripts/01_extract_nvd.py

  Con API key (50 req/min en lugar de 6):
  uv run python scripts/01_extract_nvd.py --api-key TU_API_KEY

  Solo actualizar CVEs nuevos desde la última extracción:
  uv run python scripts/01_extract_nvd.py --incremental

Salidas:
  data/raw/nvd_raw_YYYYMMDD_HHMMSS.json     ← JSON crudo de la API (backup)
  data/processed/nvd_dataset.parquet         ← Dataset limpio listo para ML
  data/model_metadata.json                   ← Fecha y estadísticas de extracción
"""

import os
import json
import time
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests
import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN GENERAL
# ─────────────────────────────────────────────────────────────────────────────

# URL base de la API NVD v2.0
NVD_BASE_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"

# Cuántos CVEs pedir por página (máximo permitido por NVD: 2000)
PAGE_SIZE = 2000

# Segundos de espera entre peticiones
# Sin API key: 6 peticiones/minuto → esperar 10s entre cada una
# Con API key: 50 peticiones/minuto → esperar 1.5s entre cada una
SLEEP_SIN_KEY = 10
SLEEP_CON_KEY = 1.5

# Rutas relativas a la carpeta ml/
# Path(__file__) apunta a ml/scripts/01_extract_nvd.py
# .parent.parent sube dos niveles hasta ml/
BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
PROCESSED_DIR = BASE_DIR / "data" / "processed"
METADATA_PATH = BASE_DIR / "data" / "model_metadata.json"

# Crear carpetas si no existen
RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# LOGGER — para ver el progreso en la terminal con timestamps
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# E X T R A C T
# Descarga paginada de todos los CVEs desde la API NVD
# ─────────────────────────────────────────────────────────────────────────────

def build_headers(api_key: str | None) -> dict:
    """
    Construye los headers HTTP.
    La API key de NVD se pasa como header 'apiKey', no como parámetro.
    Sin key: límite 6 req/min. Con key (gratuita): 50 req/min.
    Registro gratuito en: https://nvd.nist.gov/developers/request-an-api-key
    """
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["apiKey"] = api_key
    return headers


def fetch_page(params: dict, headers: dict, retries: int = 3) -> dict:
    """
    Hace una petición a la API NVD y devuelve el JSON.
    Implementa reintentos con backoff exponencial por si la API falla.
    
    Args:
        params:  Parámetros de la query (startIndex, resultsPerPage, etc.)
        headers: Headers incluyendo apiKey si existe
        retries: Número máximo de reintentos antes de fallar
    
    Returns:
        dict con la respuesta JSON de la API
    """
    for intento in range(retries):
        try:
            response = requests.get(
                NVD_BASE_URL,
                params=params,
                headers=headers,
                timeout=30,  # segundos máximos de espera por respuesta
            )
            # Lanzar excepción si el status code es 4xx o 5xx
            response.raise_for_status()
            return response.json()

        except requests.exceptions.HTTPError as e:
            # 403 = API key inválida, 404 = no encontrado
            if response.status_code in (403, 404):
                log.error(f"Error HTTP {response.status_code}: {e}")
                raise  # No tiene sentido reintentar
            log.warning(f"Intento {intento + 1}/{retries} fallido: {e}")

        except requests.exceptions.RequestException as e:
            # Errores de red: timeout, conexión rechazada, etc.
            log.warning(f"Intento {intento + 1}/{retries} — error de red: {e}")

        # Backoff exponencial: 5s, 10s, 20s...
        espera = 5 * (2 ** intento)
        log.info(f"Esperando {espera}s antes de reintentar...")
        time.sleep(espera)

    raise RuntimeError(f"La API falló después de {retries} reintentos.")


def extract(
    api_key: str | None = None,
    fecha_desde: str | None = None,
) -> list[dict]:
    """
    Descarga TODOS los CVEs de la API NVD usando paginación.
    
    La API NVD solo devuelve hasta 2000 CVEs por petición, así que
    necesitamos iterar con startIndex hasta descargar el total.
    
    Args:
        api_key:     API key de NVD (opcional pero recomendada)
        fecha_desde: Filtro ISO 8601 para modo incremental
                     ej: "2025-01-01T00:00:00.000"
    
    Returns:
        Lista de dicts, uno por CVE, con la estructura cruda de la API
    """
    headers = build_headers(api_key)
    sleep_time = SLEEP_CON_KEY if api_key else SLEEP_SIN_KEY
    todos_los_cves = []
    start_index = 0

    # Parámetros base de la query
    params_base = {"resultsPerPage": PAGE_SIZE}

    # Modo incremental: solo CVEs modificados desde la última extracción
    # lastModStartDate y lastModEndDate filtran por fecha de modificación
    if fecha_desde:
        ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000")
        params_base["lastModStartDate"] = fecha_desde
        params_base["lastModEndDate"] = ahora
        log.info(f"Modo incremental: CVEs modificados desde {fecha_desde}")

    log.info("Iniciando extracción desde la API NVD...")

    while True:
        params = {**params_base, "startIndex": start_index}
        log.info(f"Descargando CVEs {start_index} → {start_index + PAGE_SIZE}...")

        data = fetch_page(params, headers)

        # La API devuelve el total de CVEs disponibles en totalResults
        total = data.get("totalResults", 0)
        vulnerabilidades = data.get("vulnerabilities", [])

        todos_los_cves.extend(vulnerabilidades)

        log.info(f"Descargados: {len(todos_los_cves)} / {total}")

        # Si ya descargamos todo, salir del loop
        if start_index + PAGE_SIZE >= total:
            break

        start_index += PAGE_SIZE

        # Respetar el rate limit de NVD para no recibir un 403
        log.info(f"Esperando {sleep_time}s (rate limit NVD)...")
        time.sleep(sleep_time)

    log.info(f"Extracción completa: {len(todos_los_cves)} CVEs descargados.")
    return todos_los_cves


# ─────────────────────────────────────────────────────────────────────────────
# T R A N S F O R M
# Parsea el JSON crudo y construye las 21 columnas del dataset
# ─────────────────────────────────────────────────────────────────────────────

def extraer_descripcion_en(descriptions: list) -> str | None:
    """
    Busca la descripción en inglés dentro de la lista de descripciones.
    La API puede devolver múltiples idiomas; necesitamos lang='en'.
    """
    for d in descriptions:
        if d.get("lang") == "en":
            return d.get("value")
    return None


def extraer_cvss_v31(metrics: dict) -> dict:
    """
    Extrae todas las métricas CVSS v3.1 del bloque de métricas.
    
    Nota: Algunos CVEs antiguos solo tienen CVSS v2.0 o ninguna métrica.
    En esos casos devolvemos None para todas las columnas y las
    manejaremos en la limpieza.
    
    Returns:
        dict con las 9 columnas CVSS + exploitabilityScore
    """
    vacias = {
        "SCORE_BASE": None, "SEVERITY": None, "VEC_ATAQUE": None,
        "COMPLEJIDAD": None, "PRIVILEGIOS": None, "INTERACCION": None,
        "ALCANCE": None, "IMP_CONFID": None, "IMP_INTEGR": None,
        "IMP_DISPON": None, "FACILIDAD": None,
    }

    entradas = metrics.get("cvssMetricV31", [])
    if not entradas:
        return vacias  # CVE sin CVSS v3.1

    # Tomar la primera entrada (la primaria según NVD)
    m = entradas[0]
    cvss = m.get("cvssData", {})

    return {
        "SCORE_BASE":   cvss.get("baseScore"),
        "SEVERITY":     cvss.get("baseSeverity"),
        "VEC_ATAQUE":   cvss.get("attackVector"),
        "COMPLEJIDAD":  cvss.get("attackComplexity"),
        "PRIVILEGIOS":  cvss.get("privilegesRequired"),
        "INTERACCION":  cvss.get("userInteraction"),
        "ALCANCE":      cvss.get("scope"),
        "IMP_CONFID":   cvss.get("confidentialityImpact"),
        "IMP_INTEGR":   cvss.get("integrityImpact"),
        "IMP_DISPON":   cvss.get("availabilityImpact"),
        # exploitabilityScore está un nivel arriba de cvssData
        "FACILIDAD":    m.get("exploitabilityScore"),
    }


def extraer_cwe(weaknesses: list) -> str | None:
    """
    Extrae el CWE primario de la lista de debilidades.
    Filtra valores no informativos como 'NVD-CWE-Other' y 'NVD-CWE-noinfo'.
    """
    for w in weaknesses:
        for d in w.get("description", []):
            valor = d.get("value", "")
            # Ignorar valores genéricos que no aportan información al modelo
            if valor.startswith("CWE-") and valor not in ("CWE-noinfo", "CWE-Other"):
                return valor
    return None


def extraer_cpe(configurations: list) -> tuple[str | None, str | None]:
    """
    Extrae vendor y product del primer CPE match encontrado.
    
    Formato CPE 2.3: cpe:2.3:a:VENDOR:PRODUCT:VERSION:...
    Índices:          0   1  2    3       4       5
    
    Ejemplo: cpe:2.3:a:microsoft:windows_10:*:*:*:*:*:*:*:*
             → vendor='microsoft', product='windows_10'
    
    Returns:
        Tupla (vendor, product) o (None, None) si no hay configuraciones
    """
    for config in configurations:
        for node in config.get("nodes", []):
            for match in node.get("cpeMatch", []):
                criteria = match.get("criteria", "")
                partes = criteria.split(":")
                # El CPE 2.3 tiene al menos 5 partes separadas por ':'
                if len(partes) >= 5:
                    vendor = partes[3] if partes[3] != "*" else None
                    product = partes[4] if partes[4] != "*" else None
                    return vendor, product
    return None, None


def extraer_patch_url(references: list) -> str | None:
    """
    Busca la URL del parche oficial entre las referencias del CVE.
    NVD etiqueta los parches con el tag 'Patch'.
    Si no hay tag 'Patch', devuelve la primera URL disponible como fallback.
    """
    primera_url = None
    for ref in references:
        url = ref.get("url")
        tags = ref.get("tags", [])
        if not primera_url and url:
            primera_url = url
        if "Patch" in tags and url:
            return url  # Parche oficial encontrado
    return primera_url  # Fallback: primera referencia disponible


def parsear_cve(vulnerabilidad: dict) -> dict:
    """
    Transforma un objeto crudo de la API en una fila del dataset.
    Esta función es el corazón del ETL: mapea los campos anidados
    del JSON a las 21 columnas planas del dataset.
    
    Args:
        vulnerabilidad: dict con estructura {"cve": {...}} de la API NVD
    
    Returns:
        dict con las 21 columnas del dataset
    """
    cve = vulnerabilidad.get("cve", {})
    cve_id = cve.get("id", "")

    # ── Columnas directas de la API ──────────────────────────────────────────
    desc_en = extraer_descripcion_en(cve.get("descriptions", []))
    cvss = extraer_cvss_v31(cve.get("metrics", {}))
    cwe = extraer_cwe(cve.get("weaknesses", []))
    vendor, product = extraer_cpe(cve.get("configurations", []))
    patch_url = extraer_patch_url(cve.get("references", []))

    published_raw = cve.get("published")
    modified_raw = cve.get("lastModified")

    # ── Columnas derivadas (calculadas en Python) ────────────────────────────

    # CVE_YEAR: extraído del ID. CVE-2024-12345 → 2024
    # Útil como feature numérica de antigüedad para el modelo
    try:
        cve_year = int(cve_id.split("-")[1]) if cve_id else None
    except (IndexError, ValueError):
        cve_year = None

    # HAS_KEV: True si el campo cisaExploitAdd tiene una fecha (no es None)
    # Indica que CISA confirmó explotación activa de este CVE
    has_kev = cve.get("cisaExploitAdd") is not None

    return {
        # Metadatos / ID
        "CVE_ID":         cve_id,
        "PUBLISHED_DATE": published_raw,
        "MODIFIED_DATE":  modified_raw,

        # Derivadas
        "CVE_YEAR":       cve_year,
        "HAS_KEV":        has_kev,

        # Descripción (NLP)
        "DESC_EN":        desc_en,

        # CVSS v3.1 (features + targets)
        **cvss,

        # Tipo de error (NLP / categórica)
        "CWE_ID":         cwe,

        # Software afectado (derivadas de CPE)
        "CPE_VENDOR":     vendor,
        "CPE_PRODUCT":    product,

        # Solo output / UI
        "PATCH_URL":      patch_url,
    }


def transform(vulnerabilidades: list[dict]) -> pd.DataFrame:
    """
    Aplica parsear_cve a todos los CVEs y construye el DataFrame.
    Luego aplica limpieza y tipado correcto a cada columna.
    
    Args:
        vulnerabilidades: Lista cruda devuelta por extract()
    
    Returns:
        pd.DataFrame limpio con las 21 columnas
    """
    log.info("Iniciando transformación del dataset...")

    # Parsear cada CVE en paralelo con list comprehension
    filas = [parsear_cve(v) for v in vulnerabilidades]
    df = pd.DataFrame(filas)

    log.info(f"DataFrame inicial: {df.shape[0]} filas x {df.shape[1]} columnas")

    # ── Limpieza de columnas categóricas ─────────────────────────────────────
    # Convertir strings a mayúsculas y eliminar espacios extra
    # Esto evita inconsistencias como 'network' vs 'NETWORK' vs 'Network'
    cols_categoricas = [
        "SEVERITY", "VEC_ATAQUE", "COMPLEJIDAD", "PRIVILEGIOS",
        "INTERACCION", "ALCANCE", "IMP_CONFID", "IMP_INTEGR", "IMP_DISPON",
    ]
    for col in cols_categoricas:
        if col in df.columns:
            df[col] = df[col].str.strip().str.upper()

    # ── Tipado de columnas numéricas ─────────────────────────────────────────
    df["SCORE_BASE"] = pd.to_numeric(df["SCORE_BASE"], errors="coerce")
    df["FACILIDAD"]  = pd.to_numeric(df["FACILIDAD"],  errors="coerce")
    df["CVE_YEAR"]   = pd.to_numeric(df["CVE_YEAR"],   errors="coerce").astype("Int64")

    # ── Tipado de fechas ──────────────────────────────────────────────────────
    # utc=True para manejar correctamente los timestamps con zona horaria
    df["PUBLISHED_DATE"] = pd.to_datetime(df["PUBLISHED_DATE"], utc=True, errors="coerce")
    df["MODIFIED_DATE"]  = pd.to_datetime(df["MODIFIED_DATE"],  utc=True, errors="coerce")

    # ── HAS_KEV como booleano explícito ───────────────────────────────────────
    df["HAS_KEV"] = df["HAS_KEV"].astype(bool)

    # ── Limpieza de texto ─────────────────────────────────────────────────────
    # Reemplazar strings vacíos por NaN para consistencia
    df["DESC_EN"]    = df["DESC_EN"].replace("", pd.NA)
    df["CWE_ID"]     = df["CWE_ID"].replace("", pd.NA)
    df["CPE_VENDOR"] = df["CPE_VENDOR"].str.lower().replace("", pd.NA)
    df["CPE_PRODUCT"]= df["CPE_PRODUCT"].str.lower().replace("", pd.NA)

    # ── Eliminar duplicados por CVE_ID ────────────────────────────────────────
    # En caso de que la API devuelva el mismo CVE dos veces (raro pero posible)
    antes = len(df)
    df = df.drop_duplicates(subset="CVE_ID", keep="last")
    if len(df) < antes:
        log.warning(f"Eliminados {antes - len(df)} CVEs duplicados.")

    # ── Ordenar por fecha de publicación ─────────────────────────────────────
    df = df.sort_values("PUBLISHED_DATE", ascending=False).reset_index(drop=True)

    log.info(f"Transformación completa: {df.shape[0]} CVEs únicos.")
    log.info(f"CVEs con CVSS v3.1: {df['SCORE_BASE'].notna().sum()}")
    log.info(f"CVEs en KEV (explotación activa): {df['HAS_KEV'].sum()}")
    log.info(f"CVEs con CVSS v3.1 faltante: {df['SCORE_BASE'].isna().sum()}")

    return df


# ─────────────────────────────────────────────────────────────────────────────
# L O A D
# Guarda el dataset limpio y los metadatos
# ─────────────────────────────────────────────────────────────────────────────

def load(df: pd.DataFrame, vulnerabilidades_raw: list[dict]) -> None:
    """
    Guarda el dataset procesado y los metadatos de la extracción.
    
    Archivos generados:
      - data/raw/nvd_raw_TIMESTAMP.json     → backup del JSON crudo
      - data/processed/nvd_dataset.parquet  → dataset limpio para ML
      - data/model_metadata.json            → info de la última extracción
    
    Por qué .parquet en lugar de .csv:
      - 5-10x más rápido de leer/escribir
      - Preserva los tipos de datos (fechas, booleanos, Int64 nullable)
      - 3-5x menos espacio en disco
      - El estándar en proyectos de ML/Data Science
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # ── Guardar JSON crudo como backup ────────────────────────────────────────
    # Útil para re-procesar sin volver a llamar a la API
    raw_path = RAW_DIR / f"nvd_raw_{timestamp}.json"
    log.info(f"Guardando JSON crudo en {raw_path}...")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(vulnerabilidades_raw, f, ensure_ascii=False, indent=2)

    # ── Guardar dataset procesado en .parquet ─────────────────────────────────
    parquet_path = PROCESSED_DIR / "nvd_dataset.parquet"
    log.info(f"Guardando dataset en {parquet_path}...")
    df.to_parquet(parquet_path, index=False, engine="pyarrow")

    # ── Guardar metadatos ─────────────────────────────────────────────────────
    # Este archivo lo leerá la Wiki para mostrar "Datos actualizados al..."
    metadata = {
        "ultima_extraccion":    datetime.now(timezone.utc).isoformat(),
        "total_cves":           int(len(df)),
        "cves_con_cvss_v31":    int(df["SCORE_BASE"].notna().sum()),
        "cves_en_kev":          int(df["HAS_KEV"].sum()),
        "cves_sin_cvss":        int(df["SCORE_BASE"].isna().sum()),
        "archivo_parquet":      str(parquet_path.name),
        "archivo_raw":          str(raw_path.name),
        "columnas":             list(df.columns),
        "version_dataset":      "1.0",
    }
    log.info(f"Guardando metadatos en {METADATA_PATH}...")
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    log.info("─" * 60)
    log.info("ETL completado exitosamente.")
    log.info(f"  Dataset: {parquet_path}")
    log.info(f"  Total CVEs: {len(df):,}")
    log.info(f"  Con CVSS v3.1: {df['SCORE_BASE'].notna().sum():,}")
    log.info(f"  En KEV (explotación activa): {df['HAS_KEV'].sum():,}")
    log.info("─" * 60)


# ─────────────────────────────────────────────────────────────────────────────
# MODO INCREMENTAL
# Lee la última fecha de extracción del metadata.json para solo
# descargar CVEs nuevos o modificados
# ─────────────────────────────────────────────────────────────────────────────

def leer_ultima_extraccion() -> str | None:
    """
    Lee la fecha de la última extracción desde model_metadata.json.
    Devuelve None si el archivo no existe (primera vez que se corre).
    """
    if not METADATA_PATH.exists():
        log.info("No se encontró metadata.json — se hará extracción completa.")
        return None
    with open(METADATA_PATH, encoding="utf-8") as f:
        meta = json.load(f)
    fecha = meta.get("ultima_extraccion")
    log.info(f"Última extracción encontrada: {fecha}")
    return fecha


def merge_incremental(df_nuevo: pd.DataFrame) -> pd.DataFrame:
    """
    En modo incremental, combina el dataset nuevo con el existente.
    Los CVEs actualizados (mismo CVE_ID) reemplazan a los anteriores.
    
    Args:
        df_nuevo: DataFrame con los CVEs descargados en esta ejecución
    
    Returns:
        DataFrame combinado y deduplicado
    """
    parquet_path = PROCESSED_DIR / "nvd_dataset.parquet"
    if not parquet_path.exists():
        log.info("No existe dataset previo — guardando dataset nuevo directamente.")
        return df_nuevo

    log.info("Combinando con dataset existente...")
    df_existente = pd.read_parquet(parquet_path)
    df_combinado = pd.concat([df_existente, df_nuevo], ignore_index=True)
    df_combinado = df_combinado.drop_duplicates(subset="CVE_ID", keep="last")
    df_combinado = df_combinado.sort_values("PUBLISHED_DATE", ascending=False).reset_index(drop=True)
    log.info(f"Dataset combinado: {len(df_combinado):,} CVEs únicos.")
    return df_combinado


# ─────────────────────────────────────────────────────────────────────────────
# PUNTO DE ENTRADA
# ─────────────────────────────────────────────────────────────────────────────

def main():
    # Parsear argumentos de línea de comandos
    parser = argparse.ArgumentParser(
        description="ETL: Extrae CVEs de la API NVD y los guarda como .parquet"
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=None,
        help="API key de NVD (opcional). Sin key: 6 req/min. Con key: 50 req/min.",
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="Solo descargar CVEs nuevos/modificados desde la última extracción.",
    )
    args = parser.parse_args()

    # Determinar si es extracción completa o incremental
    fecha_desde = None
    if args.incremental:
        fecha_desde = leer_ultima_extraccion()
        if fecha_desde is None:
            log.info("No hay extracción previa — ejecutando extracción completa.")

    # ── E: Extraer ────────────────────────────────────────────────────────────
    vulnerabilidades_raw = extract(
        api_key=args.api_key,
        fecha_desde=fecha_desde,
    )

    # ── T: Transformar ────────────────────────────────────────────────────────
    df = transform(vulnerabilidades_raw)

    # En modo incremental, combinar con el dataset existente
    if args.incremental and fecha_desde:
        df = merge_incremental(df)

    # ── L: Cargar ─────────────────────────────────────────────────────────────
    load(df, vulnerabilidades_raw)


if __name__ == "__main__":
    main()
