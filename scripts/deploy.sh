#!/usr/bin/env bash
###############################################################################
# Script de despliegue automático - Global Exchange (PI-88 / PI-92)
#
# Modos:
#   dev     - Levanta TODO el proyecto en localhost:
#             PostgreSQL + Keycloak (Docker), migraciones, backend y frontend.
#   prod    - Ambiente de producción completo, fuera de localhost:
#             base de datos, backend, Keycloak y frontend en Docker, publicados
#             en internet con ngrok (configuración en .env.prod).
#   check   - Valida herramientas, archivos y configuración necesarios.
#   status  - Muestra el estado de los contenedores de producción.
#   logs    - Muestra los logs de producción (opcional: nombre del servicio).
#   stop    - Detiene los procesos y contenedores levantados por este script.
#
# Uso:
#   ./scripts/deploy.sh dev
#   ./scripts/deploy.sh prod
#   ./scripts/deploy.sh logs keycloak
#   ./scripts/deploy.sh check
#   ./scripts/deploy.sh stop
#   ./scripts/deploy.sh --dry-run prod
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"
RUN_DIR="${PROJECT_ROOT}/.run"

# Ambiente de producción (PI-92): un solo compose en la raíz + .env.prod.
PROD_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"
PROD_ENV_FILE="${PROJECT_ROOT}/.env.prod"
PROD_ENV_EXAMPLE="${PROJECT_ROOT}/.env.prod.example"
PROD_PROJECT="global-exchange-prod"
PROD_DOMAIN=""
PROD_PORT="8081"
PROD_REALM="Global-Exchange"
PROD_TUNNEL=true
PROD_FS_MODO="simulado"

MODE="${1:-dev}"
EXTRA="${2:-}"
DRY_RUN=false
if [[ "${MODE}" == "--dry-run" ]]; then
  DRY_RUN=true
  MODE="${2:-dev}"
  EXTRA="${3:-}"
fi

# Usar el Python del venv si existe (recomendado); si no, el del sistema.
if [[ -x "${BACKEND_DIR}/venv/bin/python" ]]; then
  PYTHON="${BACKEND_DIR}/venv/bin/python"
elif [[ -x "${BACKEND_DIR}/venv/Scripts/python.exe" ]]; then
  PYTHON="${BACKEND_DIR}/venv/Scripts/python.exe"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
else
  PYTHON="$(command -v python || true)"
fi

COMPOSE=()
for candidate in "docker compose" "docker-compose"; do
  # shellcheck disable=SC2086
  if ${candidate} version >/dev/null 2>&1; then
    # shellcheck disable=SC2206
    COMPOSE=(${candidate})
    break
  fi
done

step() { echo ""; echo "=== $* ==="; }
ok()   { echo "  OK: $*"; }
warn() { echo "  AVISO: $*"; }
err()  { echo "  ERROR: $*"; }

run() {
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY-RUN] $*"
  else
    echo "[RUN] $*"
    "$@"
  fi
}

compose() {
  run "${COMPOSE[@]}" "$@"
}

# En dev no hay variables que interpolar y el .env del backend contiene "$",
# así que desactivamos la carga automática para evitar warnings.
compose_dev() {
  COMPOSE_DISABLE_ENV_FILE=1 compose "$@"
}

