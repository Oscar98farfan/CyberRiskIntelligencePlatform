#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Instala la API de CyberRisk en un servidor Ubuntu ARM (Oracle Always Free)
#
# Uso (en el servidor, por SSH):
#   git clone https://github.com/Oscar98farfan/CyberRiskIntelligencePlatform.git
#   bash CyberRiskIntelligencePlatform/deploy/oracle/instalar.sh
#
# Se puede ejecutar varias veces: solo hace lo que falte.
# NO instala los modelos ni el .env: esos se suben desde tu PC con
# deploy/oracle/subir_archivos.ps1 (no están en GitHub).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
USUARIO="$(whoami)"
echo "Proyecto: $DIR   Usuario: $USUARIO"

echo "== 1/6 Paquetes del sistema"
sudo apt-get update -y -q
sudo apt-get install -y -q git curl ca-certificates

echo "== 2/6 Memoria de intercambio (4 GB): ayuda a cargar los modelos de 8 GB con 12 GB de RAM"
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== 3/6 uv (gestor de Python del proyecto)"
if ! command -v uv >/dev/null && [ ! -x "$HOME/.local/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"

echo "== 4/6 Dependencias de Python (puede tardar varios minutos la primera vez)"
cd "$DIR/ml"
uv sync
uv run --with gunicorn python -c "import gunicorn, sklearn; print('gunicorn', gunicorn.__version__, '· scikit-learn', sklearn.__version__)"

echo "== 5/6 ngrok (agente para ARM64)"
if ! command -v ngrok >/dev/null; then
  cd /tmp
  curl -sSLO https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz
  sudo tar xzf ngrok-v3-stable-linux-arm64.tgz -C /usr/local/bin
  rm -f ngrok-v3-stable-linux-arm64.tgz
fi
ngrok version

echo "== 6/6 Servicios (arrancan solos al encender el servidor)"
for s in cyberrisk-api cyberrisk-tunel; do
  sed -e "s|__USUARIO__|$USUARIO|g" -e "s|__DIR__|$DIR|g" -e "s|__HOME__|$HOME|g" \
    "$DIR/deploy/oracle/$s.service" | sudo tee "/etc/systemd/system/$s.service" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable cyberrisk-api cyberrisk-tunel >/dev/null

echo
echo "Instalación lista. Pendiente (si aún no lo hiciste):"
[ -f "$DIR/ml/.env" ]                                    || echo "  · Subir ml/.env desde tu PC (subir_archivos.ps1)"
[ -f "$DIR/ml/models/random_forest_tier_model.pkl" ]     || echo "  · Subir ml/models desde tu PC (subir_archivos.ps1)"
[ -f "$HOME/.config/ngrok/ngrok.yml" ]                   || echo "  · Guardar el token de ngrok: ngrok config add-authtoken TU_TOKEN"
echo "Luego:  sudo systemctl start cyberrisk-api cyberrisk-tunel"
echo "Ver registro:  journalctl -u cyberrisk-api -f"
