#requires -Version 5.1
###############################################################################
# Script de despliegue automático - Global Exchange (PI-88)
# Versión para PowerShell (Windows)
#
# Modos:
#   dev     - Levanta todo en localhost (Postgres + Keycloak + backend + frontend)
#   prod    - Prepara y despliega en un servidor (Docker Compose de producción)
#   check   - Valida que las herramientas necesarias estén instaladas
#
# Uso:
#   .\scripts\deploy.ps1 dev
#   .\scripts\deploy.ps1 prod
#   .\scripts\deploy.ps1 check
###############################################################################
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Resolve-Path (Join-Path $scriptDir '..')
$backendDir = Join-Path $projectRoot 'backend'
$frontendDir = Join-Path $projectRoot 'frontend'

param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('dev','prod','check')]
  [string]$Mode
)

function Run-Cmd {
  param([scriptblock]$ScriptBlock)
  Write-Host "[RUN] $($ScriptBlock.ToString())" -ForegroundColor Cyan
  & $ScriptBlock
  if ($LASTEXITCODE -ne 0) {
    Write-Error "El comando falló con código de salida $LASTEXITCODE"
    exit $LASTEXITCODE
  }
}

function Check-Tools {
  Write-Host "=== Verificando herramientas necesarias ===" -ForegroundColor Cyan
  $tools = @('docker','docker-compose','python','node','npm')
  $missing = $false
  foreach ($tool in $tools) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) {
      Write-Host "  OK: $tool" -ForegroundColor Green
    } else {
      Write-Host "  FALTA: $tool" -ForegroundColor Red
      $missing = $true
    }
  }
  if ($missing) {
    Write-Host "Instala las herramientas faltantes antes de continuar." -ForegroundColor Red
    exit 1
  }
  Write-Host "Todas las herramientas están disponibles." -ForegroundColor Green
}

function Test-EnvFile {
  param([string]$Path)
  if (Test-Path $Path) {
    Write-Host "  YA EXISTE: $Path (no se sobrescribe)" -ForegroundColor Yellow
    return $true
  }
  return $false
}

switch ($Mode) {
  'dev' {
    Write-Host "=== Modo: DESARROLLO (localhost) ===" -ForegroundColor Cyan
    Check-Tools

    Write-Host "1. Levantando servicios de infraestructura (Postgres + Keycloak)..." -ForegroundColor Cyan
    Run-Cmd { docker compose -f "$backendDir/docker-compose.yml" up -d }
    Run-Cmd { docker compose -f "$frontendDir/docker-compose.yml" up -d }

    Write-Host "2. Aplicando migraciones de Django..." -ForegroundColor Cyan
    Run-Cmd { & python manage.py migrate } -WorkingDirectory $backendDir

    Write-Host "3. Levantando el backend en segundo plano (puerto 8000)..." -ForegroundColor Cyan
    Start-Process python -ArgumentList 'manage.py','runserver','0.0.0.0:8000' -WorkingDirectory $backendDir

    Write-Host "4. Levantando el frontend en segundo plano (puerto 5173)..." -ForegroundColor Cyan
    Start-Process npm -ArgumentList 'run','dev' -WorkingDirectory $frontendDir

    Write-Host "Listo. Backend en http://localhost:8000, Frontend en http://localhost:5173, Keycloak en http://localhost:8080." -ForegroundColor Green
  }
  'prod' {
    Write-Host "=== Modo: PRODUCCIÓN (servidor con Docker) ===" -ForegroundColor Cyan
    Check-Tools

    Write-Host "1. Verificando archivos de entorno de producción..." -ForegroundColor Cyan
    $backendEnv = Join-Path $backendDir '.env'
    $frontendEnv = Join-Path $frontendDir '.env'
    if (-not (Test-EnvFile $backendEnv)) {
      Write-Host "   Copiando backend/.env.prod.example a backend/.env..." -ForegroundColor Cyan
      Copy-Item (Join-Path $backendDir '.env.prod.example') $backendEnv
      Write-Host "   IMPORTANTE: edita backend/.env con tus valores reales antes de continuar." -ForegroundColor Yellow
    }
    if (-not (Test-EnvFile $frontendEnv)) {
      Write-Host "   Copiando frontend/.env.example a frontend/.env..." -ForegroundColor Cyan
      Copy-Item (Join-Path $frontendDir '.env.example') $frontendEnv
      Write-Host "   IMPORTANTE: edita frontend/.env con VITE_API_URL y VITE_KEYCLOAK_URL de producción." -ForegroundColor Yellow
    }

    Write-Host "2. Construyendo e iniciando contenedores de producción..." -ForegroundColor Cyan
    Run-Cmd { docker compose -f docker-compose.prod.yml up -d --build } -WorkingDirectory $backendDir
    Run-Cmd { docker compose -f docker-compose.yml up -d } -WorkingDirectory $frontendDir

    Write-Host "3. Aplicando migraciones de Django en el contenedor de backend..." -ForegroundColor Cyan
    Run-Cmd { docker compose -f docker-compose.prod.yml exec -T web python manage.py migrate } -WorkingDirectory $backendDir

    Write-Host "4. Verificando health check del backend..." -ForegroundColor Cyan
    curl -sf http://localhost:8000/api/health/ || Write-Host "Health check falló o curl no está disponible." -ForegroundColor Yellow

    Write-Host "Listo. Configura tu proxy reverso (nginx/Caddy) para exponer los puertos correspondientes." -ForegroundColor Green
  }
  'check' {
    Check-Tools
    Write-Host "=== Check completado con éxito ===" -ForegroundColor Green
  }
}