"""
02_preprocess.py
================
Preprocesamiento del dataset NVD para entrenamiento del modelo ML.

Flujo completo:
  1. Carga el dataset completo (347k CVEs)
  2. Filtra los 181k CVEs útiles (con CPE + CVSS v3.1)
  3. Maneja nulos
  4. Codifica columnas categóricas a números
  5. Prepara features de texto (CWE_ID)
  6. Maneja el desbalance de clases en HAS_KEV
  7. Divide en train (80%) y test (20%)
  8. Guarda los datasets listos para el modelo

Uso:
  cd ml/
  uv run python scripts/02_preprocess.py

Salidas:
  data/processed/nvd_modelo_train.parquet  ← 80% para entrenar
  data/processed/nvd_modelo_test.parquet   ← 20% para evaluar
  data/processed/encoders.json             ← mapeo de categorías a números
  data/processed/feature_columns.json      ← lista de columnas que usa el modelo
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────────────────

BASE_DIR       = Path(__file__).parent.parent
PROCESSED_DIR  = BASE_DIR / "data" / "processed"
METADATA_PATH  = BASE_DIR / "data" / "model_metadata.json"

# Archivos de entrada y salida
INPUT_PARQUET  = PROCESSED_DIR / "nvd_dataset.parquet"
TRAIN_PARQUET  = PROCESSED_DIR / "nvd_modelo_train.parquet"
TEST_PARQUET   = PROCESSED_DIR / "nvd_modelo_test.parquet"
ENCODERS_JSON  = PROCESSED_DIR / "encoders.json"
FEATURES_JSON  = PROCESSED_DIR / "feature_columns.json"

# Semilla aleatoria para reproducibilidad
# Con la misma semilla siempre se obtiene el mismo train/test split
RANDOM_STATE = 42

# Proporción del split: 80% train, 20% test
TEST_SIZE = 0.20

# ─────────────────────────────────────────────────────────────────────────────
# LOGGER
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# PASO 1 — CARGA Y FILTRADO
# Toma el dataset completo y filtra solo los CVEs útiles para el modelo
# ─────────────────────────────────────────────────────────────────────────────

def cargar_y_filtrar() -> pd.DataFrame:
    """
    Carga el dataset completo y filtra los CVEs que tienen:
    - CPE_VENDOR: necesario para el flujo de selección del usuario
    - SCORE_BASE: necesario como target y como indicador de CVSS v3.1 completo

    Returns:
        DataFrame filtrado con los CVEs útiles para el modelo
    """
    log.info(f"Cargando dataset desde {INPUT_PARQUET}...")
    df = pd.read_parquet(INPUT_PARQUET)
    log.info(f"Dataset completo: {len(df):,} CVEs")

    # Filtrar CVEs con CPE (vendor/product) y CVSS v3.1 completo
    # Estos son los únicos que tienen todas las features que necesita el modelo
    df_modelo = df[
        df["CPE_VENDOR"].notna() &
        df["SCORE_BASE"].notna()
    ].copy()

    log.info(f"CVEs útiles para el modelo: {len(df_modelo):,}")
    log.info(f"CVEs descartados (sin CPE o sin CVSS v3.1): {len(df) - len(df_modelo):,}")

    return df_modelo


# ─────────────────────────────────────────────────────────────────────────────
# PASO 2 — MANEJO DE NULOS
# Estrategia diferente según el tipo de columna
# ─────────────────────────────────────────────────────────────────────────────

def manejar_nulos(df: pd.DataFrame) -> pd.DataFrame:
    """
    Maneja los valores nulos del dataset.

    Estrategia por tipo de columna:
    - Categóricas (CWE_ID): rellenar con "UNKNOWN"
      Razón: el modelo puede aprender que UNKNOWN es una categoría válida
    - Numéricas (FACILIDAD): rellenar con la mediana
      Razón: la mediana es más robusta que la media ante valores extremos
    - CPE_PRODUCT (2 nulos): eliminar esas filas
      Razón: son tan pocos que no vale la pena imputar

    Args:
        df: DataFrame filtrado del paso anterior

    Returns:
        DataFrame sin nulos
    """
    log.info("Manejando valores nulos...")
    df = df.copy()

    # ── CWE_ID: 17,715 nulos → rellenar con UNKNOWN ──────────────────────────
    # El modelo tratará UNKNOWN como una categoría más
    nulos_cwe = df["CWE_ID"].isna().sum()
    df["CWE_ID"] = df["CWE_ID"].fillna("UNKNOWN")
    log.info(f"CWE_ID: {nulos_cwe:,} nulos rellenados con 'UNKNOWN'")

    # ── CPE_PRODUCT: 2 nulos → eliminar filas ────────────────────────────────
    # Son tan pocos que su eliminación no afecta el modelo
    nulos_product = df["CPE_PRODUCT"].isna().sum()
    df = df.dropna(subset=["CPE_PRODUCT"])
    log.info(f"CPE_PRODUCT: {nulos_product} filas eliminadas por nulos")

    # ── FACILIDAD: verificar si hay nulos (no debería, pero por seguridad) ───
    nulos_facilidad = df["FACILIDAD"].isna().sum()
    if nulos_facilidad > 0:
        mediana = df["FACILIDAD"].median()
        df["FACILIDAD"] = df["FACILIDAD"].fillna(mediana)
        log.info(f"FACILIDAD: {nulos_facilidad} nulos rellenados con mediana ({mediana:.2f})")

    # Verificar que no queden nulos en columnas críticas
    columnas_criticas = [
        "SCORE_BASE", "SEVERITY", "VEC_ATAQUE", "COMPLEJIDAD",
        "PRIVILEGIOS", "INTERACCION", "ALCANCE", "IMP_CONFID",
        "IMP_INTEGR", "IMP_DISPON", "FACILIDAD", "CPE_VENDOR", "CPE_PRODUCT"
    ]
    nulos_restantes = df[columnas_criticas].isna().sum().sum()
    if nulos_restantes > 0:
        log.warning(f"Aún quedan {nulos_restantes} nulos en columnas críticas")
    else:
        log.info("Sin nulos en columnas críticas.")

    return df


# ─────────────────────────────────────────────────────────────────────────────
# PASO 3 — INGENIERÍA DE FEATURES
# Crear columnas nuevas que ayuden al modelo a aprender mejor
# ─────────────────────────────────────────────────────────────────────────────

def ingenieria_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Crea features adicionales derivadas de las columnas existentes.

    Features nuevas:
    - DIAS_DESDE_PUBLICACION: antigüedad del CVE en días
      Razón: CVEs recientes sin parche son más peligrosos
    - IMPACTO_TOTAL: suma de los 3 impactos (confidencialidad + integridad + disponibilidad)
      Razón: resume el daño potencial en un solo número para el modelo
    - ES_RED: booleano si el vector de ataque es NETWORK
      Razón: las amenazas de red son las más relevantes para PYMEs conectadas a internet

    Args:
        df: DataFrame del paso anterior

    Returns:
        DataFrame con features adicionales
    """
    log.info("Creando features adicionales...")
    df = df.copy()

    # ── DIAS_DESDE_PUBLICACION ────────────────────────────────────────────────
    # Convertir la fecha de publicación a número de días desde hoy
    # El modelo entiende números, no fechas
    hoy = pd.Timestamp.now(tz="UTC")
    df["DIAS_DESDE_PUBLICACION"] = (hoy - df["PUBLISHED_DATE"]).dt.days
    log.info("Feature creada: DIAS_DESDE_PUBLICACION")

    # ── IMPACTO_TOTAL ─────────────────────────────────────────────────────────
    # Mapear NONE=0, LOW=1, HIGH=2 y sumar los 3 impactos
    # Resultado: 0 (sin impacto) a 6 (impacto máximo en todo)
    mapa_impacto = {"NONE": 0, "LOW": 1, "HIGH": 2}
    df["IMPACTO_TOTAL"] = (
        df["IMP_CONFID"].map(mapa_impacto).fillna(0) +
        df["IMP_INTEGR"].map(mapa_impacto).fillna(0) +
        df["IMP_DISPON"].map(mapa_impacto).fillna(0)
    )
    log.info("Feature creada: IMPACTO_TOTAL (0-6)")

    # ── ES_RED ────────────────────────────────────────────────────────────────
    # Las amenazas de red son las más críticas para PYMEs con internet
    df["ES_RED"] = (df["VEC_ATAQUE"] == "NETWORK").astype(int)
    log.info("Feature creada: ES_RED (1=ataque por internet, 0=otro vector)")

    return df


