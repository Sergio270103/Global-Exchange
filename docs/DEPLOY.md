# Guía de despliegue - Global Exchange (PI-88 / PI-92)

Este documento explica cómo desplegar el proyecto Global Exchange en
desarrollo y producción usando el script automático de despliegue.

## Índice

1. [Resumen](#resumen)
2. [Requisitos previos](#requisitos-previos)
3. [Despliegue en desarrollo (localhost)](#despliegue-en-desarrollo-localhost)
4. [Despliegue en producción (Docker + ngrok)](#despliegue-en-producción-docker--ngrok)
5. [Variables de entorno](#variables-de-entorno)
6. [Facturación electrónica (PI-30) en modo simulado y real](#facturacion-electronica-pi-30)
7. [Troubleshooting](#troubleshooting)
8. [Rollback](#rollback)
9. [Cambios realizados en el código](#cambios-realizados-en-el-codigo)

---

## Resumen

El proyecto se puede levantar con un solo comando gracias a
`scripts/deploy.sh` (Linux/macOS/WSL/Git Bash) o
`scripts/deploy.ps1` (Windows PowerShell).

- **Desarrollo**: todo corre en tu computadora (`localhost`).
- **Producción**: todo corre en contenedores Docker y queda publicado en
  internet, fuera de `localhost`, con una dirección fija de ngrok.

Comandos disponibles:

| Comando | Descripción |
|---|---|
| `./scripts/deploy.sh dev` / `.\scripts\deploy.ps1 dev` | Levanta todo en localhost |
| `./scripts/deploy.sh prod` / `.\scripts\deploy.ps1 prod` | Levanta el ambiente de producción completo |
| `./scripts/deploy.sh status` / `.\scripts\deploy.ps1 status` | Estado de los contenedores de producción |
| `./scripts/deploy.sh logs [servicio]` / `.\scripts\deploy.ps1 logs [servicio]` | Logs de producción (`db`, `web`, `keycloak`, `gateway`, `ngrok`) |
| `./scripts/deploy.sh check` / `.\scripts\deploy.ps1 check` | Verifica herramientas, archivos y `.env.prod` |
| `./scripts/deploy.sh stop` / `.\scripts\deploy.ps1 stop` | Detiene procesos y contenedores |

Para ver qué haría sin ejecutar nada: `./scripts/deploy.sh --dry-run prod`
o `.\scripts\deploy.ps1 prod -DryRun`.

No se paga nada: Docker, el plan gratuito de ngrok, Stripe en modo prueba
y Factura Segura en el ambiente de TEST alcanzan para todo el despliegue.

---

## Requisitos previos

### Desarrollo

- [Docker](https://www.docker.com/) y Docker Compose
- [Python 3.11+](https://www.python.org/)
- [Node.js 20+](https://nodejs.org/) y npm

### Producción

- [Docker Desktop](https://www.docker.com/) abierto (no hace falta Python ni
  Node: todo se construye dentro de los contenedores).
- Una cuenta gratuita de [ngrok](https://dashboard.ngrok.com/) con su dominio
  fijo (`algo.ngrok-free.dev`) y su authtoken.
- Las claves de prueba de Stripe y, si se va a facturar de verdad, el token
  de Factura Segura.

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

### Tema de acceso de Keycloak

El tema Global Exchange se monta desde `frontend/keycloak/themes/global-exchange`
al crear el contenedor. En una instalación nueva, el realm se importa con el
tema activo y el español como idioma predeterminado. En producción, la tarea
`keycloak-init` también actualiza el tema de un realm existente.

En desarrollo, si Keycloak ya estaba instalado, recrea el contenedor desde la
raíz del repositorio para que cargue el tema. Docker conserva el volumen
`keycloak_data`.

```powershell
docker compose -f frontend/docker-compose.yml up -d --force-recreate keycloak
```

Abre la consola de Keycloak en `http://localhost:8080/admin/` y selecciona el
realm `Global-Exchange`. En **Realm settings → Themes**, selecciona
`global-exchange` en **Login theme**. En **Localization**, habilita
**Internationalization** y configura `es` como idioma disponible y
predeterminado. En **General**, establece **Display name** a `Global Exchange`.
Guarda los cambios en cada pestaña.

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

## Despliegue en producción (Docker + ngrok)

El ambiente de producción es la computadora donde se ejecuta el script. El
sistema completo queda detrás de **una sola dirección pública**:

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

Producción usa una base de datos y un Keycloak **propios**: no comparte
datos con el modo desarrollo y ambos pueden estar levantados a la vez.

### Paso 1: generar `.env.prod`

```bash
./scripts/deploy.sh prod        # Windows: .\scripts\deploy.ps1 prod
```

La primera vez el script copia `.env.prod.example` a `.env.prod`, genera las
claves internas (Django, PostgreSQL y administrador de Keycloak) y se
detiene indicando qué falta completar. `.env.prod` no se commitea.

### Paso 2: completar `.env.prod`

| Variable | Qué poner | Dónde se consigue |
|---|---|---|
| `NGROK_DOMAIN` | El dominio fijo, sin `https://` | <https://dashboard.ngrok.com/domains> |
| `NGROK_AUTHTOKEN` | El authtoken de la cuenta | <https://dashboard.ngrok.com/get-started/your-authtoken> |
| `KEYCLOAK_SMTP_PASSWORD` | Contraseña de aplicación de Gmail de la cuenta que envía los correos de verificación | La cuenta de Gmail del proyecto |
| `USUARIOS_INICIALES` | Usuarios a crear con su rol: `usuario:correo:contraseña:rol;...` | Los define el equipo |
| `STRIPE_SECRET_KEY` | Clave secreta de **prueba** (`sk_test_...`) | <https://dashboard.stripe.com/test/apikeys> |
| `STRIPE_WEBHOOK_SECRET` | Secreto del webhook (`whsec_...`) | Ver paso 3 |
| `FACTURASEGURA_*` | Modo, token y rango de números | Ver [Facturación electrónica](#facturación-electrónica-pi-30) |

El resto de las variables ya viene con valores que funcionan.

### Paso 3: registrar el webhook de Stripe (una sola vez)

Como el dominio de ngrok es fijo, el webhook se registra una vez y queda:

1. Entrar a <https://dashboard.stripe.com/test/webhooks> y agregar un destino
   (endpoint) con la URL `https://<NGROK_DOMAIN>/api/payments/webhook/`.
2. Elegir los eventos `checkout.session.completed`,
   `checkout.session.expired`, `checkout.session.async_payment_succeeded` y
   `checkout.session.async_payment_failed`.
3. Copiar el *signing secret* (`whsec_...`) a `STRIPE_WEBHOOK_SECRET`.

En producción no hace falta `stripe listen`: Stripe llama directo a la URL
pública.

### Paso 4: desplegar

```bash
./scripts/deploy.sh prod        # Windows: .\scripts\deploy.ps1 prod
```

El script:

1. Revisa `.env.prod` y corta si falta algo o si la clave de Stripe es real.
2. Construye las imágenes y levanta todos los contenedores.
3. Espera al backend (las migraciones se aplican solas).
4. Configura Keycloak: agrega la dirección pública al cliente del frontend,
   carga la contraseña SMTP y crea los usuarios iniciales.
5. Comprueba desde afuera que `https://<NGROK_DOMAIN>` responde.

Al terminar muestra las direcciones:

- Aplicación: `https://<NGROK_DOMAIN>`
- Consola de Keycloak: `https://<NGROK_DOMAIN>/auth/admin/`
  (usuario y contraseña: `KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD`)
- Webhook de Stripe: `https://<NGROK_DOMAIN>/api/payments/webhook/`

La primera vez tarda varios minutos (descarga y construye las imágenes). Las
siguientes veces el mismo comando solo reconstruye lo que cambió.

> **Aviso de ngrok.** En el plan gratuito, la primera vez que un navegador
> entra a la dirección aparece una página de ngrok con el botón
> **Visit Site**. Es normal: se acepta una vez por navegador y dura 7 días.

### Operación diaria

| Quiero... | Comando |
|---|---|
| Ver si está todo arriba | `./scripts/deploy.sh status` |
| Ver los logs de un servicio | `./scripts/deploy.sh logs web` |
| Apagar (los datos se conservan) | `./scripts/deploy.sh stop` |
| Volver a encender | `./scripts/deploy.sh prod` |
| Publicar una versión nueva del código | `git pull` y de nuevo `./scripts/deploy.sh prod` |

Los contenedores tienen `restart: unless-stopped`: si se reinicia la
computadora, vuelven a levantarse solos al abrir Docker Desktop.

### Túnel manual (sin el contenedor de ngrok)

Si `NGROK_AUTHTOKEN` queda vacío, el script levanta todo menos el túnel y
muestra el comando para abrirlo con el ngrok instalado en la computadora:

```bash
ngrok http --url=https://<NGROK_DOMAIN> 8081
```

### Empezar de cero

Para borrar **todos los datos** de producción (base de datos, usuarios de
Keycloak y archivos) y volver a desplegar desde cero:

```bash
docker compose -p global-exchange-prod down -v
./scripts/deploy.sh prod
```

Hace falta, por ejemplo, si se cambia `POSTGRES_PASSWORD` o
`KEYCLOAK_ADMIN_PASSWORD` después del primer despliegue (esas claves solo se
aplican cuando se crean las bases).

---

## Variables de entorno

### Desarrollo: `backend/.env` y `frontend/.env`

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DJANGO_SECRET_KEY` | Clave secreta de Django | `cambiar-por-una-clave-larga` |
| `DJANGO_DEBUG` | Modo depuración | `True` |
| `DJANGO_ALLOWED_HOSTS` | Hosts permitidos | `localhost,127.0.0.1` |
| `POSTGRES_*` | Credenciales de la base de datos | ver `backend/.env.example` |
| `KEYCLOAK_*` | Configuración de Keycloak | ver `backend/.env.example` |
| `FACTURASEGURA_*` | Configuración de Factura Segura (PI-30) | ver `backend/.env.example` |
| `VITE_API_URL` | URL del backend | `http://127.0.0.1:8000/api` |
| `VITE_KEYCLOAK_URL` | URL de Keycloak | `http://localhost:8080` |
| `VITE_KEYCLOAK_REALM` | Realm de Keycloak | `Global-Exchange` |
| `VITE_KEYCLOAK_CLIENT_ID` | Client ID | `global-exchange-frontend` |

### Producción: `.env.prod` (raíz del repositorio)

Un solo archivo configura todos los contenedores; la plantilla comentada
es `.env.prod.example`. A partir de `NGROK_DOMAIN`, `docker-compose.prod.yml`
arma solo todo lo que depende de la dirección pública:

| Se calcula | Valor |
|---|---|
| `KEYCLOAK_URL` (issuer de los tokens) | `https://<NGROK_DOMAIN>/auth` |
| `KEYCLOAK_INTERNAL_URL` (descarga de claves JWKS) | `http://keycloak:8080/auth` |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` | `https://<NGROK_DOMAIN>` |
| `DJANGO_ALLOWED_HOSTS` | `<NGROK_DOMAIN>,localhost,127.0.0.1` |
| `VITE_API_URL` / `VITE_KEYCLOAK_URL` (build del frontend) | `/api` / `https://<NGROK_DOMAIN>/auth` |
| `POSTGRES_HOST`, `DJANGO_DEBUG` | `db`, `False` |

---

## Facturación electrónica (PI-30)

El proyecto incluye la integración con Factura Segura (PI-30). La plantilla
de producción viene en **modo simulado** (`FACTURASEGURA_MODO=simulado`), lo
que significa que:

- No llama a la API externa.
- No gasta números de factura asignados.
- Es seguro para desarrollo y pruebas.

Para usar el modo real:

1. Configura `FACTURASEGURA_MODO=real`.
2. Agrega tu token de Factura Segura en `FACTURASEGURA_TOKEN`.
3. Completa los datos del emisor (`FACTURASEGURA_RUC`, `FACTURASEGURA_NOMBRE`, etc.).
4. Confirma con la cátedra que los datos del emisor están correctos antes de emitir facturas reales.

**Cuidado con los números en producción.** El despliegue nunca emite
facturas: solo se emite cuando un usuario lo pide desde la pantalla de
facturas. Pero la base de producción es nueva y no sabe qué números ya se
usaron en desarrollo, así que el sistema empezaría de nuevo desde
`FACTURASEGURA_NUMERO_DESDE`. Antes de pasar a modo `real`, poné en
`FACTURASEGURA_NUMERO_DESDE` (y en `FACTURASEGURA_NC_NUMERO_DESDE`) el
primer número que todavía **no** se usó; el script muestra el rango
configurado cada vez que despliega en modo real.

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

### Desarrollo

| Problema | Posible causa | Solución |
|---|---|---|
| El backend no levanta | Puerto 8000 ocupado | El script lo omite si ya está en uso; revisá `.run/backend.out.log` |
| El frontend no levanta | Puerto 5173 ocupado | El script lo omite si ya está en uso; revisá `.run/frontend.out.log` |
| Migraciones fallan | Base de datos no accesible | Verifica que Postgres esté corriendo (`docker ps`) |
| El frontend no carga la API | `VITE_API_URL` incorrecto | Revisa `frontend/.env` |
| Health check falla | Backend no respondió | Revisa `.run/backend.out.log` |
| Docker no encontrado | Docker no instalado | Instala Docker y Docker Compose |
| Quedó algo corriendo | Proceso o contenedor previo | Ejecutá `./scripts/deploy.sh stop` |

Ver logs en desarrollo:

```bash
# Windows PowerShell
Get-Content .run\backend.out.log -Tail 50
Get-Content .run\frontend.out.log -Tail 50
```

### Producción

| Problema | Posible causa | Solución |
|---|---|---|
| "Docker no está corriendo" | Docker Desktop cerrado | Abrilo y volvé a ejecutar |
| El backend no queda arriba | Error en migraciones o en `.env.prod` | `./scripts/deploy.sh logs web` |
| La dirección pública no responde | Authtoken o dominio mal copiados, u otro ngrok abierto con el mismo dominio | `./scripts/deploy.sh logs ngrok`; cerrá el otro ngrok |
| "No se pudo iniciar sesión como admin en Keycloak" | Se cambió `KEYCLOAK_ADMIN_PASSWORD` después del primer despliegue | Volver a la clave original o [empezar de cero](#empezar-de-cero) |
| El backend no conecta a la base | Se cambió `POSTGRES_PASSWORD` después del primer despliegue | Ídem |
| No llega el correo de verificación | `KEYCLOAK_SMTP_PASSWORD` vacío o vencido | Cargar la contraseña de aplicación y volver a ejecutar `prod` |
| El login vuelve con "Invalid redirect uri" | Se cambió `NGROK_DOMAIN` | Volver a ejecutar `prod` (reconstruye el frontend y actualiza Keycloak) |
| El pago queda pendiente | Webhook de Stripe sin registrar o `STRIPE_WEBHOOK_SECRET` incorrecto | Ver el paso 3 del despliegue |
| Puerto 8081 ocupado | Otro programa lo usa | Cambiar `GATEWAY_PORT` en `.env.prod` |

Ver logs en producción:

```bash
./scripts/deploy.sh logs            # resumen de todos los servicios
./scripts/deploy.sh logs web        # backend
./scripts/deploy.sh logs keycloak
```

---

## Rollback

Si una versión nueva falla en producción:

1. Volvé a la versión anterior del código:
   ```bash
   git checkout <commit-anterior>
   ```
2. Ejecutá de nuevo `./scripts/deploy.sh prod`: reconstruye las imágenes con
   ese código. Los datos (volúmenes) no se tocan.
3. Si la versión fallida aplicó migraciones que hay que deshacer, restaurá
   la base desde un backup previo. Para sacar un backup:
   ```bash
   docker compose -p global-exchange-prod exec -T db pg_dump -U postgres -f /tmp/backup.sql global_exchange_bd
   docker compose -p global-exchange-prod cp db:/tmp/backup.sql ./backup.sql
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
5. **`frontend/nginx.conf`**: el proxy `/api/` apunta al servicio `web`
   del compose de producción.
6. Archivos `.dockerignore`: contexto de build más liviano.
7. Archivos nuevos de despliegue (Dockerfiles, docker-compose, scripts,
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

### Script de despliegue de producción (PI-92)

1. **`scripts/deploy.sh`** y **`scripts/deploy.ps1`**: el modo `prod`
   levanta el ambiente de PI-96 con un solo comando (crea `.env.prod`,
   valida la configuración, configura Keycloak y comprueba la dirección
   pública). Se agregaron `status` y `logs`. El modo `dev` no cambió.
2. Se quitaron `backend/docker-compose.prod.yml`, `backend/.env.prod.example`
   y `frontend/.env.prod.example`, reemplazados por `docker-compose.prod.yml`
   y `.env.prod.example` de la raíz.
3. **`.gitattributes`**: los `.sh` siempre con fin de línea LF.

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
