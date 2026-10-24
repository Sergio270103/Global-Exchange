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

1. Levantará PostgreSQL y Keycloak en contenedores Docker.
2. Aplicará las migraciones de Django.
3. Arrancará el backend en `http://localhost:8000`.
4. Arrancará el frontend en `http://localhost:5173`.

Ya puedes acceder a la aplicación.

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
cp frontend/.env.example frontend/.env
```

Edita `backend/.env` y `frontend/.env` con tus valores reales
(contraseñas, URLs de producción, etc.).

### Paso 4: Ejecuta el despliegue

```bash
./scripts/deploy.sh prod
```

Esto hará lo siguiente:

1. Construirá e iniciará los contenedores de producción (backend + base de datos + frontend con nginx).
2. Aplicará las migraciones de Django.
3. Verificará que el backend responde en `/api/health/`.

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
| `VITE_API_URL` | URL del backend | `https://tu-backend.onrender.com/api` |
| `VITE_KEYCLOAK_URL` | URL de Keycloak | `http://localhost:8080` |
| `VITE_KEYCLOAK_REALM` | Realm de Keycloak | `Global-Exchange` |
| `VITE_KEYCLOAK_CLIENT_ID` | Client ID | `global-exchange-frontend` |

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

**No se commiteen tokens ni claves reales en el repositorio.**

---

## Troubleshooting

| Problema | Posible causa | Solución |
|---|---|---|
| El backend no levanta | Puerto 8000 ocupado | Cambia el puerto o libera el proceso |
| Migraciones fallan | Base de datos no accesible | Verifica que Postgres esté corriendo |
| El frontend no carga la API | `VITE_API_URL` incorrecto | Revisa `frontend/.env` |
| Health check falla | Backend no respondió | Revisa los logs: `docker logs global-exchange-backend-prod` |
| Docker no encontrado | Docker no instalado | Instala Docker y Docker Compose |

Ver logs del backend:

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
4. Archivos nuevos de despliegue (Dockerfiles, docker-compose, scripts,
   documentación). No afectan el funcionamiento diario de la aplicación.

---

## Soporte

Si algo falla durante el despliegue, revisa los logs de los contenedores
y verifica que todas las variables de entorno estén configuradas
correctamente. Para dudas sobre el dominio del negocio (facturación,
operaciones, clientes), consulta la documentación CHIA en
`docs/CHIA/`.