#requires -Version 5.1
<#
.SYNOPSIS
  Script de despliegue automático - Global Exchange (PI-88 / PI-92).

.DESCRIPTION
  Modos disponibles:
    dev    Levanta TODO el proyecto en localhost:
           PostgreSQL + Keycloak (Docker), migraciones, backend y frontend.
    prod   Ambiente de producción completo, fuera de localhost: base de datos,
           backend, Keycloak y frontend en Docker, publicados en internet con
           ngrok (configuración en .env.prod).
    check  Verifica herramientas, archivos y configuración necesarios.
    status Muestra el estado de los contenedores de producción.
    logs   Muestra los logs de producción (opcional: nombre del servicio).
    stop   Detiene los procesos y contenedores levantados por este script.

.EXAMPLE
  .\scripts\deploy.ps1 dev

.EXAMPLE
  .\scripts\deploy.ps1 prod

.EXAMPLE
  .\scripts\deploy.ps1 logs keycloak

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
  [ValidateSet('dev', 'prod', 'check', 'status', 'logs', 'stop')]
  [string]$Mode = 'dev',

  # Solo para "logs": db, web, keycloak, gateway o ngrok.
  [Parameter(Position = 1)]
  [string]$Service = '',

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$ScriptDir   = $PSScriptRoot
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$BackendDir  = Join-Path $ProjectRoot 'backend'
$FrontendDir = Join-Path $ProjectRoot 'frontend'
$RunDir      = Join-Path $ProjectRoot '.run'

# Ambiente de produccion (PI-92): un solo compose en la raiz + .env.prod.
$ProdComposeFile = Join-Path $ProjectRoot 'docker-compose.prod.yml'
$ProdEnvFile     = Join-Path $ProjectRoot '.env.prod'
$ProdEnvExample  = Join-Path $ProjectRoot '.env.prod.example'
$ProdProject     = 'global-exchange-prod'
$script:ProdDomain = ''
$script:ProdPort   = '8081'
$script:ProdRealm  = 'Global-Exchange'
$script:ProdTunnel = $true
$script:ProdFsModo = 'simulado'

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
# Produccion (PI-92)
# ---------------------------------------------------------------------------

# Ejecuta un comando externo en silencio y devuelve su salida. Nunca lanza:
# en Windows PowerShell 5.1 redirigir stderr con ErrorActionPreference=Stop
# convierte cualquier aviso del programa en un error.
function Invoke-Quiet {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @()
  )
  $ErrorActionPreference = 'Continue'
  try {
    return (& $FilePath @Arguments 2>$null)
  } catch {
    return $null
  }
}

# En produccion todo corre en contenedores: solo hace falta Docker.
function Assert-Docker {
  Write-Step 'Verificando Docker'
  if (-not (Test-CommandExists 'docker')) {
    throw 'docker no esta instalado o no esta en el PATH.'
  }
  Write-Ok ((& docker --version) -join ' ')
  Resolve-ComposeCommand
  Write-Ok "Docker Compose: $($script:ComposeExe) $($script:ComposePrefix -join ' ')".Trim()
  if (-not $DryRun) {
    Invoke-Quiet -FilePath 'docker' -Arguments @('info', '--format', '{{.ServerVersion}}') | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'Docker no esta corriendo. Abri Docker Desktop y volve a ejecutar el script.'
    }
  }
}

function Invoke-ComposeProd {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  Invoke-Compose -Arguments (@('--env-file', $ProdEnvFile, '-f', $ProdComposeFile) + $Arguments)
}