assert_tools() {
  step "Verificando herramientas necesarias"
  local missing=0

  if ! command -v docker >/dev/null 2>&1; then
    err "docker no está instalado o no está en el PATH."
    missing=1
  else
    ok "$(docker --version)"
  fi

  if [[ ${#COMPOSE[@]} -eq 0 ]]; then
    err "Docker Compose no está disponible (docker compose o docker-compose)."
    missing=1
  else
    ok "Docker Compose: ${COMPOSE[*]}"
  fi

  if ! command -v node >/dev/null 2>&1; then
    err "node no está instalado o no está en el PATH."
    missing=1
  else
    ok "node $(node --version)"
  fi

  if ! command -v npm >/dev/null 2>&1; then
    err "npm no está instalado o no está en el PATH."
    missing=1
  else
    ok "npm $(npm --version)"
  fi

  if [[ -z "${PYTHON}" ]]; then
    err "python no está instalado. Crea el venv en backend/venv o instala Python."
    missing=1
  else
    ok "Python: ${PYTHON} ($(${PYTHON} --version 2>&1))"
  fi

  if [[ ${missing} -ne 0 ]]; then
    err "Faltan herramientas. Instalalas y volvé a ejecutar el script."
    exit 1
  fi
}

ensure_env_file() {
  local target="$1"
  local example="$2"
  if [[ -f "${target}" ]]; then
    ok "Existe ${target}"
    return
  fi
  if [[ ! -f "${example}" ]]; then
    err "No existe la plantilla ${example}"
    exit 1
  fi
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY-RUN] copiar ${example} -> ${target}"
    return
  fi
  cp "${example}" "${target}"
  warn "Creado ${target} desde ${example}. Revisá los valores si hace falta."
}

wait_for_postgres() {
  [[ "${DRY_RUN}" == true ]] && return
  echo "  Esperando a que PostgreSQL esté healthy..."
  local status=""
  for _ in $(seq 1 45); do
    status="$(docker inspect --format '{{.State.Health.Status}}' global-exchange-db 2>/dev/null || true)"
    if [[ "${status}" == "healthy" ]]; then
      ok "PostgreSQL está listo."
      return
    fi
    sleep 2
  done
  err "PostgreSQL no quedó healthy. Revisá: docker logs global-exchange-db"
  exit 1
}

port_in_use() {
  "${PYTHON}" - "$1" <<'PY'
import socket
import sys
sock = socket.socket()
sock.settimeout(0.3)
sys.exit(0 if sock.connect_ex(("127.0.0.1", int(sys.argv[1]))) == 0 else 1)
PY
}

wait_http() {
  local url="$1"
  local name="$2"
  local log_path="${3:-}"
  [[ "${DRY_RUN}" == true ]] && return
  echo "  Esperando ${name} en ${url} ..."
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 "${url}" >/dev/null 2>&1; then
      ok "${name} responde."
      return
    fi
    sleep 2
  done
  warn "${name} no respondió."
  if [[ -n "${log_path}" && -f "${log_path}" ]]; then
    echo "  --- últimas líneas de ${log_path} ---"
    tail -n 20 "${log_path}"
  fi
}

ensure_backend_deps() {
  step "Verificando dependencias del backend"
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY-RUN] se omite la verificación de Django"
    return
  fi
  if "${PYTHON}" -c "import django, rest_framework, whitenoise" >/dev/null 2>&1; then
    ok "Dependencias de Python ya instaladas (Django, DRF, Whitenoise)."
    return
  fi
  warn "Faltan dependencias de Python. Instalando requirements.txt..."
  (cd "${BACKEND_DIR}" && run "${PYTHON}" -m pip install -r requirements.txt)
}

ensure_frontend_deps() {
  step "Verificando dependencias del frontend"
  if [[ -d "${FRONTEND_DIR}/node_modules" ]]; then
    ok "node_modules ya existe."
    return
  fi
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY-RUN] se instalarían las dependencias de npm"
    return
  fi
  if [[ -f "${FRONTEND_DIR}/package-lock.json" ]]; then
    (cd "${FRONTEND_DIR}" && run npm ci)
  else
    (cd "${FRONTEND_DIR}" && run npm install)
  fi
}

start_background() {
  local name="$1"
  local workdir="$2"
  shift 2
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY-RUN] $* (en ${workdir})"
    return
  fi
  mkdir -p "${RUN_DIR}"
  (cd "${workdir}" && nohup "$@" >"${RUN_DIR}/${name}.out.log" 2>&1 & echo $! >"${RUN_DIR}/${name}.pid")
  ok "${name} iniciado (PID $(cat "${RUN_DIR}/${name}.pid")). Log: ${RUN_DIR}/${name}.out.log"
}

stop_background() {
  for name in backend frontend; do
    local pid_file="${RUN_DIR}/${name}.pid"
    [[ -f "${pid_file}" ]] || continue
    local pid
    pid="$(cat "${pid_file}")"
    if kill -0 "${pid}" >/dev/null 2>&1; then
      # Matar también los procesos hijos (npm lanza node).
      pkill -P "${pid}" >/dev/null 2>&1 || true
      kill "${pid}" >/dev/null 2>&1 || true
      ok "Detenido ${name} (PID ${pid})."
    fi
    rm -f "${pid_file}"
  done
}

# ---------------------------------------------------------------------------
# Producción (PI-92)
# ---------------------------------------------------------------------------

