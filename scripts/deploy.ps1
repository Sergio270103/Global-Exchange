#requires -Version 5.1
<#
.SYNOPSIS
  Script de despliegue automático - Global Exchange (PI-88).

.DESCRIPTION
  Modos disponibles:
    dev    Levanta TODO el proyecto en localhost:
           PostgreSQL + Keycloak (Docker), migraciones, backend y frontend.
    prod   Construye y levanta los contenedores de producción (Docker Compose).
    check  Verifica herramientas, archivos y configuración necesarios.
    stop   Detiene los procesos y contenedores levantados por este script.

.EXAMPLE
  .\scripts\deploy.ps1 dev

.EXAMPLE
  .\scripts\deploy.ps1 check

.EXAMPLE
  .\scripts\deploy.ps1 stop

.EXAMPLE
  .\scripts\deploy.ps1 prod -DryRun
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('dev', 'prod', 'check', 'stop')]
  [string]$Mode = 'dev',

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$ScriptDir   = $PSScriptRoot
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$BackendDir  = Join-Path $ProjectRoot 'backend'
$FrontendDir = Join-Path $ProjectRoot 'frontend'
$RunDir      = Join-Path $ProjectRoot '.run'

# Usar el Python del venv si existe (recomendado); si no, el del sistema.
$VenvPython = Join-Path $BackendDir 'venv\Scripts\python.exe'
if (Test-Path -LiteralPath $VenvPython) { $PythonExe = $VenvPython } else { $PythonExe = 'python' }

$script:ComposeExe    = 'docker'
$script:ComposePrefix = @('compose')

