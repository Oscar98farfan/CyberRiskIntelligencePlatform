from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import json
import uuid

# Variables de entorno (ml/.env): SUPABASE_URL, SUPABASE_SECRET_KEY, CORS_ORIGINS.
# Se cargan ANTES de importar plataforma.py, que las lee al importarse.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from predictor import predecir
from plataforma import bp as plataforma_bp

app = Flask(__name__)
# Límite de tamaño por petición (el inventario del agente pesa unos cientos de KB)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

# CORS: solo los orígenes permitidos pueden llamar a la API desde el navegador
# (antes era abierto a cualquier sitio). Se configuran en ml/.env.
ORIGENES_PERMITIDOS = [
    o.strip() for o in os.environ.get(
        "CORS_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500,https://oscar98farfan.github.io",
    ).split(",") if o.strip()
]
CORS(app, origins=ORIGENES_PERMITIDOS)

# Endpoints de la plataforma con usuarios (Supabase): /api/...
app.register_blueprint(plataforma_bp)

# Carpetas
INPUTS_DIR  = "inputs"
OUTPUTS_DIR = "outputs"
LOGS_DIR    = "logs"

os.makedirs(INPUTS_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)


@app.route("/")
def home():
    return "API CyberRisk funcionando"


# Endpoint para guardar el JSON de entrada
@app.route("/guardar-json", methods=["POST"])
def guardar_json():
    data = request.json
    file_id = str(uuid.uuid4())
    archivo = f"{file_id}.json"
    ruta = os.path.join(INPUTS_DIR, archivo)

    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    return jsonify({"success": True, "id": file_id, "archivo": archivo})


@app.route("/analizar", methods=["POST"])
def analizar():
    data = request.json
    file_id = data.get("id")

    if not file_id:
        return jsonify({"error": "Se requiere el campo 'id'"}), 400

    ruta = os.path.join(INPUTS_DIR, f"{file_id}.json")
    if not os.path.exists(ruta):
        return jsonify({"error": f"Archivo {file_id}.json no encontrado"}), 404

    with open(ruta, "r", encoding="utf-8") as f:
        payload = json.load(f)  # lista de canonical_json (uno por sistema)

    resultados = []

    # for canonical_json in payload:
    #     try:
    #         resultado = predecir(canonical_json)  # devuelve lista [{product, top_scenarios}]
    #         resultados.extend(resultado)
    #     except Exception as e:
    #         return jsonify({
    #             "error": f"Error al predecir para {canonical_json.get('vendor', '?')}: {str(e)}"
    #         }), 500
    for canonical_json in payload:
        try:
            resultado = predecir(canonical_json)
            # Inyectar los productos originales en cada item del resultado
            for item in resultado:
                item["original_products"] = canonical_json.get("products", [])
            resultados.extend(resultado)
        except Exception as e:
            return jsonify({
                "error": f"Error al predecir para {canonical_json.get('vendor', '?')}: {str(e)}"
            }), 500

    # Guardar resultado para auditoría
    out_ruta = os.path.join(OUTPUTS_DIR, f"{file_id}_result.json")
    with open(out_ruta, "w", encoding="utf-8") as f:
        json.dump(resultados, f, indent=4, ensure_ascii=False)

    return jsonify(resultados)





# if __name__ == "__main__":
#     app.run(debug=True)





# from flask import Flask, request, jsonify
# from flask_cors import CORS
# import os
# import json
# import uuid
# from datetime import datetime

# app = Flask(__name__)
# CORS(app)

# # Carpetas
# INPUTS_DIR = "inputs"
# OUTPUTS_DIR = "outputs"
# LOGS_DIR = "logs"

# os.makedirs(INPUTS_DIR, exist_ok=True)
# os.makedirs(OUTPUTS_DIR, exist_ok=True)
# os.makedirs(LOGS_DIR, exist_ok=True)


# @app.route("/")
# def home():
#     return "API CyberRisk funcionando"

# # EndPoint para guardar el json - Entrada al modelo
# @app.route("/guardar-json", methods=["POST"])
# def guardar_json():
#     data = request.json
#     # ID único
#     file_id = str(uuid.uuid4())
#     archivo = f"{file_id}.json"
#     ruta = os.path.join(INPUTS_DIR, archivo)
#     with open(ruta, "w", encoding="utf-8") as f:
#         json.dump(data, f, indent=4, ensure_ascii=False)
#     return jsonify({"success": True, "id": file_id, "archivo": archivo})

# @app.route("/clientes", methods=["GET"])
# def clientes():
#     return {"total": 100}


# @app.route("/analizar", methods=["POST"])
# def analizar():
#     data = request.json
#     file_id = data.get("id")

#     ruta = os.path.join(INPUTS_DIR, f"{file_id}.json")
#     with open(ruta, "r", encoding="utf-8") as f:
#         payload = json.load(f)  # payload es una LISTA de canonical_json

