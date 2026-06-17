"""
predictor.py
═══════════════════════════════════════════════════════════
Funciones de transformación y predicción extraídas del
notebook Pipeline_identificacion_riegos_sistemas.ipynb

Flujo:
    canonical_json
        → generate_filters
        → build_base_features (generate_scenarios + add_numeric_features)
        → build_model_matrix
        → predict_score_and_tier
        → build_output_json (top 5 escenarios por producto)
═══════════════════════════════════════════════════════════
"""

import os
import pandas as pd
import joblib
from collections import defaultdict
from itertools import product

# ============================================================
# CONFIGURACIÓN DE RUTAS A LOS .pkl
# ============================================================
# Ajusta MODELS_DIR según donde tengas la carpeta "models"
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")


# ============================================================
# CATÁLOGOS CWE (cell 31)
# ============================================================
WEB_CWE = [
    "authentication", "authorization", "access_control",
    "xss_injection", "database_injection", "command_injection",
    "information_disclosure"
]

DEVICE_CWE = [
    "authentication", "authorization", "access_control",
    "buffer_overflow", "memory_corruption", "resource_exhaustion"
]

GENERIC_CWE = [
    "authentication", "authorization", "access_control",
    "information_disclosure"
]


# ============================================================
# FEATURE GROUPS / BLACKLIST / TRANSLATIONS (cells 32-33)
# ============================================================
FEATURE_GROUPS = {
    "Vendor": "vendor_",
    "Producto": "product_",
    "CWE": "cwe_",
    "Attack Vector": "attack_vector_",
    "Attack Complexity": "attack_complexity_",
    "Privileges": "privileges_required_",
    "User Interaction": "user_interaction_",
    "Scope": "scope_",
    "Confidentiality": "impact_confidentiality_",
    "Integrity": "impact_integrity_",
    "Availability": "impact_availability_",
    "Severity": "severity_"
}

BLACKLIST = ["other", "unknown", "misc"]

EXCLUIR = ["OTHER", "UNKNOWN", "MISSING"]


# ============================================================
# CVSS TABLES (cell 40)
# ============================================================
AV = {
    "NETWORK": 0.85,
    "ADJACENT_NETWORK": 0.62,
    "LOCAL": 0.55,
    "PHYSICAL": 0.20
}

AC = {
    "LOW": 0.77,
    "HIGH": 0.44
}

PR_U = {
    "NONE": 0.85,
    "LOW": 0.62,
    "HIGH": 0.27
}

PR_C = {
    "NONE": 0.85,
    "LOW": 0.68,
    "HIGH": 0.50
}

UI = {
    "NONE": 0.85,
    "REQUIRED": 0.62
}

IMPACT = {
    "NONE": 0.00,
    "LOW": 0.22,
    "HIGH": 0.56
}


# ============================================================
# add_score helper (cell 36)
# ============================================================
def add_score(score_dict, cwes, points):
    for cwe in cwes:
        score_dict[cwe] += points


