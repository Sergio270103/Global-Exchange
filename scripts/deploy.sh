#!/usr/bin/env bash
###############################################################################
# Script de despliegue automático - Global Exchange (PI-88)
#
# Modos:
#   dev     - Levanta TODO el proyecto en localhost:
#             PostgreSQL + Keycloak (Docker), migraciones, backend y frontend.
#   prod    - Construye y levanta los contenedores de producción.
#   check   - Valida herramientas, archivos y configuración necesarios.
#   stop    - Detiene los procesos y contenedores levantados por este script.
#
# Uso:
#   ./scripts/deploy.sh dev
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

MODE="${1:-dev}"
DRY_RUN=false
if [[ "${MODE}" == "--dry-run" ]]; then
  DRY_RUN=true
  MODE="${2:-dev}"
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

cmd_prod() {
  step "Modo PRODUCCIÓN (Docker Compose)"
  assert_tools
  ensure_env_file "${BACKEND_DIR}/.env" "${BACKEND_DIR}/.env.prod.example"
  ensure_env_file "${FRONTEND_DIR}/.env" "${FRONTEND_DIR}/.env.prod.example"

  if [[ -f "${FRONTEND_DIR}/.env" ]] && grep -Eq 'VITE_API_URL[[:space:]]*=[[:space:]]*http://(127\.0\.0\.1|localhost)' "${FRONTEND_DIR}/.env"; then
    warn "frontend/.env apunta a localhost. Para producción usá VITE_API_URL=/api (ver frontend/.env.prod.example)."
  fi

  local compose_file="${BACKEND_DIR}/docker-compose.prod.yml"

  step "1/3 Construyendo e iniciando contenedores de producción"
  compose -f "${compose_file}" up -d --build

  step "2/3 Aplicando migraciones de Django"
  compose -f "${compose_file}" exec -T web python manage.py migrate --noinput

  step "3/3 Verificando health check del backend"
  wait_http "http://127.0.0.1:8000/api/health/" "backend"

  echo ""
  echo "Contenedores de producción levantados:"
  echo "  Frontend (nginx): http://localhost:8081"
  echo "  Backend:          http://localhost:8000"
  echo "  Postgres:         localhost:5433"
  echo ""
  echo "Para detener todo: ./scripts/deploy.sh stop"
}

cmd_check() {
  step "Modo CHECK"
  assert_tools

  step "Verificando archivos de configuración"
  local missing=0
  for file in \
    "${BACKEND_DIR}/docker-compose.yml" \
    "${BACKEND_DIR}/docker-compose.prod.yml" \
    "${BACKEND_DIR}/Dockerfile" \
    "${FRONTEND_DIR}/docker-compose.yml" \
    "${FRONTEND_DIR}/Dockerfile" \
    "${FRONTEND_DIR}/nginx.conf"; do
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
      warn "No existe ${env} (se creará automáticamente en dev/prod)."
    fi
  done

  echo ""
  echo "Check completado con éxito."
}

cmd_stop() {
  step "Deteniendo procesos y contenedores"
  stop_background
  compose_dev -f "${BACKEND_DIR}/docker-compose.yml" down
  compose_dev -f "${FRONTEND_DIR}/docker-compose.yml" down
  local prod_containers
  prod_containers="$(docker ps -a \
    --filter 'name=global-exchange-backend-prod' \
    --filter 'name=global-exchange-frontend-prod' \
    --filter 'name=global-exchange-db-prod' \
    -q 2>/dev/null || true)"
  if [[ -n "${prod_containers}" ]]; then
    compose -f "${BACKEND_DIR}/docker-compose.prod.yml" down
  fi
  echo ""
  echo "Todo detenido."
}

case "${MODE}" in
  dev)   cmd_dev ;;
  prod)  cmd_prod ;;
  check) cmd_check ;;
  stop)  cmd_stop ;;
  *)
    echo "Uso: $0 {dev|prod|check|stop} [--dry-run]"
    echo ""
    echo "  dev     - Levanta todo en desarrollo (localhost)"
    echo "  prod    - Despliega en producción (Docker Compose)"
    echo "  check   - Verifica herramientas y archivos necesarios"
    echo "  stop    - Detiene procesos y contenedores"
    echo "  --dry-run - Muestra lo que haría sin ejecutar nada"
    exit 1
    ;;
esac