# En producción todo corre en contenedores: solo hace falta Docker.
assert_docker() {
  step "Verificando Docker"
  if ! command -v docker >/dev/null 2>&1; then
    err "docker no está instalado o no está en el PATH."
    exit 1
  fi
  ok "$(docker --version)"
  if [[ ${#COMPOSE[@]} -eq 0 ]]; then
    err "Docker Compose no está disponible (docker compose o docker-compose)."
    exit 1
  fi
  ok "Docker Compose: ${COMPOSE[*]}"
  if [[ "${DRY_RUN}" != true ]] && ! docker info >/dev/null 2>&1; then
    err "Docker no está corriendo. Abrí Docker Desktop y volvé a ejecutar el script."
    exit 1
  fi
}

compose_prod() {
  compose --env-file "${PROD_ENV_FILE}" -f "${PROD_COMPOSE_FILE}" "$@"
}

# Lee una variable de .env.prod sin ejecutar el archivo (los valores pueden
# tener espacios o paréntesis). Nunca se imprime el valor de un secreto.
prod_env_get() {
  local key="$1" line=""
  [[ -f "${PROD_ENV_FILE}" ]] || return 0
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "${PROD_ENV_FILE}" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  if [[ ${#line} -ge 2 && ( "${line}" == \"*\" || "${line}" == \'*\' ) ]]; then
    line="${line:1:${#line}-2}"
  fi
  printf '%s' "${line}"
}

random_hex() {
  od -An -N24 -tx1 /dev/urandom | tr -d ' \n'
}

# Crea .env.prod desde la plantilla y genera las claves marcadas __GENERAR__.
ensure_prod_env() {
  step "Verificando .env.prod"
  if [[ -f "${PROD_ENV_FILE}" ]]; then
    ok "Existe ${PROD_ENV_FILE}"
    return
  fi
  if [[ ! -f "${PROD_ENV_EXAMPLE}" ]]; then
    err "No existe la plantilla ${PROD_ENV_EXAMPLE}"
    exit 1
  fi
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY-RUN] crear ${PROD_ENV_FILE} desde la plantilla (con claves generadas)"
    return
  fi
  local line
  while IFS= read -r line || [[ -n "${line}" ]]; do
    # Solo las líneas "CLAVE=__GENERAR__" (no los comentarios que lo nombran).
    if [[ "${line}" != "#"* && "${line%$'\r'}" == *"=__GENERAR__" ]]; then
      line="${line/__GENERAR__/$(random_hex)}"
    fi
    printf '%s\n' "${line}"
  done <"${PROD_ENV_EXAMPLE}" >"${PROD_ENV_FILE}"
  chmod 600 "${PROD_ENV_FILE}" 2>/dev/null || true
  warn "Se creó ${PROD_ENV_FILE} con claves internas nuevas. No se commitea."
}

# Revisa .env.prod antes de tocar nada. Corta si falta algo indispensable o
# si la configuración puede gastar plata o números de factura por error.
validate_prod_env() {
  [[ -f "${PROD_ENV_FILE}" ]] || return 0
  step "Revisando la configuración de producción"
  local errores=0 key value

  PROD_DOMAIN="$(prod_env_get NGROK_DOMAIN)"
  if [[ -z "${PROD_DOMAIN}" || "${PROD_DOMAIN}" == "tu-dominio.ngrok-free.dev" ]]; then
    err "Falta NGROK_DOMAIN: tu dominio fijo de ngrok (https://dashboard.ngrok.com/domains)."
    errores=1
  elif [[ "${PROD_DOMAIN}" == *"/"* || "${PROD_DOMAIN}" == *" "* ]]; then
    err "NGROK_DOMAIN va sin 'https://' ni barras. Ejemplo: mi-dominio.ngrok-free.dev"
    errores=1
  else
    ok "Dirección pública: https://${PROD_DOMAIN}"
  fi

  for key in DJANGO_SECRET_KEY POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD; do
    value="$(prod_env_get "${key}")"
    if [[ -z "${value}" || "${value}" == "__GENERAR__" ]]; then
      err "Falta ${key} en .env.prod (poné una clave larga, sin espacios)."
      errores=1
    fi
  done

  value="$(prod_env_get GATEWAY_PORT)"
  [[ -n "${value}" ]] && PROD_PORT="${value}"
  value="$(prod_env_get KEYCLOAK_REALM)"
  [[ -n "${value}" ]] && PROD_REALM="${value}"

  if [[ -z "$(prod_env_get NGROK_AUTHTOKEN)" ]]; then
    PROD_TUNNEL=false
    warn "NGROK_AUTHTOKEN vacío: no se levanta el contenedor de ngrok (túnel manual)."
  fi

  # Stripe: solo claves de prueba, para no mover plata real.
  value="$(prod_env_get STRIPE_SECRET_KEY)"
  if [[ "${value}" == sk_live_* || "${value}" == rk_live_* ]]; then
    if [[ "${PERMITIR_STRIPE_LIVE:-}" == "si" ]]; then
      warn "STRIPE_SECRET_KEY es una clave REAL (live): los pagos van a cobrar de verdad."
    else
      err "STRIPE_SECRET_KEY es una clave REAL (sk_live_). Usá la de prueba (sk_test_)."
      err "Si de verdad querés cobrar, ejecutá con PERMITIR_STRIPE_LIVE=si."
      errores=1
    fi
  elif [[ -z "${value}" ]]; then
    warn "STRIPE_SECRET_KEY vacío: el pago con tarjeta no va a funcionar."
  else
    ok "Stripe en modo prueba."
    if [[ -z "$(prod_env_get STRIPE_WEBHOOK_SECRET)" ]]; then
      warn "STRIPE_WEBHOOK_SECRET vacío: los pagos no se van a confirmar solos."
    fi
  fi

  # Factura Segura: el despliegue nunca emite, pero se avisa en qué modo queda.
  PROD_FS_MODO="$(prod_env_get FACTURASEGURA_MODO | tr '[:upper:]' '[:lower:]')"
  [[ -n "${PROD_FS_MODO}" ]] || PROD_FS_MODO="simulado"
  if [[ "${PROD_FS_MODO}" == "real" ]]; then
    warn "Factura Segura en modo REAL: cada factura emitida desde la app gasta un número."
    warn "  Rango configurado: $(prod_env_get FACTURASEGURA_NUMERO_DESDE) a $(prod_env_get FACTURASEGURA_NUMERO_HASTA). La base de producción no conoce"
    warn "  los números usados en desarrollo: NUMERO_DESDE debe ser el primero sin usar."
    if [[ -z "$(prod_env_get FACTURASEGURA_TOKEN)" ]]; then
      warn "  FACTURASEGURA_TOKEN vacío: la emisión va a fallar hasta que lo cargues."
    fi
    if [[ "$(prod_env_get FACTURASEGURA_URL)" != *"apitest"* ]]; then
      warn "  FACTURASEGURA_URL no es el ambiente de TEST (apitest). Revisalo antes de emitir."
    fi
  else
    ok "Factura Segura en modo simulado (no gasta números)."
  fi

  if [[ ${errores} -ne 0 ]]; then
    echo ""
    err "Completá ${PROD_ENV_FILE} y volvé a ejecutar el script."
    exit 1
  fi
}

# Contenedores del despliegue anterior (backend/docker-compose.prod.yml).
# Ocupan los mismos puertos; sus volúmenes de datos no se tocan.
remove_legacy_prod() {
  local name
  for name in global-exchange-frontend-prod global-exchange-backend-prod global-exchange-db-prod; do
    if [[ -n "$(docker ps -a -q --filter "name=^/${name}$" 2>/dev/null || true)" ]]; then
      warn "Quitando el contenedor del despliegue anterior: ${name}"
      run docker rm -f "${name}" >/dev/null
    fi
  done
}

# Como wait_http, pero devuelve error si el servicio no responde a tiempo.
wait_http_strict() {
  local url="$1" name="$2" intentos="${3:-60}"
  [[ "${DRY_RUN}" == true ]] && return 0
  echo "  Esperando ${name} en ${url} ..."
  for _ in $(seq 1 "${intentos}"); do
    # La cabecera evita la página de aviso que ngrok muestra a los navegadores.
    if curl -fsS --max-time 5 -H "ngrok-skip-browser-warning: 1" "${url}" >/dev/null 2>&1; then
      ok "${name} responde."
      return 0
    fi
    sleep 3
  done
  err "${name} no respondió en ${url}"
  return 1
}

prod_logs_tail() {
  echo "  --- últimas líneas del servicio $1 ---"
  "${COMPOSE[@]}" -p "${PROD_PROJECT}" logs --tail 25 "$1" 2>&1 || true
}

cmd_prod() {
  step "Modo PRODUCCIÓN (Docker + ngrok)"
  assert_docker
  ensure_prod_env
  validate_prod_env

  local scale=()
  [[ "${PROD_TUNNEL}" == true ]] || scale=(--scale ngrok=0)
  [[ -n "${PROD_DOMAIN}" ]] || PROD_DOMAIN="<NGROK_DOMAIN>"
  local local_url="http://127.0.0.1:${PROD_PORT}"
  local public_url="https://${PROD_DOMAIN}"

  step "1/4 Construyendo y levantando los contenedores"
  [[ "${DRY_RUN}" == true ]] || remove_legacy_prod
  compose_prod up -d --build ${scale[@]+"${scale[@]}"}

  step "2/4 Esperando al backend (aplica las migraciones al arrancar)"
  if ! wait_http_strict "${local_url}/api/health/" "backend" 80; then
    prod_logs_tail web
    prod_logs_tail gateway
    exit 1
  fi

  step "3/4 Configurando Keycloak (URLs públicas, correo y usuarios iniciales)"
  if ! compose_prod run --rm -T keycloak-init; then
    prod_logs_tail keycloak
    exit 1
  fi

  step "4/4 Verificando el acceso desde internet"
  if [[ "${PROD_TUNNEL}" == true ]]; then
    if ! wait_http_strict "${public_url}/api/health/" "la dirección pública" 30; then
      prod_logs_tail ngrok
      err "El túnel de ngrok no quedó arriba. Causas habituales:"
      err "  - NGROK_AUTHTOKEN o NGROK_DOMAIN mal copiados en .env.prod."
      err "  - Otro ngrok abierto usando el mismo dominio (cerralo y volvé a ejecutar)."
      exit 1
    fi
    wait_http_strict "${public_url}/auth/realms/${PROD_REALM}" "Keycloak público" 20 || exit 1
  else
    warn "Túnel manual: en otra terminal ejecutá"
    echo "      ngrok http --url=${public_url} ${PROD_PORT}"
  fi

  echo ""
  echo "Sistema en producción:"
  echo "  Aplicación:         ${public_url}"
  echo "  Consola Keycloak:   ${public_url}/auth/admin/   (KEYCLOAK_ADMIN_USER de .env.prod)"
  echo "  Webhook de Stripe:  ${public_url}/api/payments/webhook/"
  echo "  Acceso local:       http://localhost:${PROD_PORT}   (solo para diagnóstico)"
  echo "  Factura Segura:     modo ${PROD_FS_MODO}"
  echo ""
  echo "Estado:   ./scripts/deploy.sh status"
  echo "Logs:     ./scripts/deploy.sh logs [db|web|keycloak|gateway|ngrok]"
  echo "Detener:  ./scripts/deploy.sh stop   (los datos se conservan)"
}

cmd_status() {
  run "${COMPOSE[@]}" -p "${PROD_PROJECT}" ps
}

cmd_logs() {
  if [[ -n "${EXTRA}" ]]; then
    run "${COMPOSE[@]}" -p "${PROD_PROJECT}" logs --tail 100 "${EXTRA}"
  else
    run "${COMPOSE[@]}" -p "${PROD_PROJECT}" logs --tail 40
  fi
}

cmd_dev() {
  step "Modo DESARROLLO (localhost)"
  assert_tools
  ensure_env_file "${BACKEND_DIR}/.env" "${BACKEND_DIR}/.env.example"
  ensure_env_file "${FRONTEND_DIR}/.env" "${FRONTEND_DIR}/.env.example"

  step "1/5 Levantando PostgreSQL y Keycloak en Docker"
  compose_dev -f "${BACKEND_DIR}/docker-compose.yml" up -d
  compose_dev -f "${FRONTEND_DIR}/docker-compose.yml" up -d
  wait_for_postgres

  ensure_backend_deps

  step "2/5 Aplicando migraciones de Django"
  (cd "${BACKEND_DIR}" && run "${PYTHON}" manage.py migrate --noinput)

  ensure_frontend_deps

  step "3/5 Iniciando backend (puerto 8000)"
  local backend_log="${RUN_DIR}/backend.out.log"
  if port_in_use 8000; then
    warn "El puerto 8000 ya está en uso; se omite el arranque del backend."
  else
    start_background backend "${BACKEND_DIR}" "${PYTHON}" manage.py runserver 0.0.0.0:8000
  fi

  step "4/5 Iniciando frontend (puerto 5173)"
  local frontend_log="${RUN_DIR}/frontend.out.log"
  if port_in_use 5173; then
    warn "El puerto 5173 ya está en uso; se omite el arranque del frontend."
  else
    start_background frontend "${FRONTEND_DIR}" npm run dev
  fi

  step "5/5 Verificando que los servicios respondan"
  wait_http "http://127.0.0.1:8000/api/health/" "backend" "${backend_log}"
  wait_http "http://127.0.0.1:5173/" "frontend" "${frontend_log}"

  echo ""
  echo "Proyecto levantado:"
  echo "  Frontend:  http://localhost:5173"
  echo "  Backend:   http://localhost:8000"
  echo "  Keycloak:  http://localhost:8080"
  echo "  Postgres:  localhost:5433"
  echo ""
  echo "Logs en: ${RUN_DIR}"
  echo "Para detener todo: ./scripts/deploy.sh stop"
}

cmd_check() {
  step "Modo CHECK"
  assert_tools

  step "Verificando archivos de configuración"
  local missing=0
  for file in \
    "${BACKEND_DIR}/docker-compose.yml" \
    "${BACKEND_DIR}/Dockerfile" \
    "${FRONTEND_DIR}/docker-compose.yml" \
    "${FRONTEND_DIR}/Dockerfile" \
    "${FRONTEND_DIR}/nginx.conf" \
    "${FRONTEND_DIR}/realm-export.json" \
    "${PROD_COMPOSE_FILE}" \
    "${PROD_ENV_EXAMPLE}" \
    "${SCRIPT_DIR}/keycloak_prod_init.py" \
    "${PROJECT_ROOT}/deploy/postgres-init/01-crear-base-keycloak.sql"; do
    if [[ -f "${file}" ]]; then
      ok "Existe ${file}"
    else
      err "Falta ${file}"
      missing=1
    fi
  done
  if [[ ${missing} -ne 0 ]]; then
    err "Faltan archivos necesarios para el despliegue."
    exit 1
  fi

  step "Verificando archivos .env"
  for env in "${BACKEND_DIR}/.env" "${FRONTEND_DIR}/.env"; do
    if [[ -f "${env}" ]]; then
      ok "Existe ${env}"
    else
      warn "No existe ${env} (se creará automáticamente en dev)."
    fi
  done
  if [[ -f "${PROD_ENV_FILE}" ]]; then
    ok "Existe ${PROD_ENV_FILE}"
    validate_prod_env
  else
    warn "No existe ${PROD_ENV_FILE} (se crea la primera vez que ejecutás prod)."
  fi

  echo ""
  echo "Check completado con éxito."
}

cmd_stop() {
  step "Deteniendo procesos y contenedores"
  stop_background
  compose_dev -f "${BACKEND_DIR}/docker-compose.yml" down
  compose_dev -f "${FRONTEND_DIR}/docker-compose.yml" down
  if [[ -n "$(docker ps -a -q --filter "label=com.docker.compose.project=${PROD_PROJECT}" 2>/dev/null || true)" ]]; then
    # Baja los contenedores de producción; los volúmenes (datos) se conservan.
    run "${COMPOSE[@]}" -p "${PROD_PROJECT}" down
  fi
  remove_legacy_prod
  echo ""
  echo "Todo detenido."
}

case "${MODE}" in
  dev)    cmd_dev ;;
  prod)   cmd_prod ;;
  check)  cmd_check ;;
  status) cmd_status ;;
  logs)   cmd_logs ;;
  stop)   cmd_stop ;;
  *)
    echo "Uso: $0 [--dry-run] {dev|prod|check|status|logs|stop}"
    echo ""
    echo "  dev     - Levanta todo en desarrollo (localhost)"
    echo "  prod    - Despliega en producción (Docker + ngrok, ver .env.prod)"
    echo "  check   - Verifica herramientas y archivos necesarios"
    echo "  status  - Estado de los contenedores de producción"
    echo "  logs    - Logs de producción (opcional: db, web, keycloak, gateway, ngrok)"
    echo "  stop    - Detiene procesos y contenedores"
    echo "  --dry-run - Muestra lo que haría sin ejecutar nada"
    exit 1
    ;;
esac