# ============================================================
# generate_filters (cell 37 - versión final con CWE scoring)
# ============================================================
def generate_filters(data, top_n_cwe=8):

    cwe_scores = defaultdict(int)

    # NAVEGADOR WEB
    if data["accessible_from_browser"]:
        add_score(cwe_scores, [
            "xss_injection", "database_injection", "command_injection",
            "unrestricted_upload", "path_traversal", "input_validation",
            "information_disclosure"
        ], 4)
        add_score(cwe_scores, [
            "authentication", "authorization", "access_control"
        ], 3)

    # INTERNET
    if data["internet_exposed"]:
        add_score(cwe_scores, [
            "authentication", "authorization", "access_control",
            "information_disclosure"
        ], 5)
        add_score(cwe_scores, [
            "database_injection", "command_injection",
            "xss_injection", "unrestricted_upload"
        ], 3)

    # SOLO INTERNO
    if data["internal_use"]:
        add_score(cwe_scores, [
            "authentication", "authorization", "access_control",
            "privilege_management"
        ], 4)
        add_score(cwe_scores, ["information_disclosure"], 2)

    # CONTROLA DISPOSITIVOS
    if data["controls_devices"]:
        add_score(cwe_scores, [
            "buffer_overflow", "memory_corruption",
            "resource_exhaustion", "hardcoded_credentials"
        ], 5)
        add_score(cwe_scores, ["authentication", "authorization"], 3)

    # LOGIN
    if data["requires_login"]:
        add_score(cwe_scores, [
            "authentication", "authorization",
            "privilege_management", "access_control"
        ], 5)
    else:
        add_score(cwe_scores, [
            "authentication", "authorization", "access_control"
        ], 7)
        add_score(cwe_scores, ["information_disclosure"], 4)

    # CRITICIDAD
    criticality = data["business_criticality"]

    if criticality == "critical":
        add_score(cwe_scores, [
            "authentication", "authorization",
            "access_control", "information_disclosure"
        ], 4)
    elif criticality == "high":
        add_score(cwe_scores, [
            "authentication", "authorization", "access_control"
        ], 3)

    # DATOS SENSIBLES
    sensitivity = data["data_sensitivity"]

    if sensitivity == "highly_confidential":
        add_score(cwe_scores, [
            "information_disclosure", "access_control",
            "authentication", "authorization"
        ], 7)
    elif sensitivity == "confidential":
        add_score(cwe_scores, [
            "information_disclosure", "access_control", "authentication"
        ], 5)
    elif sensitivity == "internal":
        add_score(cwe_scores, ["information_disclosure"], 3)

    # INTEGRIDAD
    integrity = data["integrity_impact"]

    if integrity == "high":
        add_score(cwe_scores, [
            "authorization", "privilege_management",
            "command_injection", "database_injection"
        ], 5)
    elif integrity == "medium":
        add_score(cwe_scores, ["authorization", "database_injection"], 3)

    # DISPONIBILIDAD
    availability = data["availability_impact"]

    if availability == "high":
        add_score(cwe_scores, [
            "resource_exhaustion", "resource_management",
            "buffer_overflow", "memory_corruption"
        ], 5)
    elif availability == "medium":
        add_score(cwe_scores, ["resource_exhaustion", "resource_management"], 3)

    # TOP CWE
    ordered_cwe = sorted(cwe_scores.items(), key=lambda x: x[1], reverse=True)
    selected_cwe = [cwe for cwe, score in ordered_cwe[:top_n_cwe]]

    # ATTACK VECTOR
    if data["internet_exposed"]:
        attack_vector = ["NETWORK"]
    elif data["internal_use"]:
        attack_vector = ["NETWORK", "LOCAL"]
    else:
        attack_vector = ["LOCAL", "PHYSICAL"]

    # PRIVILEGES
    if data["requires_login"]:
        privileges = ["LOW", "HIGH"]
    else:
        privileges = ["NONE"]

    # USER INTERACTION
    interaction = ["NONE", "REQUIRED"]

    # SCOPE
    scope = ["UNCHANGED", "CHANGED"]

    # SEVERITY
    severity_map = {
        "low": ["LOW", "MEDIUM"],
        "medium": ["MEDIUM", "HIGH"],
        "high": ["HIGH", "CRITICAL"],
        "critical": ["CRITICAL"]
    }
    severity = severity_map.get(criticality, ["MEDIUM", "HIGH"])

    # IMPACTOS
    confidentiality_map = {
        "none": ["NONE"],
        "internal": ["LOW"],
        "confidential": ["LOW", "HIGH"],
        "highly_confidential": ["HIGH"]
    }

    impact_map = {
        "low": ["LOW"],
        "medium": ["LOW", "HIGH"],
        "high": ["HIGH"]
    }

    # COMPLEXITY
    if data["internet_exposed"]:
        complexity = ["LOW"]
    elif data["internal_use"]:
        complexity = ["LOW", "HIGH"]
    else:
        complexity = ["HIGH"]

    filters = {
        "cwe_scores": dict(ordered_cwe),
        "cwe": selected_cwe,
        "attack_vector": attack_vector,
        "privileges": privileges,
        "interaction": interaction,
        "scope": scope,
        "severity": severity,
        "complexity": complexity,
        "impact_confid": confidentiality_map.get(sensitivity, ["LOW", "HIGH"]),
        "impact_integr": impact_map.get(integrity, ["LOW", "HIGH"]),
        "impact_dispon": impact_map.get(availability, ["LOW", "HIGH"])
    }

    return filters


