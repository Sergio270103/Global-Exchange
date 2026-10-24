#!/usr/bin/env bash
###############################################################################
# Script de despliegue automático - Global Exchange (PI-88)
#
# Modos:
#   dev     - Levanta todo en localhost (Postgres + Keycloak + backend + frontend)
#   prod    - Prepara y despliega en un servidor (Docker Compose de producción)
#   check   - Valida que las herramientas necesarias estén instaladas
#   --dry-run - Muestra lo que haría sin ejecutar nada
#
# Uso:
#   ./scripts/deploy.sh dev
#   ./scripts/deploy.sh prod
#   ./scripts/deploy.sh check
#   ./scripts/deploy.sh --dry-run prod
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"

MODE="${1:-}"
DRY_RUN=false

if [[ "${MODE}" == "--dry-run" ]]; then
  DRY_RUN=true
  MODE="${2:-}"
fi

run() {
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY-RUN] $*"
  else
    echo "[RUN] $*"
    "$@"
  fi
}

check_tools() {
  echo "=== Verificando herramientas necesarias ==="
  local missing=0
  for tool in docker docker-compose python3 node npm; do
    if command -v "${tool}" >/dev/null 2>&1; then
      echo "  OK: ${tool} ($(command -v ${tool}))"
    else
      echo "  FALTA: ${tool}"
      missing=1
    fi
  done
  if [[ "${missing}" -ne 0 ]]; then
    echo "Instala las herramientas faltantes antes de continuar."
    exit 1
  fi
  echo "Todas las herramientas están disponibles."
}

env_file_exists() {
  local path="$1"
  if [[ -f "${path}" ]]; then
    echo "  YA EXISTE: ${path} (no se sobrescribe)"
    return 0
  fi
  return 1
}

cmd_dev() {
  echo "=== Modo: DESARROLLO (localhost) ==="
  check_tools

  echo "1. Levantando servicios de infraestructura (Postgres + Keycloak)..."
  run docker compose -f "${BACKEND_DIR}/docker-compose.yml" up -d
  run docker compose -f "${FRONTEND_DIR}/docker-compose.yml" up -d

  echo "2. Aplicando migraciones de Django..."
  (cd "${BACKEND_DIR}" && run python manage.py migrate)

  echo "3. Levanta el backend en segundo plano (puerto 8000)..."
  (cd "${BACKEND_DIR}" && run python manage.py runserver 0.0.0.0:8000 &)

  echo "4. Levanta el frontend en segundo plano (puerto 5173)..."
  (cd "${FRONTEND_DIR}" && run npm run dev &)

  echo "Listo. Backend en http://localhost:8000, Frontend en http://localhost:5173, Keycloak en http://localhost:8080."
}

cmd_prod() {
  echo "=== Modo: PRODUCCIÓN (servidor con Docker) ==="
  check_tools

  echo "1. Verificando archivos de entorno de producción..."
  if ! env_file_exists "${BACKEND_DIR}/.env"; then
    echo "   Copiando backend/.env.prod.example a backend/.env..."
    run cp "${BACKEND_DIR}/.env.prod.example" "${BACKEND_DIR}/.env"
    echo "   IMPORTANTE: edita backend/.env con tus valores reales antes de continuar."
  fi
  if ! env_file_exists "${FRONTEND_DIR}/.env"; then
    echo "   Copiando frontend/.env.example a frontend/.env..."
    run cp "${FRONTEND_DIR}/.env.example" "${FRONTEND_DIR}/.env"
    echo "   IMPORTANTE: edita frontend/.env con VITE_API_URL y VITE_KEYCLOAK_URL de producción."
  fi

  echo "2. Construyendo e iniciando contenedores de producción..."
  (cd "${BACKEND_DIR}" && run docker compose -f docker-compose.prod.yml up -d --build)
  (cd "${FRONTEND_DIR}" && run docker compose -f docker-compose.yml up -d)

  echo "3. Aplicando migraciones de Django en el contenedor de backend..."
  run docker compose -f "${BACKEND_DIR}/docker-compose.prod.yml" exec -T web python manage.py migrate

  echo "4. Verificando health check del backend..."
  run curl -sf http://localhost:8000/api/health/ || true

  echo "Listo. El backend está en el contenedor 'web' y el frontend en el contenedor de nginx."
  echo "Configura tu proxy reverso (nginx/Caddy) para exponer los puertos correspondientes."
}

cmd_check() {
  check_tools
  echo "=== Check completado con éxito ==="
}

case "${MODE}" in
  dev)   cmd_dev ;;
  prod)  cmd_prod ;;
  check) cmd_check ;;
  *)
    echo "Uso: $0 {dev|prod|check|--dry-run dev|prod}"
    echo ""
    echo "  dev     - Levanta todo en desarrollo (localhost)"
    echo "  prod    - Despliega en producción (Docker Compose)"
    echo "  check   - Verifica herramientas necesarias"
    echo "  --dry-run - Muestra lo que haría sin ejecutar nada"
    exit 1
    ;;
esac