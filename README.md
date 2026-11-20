# Global Exchange

Plataforma web para la gestión de una casa de cambio digital: clientes, cotizaciones,
compra y venta de divisas, billeteras, pagos, operación de caja, facturación electrónica
y reportes de ganancias.

Proyecto de la asignatura **Ingeniería de Software 2** — Ingeniería en Informática,
Facultad Politécnica, Universidad Nacional de Asunción (2026).

## Equipo 02

| Integrante | Rol |
|---|---|
| Sergio Enmanuel Gonzalez García | Scrum Master / Desarrollo |
| Enrique Enmanuel David Acosta Brizuela | Desarrollo |
| Johana Beatriz Amante Sosa | Desarrollo |
| Ivana Raquel Escobar Paiva | Desarrollo |

Product Owner: Prof. Ing. Deysi Leguizamón.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Django, Django REST Framework |
| Base de datos | PostgreSQL |
| Autenticación y roles | Keycloak |
| Pagos con tarjeta | Stripe (modo prueba) |
| Facturación electrónica | Factura Segura (SIFEN) |
| Despliegue | Docker, Docker Compose, ngrok |
| Pruebas | Django test (backend), Vitest + Testing Library (frontend) |
| Documentación de código | TypeDoc (frontend), docstrings (backend) |

Roles del sistema: **usuario**, **cajero**, **analista cambiario** y **administrador**.

## Estructura del repositorio

```
Global-Exchange/
├─ backend/                 API REST en Django
│  ├─ core/                 Configuración, URLs y reportes administrativos
│  ├─ clientes/             Clientes, categorías y asociación usuario-cliente
│  ├─ monedas/              Monedas y validación de tokens de Keycloak
│  ├─ cotizaciones/         Cotizaciones vigentes, históricas y evolución
│  ├─ pagos/                Medios de pago, cuentas asociadas y Stripe
│  ├─ billeteras/           Billeteras por moneda y movimientos
│  ├─ operaciones/          Compra/venta, historial, cancelación y ganancias
│  ├─ cajas/                Cajas, turnos, entregas, reposición y operación presencial
│  ├─ comprobantes/         Comprobantes de operación
│  ├─ facturacion/          Facturas electrónicas, KuDE y notas de crédito
│  └─ alertas/              Alertas de tasas y notificaciones
├─ frontend/                Aplicación React + Vite
│  ├─ src/                  Páginas, componentes y servicios
│  ├─ keycloak/themes/      Tema de acceso de Keycloak
│  ├─ realm-export.json     Realm de Keycloak (roles y clientes)
│  └─ docs/PDO/             Documentación de código generada con TypeDoc
├─ scripts/                 Scripts de despliegue automático (deploy.sh / deploy.ps1)
├─ deploy/                  Inicialización de PostgreSQL para producción
├─ docs/                    Guía de despliegue, pruebas, reportes y CHIA
└─ docker-compose.prod.yml  Ambiente de producción
```

## Requisitos

- **Desarrollo:** Docker y Docker Compose, Python 3.11+, Node.js 20+ y npm.
- **Producción:** Docker Desktop y una cuenta gratuita de ngrok con dominio fijo.

## Cómo levantar el proyecto

El despliegue está automatizado con `scripts/deploy.sh` (Linux, macOS, WSL, Git Bash)
y `scripts/deploy.ps1` (Windows PowerShell).

### Desarrollo (localhost)

```bash
git clone https://github.com/Sergio270103/Global-Exchange.git
cd Global-Exchange
./scripts/deploy.sh dev          # Windows: .\scripts\deploy.ps1 dev
```

El script levanta PostgreSQL y Keycloak en Docker, instala dependencias si faltan,
aplica las migraciones y arranca:

- Backend: http://localhost:8000
- Frontend: http://localhost:5173
- Consola de Keycloak: http://localhost:8080/admin/

Antes de la primera ejecución, copiar `backend/.env.example` a `backend/.env` y
`frontend/.env.example` a `frontend/.env`, y completar los valores.

### Producción (Docker + ngrok)

```bash
cp .env.prod.example .env.prod   # completar dominio de ngrok, claves de Stripe, etc.
./scripts/deploy.sh check        # verifica herramientas y variables
./scripts/deploy.sh prod         # Windows: .\scripts\deploy.ps1 prod
```

Otros comandos: `status`, `logs [servicio]` y `stop`.
El paso a paso completo, las variables de entorno, el webhook de Stripe y la
solución de problemas están en [`docs/DEPLOY.md`](docs/DEPLOY.md).

> Los archivos `.env` y `.env.prod` contienen credenciales y **no** se suben al repositorio.

## Pruebas

Backend:

```bash
cd backend
python manage.py test --settings=core.settings_test
```

Frontend:

```bash
cd frontend
npm test                 # ejecuta las pruebas con Vitest
npm run test:coverage    # pruebas con reporte de cobertura
npx tsc --noEmit         # comprobación de tipos
```

## Documentación

| Documento | Ubicación |
|---|---|
| Documentación de código (frontend) | `frontend/docs/PDO/` — se regenera con `npm run docs` dentro de `frontend` |
| Guía de despliegue | [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| Reportes administrativos | [`docs/reportes-pi91.md`](docs/reportes-pi91.md) |
| Procedimientos de prueba | `docs/PRUEBAS-PI-*.md` |
| Conversaciones con IA (CHIA) | [`docs/CHIA/`](docs/CHIA/) |

## Flujo de trabajo (Git Flow)

- `main`: versiones entregadas. Cada sprint se marca con un tag de release (`0.1.0`, `0.2.0`, …).
- `develop`: rama de integración.
- `feature/PI-XX`: una rama por historia de usuario de Jira, creada desde `develop`
  y cerrada al integrarse.

```bash
git flow feature start PI-XX
# ... commits ...
git flow feature finish PI-XX
```

La planificación de épicas, historias de usuario y sprints se gestiona en Jira.
