# Guía de despliegue - Global Exchange (PI-88)

Este documento explica cómo desplegar el proyecto Global Exchange en
desarrollo y producción usando el script automático de despliegue.

## Índice

1. [Resumen](#resumen)
2. [Requisitos previos](#requisitos-previos)
3. [Despliegue en desarrollo (localhost)](#despliegue-en-desarrollo-localhost)
4. [Despliegue en producción (servidor)](#despliegue-en-produccion-servidor)
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
- **Producción**: todo corre en contenedores Docker listos para un servidor
  (VPS, Render, Railway, etc.).

Comandos disponibles:

| Comando | Descripción |
|---|---|
| `./scripts/deploy.sh dev` / `.\scripts\deploy.ps1 dev` | Levanta todo en localhost |
| `./scripts/deploy.sh prod` / `.\scripts\deploy.ps1 prod` | Levanta los contenedores de producción |
| `./scripts/deploy.sh check` / `.\scripts\deploy.ps1 check` | Verifica herramientas y archivos |
| `./scripts/deploy.sh stop` / `.\scripts\deploy.ps1 stop` | Detiene procesos y contenedores |

En PowerShell también podés usar `-DryRun` para ver qué haría sin ejecutar nada:
`.\scripts\deploy.ps1 prod -DryRun`.

No se paga nada específico para desarrollo. Para producción puedes usar
servicios gratuitos o de bajo costo (Render, Railway, etc.).

---

## Requisitos previos

### En tu computadora (desarrollo)

- [Docker](https://www.docker.com/) y Docker Compose
- [Python 3.11+](https://www.python.org/)
- [Node.js 20+](https://nodejs.org/) y npm

### En el servidor (producción)

- Un servidor Linux con Docker y Docker Compose instalados
- Acceso por SSH al servidor
- Opcional: un dominio y un proxy reverso (nginx, Caddy, traefik)

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

## Despliegue en producción (servidor)

### Paso 1: Conéctate al servidor

```bash
ssh usuario@tu-servidor.com
```

### Paso 2: Clona el repositorio

```bash
git clone https://github.com/Sergio270103/Global-Exchange.git
cd Global-Exchange
git checkout develop
```

### Paso 3: Configura el entorno de producción

Copia la plantilla de variables de entorno:

```bash
cp backend/.env.prod.example backend/.env
cp frontend/.env.prod.example frontend/.env
```

Edita `backend/.env` y `frontend/.env` con tus valores reales
(contraseñas, URLs de producción, etc.). En el frontend, `VITE_API_URL=/api`
hace que nginx reenvíe las llamadas al backend dentro de la misma red Docker.

### Paso 4: Ejecuta el despliegue

```bash
./scripts/deploy.sh prod
```

Esto hará lo siguiente:

1. Construirá e iniciará los contenedores de producción: base de datos,
   backend (gunicorn) y frontend (nginx).
2. Aplicará las migraciones de Django.
3. Verificará que el backend responde en `/api/health/`.

Al terminar:

- Frontend: `http://localhost:8081`
- Backend: `http://localhost:8000`
- PostgreSQL: `localhost:5433`

Para detener los contenedores: `./scripts/deploy.sh stop`.

### Paso 5: Configura el acceso público

El script deja los contenedores corriendo. Para exponerlos desde Internet,
configura un proxy reverso (nginx o Caddy) en tu servidor que redirija:

- `http://tu-dominio.com` → frontend (nginx en el contenedor)
- `http://tu-dominio.com/api/` → backend (Django en el contenedor)

Si usas Render, Railway o similar, conecta el repositorio y usa los mismos
comandos de build y start que aparecen en los Dockerfile.

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
