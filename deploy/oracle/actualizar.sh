#!/usr/bin/env bash
# Trae la última versión de GitHub y reinicia la API (en el servidor).
#   bash ~/CyberRiskIntelligencePlatform/deploy/oracle/actualizar.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"
git -C "$DIR" pull --ff-only
(cd "$DIR/ml" && uv sync)
sudo systemctl restart cyberrisk-api
echo "Actualizado. La API tarda unos minutos en cargar los modelos: journalctl -u cyberrisk-api -f"
