# CHIA — Sesión backend Hito 4 (2026-09-13)

Asistente: Muse Spark (opencode). Sin commits ni push, solo trabajo local.

## 1. Diagnóstico inicial
- `core/settings.py` no tenía `monedas` en `INSTALLED_APPS`, ni DRF,
  ni CORS, ni config Keycloak; `core/urls.py` no incluía `/api/`.
- `MAILERS` no es una setting válida de Django (se corrigió a `EMAIL_BACKEND`).
- Faltaba `requirements.txt`; el venv solo tenía Django + psycopg2.
- `djangorestframework==3.16.1` es incompatible con Django 6.1.1
  (`ImportError: cc_delim_re`); se subió a `3.18.1` y `manage.py check` pasa.
- La guía del proyecto referencia Django 4.2, pero el proyecto usa
  Django 6.1.1; se mantuvo 6.1.1 con DRF 3.18.1 compatible.

## 2. Cambios aplicados
- `backend/requirements.txt` (nuevo): Django 6.1.1, DRF 3.18.1,
  django-cors-headers, psycopg2-binary, PyJWT[crypto], python-dotenv.
- `core/settings.py`: apps DRF/CORS/proyecto, `REST_FRAMEWORK` con
  `AutenticacionKeycloak`, dict `KEYCLOAK` por env, CORS, DB Postgres
  por env, `TIME_ZONE America/Asuncion`, `LANGUAGE_CODE es-py`.
- `core/urls.py`: incluye `monedas`, `clientes`, `cotizaciones`, `pagos` bajo `/api/`.
- `backend/.env.example` (nuevo) + `backend/.env` local (gitignored).
- `backend/docker-compose.yml` (nuevo): Postgres 16 para quien no tenga
  servicio local (pendiente de Docker Desktop).
- Apps nuevas:
  - `clientes`: Cliente, ClienteUsuario (asociaciones RF8/RF9/RF43,
    filtro `?mine=1` para el selector RF10/RF11), Comision por categoría.
  - `cotizaciones`: Cotizacion historial inmutable, filtros
    `?moneda ?desde ?hasta`, `vigentes/`, escritura admin+analista,
    `GET /api/simulador/` con desglose RF21 (tasa, bruto, comisión, neto).
  - `pagos`: MetodoPago (catálogo RF42) y CuentaBancaria (RF16/RF26,
    número enmascarado, baja lógica).
- Seeds: 6 monedas, 3 comisiones (1.00/0.75/0.50), 4 métodos de pago.
- Tests: 25 (monedas 12, clientes 4, cotizaciones 5, pagos 4) — todos OK.

## 3. Verificación
- `manage.py check`: sin issues.
- `manage.py test monedas clientes cotizaciones pagos`: 25 OK.
- `migrate` + shell: 6 monedas, 3 comisiones, 4 métodos en BD.
- `runserver` + requests sin token a `/api/monedas/`,
  `/api/cotizaciones/vigentes/`, `/api/simulador/`: 401 (auth exigida, correcto).

## 4. Preguntas al usuario respondidas
- BD: usar Docker (compose creado, pero el Postgres local ya responde;
  falta iniciar Docker Desktop para contenerizar).
- Keycloak: levantar local (pendiente Docker Desktop).
- Orden: backend primero.

## 5. Pendiente
- Iniciar Docker Desktop y levantar `backend/docker-compose.yml` (db)
  + `frontend/docker-compose.yml` (keycloak).
- Conectar frontend (services + Currencies/Rates/Banks/Simulator) al backend.
- Probar flujo con token real de Keycloak.

## 6. Docker (2026-09-13, con el usuario)
- Docker Desktop respondiendo. Conflicto: servicio Windows postgresql-x64-17 ocupa 5432 y no se puede detener sin admin; el contenedor global-exchange-db se mape� a **5433** (ackend/.env actualizado).
- docker compose -f backend/docker-compose.yml up -d: OK, migrate + seeds reaplicados, 25 tests OK contra el contenedor.
- docker compose up -d en frontend: Keycloak 26.7.2 OK; realm Global-Exchange responde 200 en openid-configuration y JWKS (el backend puede validar tokens).
- Contenedores: global-exchange-db (healthy), global-exchange-keycloak (Up).


## 7. E2E con Keycloak (2026-09-13)
- Usuario 	ester@local.py (rol admin) creado por Admin API: exige username+firstName+lastName+attributes.tipo_persona.
- Con su token: monedas 200, alta cotizaci�n 201 (creado_por registrado), vigentes 200, simulador 200 con desglose.
- Usuario com�n: lectura 200, alta de tasa 403, simulador 200. Direct grant reactivado solo para la prueba y restaurado a false.

