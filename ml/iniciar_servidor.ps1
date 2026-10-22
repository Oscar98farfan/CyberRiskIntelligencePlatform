# ═══════════════════════════════════════════════════════════════════
# Arranca la API de CyberRisk y la publica en internet con ngrok.
#   cd ml
#   powershell -ExecutionPolicy Bypass -File .\iniciar_servidor.ps1
#
# Requisitos (una sola vez):
#   1. winget install ngrok.ngrok
#   2. ngrok config add-authtoken <TU_TOKEN>      (dashboard.ngrok.com)
#   3. En ml\.env:  NGROK_DOMAIN=tu-dominio.ngrok-free.app
#
# Para detener todo: Ctrl+C en esta ventana.
# ═══════════════════════════════════════════════════════════════════
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ── Dominio desde ml\.env ──
$linea = Get-Content .env -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*NGROK_DOMAIN\s*=' }
$dominio = if ($linea) { ($linea -split '=', 2)[1].Trim() -replace '^https?://', '' -replace '/$', '' } else { '' }
if (-not $dominio) {
    Write-Host "Falta NGROK_DOMAIN en ml\.env (ej: NGROK_DOMAIN=tu-dominio.ngrok-free.app)" -ForegroundColor Red
    exit 1
}
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Host "ngrok no está instalado. Ejecuta: winget install ngrok.ngrok  (y abre una terminal nueva)" -ForegroundColor Red
    exit 1
}

# ── 1. API (en segundo plano, misma ventana) ──
Write-Host "Iniciando la API y cargando los modelos (puede tardar)..." -ForegroundColor Cyan
$api = Start-Process -FilePath "uv" -ArgumentList "run", "flask", "--app", "app", "run", "--port", "5000" -PassThru -NoNewWindow

try {
    # Esperar a que la API responda (máx. ~10 min: los modelos pesan 8 GB)
    $lista = $false
    for ($i = 0; $i -lt 300; $i++) {
        if ($api.HasExited) { throw "La API se cerró al arrancar. Revisa el error de arriba." }
        try { Invoke-WebRequest "http://127.0.0.1:5000/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $lista = $true; break }
        catch { Start-Sleep -Seconds 2 }
    }
    if (-not $lista) { throw "La API no respondió a tiempo." }

    # ── 2. Túnel ──
    Write-Host ""
    Write-Host "API lista. Publicando en: https://$dominio" -ForegroundColor Green
    Write-Host "Deja esta ventana abierta. Ctrl+C para detener API y túnel." -ForegroundColor Green
    Write-Host ""
    ngrok http 5000 --url "https://$dominio"
}
finally {
    # Cerrar la API (y su proceso de Python) al salir
    if (-not $api.HasExited) { taskkill /PID $api.Id /T /F | Out-Null }
    Write-Host "API detenida."
}