# ============================================================
# select_top_cwe (cell 38)
# ============================================================
def select_top_cwe(filters, top_n=6, max_n=8):
    cwe_scores = filters.get("cwe_scores", {})

    if not cwe_scores:
        return filters["cwe"][:top_n]

    ordered = sorted(cwe_scores.items(), key=lambda x: x[1], reverse=True)
    n = min(top_n, max_n, len(ordered))

    return [cwe for cwe, score in ordered[:n]]


# ============================================================
# generate_scenarios (cell 39)
# ============================================================
def generate_scenarios(canonical_json, filters, top_n_cwe=6, max_n_cwe=8):

    selected_cwe = select_top_cwe(filters=filters, top_n=top_n_cwe, max_n=max_n_cwe)

    rows = []

    for product_name in canonical_json["products"]:

        combinations = product(
            selected_cwe,
            filters["attack_vector"],
            filters["complexity"],
            filters["privileges"],
            filters["interaction"],
            filters["scope"],
            filters["severity"],
            filters["impact_confid"],
            filters["impact_integr"],
            filters["impact_dispon"]
        )

        for combo in combinations:
            (cwe, attack_vector, complexity, privileges, interaction,
             scope, severity, impact_confid, impact_integr, impact_dispon) = combo

            rows.append({
                "vendor": canonical_json["vendor"],
                "product": product_name,
                "cwe": cwe,
                "attack_vector": attack_vector,
                "complexity": complexity,
                "privileges": privileges,
                "interaction": interaction,
                "scope": scope,
                "severity": severity,
                "impact_confid": impact_confid,
                "impact_integr": impact_integr,
                "impact_dispon": impact_dispon
            })

    return pd.DataFrame(rows)


# ============================================================
# calculate_facilidad / calculate_score_base (cells 41-42)
# ============================================================
def calculate_facilidad(row):
    av = AV[row["attack_vector"]]
    ac = AC[row["complexity"]]

    if row["scope"] == "CHANGED":
        pr = PR_C[row["privileges"]]
    else:
        pr = PR_U[row["privileges"]]

    ui = UI[row["interaction"]]

    exploitability = 8.22 * av * ac * pr * ui
    return round(exploitability, 2)


def calculate_score_base(row):
    exploitability = calculate_facilidad(row)

    impact = (
        IMPACT[row["impact_confid"]]
        + IMPACT[row["impact_integr"]]
        + IMPACT[row["impact_dispon"]]
    )

    score = exploitability + (impact * 4)
    return round(min(score, 10), 1)


# ============================================================
# add_numeric_features (cell 43)
# ============================================================
def add_numeric_features(df_scenarios, canonical_json):
    df = df_scenarios.copy()

    df["FACILIDAD"] = df.apply(calculate_facilidad, axis=1)
    df["SCORE_BASE"] = df.apply(calculate_score_base, axis=1)

    reference_count = canonical_json.get("reference_count", 1)
    df["REFERENCE_COUNT"] = reference_count
    df["CPE_COUNT"] = len(canonical_json["products"])

    return df


# ============================================================
# build_base_features (cell 44)
# ============================================================
def build_base_features(canonical_json, filters, top_n_cwe=6, max_n_cwe=10):
    df_scenarios = generate_scenarios(
        canonical_json=canonical_json,
        filters=filters,
        top_n_cwe=top_n_cwe,
        max_n_cwe=max_n_cwe
    )

    df_base = add_numeric_features(
        df_scenarios=df_scenarios,
        canonical_json=canonical_json
    )

    return df_base


# ============================================================
# normalize_text / map_vendor / map_product (cells 45-47)
# ============================================================
def normalize_text(text):
    if pd.isna(text):
        return ""

    return (
        str(text).lower().strip()
        .replace("-", "_")
        .replace(" ", "_")
        .replace("/", "_")
    )