# Lee una variable de .env.prod. Nunca se imprime el valor de un secreto.
function Get-ProdEnv {
  param([Parameter(Mandatory = $true)][string]$Key)
  if (-not (Test-Path -LiteralPath $ProdEnvFile)) { return '' }
  $value = ''
  $pattern = '^\s*' + [regex]::Escape($Key) + '\s*=(.*)$'
  foreach ($line in [System.IO.File]::ReadAllLines($ProdEnvFile, [System.Text.Encoding]::UTF8)) {
    $match = [regex]::Match($line, $pattern)
    if ($match.Success) { $value = $match.Groups[1].Value.Trim() }
  }
  if ($value.Length -ge 2) {
    $first = $value.Substring(0, 1)
    if (($first -eq '"' -or $first -eq "'") -and $value.EndsWith($first)) {
      $value = $value.Substring(1, $value.Length - 2)
    }
  }
  return $value
}

function New-RandomHex {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

# Crea .env.prod desde la plantilla y genera las claves marcadas __GENERAR__.
function Ensure-ProdEnv {
  Write-Step 'Verificando .env.prod'
  if (Test-Path -LiteralPath $ProdEnvFile) {
    Write-Ok "Existe $ProdEnvFile"
    return
  }
  if (-not (Test-Path -LiteralPath $ProdEnvExample)) {
    throw "No existe la plantilla $ProdEnvExample"
  }
  if ($DryRun) {
    Write-Host "[DRY-RUN] crear $ProdEnvFile desde la plantilla (con claves generadas)" -ForegroundColor DarkYellow
    return
  }
  # UTF-8 sin BOM en la lectura y en la escritura (la plantilla tiene acentos).
  $text = [System.IO.File]::ReadAllText($ProdEnvExample, [System.Text.Encoding]::UTF8)
  $evaluator = [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    $m.Groups[1].Value + '=' + (New-RandomHex) + $m.Groups[2].Value
  }
  $text = [regex]::Replace($text, '(?m)^([A-Z0-9_]+)=__GENERAR__(\r?)$', $evaluator)
  [System.IO.File]::WriteAllText($ProdEnvFile, $text, (New-Object System.Text.UTF8Encoding($false)))
  Write-Warn "Se creo $ProdEnvFile con claves internas nuevas. No se commitea."
}

# Revisa .env.prod antes de tocar nada. Corta si falta algo indispensable o
# si la configuracion puede gastar plata o numeros de factura por error.
function Test-ProdEnv {
  if (-not (Test-Path -LiteralPath $ProdEnvFile)) { return }
  Write-Step 'Revisando la configuracion de produccion'
  $errors = $false

  $script:ProdDomain = Get-ProdEnv 'NGROK_DOMAIN'
  if (-not $script:ProdDomain -or $script:ProdDomain -eq 'tu-dominio.ngrok-free.dev') {
    Write-Err 'Falta NGROK_DOMAIN: tu dominio fijo de ngrok (https://dashboard.ngrok.com/domains).'
    $errors = $true
  } elseif ($script:ProdDomain -match '[/\s]') {
    Write-Err "NGROK_DOMAIN va sin 'https://' ni barras. Ejemplo: mi-dominio.ngrok-free.dev"
    $errors = $true
  } else {
    Write-Ok "Direccion publica: https://$($script:ProdDomain)"
  }

  foreach ($key in @('DJANGO_SECRET_KEY', 'POSTGRES_PASSWORD', 'KEYCLOAK_ADMIN_PASSWORD')) {
    $value = Get-ProdEnv $key
    if (-not $value -or $value -eq '__GENERAR__') {
      Write-Err "Falta $key en .env.prod (pone una clave larga, sin espacios)."
      $errors = $true
    }
  }

  $value = Get-ProdEnv 'GATEWAY_PORT'
  if ($value) { $script:ProdPort = $value }
  $value = Get-ProdEnv 'KEYCLOAK_REALM'
  if ($value) { $script:ProdRealm = $value }

  if (-not (Get-ProdEnv 'NGROK_AUTHTOKEN')) {
    $script:ProdTunnel = $false
    Write-Warn 'NGROK_AUTHTOKEN vacio: no se levanta el contenedor de ngrok (tunel manual).'
  }

  # Stripe: solo claves de prueba, para no mover plata real.
  $value = Get-ProdEnv 'STRIPE_SECRET_KEY'
  if ($value -like 'sk_live_*' -or $value -like 'rk_live_*') {
    if ($env:PERMITIR_STRIPE_LIVE -eq 'si') {
      Write-Warn 'STRIPE_SECRET_KEY es una clave REAL (live): los pagos van a cobrar de verdad.'
    } else {
      Write-Err 'STRIPE_SECRET_KEY es una clave REAL (sk_live_). Usa la de prueba (sk_test_).'
      Write-Err 'Si de verdad queres cobrar, ejecuta con $env:PERMITIR_STRIPE_LIVE = "si".'
      $errors = $true
    }
  } elseif (-not $value) {
    Write-Warn 'STRIPE_SECRET_KEY vacio: el pago con tarjeta no va a funcionar.'
  } else {
    Write-Ok 'Stripe en modo prueba.'
    if (-not (Get-ProdEnv 'STRIPE_WEBHOOK_SECRET')) {
      Write-Warn 'STRIPE_WEBHOOK_SECRET vacio: los pagos no se van a confirmar solos.'
    }
  }

  # Factura Segura: el despliegue nunca emite, pero se avisa en que modo queda.
  $script:ProdFsModo = (Get-ProdEnv 'FACTURASEGURA_MODO').ToLowerInvariant()
  if (-not $script:ProdFsModo) { $script:ProdFsModo = 'simulado' }
  if ($script:ProdFsModo -eq 'real') {
    Write-Warn 'Factura Segura en modo REAL: cada factura emitida desde la app gasta un numero.'
    Write-Warn "  Rango configurado: $(Get-ProdEnv 'FACTURASEGURA_NUMERO_DESDE') a $(Get-ProdEnv 'FACTURASEGURA_NUMERO_HASTA'). La base de produccion no conoce"
    Write-Warn '  los numeros usados en desarrollo: NUMERO_DESDE debe ser el primero sin usar.'
    if (-not (Get-ProdEnv 'FACTURASEGURA_TOKEN')) {
      Write-Warn '  FACTURASEGURA_TOKEN vacio: la emision va a fallar hasta que lo cargues.'
    }
    if ((Get-ProdEnv 'FACTURASEGURA_URL') -notlike '*apitest*') {
      Write-Warn '  FACTURASEGURA_URL no es el ambiente de TEST (apitest). Revisalo antes de emitir.'
    }
  } else {
    Write-Ok 'Factura Segura en modo simulado (no gasta numeros).'
  }

  if ($errors) {
    throw "Completa $ProdEnvFile y volve a ejecutar el script."
  }
}

# Contenedores del despliegue anterior (backend/docker-compose.prod.yml).
# Ocupan los mismos puertos; sus volumenes de datos no se tocan.
function Remove-LegacyProd {
  foreach ($name in @('global-exchange-frontend-prod', 'global-exchange-backend-prod', 'global-exchange-db-prod')) {
    $found = Invoke-Quiet -FilePath 'docker' -Arguments @('ps', '-a', '-q', '--filter', "name=^/$name`$")
    if ($found) {
      Write-Warn "Quitando el contenedor del despliegue anterior: $name"
      if ($DryRun) {
        Write-Host "[DRY-RUN] docker rm -f $name" -ForegroundColor DarkYellow
      } else {
        Invoke-Quiet -FilePath 'docker' -Arguments @('rm', '-f', $name) | Out-Null
      }
    }
  }
}

# Como Wait-Http, pero devuelve $false si el servicio no responde a tiempo.
function Wait-HttpStrict {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Name,
    [int]$TimeoutSeconds = 240
  )
  if ($DryRun) { return $true }
  $ProgressPreference = 'SilentlyContinue'
  Write-Host "  Esperando $Name en $Url ..." -ForegroundColor Cyan
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      # La cabecera evita la pagina de aviso que ngrok muestra a los navegadores.
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 `
        -Headers @{ 'ngrok-skip-browser-warning' = '1' }
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        Write-Ok "$Name responde."
        return $true
      }
    } catch {
      # Seguimos esperando.
    }
    Start-Sleep -Seconds 3
  }
  Write-Err "$Name no respondio en $Url"
  return $false
}

function Show-ProdLogs {
  param([Parameter(Mandatory = $true)][string]$ServiceName)
  Write-Host "  --- ultimas lineas del servicio $ServiceName ---" -ForegroundColor DarkGray
  $ErrorActionPreference = 'Continue'
  try {
    $composeArgs = @($script:ComposePrefix) + @('-p', $ProdProject, 'logs', '--tail', '25', $ServiceName)
    & $script:ComposeExe @composeArgs
  } catch {
    # Los logs son solo una ayuda: si fallan no se corta nada.
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
  Write-Step 'Modo PRODUCCION (Docker + ngrok)'

  Assert-Docker
  Ensure-ProdEnv
  Test-ProdEnv

  # ngrok exige TLS 1.2; Windows PowerShell 5.1 no siempre lo usa por defecto.
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch {
    # Versiones nuevas de PowerShell ya lo negocian solas.
  }

  if (-not $script:ProdDomain) { $script:ProdDomain = '<NGROK_DOMAIN>' }
  $localUrl  = "http://127.0.0.1:$($script:ProdPort)"
  $publicUrl = "https://$($script:ProdDomain)"

  Write-Step '1/4 Construyendo y levantando los contenedores'
  if (-not $DryRun) { Remove-LegacyProd }
  $upArgs = @('up', '-d', '--build')
  if (-not $script:ProdTunnel) { $upArgs += @('--scale', 'ngrok=0') }
  Invoke-ComposeProd -Arguments $upArgs

  Write-Step '2/4 Esperando al backend (aplica las migraciones al arrancar)'
  if (-not (Wait-HttpStrict -Url "$localUrl/api/health/" -Name 'backend' -TimeoutSeconds 300)) {
    Show-ProdLogs 'web'
    Show-ProdLogs 'gateway'
    throw 'El backend no quedo arriba.'
  }

  Write-Step '3/4 Configurando Keycloak (URLs publicas, correo y usuarios iniciales)'
  try {
    Invoke-ComposeProd -Arguments @('run', '--rm', '-T', 'keycloak-init')
  } catch {
    Show-ProdLogs 'keycloak'
    throw 'No se pudo configurar Keycloak (ver el detalle arriba).'
  }

  Write-Step '4/4 Verificando el acceso desde internet'
  if ($script:ProdTunnel) {
    if (-not (Wait-HttpStrict -Url "$publicUrl/api/health/" -Name 'la direccion publica' -TimeoutSeconds 120)) {
      Show-ProdLogs 'ngrok'
      Write-Err 'El tunel de ngrok no quedo arriba. Causas habituales:'
      Write-Err '  - NGROK_AUTHTOKEN o NGROK_DOMAIN mal copiados en .env.prod.'
      Write-Err '  - Otro ngrok abierto usando el mismo dominio (cerralo y volve a ejecutar).'
      throw 'La direccion publica no responde.'
    }
    if (-not (Wait-HttpStrict -Url "$publicUrl/auth/realms/$($script:ProdRealm)" -Name 'Keycloak publico' -TimeoutSeconds 60)) {
      throw 'Keycloak no responde por la direccion publica.'
    }
  } else {
    Write-Warn 'Tunel manual: en otra terminal ejecuta'
    Write-Host "      ngrok http --url=$publicUrl $($script:ProdPort)"
  }

  Write-Host ''
  Write-Host 'Sistema en produccion:' -ForegroundColor Green
  Write-Host "  Aplicacion:         $publicUrl" -ForegroundColor Green
  Write-Host "  Consola Keycloak:   $publicUrl/auth/admin/   (KEYCLOAK_ADMIN_USER de .env.prod)" -ForegroundColor Green
  Write-Host "  Webhook de Stripe:  $publicUrl/api/payments/webhook/" -ForegroundColor Green
  Write-Host "  Acceso local:       http://localhost:$($script:ProdPort)   (solo para diagnostico)" -ForegroundColor Green
  Write-Host "  Factura Segura:     modo $($script:ProdFsModo)" -ForegroundColor Green
  Write-Host ''
  Write-Host 'Estado:   .\scripts\deploy.ps1 status' -ForegroundColor DarkGray
  Write-Host 'Logs:     .\scripts\deploy.ps1 logs [db|web|keycloak|gateway|ngrok]' -ForegroundColor DarkGray
  Write-Host 'Detener:  .\scripts\deploy.ps1 stop   (los datos se conservan)' -ForegroundColor DarkGray
}

function Invoke-Status {
  Resolve-ComposeCommand
  Invoke-Compose -Arguments @('-p', $ProdProject, 'ps')
}

function Invoke-Logs {
  Resolve-ComposeCommand
  if ($Service) {
    Invoke-Compose -Arguments @('-p', $ProdProject, 'logs', '--tail', '100', $Service)
  } else {
    Invoke-Compose -Arguments @('-p', $ProdProject, 'logs', '--tail', '40')
  }
}

function Invoke-Check {
  Write-Step 'Modo CHECK'
  Assert-Tools

  Write-Step 'Verificando archivos de configuracion'
  $files = @(
    (Join-Path $BackendDir 'docker-compose.yml'),
    (Join-Path $BackendDir 'Dockerfile'),
    (Join-Path $FrontendDir 'docker-compose.yml'),
    (Join-Path $FrontendDir 'Dockerfile'),
    (Join-Path $FrontendDir 'nginx.conf'),
    (Join-Path $FrontendDir 'realm-export.json'),
    $ProdComposeFile,
    $ProdEnvExample,
    (Join-Path $ScriptDir 'keycloak_prod_init.py'),
    (Join-Path $ProjectRoot 'deploy\postgres-init\01-crear-base-keycloak.sql')
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
    else { Write-Warn "No existe $env (se creara automaticamente en dev)." }
  }
  if (Test-Path -LiteralPath $ProdEnvFile) {
    Write-Ok "Existe $ProdEnvFile"
    Test-ProdEnv
  } else {
    Write-Warn "No existe $ProdEnvFile (se crea la primera vez que ejecutas prod)."
  }

  Write-Host ''
  Write-Host 'Check completado con exito.' -ForegroundColor Green
}

function Invoke-Stop {
  Write-Step 'Deteniendo procesos y contenedores'
  Stop-Background
  Invoke-Compose -Arguments @('-f', (Join-Path $BackendDir 'docker-compose.yml'), 'down') -WorkingDirectory $BackendDir -DisableEnvFile
  Invoke-Compose -Arguments @('-f', (Join-Path $FrontendDir 'docker-compose.yml'), 'down') -WorkingDirectory $FrontendDir -DisableEnvFile
  $prodContainers = Invoke-Quiet -FilePath 'docker' -Arguments @('ps', '-a', '-q', '--filter', "label=com.docker.compose.project=$ProdProject")
  if ($prodContainers) {
    # Baja los contenedores de produccion; los volumenes (datos) se conservan.
    Invoke-Compose -Arguments @('-p', $ProdProject, 'down')
  }
  Remove-LegacyProd
  Write-Host ''
  Write-Host 'Todo detenido.' -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------
try {
  switch ($Mode) {
    'dev'    { Invoke-Dev }
    'prod'   { Invoke-Prod }
    'check'  { Invoke-Check }
    'status' { Invoke-Status }
    'logs'   { Invoke-Logs }
    'stop'   { Invoke-Stop }
  }
} catch {
  Write-Host ''
  Write-Err $_.Exception.Message
  exit 1
}
