param([switch]$Stop,[switch]$Restart,[switch]$Status)
$ROOT  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BACK  = Join-Path $ROOT "RagBackend"
$FRONT = Join-Path $ROOT "RagFrontend"

function Test-Port { param([int]$p); $r = netstat -ano 2>$null | Select-String (":$p\s") | Select-String "LISTENING"; return ($null -ne $r -and $r.Count -gt 0) }
function Get-PidOnPort { param([int]$p); $line = netstat -ano 2>$null | Select-String (":$p\s") | Select-String "LISTENING" | Select-Object -First 1; if ($line) { return (($line.Line -split "\s+") | Where-Object { $_ -ne "" } | Select-Object -Last 1) }; return $null }
function Get-FrontPort { if (Test-Port 5173) { return 5173 } elseif (Test-Port 5174) { return 5174 } else { return 0 } }

function Test-DockerMySQL {
    $result = docker exec ragf-mysql bash -c "MYSQL_PWD=Www028820 mysql -uroot -e 'SELECT 1;'" 2>&1
    return ($result -match "1")
}

if ($Status) {
  Write-Host "--- Status ---" -ForegroundColor Magenta
  if (Test-DockerMySQL) { Write-Host "  [OK] MySQL (Docker ragf-mysql)" -ForegroundColor Green } else { Write-Host "  [X]  MySQL (Docker ragf-mysql not responding)" -ForegroundColor Red }
  if (Test-Port 8000) { Write-Host "  [OK] Backend  http://localhost:8000/docs" -ForegroundColor Green } else { Write-Host "  [X]  Backend" -ForegroundColor Red }
  $fp = Get-FrontPort; if ($fp -gt 0) { Write-Host "  [OK] Frontend http://localhost:$fp" -ForegroundColor Green } else { Write-Host "  [X]  Frontend" -ForegroundColor Red }
  if (Test-Port 11434) { Write-Host "  [OK] Ollama" -ForegroundColor Green } else { Write-Host "  [--] Ollama not running (optional)" -ForegroundColor Yellow }
  exit 0
}

if ($Stop) {
  $p5 = Get-PidOnPort 5173; if ($p5) { taskkill /PID $p5 /F | Out-Null; Write-Host "Stopped frontend(5173)" -ForegroundColor Green }
  $p5b = Get-PidOnPort 5174; if ($p5b) { taskkill /PID $p5b /F | Out-Null; Write-Host "Stopped frontend(5174)" -ForegroundColor Green }
  $p8 = Get-PidOnPort 8000; if ($p8) { taskkill /PID $p8 /F | Out-Null; Write-Host "Stopped backend" -ForegroundColor Green }
  Write-Host "Note: Docker MySQL (ragf-mysql) is managed by Docker, use 'docker compose stop' to stop it." -ForegroundColor Yellow
  exit 0
}

if ($Restart) { & $MyInvocation.MyCommand.Definition -Stop; Start-Sleep 2 }

Write-Host "=== KnowledgeRAG Quick Start ===" -ForegroundColor Cyan

Write-Host "[1/3] MySQL (Docker)"
$dockerRunning = (docker ps --format "{{.Names}}" 2>&1) -match "ragf-mysql"
if (-not $dockerRunning) {
  Write-Host "  [!] ragf-mysql not running, starting Docker services..." -ForegroundColor Yellow
  Push-Location $ROOT
  docker compose up -d db 2>&1 | Out-Null
  Pop-Location
  $w = 0
  while (-not (Test-DockerMySQL) -and $w -lt 20) { Start-Sleep 1; $w++ }
}
if (Test-DockerMySQL) {
  Write-Host "  [OK] ragf-mysql running on 127.0.0.1:3306" -ForegroundColor Green
} else {
  Write-Host "  [X] Docker MySQL not responding. Please run: docker compose up -d" -ForegroundColor Red
  Write-Host "      Then retry this script." -ForegroundColor Red
  exit 1
}

Write-Host "[2/3] Backend (8000)"
if (Test-Port 8000) { Write-Host "  [skip] already running" -ForegroundColor Cyan }
else {
  $py = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } elseif (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { $null }
  if (-not $py) { Write-Host "  [X] python not found" -ForegroundColor Red; exit 1 }
  Start-Process -FilePath $py -ArgumentList "-m","uvicorn","main:app","--host","0.0.0.0","--port","8000","--reload" -WorkingDirectory $BACK -WindowStyle Minimized
  $w=0; while (-not (Test-Port 8000) -and $w -lt 15) { Start-Sleep 1; $w++ }
  if (Test-Port 8000) { Write-Host "  [OK] http://localhost:8000/docs" -ForegroundColor Green } else { Write-Host "  [X] timeout" -ForegroundColor Red }
}

Write-Host "[3/3] Frontend (Vite)"
$efp = Get-FrontPort
if ($efp -gt 0) { Write-Host "  [skip] already on port $efp" -ForegroundColor Cyan }
else {
  $narg = "/k cd /d `"$FRONT`" && npm run dev"
  Start-Process cmd.exe -ArgumentList $narg -WindowStyle Normal
  $w=0; Write-Host "  waiting" -NoNewline
  while ((Get-FrontPort) -eq 0 -and $w -lt 35) { Start-Sleep 1; $w++; Write-Host "." -NoNewline }
  Write-Host ""
  $rfp = Get-FrontPort
  if ($rfp -gt 0) { Write-Host "  [OK] http://localhost:$rfp" -ForegroundColor Green } else { Write-Host "  [check Vite window - it may take longer]" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "=== All ready! ===" -ForegroundColor Green
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor Green
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor Green
$ffp = Get-FrontPort; if ($ffp -gt 0) { Write-Host "  Frontend: http://localhost:$ffp" -ForegroundColor Green; Start-Process "http://localhost:$ffp" } else { Write-Host "  Frontend: check Vite window (5173 or 5174)" -ForegroundColor Yellow }
Write-Host ""
Write-Host "  [DB] Both local dev and Docker use the same MySQL: ragf-mysql (127.0.0.1:3306)" -ForegroundColor Cyan
