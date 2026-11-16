# CHIA – PI-96: Configuración del servidor anfitrión (Host) para el entorno de producción

| Campo | Detalle |
|---|---|
| Hito | Hito 8 (Sprint 6) |
| Historia (Jira) | PI-96 – Configuración del servidor anfitrión (Host) para entorno de producción |
| Relacionada con | PI-92 (script de despliegue), PI-30 (factura electrónica), pagos con Stripe |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 16/11/2026 |

## 1. Objetivo

La PO pidió que el ambiente de producción del Hito 8 esté **fuera de
localhost**. Se pidió a la IA preparar la computadora propia como servidor
anfitrión, publicada en internet con ngrok, con todo el sistema: backend,
frontend, Keycloak, Stripe y Factura Segura, cuidando de no gastar emisiones
de Factura Segura ni mover dinero real. La IA solo tuvo acceso de lectura al
repositorio y entregó los cambios como un *patch*.

## 2. Solución

Todo el sistema queda detrás de una sola dirección pública de ngrok:

```
Internet -> ngrok -> gateway (nginx) -> /       frontend
                                        /api/   backend (Django + gunicorn)
                                        /auth/  Keycloak
```

- **`docker-compose.prod.yml`** (raíz): `db`, `web`, `keycloak`, `gateway`,
  `ngrok` y la tarea `keycloak-init`. Solo el gateway publica un puerto
  (`127.0.0.1:8081`), así producción y desarrollo no chocan.
- **`.env.prod`** (plantilla `.env.prod.example`): un único archivo. A partir
  de `NGROK_DOMAIN` el compose calcula las URLs del backend, de Keycloak y
  del build del frontend.
- **`frontend/nginx.conf`** y **`frontend/Dockerfile`**: el gateway publica
  `/api/` y `/auth/`; las variables `VITE_*` entran como argumentos de build.
- **`scripts/keycloak_prod_init.py`**: después del arranque agrega la URL
  pública al cliente del frontend, carga la contraseña SMTP (el export la
  trae enmascarada) y crea los usuarios iniciales con su rol.
- **Backend**: variable opcional `KEYCLOAK_INTERNAL_URL` para bajar las
  claves JWKS por la red interna de Docker; el `issuer` del token se sigue
  validando contra la URL pública.

Los pasos para levantarlo están en `docs/DEPLOY.md`.

## 3. Decisiones

| Decisión | Motivo |
|---|---|
| Una sola dirección para frontend, API y Keycloak | El plan gratuito de ngrok da un único dominio fijo; además evita CORS |
| Keycloak en `/auth` con `KC_HOSTNAME` fijo | Los enlaces de los correos y los tokens salen siempre con el dominio público |
| Keycloak en modo `start` con PostgreSQL | `start-dev` y la base H2 no son para producción |
| Base de datos y Keycloak propios de producción | Un ambiente limpio, separado de los datos de desarrollo |
| ngrok en un contenedor (con túnel manual como alternativa) | Que el ambiente se levante completo con Docker |
| Webhook de Stripe registrado en el panel, no `stripe listen` | El dominio es fijo: se registra una vez |
| Factura Segura en `simulado` por defecto | La base nueva no conoce los números ya usados en desarrollo |
| Secretos solo en `.env.prod` (ignorado por git) | No commitear tokens ni claves |

## 4. Verificación

La IA no tenía acceso a la computadora anfitriona ni podía descargar las
imágenes de Docker, así que probó cada parte por separado en su entorno:

- **Keycloak 26.7.2 real** (misma versión, modo `start`, PostgreSQL, `/auth`
  y `KC_HOSTNAME` público): importa el realm y `keycloak_prod_init.py`
  configura cliente, SMTP y usuarios; la segunda ejecución no duplica nada.
- **nginx** con el `nginx.conf` nuevo, delante del backend y de Keycloak:
  login completo (authorization code + PKCE) con las cabeceras que agrega
  ngrok, token con `issuer` público aceptado por la API y webhook de Stripe
  enrutado (firma inválida → 400, evento de prueba firmado localmente → 200).
- **Backend:** 3 pruebas nuevas en `monedas/test_jwks_interno.py`; todo el
  proyecto en verde (313 pruebas).
- **Frontend:** `npm run build` con las variables de producción.
- **Compose:** `docker compose config` valida el archivo.

No se llamó a Stripe ni a Factura Segura en ninguna prueba: no se gastó
ninguna emisión. **Queda por hacer en la computadora anfitriona** la primera
corrida completa con Docker y ngrok reales.