#     resultados = []
#     for canonical_json in payload:
#         resultado = {
#             "prediction": {"tier": 4, "score": 0.53},
#             "asset": {
#                 "Vendor": [canonical_json.get("vendor", "—")],
#                 "Producto": canonical_json.get("products", ["—"]),
#                 "CWE": ["Null Pointer"],
#                 "Severidad": ["Critical"]
#             },
#             "attack": {
#                 "VectorAtaque": ["Network"],
#                 "Complejidad": ["Low"],
#                 "Privilegios": ["None"],
#                 "InteraccionUsuario": ["None"],
#                 "Alcance": ["Unchanged"]
#             },
#             "impact": {
#                 "ImpactoConfidencialidad": ["High"],
#                 "ImpactoIntegridad": ["High"],
#                 "ImpactoDisponibilidad": ["High"]
#             }
#         }
#         resultados.append(resultado)

#     # resultados = []
#     # for canonical_json in payload:
#     #     resultado = predecir(canonical_json)  # tu función del notebook
#     #     resultados.append(resultado)

#     # 4. Guardar resultado en outputs
#     out_ruta = os.path.join(OUTPUTS_DIR, f"{file_id}_result.json")
#     with open(out_ruta, "w", encoding="utf-8") as f:
#         json.dump(resultados, f, indent=4, ensure_ascii=False)

#     return jsonify(resultados)



# @app.route("/analizar", methods=["POST"])
# def analizar():
#     data = request.json
#     file_id = data.get("id")
    
#     if not file_id:
#         return jsonify({"error": "Se requiere el campo 'id'"}), 400

#     #1. Se guarda el json la entrada original
#     ruta = os.path.join(INPUTS_DIR, f"{file_id}.json")
#     if not os.path.exists(ruta):
#         return jsonify({"error": f"Archivo {file_id}.json no encontrado"}), 404

#     with open(ruta, "r", encoding="utf-8") as f:
#         payload = json.load(f)

#     #2. Aqui va el modelo cuando se tenga
#     # resultado = modelo.predict(payload)

#     ruta = os.path.join(INPUTS_DIR, f"{file_id}.json")
#     with open(ruta, "r", encoding="utf-8") as f:
#         payload = json.load(f)  # payload es una LISTA de canonical_json

#     resultados = []
#     for canonical_json in payload:
#         resultado = predecir(canonical_json)  # tu función del notebook
#         resultados.append(resultado)

#     #3.Se devuelve el resutlkaod del modelo
#     # resultado = {
#     #     "prediction": { "tier": 4, "score": 0.13 },
#     #     "asset": {
#     #         "Vendor":    [r.get("vendor", "—")    for r in payload],
#     #         "Producto":  [r.get("technology", "—") for r in payload],
#     #         "CWE":       ["Null Pointer"],
#     #         "Severidad": ["Critical"]
#     #     },
#     #     "attack": {
#     #         "VectorAtaque":       ["Network"],
#     #         "Complejidad":        ["Low"],
#     #         "Privilegios":        ["None"],
#     #         "InteraccionUsuario": ["None"],
#     #         "Alcance":            ["Unchanged"]
#     #     },
#     #     "impact": {
#     #         "ImpactoConfidencialidad": ["High"],
#     #         "ImpactoIntegridad":       ["High"],
#     #         "ImpactoDisponibilidad":   ["High"]
#     #     }
#     # }

#     #4.Guardar resultado en outputs para mostrarlo
#     out_ruta = os.path.join(OUTPUTS_DIR, f"{file_id}_result.json")
#     with open(out_ruta, "w", encoding="utf-8") as f:
#         json.dump(resultado, f, indent=4, ensure_ascii=False)

#     return jsonify(resultado)


# @app.route("/analizar", methods=["POST"])
# def analizar():
#     resultado = {
#         "prediction": {
#             "tier": 4,
#             "score": 0.53
#         },
#         "asset": {
#             "Vendor": ["Canonical", "Imagemagick"],
#             "Producto": ["Linux Ecosystem", "Media Security Tools"],
#             "CWE": ["Null Pointer"],
#             "Severidad": ["Critical"]
#         },
#         "attack": {
#             "VectorAtaque": ["Network"],
#             "Complejidad": ["Low"],
#             "Privilegios": ["None"],
#             "InteraccionUsuario": ["None"],
#             "Alcance": ["Unchanged"]
#         },
#         "impact": {
#             "ImpactoConfidencialidad": ["High"],
#             "ImpactoIntegridad": ["High"],
#             "ImpactoDisponibilidad": ["High"]
#         }
#     }

#     return jsonify(resultado)




# if __name__ == "__main__":
#     app.run(debug=True)

# en consolo se ejecuta con flask run --debug