# ---------------------------------------------------------------------------
# Utilidades de salida
# ---------------------------------------------------------------------------
function Write-Step { param([string]$Message) Write-Host "`n=== $Message ===" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "  OK: $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "  AVISO: $Message" -ForegroundColor Yellow }
function Write-Err  { param([string]$Message) Write-Host "  ERROR: $Message" -ForegroundColor Red }

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# Ejecuta un comando externo y falla si devuelve código distinto de 0.
function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = $ProjectRoot
  )
  Write-Host "[RUN] $FilePath $($Arguments -join ' ')" -ForegroundColor DarkGray
  if ($DryRun) { Write-Host "[DRY-RUN] no se ejecuta" -ForegroundColor DarkYellow; return }
  Push-Location -LiteralPath $WorkingDirectory
  try {
    $global:LASTEXITCODE = 0
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "El comando fallo con codigo de salida $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-Compose {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$WorkingDirectory = $ProjectRoot,
    [switch]$DisableEnvFile
  )
  $all = @($script:ComposePrefix) + $Arguments
  $previous = $env:COMPOSE_DISABLE_ENV_FILE
  if ($DisableEnvFile) { $env:COMPOSE_DISABLE_ENV_FILE = '1' }
  try {
    Invoke-Checked -FilePath $script:ComposeExe -Arguments $all -WorkingDirectory $WorkingDirectory
  } finally {
    if ($DisableEnvFile) {
      if ($null -eq $previous) {
        Remove-Item Env:COMPOSE_DISABLE_ENV_FILE -ErrorAction SilentlyContinue
      } else {
        $env:COMPOSE_DISABLE_ENV_FILE = $previous
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Verificaciones
# ---------------------------------------------------------------------------
function Resolve-ComposeCommand {
  if (Test-CommandExists 'docker') {
    & docker compose version *> $null
    if ($LASTEXITCODE -eq 0) {
      $script:ComposeExe = 'docker'
      $script:ComposePrefix = @('compose')
      return
    }
  }
  if (Test-CommandExists 'docker-compose') {
    $script:ComposeExe = 'docker-compose'
    $script:ComposePrefix = @()
    return
  }
  throw 'Docker Compose no esta disponible. Instala Docker Desktop o el plugin docker compose.'
}

function Assert-Tools {
  Write-Step 'Verificando herramientas necesarias'
  $missing = $false

  if (-not (Test-CommandExists 'docker')) {
    Write-Err 'docker no esta instalado o no esta en el PATH.'
    $missing = $true
  } else {
    Write-Ok ((& docker --version) -join ' ')
  }

  if (-not (Test-CommandExists 'node')) {
    Write-Err 'node no esta instalado o no esta en el PATH.'
    $missing = $true
  } else {
    Write-Ok "node $((& node --version) -join ' ')"
  }

  if (-not (Test-CommandExists 'npm')) {
    Write-Err 'npm no esta instalado o no esta en el PATH.'
    $missing = $true
  } else {
    Write-Ok "npm $((& npm --version) -join ' ')"
  }

  if (Test-Path -LiteralPath $VenvPython) {
    Write-Ok "Python (venv): $VenvPython"
  } elseif (Test-CommandExists 'python') {
    Write-Ok ((& python --version) -join ' ')
  } else {
    Write-Err 'python no esta instalado. Crea el venv en backend/venv o instala Python.'
    $missing = $true
  }

  if ($missing) { throw 'Faltan herramientas. Instalalas y volve a ejecutar el script.' }

  Resolve-ComposeCommand
  Write-Ok "Docker Compose: $($script:ComposeExe) $($script:ComposePrefix -join ' ')".Trim()
}

function Get-NpmExe {
  $cmd = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cmd = Get-Command 'npm' -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'npm no esta disponible.'
}

function Test-PortInUse {
  param([int]$Port)
  try {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

function Ensure-EnvFile {
  param(
    [Parameter(Mandatory = $true)][string]$Target,
    [Parameter(Mandatory = $true)][string]$Example
  )
  if (Test-Path -LiteralPath $Target) {
    Write-Ok "Existe $Target"
    return
  }
  if (-not (Test-Path -LiteralPath $Example)) {
    throw "No existe la plantilla $Example"
  }
  if ($DryRun) {
    Write-Host "[DRY-RUN] copiar $Example -> $Target" -ForegroundColor DarkYellow
    return
  }
  Copy-Item -LiteralPath $Example -Destination $Target
  Write-Warn "Creado $Target desde $Example. Revisa los valores si hace falta."
}

function Wait-ForPostgres {
  param(
    [string]$ContainerName = 'global-exchange-db',
    [int]$TimeoutSeconds = 90
  )
  if ($DryRun) { return }
  Write-Host "  Esperando a que PostgreSQL este healthy..." -ForegroundColor Cyan
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $status = (& docker inspect --format '{{.State.Health.Status}}' $ContainerName 2>$null)
    if ($status -eq 'healthy') {
      Write-Ok 'PostgreSQL esta listo.'
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "PostgreSQL no quedo healthy en $TimeoutSeconds s. Revisa: docker logs $ContainerName"
}

function Show-LogTail {
  param([string]$Path, [int]$Lines = 20)
  if (Test-Path -LiteralPath $Path) {
    Write-Host "  --- ultimas lineas de $Path ---" -ForegroundColor DarkGray
    Get-Content -LiteralPath $Path -Tail $Lines | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  }
}

function Wait-Http {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Name,
    [int]$TimeoutSeconds = 60,
    [string]$LogPath = ''
  )
  if ($DryRun) { return }
  Write-Host "  Esperando $Name en $Url ..." -ForegroundColor Cyan
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Ok "$Name responde (HTTP $($response.StatusCode))."
        return
      }
    } catch {
      # Seguimos esperando.
    }
    Start-Sleep -Seconds 2
  }
  Write-Warn "$Name no respondio en $TimeoutSeconds s."
  if ($LogPath) { Show-LogTail -Path $LogPath }
}

# ---------------------------------------------------------------------------
# Dependencias
# ---------------------------------------------------------------------------
function Ensure-BackendDeps {
  Write-Step 'Verificando dependencias del backend'
  if ($DryRun) { Write-Host '[DRY-RUN] se omite la verificacion de Django' -ForegroundColor DarkYellow; return }

  & $PythonExe -c "import django, rest_framework, whitenoise" *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Ok 'Dependencias de Python ya instaladas (Django, DRF, Whitenoise).'
    return
  }

  Write-Warn 'Faltan dependencias de Python. Instalando requirements.txt...'
  Invoke-Checked -FilePath $PythonExe -Arguments @('-m', 'pip', 'install', '-r', 'requirements.txt') -WorkingDirectory $BackendDir
}

function Ensure-FrontendDeps {
  Write-Step 'Verificando dependencias del frontend'
  $nodeModules = Join-Path $FrontendDir 'node_modules'
  if (Test-Path -LiteralPath $nodeModules) {
    Write-Ok 'node_modules ya existe.'
    return
  }
  if ($DryRun) {
    Write-Host '[DRY-RUN] se instalarian las dependencias de npm' -ForegroundColor DarkYellow
    return
  }
  $npmExe = Get-NpmExe
  if (Test-Path -LiteralPath (Join-Path $FrontendDir 'package-lock.json')) {
    Invoke-Checked -FilePath $npmExe -Arguments @('ci') -WorkingDirectory $FrontendDir
  } else {
    Invoke-Checked -FilePath $npmExe -Arguments @('install') -WorkingDirectory $FrontendDir
  }
}

# ---------------------------------------------------------------------------
# Procesos en segundo plano
# ---------------------------------------------------------------------------
function Start-Background {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$Name
  )
  if ($DryRun) {
    Write-Host "[DRY-RUN] $FilePath $($Arguments -join ' ') (en $WorkingDirectory)" -ForegroundColor DarkYellow
    return $null
  }

  New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
  $outLog = Join-Path $RunDir "$Name.out.log"
  $errLog = Join-Path $RunDir "$Name.err.log"

  $process = Start-Process -FilePath $FilePath `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath (Join-Path $RunDir "$Name.pid") -Value $process.Id -Encoding ascii
  Write-Ok "$Name iniciado (PID $($process.Id)). Log: $outLog"
  return $process
}

function Stop-Background {
  foreach ($name in @('backend', 'frontend')) {
    $pidFile = Join-Path $RunDir "$name.pid"
    if (-not (Test-Path -LiteralPath $pidFile)) { continue }
    $procId = 0
    [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$procId) | Out-Null
    if ($procId -gt 0) {
      $process = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($process) {
        # En Windows hay que matar el arbol completo: npm.cmd lanza node como hijo.
        if ($env:OS -eq 'Windows_NT') {
          & taskkill /PID $procId /T /F *> $null
        } else {
          Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
        Write-Ok "Detenido $name (PID $procId)."
      }
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  }
}

# ---------------------------------------------------------------------------
# Modos
# ---------------------------------------------------------------------------
function Invoke-Dev {
  Write-Step 'Modo DESARROLLO (localhost)'

  Assert-Tools
  Ensure-EnvFile -Target (Join-Path $BackendDir '.env') -Example (Join-Path $BackendDir '.env.example')
  Ensure-EnvFile -Target (Join-Path $FrontendDir '.env') -Example (Join-Path $FrontendDir '.env.example')

  Write-Step '1/5 Levantando PostgreSQL y Keycloak en Docker'
  Invoke-Compose -Arguments @('-f', (Join-Path $BackendDir 'docker-compose.yml'), 'up', '-d') -WorkingDirectory $BackendDir -DisableEnvFile
  Invoke-Compose -Arguments @('-f', (Join-Path $FrontendDir 'docker-compose.yml'), 'up', '-d') -WorkingDirectory $FrontendDir -DisableEnvFile
  Wait-ForPostgres

  Ensure-BackendDeps

  Write-Step '2/5 Aplicando migraciones de Django'
  Invoke-Checked -FilePath $PythonExe -Arguments @('manage.py', 'migrate', '--noinput') -WorkingDirectory $BackendDir

  Ensure-FrontendDeps

  Write-Step '3/5 Iniciando backend (puerto 8000)'
  $backendLog = Join-Path $RunDir 'backend.err.log'
  if (Test-PortInUse 8000) {
    Write-Warn 'El puerto 8000 ya esta en uso; se omite el arranque del backend.'
  } else {
    Start-Background -FilePath $PythonExe `
      -Arguments @('manage.py', 'runserver', '0.0.0.0:8000') `
      -WorkingDirectory $BackendDir `
      -Name 'backend' | Out-Null
  }

  Write-Step '4/5 Iniciando frontend (puerto 5173)'
  $frontendLog = Join-Path $RunDir 'frontend.err.log'
  if (Test-PortInUse 5173) {
    Write-Warn 'El puerto 5173 ya esta en uso; se omite el arranque del frontend.'
  } else {
    Start-Background -FilePath (Get-NpmExe) `
      -Arguments @('run', 'dev') `
      -WorkingDirectory $FrontendDir `
      -Name 'frontend' | Out-Null
  }

  Write-Step '5/5 Verificando que los servicios respondan'
  Wait-Http -Url 'http://127.0.0.1:8000/api/health/' -Name 'backend' -LogPath $backendLog
  Wait-Http -Url 'http://127.0.0.1:5173/' -Name 'frontend' -LogPath $frontendLog

  Write-Host ''
  Write-Host 'Proyecto levantado:' -ForegroundColor Green
  Write-Host '  Frontend:  http://localhost:5173' -ForegroundColor Green
  Write-Host '  Backend:   http://localhost:8000' -ForegroundColor Green
  Write-Host '  Keycloak:  http://localhost:8080' -ForegroundColor Green
  Write-Host '  Postgres:  localhost:5433' -ForegroundColor Green
  Write-Host ''
  Write-Host "Logs en: $RunDir" -ForegroundColor DarkGray
  Write-Host 'Para detener todo: .\scripts\deploy.ps1 stop' -ForegroundColor DarkGray
}

function Invoke-Prod {
  Write-Step 'Modo PRODUCCION (Docker Compose)'

  Assert-Tools
  Ensure-EnvFile -Target (Join-Path $BackendDir '.env') -Example (Join-Path $BackendDir '.env.prod.example')
  Ensure-EnvFile -Target (Join-Path $FrontendDir '.env') -Example (Join-Path $FrontendDir '.env.prod.example')

  $frontendEnvPath = Join-Path $FrontendDir '.env'
  if (Test-Path -LiteralPath $frontendEnvPath) {
    $frontendEnvContent = Get-Content -LiteralPath $frontendEnvPath -Raw
    if ($frontendEnvContent -match 'VITE_API_URL\s*=\s*http://(127\.0\.0\.1|localhost)') {
      Write-Warn 'frontend/.env apunta a localhost. Para produccion usa VITE_API_URL=/api (ver frontend/.env.prod.example).'
    }
  }

  $composeFile = Join-Path $BackendDir 'docker-compose.prod.yml'

  Write-Step '1/3 Construyendo e iniciando contenedores de produccion'
  Invoke-Compose -Arguments @('-f', $composeFile, 'up', '-d', '--build') -WorkingDirectory $BackendDir

  Write-Step '2/3 Aplicando migraciones de Django'
  Invoke-Compose -Arguments @('-f', $composeFile, 'exec', '-T', 'web', 'python', 'manage.py', 'migrate', '--noinput') -WorkingDirectory $BackendDir

  Write-Step '3/3 Verificando health check del backend'
  Wait-Http -Url 'http://127.0.0.1:8000/api/health/' -Name 'backend'

  Write-Host ''
  Write-Host 'Contenedores de produccion levantados:' -ForegroundColor Green
  Write-Host '  Frontend (nginx): http://localhost:8081' -ForegroundColor Green
  Write-Host '  Backend:          http://localhost:8000' -ForegroundColor Green
  Write-Host '  Postgres:         localhost:5433' -ForegroundColor Green
  Write-Host ''
  Write-Host 'Para detener todo: .\scripts\deploy.ps1 stop' -ForegroundColor DarkGray
}

function Invoke-Check {
  Write-Step 'Modo CHECK'
  Assert-Tools

  Write-Step 'Verificando archivos de configuracion'
  $files = @(
    (Join-Path $BackendDir 'docker-compose.yml'),
    (Join-Path $BackendDir 'docker-compose.prod.yml'),
    (Join-Path $BackendDir 'Dockerfile'),
    (Join-Path $FrontendDir 'docker-compose.yml'),
    (Join-Path $FrontendDir 'Dockerfile'),
    (Join-Path $FrontendDir 'nginx.conf')
  )
  $missing = $false
  foreach ($file in $files) {
    if (Test-Path -LiteralPath $file) { Write-Ok "Existe $file" }
    else { Write-Err "Falta $file"; $missing = $true }
  }
  if ($missing) { throw 'Faltan archivos necesarios para el despliegue.' }

  Write-Step 'Verificando archivos .env'
  foreach ($env in @((Join-Path $BackendDir '.env'), (Join-Path $FrontendDir '.env'))) {
    if (Test-Path -LiteralPath $env) { Write-Ok "Existe $env" }
    else { Write-Warn "No existe $env (se creara automaticamente en dev/prod)." }
  }

  Write-Host ''
  Write-Host 'Check completado con exito.' -ForegroundColor Green
}

function Invoke-Stop {
  Write-Step 'Deteniendo procesos y contenedores'
  Stop-Background
  Invoke-Compose -Arguments @('-f', (Join-Path $BackendDir 'docker-compose.yml'), 'down') -WorkingDirectory $BackendDir -DisableEnvFile
  Invoke-Compose -Arguments @('-f', (Join-Path $FrontendDir 'docker-compose.yml'), 'down') -WorkingDirectory $FrontendDir -DisableEnvFile
  $prodContainers = & docker ps -a `
    --filter 'name=global-exchange-backend-prod' `
    --filter 'name=global-exchange-frontend-prod' `
    --filter 'name=global-exchange-db-prod' `
    -q 2>$null
  if ($prodContainers) {
    Invoke-Compose -Arguments @('-f', (Join-Path $BackendDir 'docker-compose.prod.yml'), 'down') -WorkingDirectory $BackendDir
  }
  Write-Host ''
  Write-Host 'Todo detenido.' -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------
try {
  switch ($Mode) {
    'dev'   { Invoke-Dev }
    'prod'  { Invoke-Prod }
    'check' { Invoke-Check }
    'stop'  { Invoke-Stop }
  }
} catch {
  Write-Host ''
  Write-Err $_.Exception.Message
  exit 1
}
