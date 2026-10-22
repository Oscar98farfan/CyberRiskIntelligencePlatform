# ═══════════════════════════════════════════════════════════════
# Genera dist\CyberRisk-Agente.exe  (ejecutar en Windows, PowerShell)
#   cd agente
#   .\build.ps1
# ═══════════════════════════════════════════════════════════════
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

uv sync --group dev
uv run pyinstaller `
    --onefile `
    --windowed `
    --name "CyberRisk-Agente" `
    --clean `
    --noconfirm `
    cyberrisk_agente.py

Write-Host ""
Write-Host "Listo: $PSScriptRoot\dist\CyberRisk-Agente.exe" -ForegroundColor Cyan
