# Guía de despliegue - Global Exchange (PI-88)

Este documento explica cómo desplegar el proyecto Global Exchange en
desarrollo y producción usando el script automático de despliegue.

## Índice

1. [Resumen](#resumen)
2. [Requisitos previos](#requisitos-previos)
3. [Despliegue en desarrollo (localhost)](#despliegue-en-desarrollo-localhost)
4. [Ambiente de producción (Docker + ngrok)](#ambiente-de-producción-docker--ngrok)
5. [Variables de entorno](#variables-de-entorno)
6. [Facturación electrónica (PI-30) en modo simulado y real](#facturacion-electronica-pi-30)
7. [Troubleshooting](#troubleshooting)
8. [Rollback](#rollback)
9. [Cambios realizados en el código](#cambios-realizados-en-el-codigo)

---

## Resumen

El proyecto se puede levantar con un solo comando gracias a
`scripts/deploy.sh` (Linux/macOS/WSL) o
`scripts/deploy.ps1` (Windows PowerShell).

- **Desarrollo**: todo corre en tu computadora (`localhost`).
- **Producción**: todo corre en contenedores Docker y queda publicado en
  internet con ngrok (ver [Ambiente de producción](#ambiente-de-producción-docker--ngrok)).

Comandos disponibles:

| Comando | Descripción |
|---|---|
| `./scripts/deploy.sh dev` / `.\scripts\deploy.ps1 dev` | Levanta todo en localhost |
| `./scripts/deploy.sh prod` / `.\scripts\deploy.ps1 prod` | Levanta los contenedores de producción |
| `./scripts/deploy.sh check` / `.\scripts\deploy.ps1 check` | Verifica herramientas y archivos |
| `./scripts/deploy.sh stop` / `.\scripts\deploy.ps1 stop` | Detiene procesos y contenedores |

En PowerShell también podés usar `-DryRun` para ver qué haría sin ejecutar nada:
`.\scripts\deploy.ps1 prod -DryRun`.

No se paga nada: Docker, el plan gratuito de ngrok, Stripe en modo prueba
y Factura Segura en el ambiente de TEST alcanzan para todo.

---

## Requisitos previos

### En tu computadora (desarrollo)

- [Docker](https://www.docker.com/) y Docker Compose
- [Python 3.11+](https://www.python.org/)
- [Node.js 20+](https://nodejs.org/) y npm

### En la computadora anfitriona (producción)

Ver [Requisitos de la computadora anfitriona](#requisitos-de-la-computadora-anfitriona).

---

## Despliegue en desarrollo (localhost)

```bash
# Clona el repositorio
git clone https://github.com/Sergio270103/Global-Exchange.git
cd Global-Exchange

# Ejecuta el script en modo desarrollo
./scripts/deploy.sh dev
```

En Windows (PowerShell):

```powershell
.\scripts\deploy.ps1 dev
```

Esto hará lo siguiente:

1. Levantará PostgreSQL y Keycloak en contenedores Docker y esperará a que
   PostgreSQL esté listo.
2. Verificará las dependencias de Python (usando `backend/venv` si existe) y
   de Node, instalándolas si faltan.
3. Aplicará las migraciones de Django.
4. Arrancará el backend en `http://localhost:8000`.
5. Arrancará el frontend en `http://localhost:5173` y verificará que ambos
   respondan.

Ya puedes acceder a la aplicación.

Los logs de los procesos en segundo plano quedan en `.run/`
(`backend.out.log`, `frontend.out.log`, etc.).

Para detener todo:

```bash
./scripts/deploy.sh stop
```

En Windows:

```powershell
.\scripts\deploy.ps1 stop
```

---

## Ambiente de producción (Docker + ngrok)

El ambiente de producción (PI-96) es la computadora anfitriona, publicada en
internet con ngrok. El sistema completo queda detrás de **una sola dirección
pública**:

```
Internet ──> ngrok ──> gateway (nginx) ──> /        frontend (React)
          https://<NGROK_DOMAIN>          /api/    backend (Django + gunicorn) ──> PostgreSQL
                                          /auth/   Keycloak ─────────────────────> PostgreSQL
```

Servicios de `docker-compose.prod.yml` (en la raíz del repositorio):

| Servicio | Qué es |
|---|---|
| `db` | PostgreSQL 16 con dos bases: `global_exchange_bd` (sistema) y `keycloak` |
| `web` | Backend Django con gunicorn; aplica las migraciones al arrancar |
| `keycloak` | Keycloak en modo producción (`start`), con el realm de `frontend/realm-export.json` |
| `gateway` | nginx: sirve el frontend y reparte `/api/` y `/auth/` |
| `ngrok` | Túnel que publica el gateway en `https://<NGROK_DOMAIN>` |
| `keycloak-init` | Tarea de una sola vez que configura Keycloak (`scripts/keycloak_prod_init.py`) |

Solo el gateway publica un puerto (`127.0.0.1:8081`). Producción usa una base
de datos y un Keycloak **propios**: no comparte datos con el modo desarrollo
y ambos pueden estar levantados a la vez.

### Requisitos de la computadora anfitriona

- [Docker Desktop](https://www.docker.com/) abierto (no hace falta Python ni
  Node: todo se construye dentro de los contenedores).
- Una cuenta gratuita de [ngrok](https://dashboard.ngrok.com/) con su dominio
  fijo (`algo.ngrok-free.dev`) y su authtoken.
- Las claves de prueba de Stripe y, si se va a facturar de verdad, el token
  de Factura Segura.

### Paso 1: crear `.env.prod`

Copiá `.env.prod.example` a `.env.prod` (en la raíz; no se commitea) y
reemplazá cada `__GENERAR__` por una clave larga al azar. Después completá:

| Variable | Qué poner | Dónde se consigue |
|---|---|---|
| `NGROK_DOMAIN` | El dominio fijo, sin `https://` | <https://dashboard.ngrok.com/domains> |
| `NGROK_AUTHTOKEN` | El authtoken de la cuenta | <https://dashboard.ngrok.com/get-started/your-authtoken> |
| `KEYCLOAK_SMTP_PASSWORD` | Contraseña de aplicación de Gmail de la cuenta que envía los correos de verificación | La cuenta de Gmail del proyecto |
| `USUARIOS_INICIALES` | Usuarios a crear con su rol: `usuario:correo:contraseña:rol;...` | Los define el equipo |
| `STRIPE_SECRET_KEY` | Clave secreta de **prueba** (`sk_test_...`) | <https://dashboard.stripe.com/test/apikeys> |
| `STRIPE_WEBHOOK_SECRET` | Secreto del webhook (`whsec_...`) | Ver paso 2 |
| `FACTURASEGURA_*` | Modo, token y rango de números | Ver [Facturación electrónica](#facturación-electrónica-pi-30) |

El resto de las variables ya viene con valores que funcionan.

### Paso 2: registrar el webhook de Stripe (una sola vez)

Como el dominio de ngrok es fijo, el webhook se registra una vez y queda:

1. Entrar a <https://dashboard.stripe.com/test/webhooks> y agregar un destino
   (endpoint) con la URL `https://<NGROK_DOMAIN>/api/payments/webhook/`.
2. Elegir los eventos `checkout.session.completed`,
   `checkout.session.expired`, `checkout.session.async_payment_succeeded` y
   `checkout.session.async_payment_failed`.
3. Copiar el *signing secret* (`whsec_...`) a `STRIPE_WEBHOOK_SECRET`.

En producción no hace falta `stripe listen`: Stripe llama directo a la URL
pública.

### Paso 3: levantar el ambiente

Desde la raíz del repositorio:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm -T keycloak-init
```

El primer comando construye y levanta los contenedores (las migraciones se
aplican solas). El segundo agrega la dirección pública al cliente del
frontend en Keycloak, carga la contraseña SMTP y crea los usuarios
iniciales; se puede repetir sin problema.

Direcciones:

- Aplicación: `https://<NGROK_DOMAIN>`
- Consola de Keycloak: `https://<NGROK_DOMAIN>/auth/admin/`
  (usuario y contraseña: `KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD`)
- Webhook de Stripe: `https://<NGROK_DOMAIN>/api/payments/webhook/`

> **Aviso de ngrok.** En el plan gratuito, la primera vez que un navegador
> entra a la dirección aparece una página de ngrok con el botón
> **Visit Site**. Es normal: se acepta una vez por navegador y dura 7 días.

Los contenedores tienen `restart: unless-stopped`: si se reinicia la
computadora, vuelven a levantarse solos al abrir Docker Desktop. Para
apagarlos (los datos se conservan):

```bash
docker compose -p global-exchange-prod down
```

### Túnel manual (sin el contenedor de ngrok)

Si `NGROK_AUTHTOKEN` queda vacío, levantá todo menos el túnel y abrilo con
el ngrok instalado en la computadora:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build --scale ngrok=0
ngrok http --url=https://<NGROK_DOMAIN> 8081
```

### Empezar de cero

Para borrar **todos los datos** de producción (base de datos, usuarios de
Keycloak y archivos) y volver a levantar desde cero:

```bash
docker compose -p global-exchange-prod down -v
```

Hace falta, por ejemplo, si se cambia `POSTGRES_PASSWORD` o
`KEYCLOAK_ADMIN_PASSWORD` después del primer despliegue (esas claves solo se
aplican cuando se crean las bases).

### Variables que arma el compose

A partir de `NGROK_DOMAIN`, `docker-compose.prod.yml` arma solo todo lo que
depende de la dirección pública:

| Se calcula | Valor |
|---|---|
| `KEYCLOAK_URL` (issuer de los tokens) | `https://<NGROK_DOMAIN>/auth` |
| `KEYCLOAK_INTERNAL_URL` (descarga de claves JWKS) | `http://keycloak:8080/auth` |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` | `https://<NGROK_DOMAIN>` |
| `DJANGO_ALLOWED_HOSTS` | `<NGROK_DOMAIN>,localhost,127.0.0.1` |
| `VITE_API_URL` / `VITE_KEYCLOAK_URL` (build del frontend) | `/api` / `https://<NGROK_DOMAIN>/auth` |
| `POSTGRES_HOST`, `DJANGO_DEBUG` | `db`, `False` |

---

## Variables de entorno

### Backend (`backend/.env`)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DJANGO_SECRET_KEY` | Clave secreta de Django | `cambiar-por-una-clave-larga` |
| `DJANGO_DEBUG` | Modo depuración (False en producción) | `False` |
| `DJANGO_ALLOWED_HOSTS` | Hosts permitidos | `tu-dominio.com` |
| `POSTGRES_*` | Credenciales de la base de datos | ver `.env.prod.example` |
| `KEYCLOAK_*` | Configuración de Keycloak | ver `.env.prod.example` |
| `FACTURASEGURA_*` | Configuración de Factura Segura (PI-30) | ver `.env.prod.example` |

### Frontend (`frontend/.env`)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `VITE_API_URL` | URL del backend (o `/api` en producción con nginx) | `https://tu-backend.onrender.com/api` |
| `VITE_KEYCLOAK_URL` | URL de Keycloak | `http://localhost:8080` |
| `VITE_KEYCLOAK_REALM` | Realm de Keycloak | `Global-Exchange` |
| `VITE_KEYCLOAK_CLIENT_ID` | Client ID | `global-exchange-frontend` |

En producción usá `frontend/.env.prod.example` como plantilla
(`VITE_API_URL=/api`).

---

## Facturación electrónica (PI-30)

El proyecto incluye la integración con Factura Segura (PI-30). Por defecto
funciona en **modo simulado** (`FACTURASEGURA_MODO=simulado`), lo que
significa que:

- No llama a la API externa.
- No gasta números de factura asignados.
- Es seguro para desarrollo y pruebas.

Para usar el modo real:

1. Configura `FACTURASEGURA_MODO=real`.
2. Agrega tu token de Factura Segura en `FACTURASEGURA_TOKEN`.
3. Completa los datos del emisor (`FACTURASEGURA_RUC`, `FACTURASEGURA_NOMBRE`, etc.).
4. Confirma con la cátedra que los datos del emisor están correctos antes de emitir facturas reales.

**Cuidado con los números en producción.** Levantar el ambiente nunca
emite facturas: solo se emite cuando un usuario lo pide desde la pantalla de
facturas. Pero la base de producción es nueva y no sabe qué números ya se
usaron en desarrollo, así que el sistema empezaría de nuevo desde
`FACTURASEGURA_NUMERO_DESDE`. Antes de pasar a modo `real`, poné en
`FACTURASEGURA_NUMERO_DESDE` (y en `FACTURASEGURA_NC_NUMERO_DESDE`) el
primer número que todavía **no** se usó.

### Anulación, inutilización y notas de crédito

Además de emitir, el backend permite gestionar un comprobante desde
`POST /api/facturas/{id}/...`:

| Acción | Endpoint | Cuándo |
|---|---|---|
| Anular | `cancelar/` y `cancelacion/estado/` | Factura `APROBADA`, dentro de la ventana de cancelación |
| Inutilizar | `inutilizar/` e `inutilizacion/estado/` | Número consumido por un DE `RECHAZADA`, `ERROR` o `VERIFICAR` |
| Nota de crédito | `nota-credito/` | Factura `APROBADA`, sin cancelación aprobada ni NC activa |

Las notas de crédito se consultan en `GET /api/notas-credito/` y tienen su
propio estado en `POST /api/notas-credito/{id}/estado/`. El KuDE y el XML
oficiales se descargan con `GET /api/notas-credito/{id}/kude|xml/`.

Variables nuevas:

- `FACTURASEGURA_NC_NUMERO_DESDE` / `FACTURASEGURA_NC_NUMERO_HASTA`: rango
  propio de NC (por defecto `13`–`24`).
- `FACTURASEGURA_CANCELACION_VENTANA_HORAS`: horas desde la emisión en que
  se permite cancelar (por defecto `48`; `0` desactiva el control local).
- `FACTURASEGURA_LOGIN_URL`: opcional; si no se define se deriva de
  `FACTURASEGURA_URL` para `/login?include_auth_token`.

El estado fiscal de la factura pasa a `ANULADA` después de una
cancelación; el resultado se guarda en `estado_cancelacion` y en el
historial de `EventoSIFEN`. La anulación fiscal **no** revierte la caja ni
la operación interna: para eso se usa el flujo administrativo de
cancelación de la operación. Una NC tampoco revierte la caja
automáticamente.

**No se commiteen tokens ni claves reales en el repositorio.**

---

## Troubleshooting

| Problema | Posible causa | Solución |
|---|---|---|
| El backend no levanta | Puerto 8000 ocupado | El script lo omite si ya está en uso; revisá `.run/backend.out.log` |
| El frontend no levanta | Puerto 5173 ocupado | El script lo omite si ya está en uso; revisá `.run/frontend.out.log` |
| Migraciones fallan | Base de datos no accesible | Verifica que Postgres esté corriendo (`docker ps`) |
| El frontend no carga la API | `VITE_API_URL` incorrecto | Revisa `frontend/.env` |
| Health check falla | Backend no respondió | Revisa `.run/backend.out.log` o `docker logs global-exchange-backend-prod` |
| Docker no encontrado | Docker no instalado | Instala Docker y Docker Compose |
| Quedó algo corriendo | Proceso o contenedor previo | Ejecutá `./scripts/deploy.sh stop` |

Ver logs en desarrollo:

```bash
# Windows PowerShell
Get-Content .run\backend.out.log -Tail 50
Get-Content .run\frontend.out.log -Tail 50
```

Ver logs del backend en producción:

```bash
docker logs global-exchange-backend-prod
```

Ver logs de la base de datos:

```bash
docker logs global-exchange-db-prod
```

---

## Rollback

Si el despliegue en producción falla:

1. Detén los contenedores nuevos:
   ```bash
   docker compose -f backend/docker-compose.prod.yml down
   ```
2. Restaura la base de datos desde el backup generado antes del despliegue.
3. Vuelve a la versión anterior del código si es necesario:
   ```bash
   git checkout <commit-anterior>
   ```

---

## Cambios realizados en el código

Para soportar el despliegue en producción se hicieron los siguientes
cambios mínimos (no modifican la lógica de negocio):

1. **`backend/core/settings.py`**: se agregó `STATIC_ROOT` para que
   `collectstatic` funcione en producción con Whitenoise.
2. **`backend/requirements.txt`**: se agregaron `gunicorn` (servidor WSGI)
   y `whitenoise` (servicio de archivos estáticos).
3. **`backend/core/views.py`** y **`backend/core/urls.py`**: se agregó el
   endpoint `GET /api/health/` para el health check de Docker.
4. **`backend/Dockerfile`**: se usa `python:3.13-slim` (Django 6.1 requiere
   Python 3.12 o superior).
5. **`backend/docker-compose.prod.yml`**: se agregó el servicio `frontend`
   (nginx) a la misma red que el backend, en el puerto `8081`.
6. **`frontend/nginx.conf`**: el proxy `/api/` apunta al servicio `web`
   del compose de producción.
7. **`frontend/.env.prod.example`** y archivos `.dockerignore`: plantilla de
   entorno de producción y contexto de build más liviano.
8. Archivos nuevos de despliegue (Dockerfiles, docker-compose, scripts,
   documentación). No afectan el funcionamiento diario de la aplicación.

### Ambiente de producción con ngrok (PI-96)

1. **`docker-compose.prod.yml`** (raíz): base de datos, backend, Keycloak,
   gateway y ngrok; no publica los puertos de la base, el backend ni Keycloak.
2. **`.env.prod.example`** (raíz): una sola plantilla para todo el ambiente.
3. **`frontend/nginx.conf`**: además de `/api/`, publica Keycloak en
   `/auth/` y respeta el `X-Forwarded-Proto` de ngrok.
4. **`frontend/Dockerfile`** y **`frontend/.dockerignore`**: las variables
   `VITE_*` entran como argumentos de build y el `.env` local queda fuera
   de la imagen.
5. **`backend/core/settings.py`** y **`backend/monedas/autenticacion.py`**:
   variable opcional `KEYCLOAK_INTERNAL_URL` para descargar las claves de
   Keycloak por la red interna. Sin ella todo funciona como antes.
6. **`scripts/keycloak_prod_init.py`** y **`deploy/postgres-init/`**:
   configuración de Keycloak posterior al arranque y creación de su base.

---

## Soporte

Si algo falla durante el despliegue, revisa los logs de los contenedores
y verifica que todas las variables de entorno estén configuradas
correctamente. Para dudas sobre el dominio del negocio (facturación,
operaciones, clientes), consulta la documentación CHIA en
`docs/CHIA/`.

## Gestión de facturas: estados finales y PDF

Aplicar las migraciones de facturación antes de iniciar el backend:
`python manage.py migrate`.
La cancelación aprobada cambia la factura a ANULADA; una NC total aprobada
la cambia a DEVUELTA. Estas acciones no revierten caja ni billeteras.
El cajero solo gestiona facturas emitidas por él; el administrador, todas.
La NC utiliza el motivo fijo 5 y el correo de la factura original.

El listado autenticado reconcilia las gestiones pendientes visibles al usuario.
La interfaz vuelve a consultar cada diez segundos mientras haya pendientes;
al cerrar la página no queda un trabajador en segundo plano.
El endpoint GET /api/facturas/{id}/gestion/estado/ permite consultar una sola.
Un rechazo conserva la factura aprobada y muestra el resultado del evento.

Los PDF actualizados se guardan atómicamente en MEDIA_ROOT/facturas/{id}.pdf.
DJANGO_MEDIA_ROOT permite cambiar la ubicación; Docker usa el volumen media.
Si falla la descarga, se conserva el estado fiscal y se bloquea el PDF anterior
hasta que una consulta posterior complete la descarga. Incluir este volumen
en los backups. Los archivos se sirven por el endpoint autenticado de KuDE.
