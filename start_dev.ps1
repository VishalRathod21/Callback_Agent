# Windows developer start script (PowerShell 5.1+). Runs backend (SQLite by default) and frontend.
#   powershell -ExecutionPolicy Bypass -File .\start_dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "== Backend =="
Set-Location "$root\backend"
if (-not (Test-Path "venv")) { python -m venv venv }
& "venv\Scripts\python.exe" -m pip install -r requirements.txt -q
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Write-Host "Created backend/.env from .env.example (edit keys to enable AI/voice)." }
Start-Process -FilePath "venv\Scripts\python.exe" -ArgumentList "-m uvicorn main:app --reload --host 127.0.0.1 --port 8002" -WorkingDirectory "$root\backend"

Write-Host "== Frontend =="
Set-Location "$root\frontend"
if (-not (Test-Path "node_modules")) { npm install --no-audit --no-fund }
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory "$root\frontend"

Write-Host ""
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:8002   (docs at /docs when ENABLE_DOCS=true)"