# ─────────────────────────────────────────────────────────────────────────────
# PASO 4 — ENCODING DE CATEGÓRICAS
# Convertir texto a números porque los modelos ML solo entienden números
# ─────────────────────────────────────────────────────────────────────────────

def encodear_categoricas(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Convierte columnas categóricas de texto a números enteros.

    Por qué Label Encoding y no One-Hot Encoding:
    - XGBoost maneja label encoding nativamente y eficientemente
    - One-Hot con CPE_VENDOR (5000+ valores) generaría miles de columnas
    - Label encoding es más eficiente en memoria y velocidad

    Args:
        df: DataFrame del paso anterior

    Returns:
        Tupla (DataFrame con columnas codificadas, dict con los encoders guardados)
    """
    log.info("Codificando columnas categóricas...")
    df = df.copy()

    # Columnas categóricas que necesitan encoding
    # Nota: CPE_VENDOR y CPE_PRODUCT también son categóricas
    columnas_categoricas = [
        "SEVERITY",       # LOW, MEDIUM, HIGH, CRITICAL → 0, 1, 2, 3
        "VEC_ATAQUE",     # NETWORK, LOCAL, etc. → números
        "COMPLEJIDAD",    # LOW, HIGH → 0, 1
        "PRIVILEGIOS",    # NONE, LOW, HIGH → 0, 1, 2
        "INTERACCION",    # NONE, REQUIRED → 0, 1
        "ALCANCE",        # UNCHANGED, CHANGED → 0, 1
        "IMP_CONFID",     # NONE, LOW, HIGH → 0, 1, 2
        "IMP_INTEGR",     # NONE, LOW, HIGH → 0, 1, 2
        "IMP_DISPON",     # NONE, LOW, HIGH → 0, 1, 2
        "CWE_ID",         # CWE-89, CWE-79, UNKNOWN, etc. → números
        "CPE_VENDOR",     # microsoft, apache, etc. → números
        "CPE_PRODUCT",    # windows_10, chrome, etc. → números
    ]

    # Guardar el mapeo de cada categoría para poder revertirlo después
    # Esto es crítico: cuando el usuario selecciona "microsoft" necesitamos
    # convertirlo al número que el modelo espera
    encoders = {}

    for col in columnas_categoricas:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col].astype(str))

        # Guardar el mapeo: {número: categoría_original}
        # Ejemplo: {0: "apache", 1: "cisco", 2: "google", ...}
        encoders[col] = {
            int(i): str(clase)
            for i, clase in enumerate(le.classes_)
        }

        log.info(f"  {col}: {len(le.classes_)} categorías únicas codificadas")

    return df, encoders


# ─────────────────────────────────────────────────────────────────────────────
# PASO 5 — DEFINIR FEATURES Y TARGETS
# Seleccionar qué columnas entran al modelo y cuáles son los objetivos
# ─────────────────────────────────────────────────────────────────────────────

def definir_features_y_targets(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Define las columnas que usa el modelo (X) y las que predice (y).

    Features (X) — lo que el modelo recibe como entrada:
        Columnas CVSS + features derivadas + vendor/product

    Targets (y) — lo que el modelo predice:
        SCORE_BASE  → Modelo 1: regresión (predice número 0-10)
        SEVERITY    → Modelo 2: clasificación (predice LOW/MEDIUM/HIGH/CRITICAL)
        HAS_KEV     → Modelo 3: clasificación binaria (predice True/False)

    Args:
        df: DataFrame con todas las columnas procesadas

    Returns:
        Tupla (DataFrame con solo las features, dict con los 3 targets)
    """
    log.info("Definiendo features y targets del modelo...")

    # ── Features que entran al modelo ────────────────────────────────────────
    feature_columns = [
        # CVSS v3.1 — el corazón del modelo
        "VEC_ATAQUE",
        "COMPLEJIDAD",
        "PRIVILEGIOS",
        "INTERACCION",
        "ALCANCE",
        "IMP_CONFID",
        "IMP_INTEGR",
        "IMP_DISPON",
        "FACILIDAD",

        # Clasificación del tipo de error
        "CWE_ID",

        # Software afectado — para personalización por empresa
        "CPE_VENDOR",
        "CPE_PRODUCT",

        # Temporales
        "CVE_YEAR",
        "DIAS_DESDE_PUBLICACION",

        # Features derivadas
        "IMPACTO_TOTAL",
        "ES_RED",
    ]

    # ── Targets que el modelo predice ────────────────────────────────────────
    targets = {
        "SCORE_BASE": df["SCORE_BASE"],    # Regresión: número 0-10
        "SEVERITY":   df["SEVERITY"],      # Clasificación: 4 clases
        "HAS_KEV":    df["HAS_KEV"],       # Clasificación binaria: 0 o 1
    }

    X = df[feature_columns].copy()

    log.info(f"Features del modelo: {len(feature_columns)} columnas")
    log.info(f"Targets: SCORE_BASE (regresión), SEVERITY (4 clases), HAS_KEV (binario)")
    log.info(f"Shape final de X: {X.shape}")

    return X, targets, feature_columns


# ─────────────────────────────────────────────────────────────────────────────
# PASO 6 — MANEJO DEL DESBALANCE EN HAS_KEV
# Solo 1,582 positivos de 181k → el modelo aprendería a decir siempre False
# ─────────────────────────────────────────────────────────────────────────────

def calcular_scale_pos_weight(y_kev: pd.Series) -> float:
    """
    Calcula el peso para balancear las clases en HAS_KEV.

    El desbalance: ~1,582 True vs ~179,697 False
    Sin corrección el modelo predice siempre False y tiene 99% de accuracy
    pero es inútil — nunca detecta el peligro real.

    XGBoost tiene el parámetro scale_pos_weight para esto:
    scale_pos_weight = negativos / positivos

    Guardamos este valor en los metadatos para usarlo en el 03_train.py

    Args:
        y_kev: Serie booleana de HAS_KEV

    Returns:
        float con el peso calculado
    """
    negativos = (y_kev == False).sum()
    positivos = (y_kev == True).sum()
    peso = round(negativos / positivos, 2)

    log.info(f"Desbalance HAS_KEV — Positivos: {positivos:,} | Negativos: {negativos:,}")
    log.info(f"scale_pos_weight calculado: {peso}")

    return peso


# ─────────────────────────────────────────────────────────────────────────────
# PASO 7 — SPLIT TRAIN / TEST
# Dividir en 80% entrenamiento y 20% evaluación
# ─────────────────────────────────────────────────────────────────────────────

def dividir_train_test(
    X: pd.DataFrame,
    targets: dict,
    df_original: pd.DataFrame,
) -> tuple:
    """
    Divide el dataset en train (80%) y test (20%).

    stratify=targets['SEVERITY']:
        Garantiza que la proporción de cada nivel de severidad
        sea la misma en train y test. Sin esto podría pasar que
        todo el test tenga solo CVEs CRITICAL y el modelo no
        aprenda a detectar los LOW.

    Args:
        X:           DataFrame con las features
        targets:     Dict con los 3 targets
        df_original: DataFrame completo para guardar columnas extra en test

    Returns:
        Tupla con los índices y datos divididos
    """
    log.info("Dividiendo en train (80%) y test (20%)...")

    # Usar SEVERITY como estratificación porque tiene 4 clases balanceables
    X_train, X_test, idx_train, idx_test = train_test_split(
        X,
        X.index,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=targets["SEVERITY"],  # mantener proporción de severidades
    )

    log.info(f"Train: {len(X_train):,} CVEs")
    log.info(f"Test:  {len(X_test):,} CVEs")

    return X_train, X_test, idx_train, idx_test


# ─────────────────────────────────────────────────────────────────────────────
# PASO 8 — GUARDAR
# Exportar los datasets y metadatos necesarios para el 03_train.py
# ─────────────────────────────────────────────────────────────────────────────

def guardar(
    df: pd.DataFrame,
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    idx_train,
    idx_test,
    targets: dict,
    encoders: dict,
    feature_columns: list,
    scale_pos_weight: float,
) -> None:
    """
    Guarda todos los archivos necesarios para el entrenamiento.

    Archivos generados:
    - nvd_modelo_train.parquet: features + targets del 80% de entrenamiento
    - nvd_modelo_test.parquet:  features + targets del 20% de evaluación
    - encoders.json:            mapeo de categorías a números (para la UI)
    - feature_columns.json:     lista de columnas del modelo (para inferencia)
    """

    # ── Construir DataFrames completos con features + targets ─────────────────
    # El train y test necesitan las features Y los targets juntos
    def construir_df_completo(X, idx):
        df_out = X.copy()
        df_out["SCORE_BASE"] = targets["SCORE_BASE"].loc[idx]
        df_out["SEVERITY"]   = targets["SEVERITY"].loc[idx]
        df_out["HAS_KEV"]    = targets["HAS_KEV"].loc[idx]
        # Incluir CVE_ID para trazabilidad — saber qué CVE es cada fila
        df_out["CVE_ID"]     = df.loc[idx, "CVE_ID"].values
        return df_out

    df_train = construir_df_completo(X_train, idx_train)
    df_test  = construir_df_completo(X_test,  idx_test)

    # ── Guardar parquets ──────────────────────────────────────────────────────
    log.info(f"Guardando train en {TRAIN_PARQUET}...")
    df_train.to_parquet(TRAIN_PARQUET, index=False, engine="pyarrow")

    log.info(f"Guardando test en {TEST_PARQUET}...")
    df_test.to_parquet(TEST_PARQUET, index=False, engine="pyarrow")

    # ── Guardar encoders ──────────────────────────────────────────────────────
    # El encoder es el diccionario de traducción número→categoría
    # Lo necesita la UI para convertir "microsoft" al número que el modelo espera
    # Y también para mostrar "CRITICAL" en lugar de "3" en los resultados
    log.info(f"Guardando encoders en {ENCODERS_JSON}...")
    with open(ENCODERS_JSON, "w", encoding="utf-8") as f:
        json.dump(encoders, f, ensure_ascii=False, indent=2)

    # ── Guardar lista de features ─────────────────────────────────────────────
    # El 03_train.py y la UI necesitan saber exactamente qué columnas
    # y en qué orden usar para hacer predicciones
    features_info = {
        "feature_columns": feature_columns,
        "target_columns": ["SCORE_BASE", "SEVERITY", "HAS_KEV"],
        "scale_pos_weight_kev": scale_pos_weight,
        "total_train": len(df_train),
        "total_test": len(df_test),
        "random_state": RANDOM_STATE,
        "test_size": TEST_SIZE,
        "fecha_preprocesamiento": datetime.now(timezone.utc).isoformat(),
    }
    log.info(f"Guardando info de features en {FEATURES_JSON}...")
    with open(FEATURES_JSON, "w", encoding="utf-8") as f:
        json.dump(features_info, f, ensure_ascii=False, indent=2)

    # ── Actualizar model_metadata.json ───────────────────────────────────────
    if METADATA_PATH.exists():
        with open(METADATA_PATH, encoding="utf-8") as f:
            metadata = json.load(f)
        metadata["preprocesamiento"] = {
            "fecha": datetime.now(timezone.utc).isoformat(),
            "total_modelo": len(df_train) + len(df_test),
            "total_train": len(df_train),
            "total_test": len(df_test),
            "features": len(feature_columns),
            "scale_pos_weight_kev": scale_pos_weight,
        }
        with open(METADATA_PATH, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

    log.info("─" * 60)
    log.info("Preprocesamiento completado exitosamente.")
    log.info(f"  Train: {len(df_train):,} CVEs → {TRAIN_PARQUET.name}")
    log.info(f"  Test:  {len(df_test):,} CVEs → {TEST_PARQUET.name}")
    log.info(f"  Features del modelo: {len(feature_columns)}")
    log.info(f"  scale_pos_weight KEV: {scale_pos_weight}")
    log.info("─" * 60)


# ─────────────────────────────────────────────────────────────────────────────
# PUNTO DE ENTRADA
# ─────────────────────────────────────────────────────────────────────────────

def main():
    log.info("=" * 60)
    log.info("INICIANDO PREPROCESAMIENTO")
    log.info("=" * 60)

    # Paso 1: Cargar y filtrar
    df = cargar_y_filtrar()

    # Paso 2: Manejar nulos
    df = manejar_nulos(df)

    # Paso 3: Ingeniería de features
    df = ingenieria_features(df)

    # Paso 4: Encoding de categóricas
    df, encoders = encodear_categoricas(df)

    # Paso 5: Definir features y targets
    X, targets, feature_columns = definir_features_y_targets(df)

    # Paso 6: Calcular peso para desbalance KEV
    scale_pos_weight = calcular_scale_pos_weight(targets["HAS_KEV"])

    # Paso 7: Dividir train/test
    X_train, X_test, idx_train, idx_test = dividir_train_test(X, targets, df)

    # Paso 8: Guardar todo
    guardar(
        df, X_train, X_test, idx_train, idx_test,
        targets, encoders, feature_columns, scale_pos_weight
    )


if __name__ == "__main__":
    main()