# ============================================================
# build_model_matrix (cell 48)
# ============================================================
def build_model_matrix(df_base, model_features, vendor_map=None, product_map=None):

    df = df_base.copy()

    def map_vendor(value, vmap):
        if vmap is None:
            return value
        value_norm = normalize_text(value)
        vmap_norm = {normalize_text(k): v for k, v in vmap.items()}
        return vmap_norm.get(value_norm, "OTHER_VENDOR")

    def map_product(value, pmap):
        if pmap is None:
            return value
        value_norm = normalize_text(value)
        pmap_norm = {normalize_text(k): v for k, v in pmap.items()}

        if value_norm in pmap_norm:
            return pmap_norm[value_norm]

        for key in pmap_norm:
            if value_norm in key:
                return pmap_norm[key]
            if key in value_norm:
                return pmap_norm[key]

        return "other_software"

    df["vendor_group"] = df["vendor"].apply(lambda x: map_vendor(x, vendor_map))
    df["product_group"] = df["product"].apply(lambda x: map_product(x, product_map))
    df["cwe"] = df["cwe"].astype(str).str.lower().str.strip()

    X = pd.DataFrame(index=df.index)

    numeric_cols = ["SCORE_BASE", "FACILIDAD", "REFERENCE_COUNT", "CPE_COUNT"]
    X[numeric_cols] = df[numeric_cols]

    def add_dummies(X, series, prefix):
        dummies = pd.get_dummies(series, prefix=prefix, dtype=int)
        return pd.concat([X, dummies], axis=1)

    X = add_dummies(X, df["vendor_group"], "VENDOR")
    X = add_dummies(X, df["product_group"], "PRODUCT")
    X = add_dummies(X, df["cwe"], "CWE")
    X = add_dummies(X, df["severity"], "SEVERITY")
    X = add_dummies(X, df["attack_vector"], "VEC_ATAQUE")
    X = add_dummies(X, df["complexity"], "COMPLEJIDAD")
    X = add_dummies(X, df["privileges"], "PRIVILEGIOS")
    X = add_dummies(X, df["interaction"], "INTERACCION")
    X = add_dummies(X, df["scope"], "ALCANCE")
    X = add_dummies(X, df["impact_confid"], "IMP_CONFID")
    X = add_dummies(X, df["impact_integr"], "IMP_INTEGR")
    X = add_dummies(X, df["impact_dispon"], "IMP_DISPON")

    # Alineación con entrenamiento
    for col in model_features:
        if col not in X.columns:
            X[col] = 0

    X = X[model_features]

    numeric_base = ["SCORE_BASE", "FACILIDAD", "REFERENCE_COUNT", "CPE_COUNT"]
    dummy_cols = [c for c in X.columns if c not in numeric_base]
    X[dummy_cols] = X[dummy_cols].astype(int)

    return X


# ============================================================
# predict_score_and_tier (cell 49)
# ============================================================
def predict_score_and_tier(new_data, regressor_model, classifier_model):

    score_pred = regressor_model.predict(new_data)
    tier_pred = classifier_model.predict(new_data)
    tier_proba = classifier_model.predict_proba(new_data)

    result = new_data.copy()
    result["score_pred"] = score_pred
    result["tier_pred"] = tier_pred

    for i, class_name in enumerate(classifier_model.classes_):
        result[f"proba_tier_{class_name}"] = tier_proba[:, i]

    return result


# ============================================================
# extract_product (cell 56)
# ============================================================
def extract_product(row):
    product_cols = [c for c in row.index if c.startswith("PRODUCT_")]

    for col in product_cols:
        try:
            if float(row[col]) > 0:
                return col.replace("PRODUCT_", "")
        except Exception:
            pass

    return "unknown"


