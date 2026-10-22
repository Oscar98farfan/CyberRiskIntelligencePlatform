# ═══════════════════════════════════════════════════════════════════
# Sube al servidor de Oracle lo que NO está en GitHub:
#   ml\.env        (llaves de Supabase y dominio de ngrok)
#   ml\uv.lock     (mismas versiones de librerías que en tu PC)
#   ml\models\     (modelos entrenados, ~8 GB: puede tardar bastante)
#
# Uso (en tu PC, desde la carpeta Wiki):
#   powershell -ExecutionPolicy Bypass -File .\deploy\oracle\subir_archivos.ps1 -IP 123.45.67.89
# Opcional: -Llave C:\ruta\a\tu\llave   (por defecto ~\.ssh\oracle_cyberrisk)
#           -SoloConfig                  (sube .env y uv.lock, sin los modelos)
# ═══════════════════════════════════════════════════════════════════
param(
    [Parameter(Mandatory = $true)][string]$IP,
    [string]$Llave = "$HOME\.ssh\oracle_cyberrisk",
    [switch]$SoloConfig
)
$ErrorActionPreference = "Stop"
$ml = Join-Path $PSScriptRoot "..\..\ml" | Resolve-Path
$destino = "ubuntu@${IP}:CyberRiskIntelligencePlatform/ml/"
$opciones = @("-i", $Llave, "-o", "StrictHostKeyChecking=accept-new")

if (-not (Test-Path $Llave)) { throw "No encuentro la llave SSH en $Llave" }
if (-not (Test-Path "$ml\.env")) { throw "No encuentro $ml\.env" }

Write-Host "1/3 Subiendo .env y uv.lock..." -ForegroundColor Cyan
scp @opciones "$ml\.env" $destino
if (Test-Path "$ml\uv.lock") { scp @opciones "$ml\uv.lock" $destino }

if ($SoloConfig) { Write-Host "Listo (sin modelos)." -ForegroundColor Green; exit 0 }

Write-Host "2/3 Subiendo modelos (~8 GB). No cierres esta ventana..." -ForegroundColor Cyan
ssh @opciones "ubuntu@$IP" "mkdir -p CyberRiskIntelligencePlatform/ml/models"
scp @opciones "$ml\models\*.pkl" "ubuntu@${IP}:CyberRiskIntelligencePlatform/ml/models/"

Write-Host "3/3 Verificando tamaños en el servidor..." -ForegroundColor Cyan
ssh @opciones "ubuntu@$IP" "ls -lh CyberRiskIntelligencePlatform/ml/models"
Write-Host "Listo. Ahora en el servidor: sudo systemctl start cyberrisk-api cyberrisk-tunel" -ForegroundColor Green
