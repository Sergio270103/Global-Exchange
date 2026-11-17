# PI-19 — Cuentas bancarias por cliente asociado

Rama: `feature/PI-19`. No requiere migraciones nuevas.

La pantalla usa el cliente activo de la barra superior. La API comprueba la
asociación `ClienteUsuario.keycloak_id` contra el `sub` del usuario autenticado.
El rol administrador no evita esta comprobación en cuentas bancarias.

## Preparar la prueba manual

Usar el entorno de desarrollo, con PostgreSQL, Keycloak, backend y frontend.
La guía general está en [DEPLOY.md](DEPLOY.md). Con Docker Desktop abierto y
Node/npm disponibles, desde la raíz del proyecto:

```powershell
.\scripts\deploy.ps1 dev
```

Abrir `http://localhost:5173`. El backend usa `http://localhost:8000` y
Keycloak `http://localhost:8080` por defecto.

Preparar estos datos desde la administración:

| Usuario Keycloak | Clientes asociados | Cuenta de ejemplo |
|---|---|---|
| Usuario A, rol user | Cliente A y Cliente B | Una cuenta distinta en cada cliente |
| Usuario B, rol user | Cliente C | Una cuenta del Cliente C |
| Usuario sin asociaciones, rol user | Ninguno | Ninguna |

Crear los clientes en **Clientes** y las asociaciones en **Usuarios**.
El campo `sub de Keycloak` debe ser el ID real del usuario en Keycloak,
no su nombre ni correo. Para crear las cuentas de ejemplo, ingresar como
el usuario asociado y seleccionar cada cliente en la barra superior.
Anotar los IDs de clientes y cuentas para las pruebas de API.

## Prueba en pantalla

1. Ingresar como Usuario A y abrir **Cuentas Bancarias**.
2. Seleccionar Cliente A en la barra superior: solo aparecen sus cuentas.
   La pantalla ya no tiene un segundo selector de clientes.
3. Cambiar a Cliente B: desaparecen las cuentas de A y se cargan las de B.
4. Agregar, editar y eliminar una cuenta de B; volver a A y comprobar que
   sus cuentas siguen iguales. Eliminar conserva la baja lógica existente.
5. Abrir un formulario de edición o confirmación de eliminación y cambiar
   de cliente: el diálogo anterior se cierra.
6. Con Network de DevTools en conexión lenta, alternar A/B rápidamente:
   una respuesta tardía de A no debe reemplazar las cuentas de B.
7. Cerrar sesión e ingresar como el usuario sin asociaciones: no se muestran
   cuentas y el botón para agregar está deshabilitado. Los clientes de demo
   que conserva la barra superior no habilitan operaciones bancarias.

## Prueba directa de API

Usar el token del **Usuario A**, no el token del administrador. En DevTools,
Network, una petición a `cuentas-bancarias` contiene la cabecera
`Authorization: Bearer ...`; se puede reproducir con un cliente HTTP.
No guardar ese token en el repositorio.

| Petición | Resultado esperado |
|---|---|
| `GET /api/cuentas-bancarias/?cliente=<A>` | 200, solo cuentas de A |
| `GET /api/cuentas-bancarias/?cliente=<B>` | 200, solo cuentas de B |
| `GET /api/cuentas-bancarias/` | 200, solo cuentas de clientes asociados A/B |
| `GET /api/cuentas-bancarias/?cliente=<C>` | 404 |
| `GET /api/cuentas-bancarias/<cuenta-C>/` | 404 |
| `POST /api/cuentas-bancarias/` con cliente C y campos válidos | 403, no crea nada |
| `PUT` o `PATCH /api/cuentas-bancarias/<cuenta-C>/` | 404, no modifica nada |
| `DELETE /api/cuentas-bancarias/<cuenta-C>/` | 404, no desactiva nada |
| `PATCH /api/cuentas-bancarias/<cuenta-A>/` con `{"cliente": <C>}` | 403, conserva el cliente A |

Para el POST usar el mismo cuerpo de una creación válida y reemplazar solo
`cliente` por el ID de C. Esto evita confundir errores de validación con
la comprobación de permisos. Repetir con un administrador sin asociación:
tampoco debe poder acceder a cuentas ajenas.

## Pruebas automatizadas

Desde la raíz, con PostgreSQL configurado y disponible:

```powershell
.\backend\venv\Scripts\python.exe backend/manage.py test pagos --noinput
```

Frontend, desde `frontend`:

```powershell
npm test -- src/pages/Banks.test.tsx src/services/cuentas.test.ts src/App.test.tsx
npm run build
```

Si npm todavía no está en PATH, en esta máquina se pueden ejecutar directamente
los archivos instalados usando el Node incluido con Codex (desde la raíz):

```powershell
$nodePI19 = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
Push-Location frontend
& $nodePI19 node_modules/vitest/vitest.mjs run src/pages/Banks.test.tsx src/services/cuentas.test.ts src/App.test.tsx
& $nodePI19 node_modules/vite/bin/vite.js build
Pop-Location
```

Para repetir solo las pruebas de permisos sin PostgreSQL, desde la raíz:

```powershell
@'
import os
import sys
sys.path.insert(0, 'backend')
os.environ['DJANGO_SETTINGS_MODULE'] = 'core.settings'
from django.conf import settings
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
import django
django.setup()
from django.core.management import call_command
call_command('test', 'pagos', interactive=False, verbosity=2)
'@ | .\backend\venv\Scripts\python.exe -
```

Esta alternativa aplica las migraciones en una base temporal y ejecuta las
mismas pruebas, pero no sustituye la validación con PostgreSQL y Keycloak.

## Validación realizada

- Frontend: 19 pruebas seleccionadas aprobadas.
- TypeScript: comprobación `tsc --noEmit` aprobada.
- Build de producción: correcto; Vite informa avisos de configuración y tamaño de bundles.
- Backend: 13 pruebas de pagos aprobadas con SQLite temporal, incluidas 10 de PI-19.
- PostgreSQL 18 instalado localmente: migraciones aplicadas y las 13 pruebas de pagos aprobadas.
- Navegador con Keycloak real: login A/B, cambio de cliente, aislamiento de cuentas,
  rechazo por API de lectura/creación/edición/baja y reasignación ajenas comprobados.
- Usuario sin asociaciones: sin cuentas y creación deshabilitada, comprobado en navegador.
- La integración a develop conserva un commit de merge (`--no-ff`).