# ============================================================
# transformar_dummies_a_json (cell 57)
# ============================================================
def transformar_dummies_a_json(row):

    resultado = {
        "prediction": {
            "tier": int(row["tier_pred"]),
            "score": round(float(row["score_pred"]), 2)
        },
        "asset": {},
        "attack": {},
        "impact": {}
    }

    grupos = {
        "Vendor": "VENDOR_",
        "Producto": "PRODUCT_",
        "CWE": "CWE_",
        "Severidad": "SEVERITY_",
        "VectorAtaque": "VEC_ATAQUE_",
        "Complejidad": "COMPLEJIDAD_",
        "Privilegios": "PRIVILEGIOS_",
        "InteraccionUsuario": "INTERACCION_",
        "Alcance": "ALCANCE_",
        "ImpactoConfidencialidad": "IMP_CONFID_",
        "ImpactoIntegridad": "IMP_INTEGR_",
        "ImpactoDisponibilidad": "IMP_DISPON_"
    }

    for grupo, prefijo in grupos.items():

        valores = []
        columnas = [c for c in row.index if c.startswith(prefijo)]

        for col in columnas:
            try:
                valor_col = float(row[col])
            except Exception:
                continue

            if valor_col <= 0:
                continue

            valor = col.replace(prefijo, "")

            if any(x in valor.upper() for x in EXCLUIR):
                continue

            valor = valor.replace("_", " ").title()
            valores.append(valor)

        if not valores:
            continue

        if grupo in ["Vendor", "Producto", "CWE", "Severidad"]:
            resultado["asset"][grupo] = valores
        elif grupo in ["VectorAtaque", "Complejidad", "Privilegios",
                       "InteraccionUsuario", "Alcance"]:
            resultado["attack"][grupo] = valores
        else:
            resultado["impact"][grupo] = valores

    return resultado


# ============================================================
# build_output_json (cell 59) — top 5 escenarios por producto
# ============================================================
def build_output_json(top5_df):

    output = []

    for product_name, group in top5_df.groupby("product_group"):

        scenarios = []

        for _, row in group.iterrows():
            scenarios.append(transformar_dummies_a_json(row))

        output.append({
            "product": product_name,
            "top_scenarios": scenarios
        })

    return output


# ============================================================
# CARGA DE MODELOS (cells 61, 77) — se ejecuta UNA VEZ al importar
# ============================================================
_vendor_map     = joblib.load(os.path.join(MODELS_DIR, "vendor_map.pkl"))
_product_map    = joblib.load(os.path.join(MODELS_DIR, "product_map.pkl"))
_model_features = joblib.load(os.path.join(MODELS_DIR, "model_features.pkl"))
_rf_regressor   = joblib.load(os.path.join(MODELS_DIR, "random_forest_score_model.pkl"))
_rf_classifier  = joblib.load(os.path.join(MODELS_DIR, "random_forest_tier_model.pkl"))


# ============================================================
# FUNCIÓN PRINCIPAL — predecir(canonical_json)
# ============================================================
def predecir(canonical_json, top_n=5):
    """
    Recibe UN canonical_json (con 'products' como lista de 1+ elementos)
    y devuelve la lista de resultados agrupados por producto, cada uno
    con sus top N escenarios de mayor riesgo.

    Salida:
        [
          {
            "product": "windows_server",
            "top_scenarios": [ {prediction, asset, attack, impact}, ... ]
          },
          ...
        ]
    """

    # 1. Filtros derivados del canonical_json
    filters = generate_filters(canonical_json, top_n_cwe=8)

    # 2. Escenarios base (combinatoria) + features numéricas
    df_base = build_base_features(
        canonical_json=canonical_json,
        filters=filters,
        top_n_cwe=6,
        max_n_cwe=10
    )

    # 3. Matriz alineada con las columnas del modelo
    X_model = build_model_matrix(
        df_base=df_base,
        model_features=_model_features,
        vendor_map=_vendor_map,
        product_map=_product_map
    )

    # 4. Predicción
    predictions = predict_score_and_tier(
        new_data=X_model,
        regressor_model=_rf_regressor,
        classifier_model=_rf_classifier
    )

    # 5. Ranking descendente por tier y score
    ranking_df = predictions.sort_values(
        by=["tier_pred", "score_pred"],
        ascending=False
    ).copy()

    # 6. Identificar el producto de cada fila
    ranking_df["product_group"] = ranking_df.apply(extract_product, axis=1)

    # 7. Top N escenarios por producto
    top_df = (
        ranking_df
        .groupby("product_group", group_keys=False)
        .head(top_n)
        .reset_index(drop=True)
    )

    # 8. JSON final agrupado por producto
    return build_output_json(top_df)