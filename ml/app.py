from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import uuid
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Carpetas
INPUTS_DIR = "inputs"
OUTPUTS_DIR = "outputs"
LOGS_DIR = "logs"

os.makedirs(INPUTS_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)


@app.route("/")
def home():
    return "API CyberRisk funcionando"


@app.route("/guardar-json", methods=["POST"])
def guardar_json():
    data = request.json
    # ID único
    file_id = str(uuid.uuid4())
    archivo = f"{file_id}.json"
    ruta = os.path.join(INPUTS_DIR, archivo)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    return jsonify({"success": True, "id": file_id, "archivo": archivo})

@app.route("/clientes", methods=["GET"])
def clientes():
    return {"total": 100}


# if __name__ == "__main__":
#     app.run(debug=True)

# en consolo se ejecuta con flask run --debug
