# PI-27 — Pagos digitales con operaciones reales

Rama: `feature/PI-27`. Sin migraciones nuevas.

La pantalla consulta `/api/operaciones/` y el catálogo de métodos de pago.
Cada fila representa una operación, incluso si está pendiente o cancelada;
el importe es el enviado, en su moneda de origen. Los filtros de pantalla
se aplican sobre los datos autorizados por el backend. Las tarjetas cuentan
las mismas operaciones que muestra la tabla. El administrador puede consultar
todos los clientes; el usuario consulta el cliente activo de la barra superior.
El endpoint también admite `?metodo=`, combinado con sus filtros existentes.

## Entorno local preparado

Abrir http://localhost:5173. Usuarios `sergio` (usuario) y `enrique` (admin),
ambos con contraseña `123`. Son credenciales del entorno local, no se crean
con esta funcionalidad ni se incluyen en el export de Keycloak.

Se cargaron seis operaciones demostrativas en PostgreSQL local, sin efectuar
cobros ni transferencias reales. La pantalla no contiene pagos prefijados.

| Cliente | Operación | Método | Estado |
|---|---|---|---|
| PI19 Cliente A | OP-1 | Transferencia | Pagada |
| PI19 Cliente A | OP-2 | Tarjeta | Pendiente |
| PI19 Cliente A | OP-3 | Billetera | Cancelada |
| PI19 Cliente B | OP-4 | Billetera | Pagada |
| PI19 Cliente B | OP-5 | Transferencia | Pendiente |
| PI19 Cliente C | OP-6 | Tarjeta | Pagada |

Estas filas son datos locales para demostración: sus estados no prueban
integración con Stripe ni movimientos financieros.

## Flujo manual

1. Ingresar como Sergio y abrir **Pagos Digitales**. Con Cliente A activo,
   aparecen OP-1/2/3; C nunca debe aparecer en el selector superior.
2. Filtrar por **Pendiente**: queda OP-2, la tarjeta de Tarjeta cuenta 1 y
   las demás cuentan 0. Combinar con Transferencia: aparece el mensaje vacío.
3. Limpiar filtros y cambiar arriba a Cliente B: aparecen OP-4/5, sin filas
   del cliente anterior. Los filtros se restablecen al cambiar el cliente.
4. Ingresar como Enrique y abrir **Pagos Digitales**: aparecen las seis
   operaciones. El filtro **Cliente** permite elegir A, B o C. Combinar
   cliente, estado y método y comprobar que tabla y tarjetas coinciden.
5. Elegir **Anulada**: no hay operaciones, se muestra mensaje y tarjetas en 0.
6. Para consultar cambios recientes, pulsar **Actualizar**.

## Método deshabilitado

Usar dos sesiones de navegador (por ejemplo, normal e incógnito):

1. Como Sergio, preparar una compra por transferencia y dejarla pendiente
   de confirmación. No hace falta usar tarjeta ni efectuar un cobro real.
2. Como Enrique, en **Configuración del Sistema**, deshabilitar el método
   Transferencia bancaria.
3. Confirmar la operación pendiente en la sesión de Sergio: el backend
   responde 400 con “El método de pago no existe o está deshabilitado.
   Seleccioná otro método habilitado.” La operación no se confirma.
4. Una nueva operación con ese método también se rechaza. Manipular la API
   para enviar `metodo_pago: "inventado"` o vacío obtiene el mismo rechazo.
5. Los pagos históricos por transferencia siguen visibles en Pagos Digitales.
6. Volver a habilitar Transferencia al terminar para dejar el entorno operativo.

El efectivo de ventanilla mantiene su tratamiento especial para cajeros.
La confirmación de webhooks de un cobro ya realizado no se bloquea: conserva
la conciliación existente del sistema.

## Validación automatizada

Desde la raíz:

```powershell
.\backend\venv\Scripts\python.exe backend/manage.py test operaciones pagos cajas --noinput
```

Desde `frontend` (se puede usar el Node incluido en Codex):

```powershell
node node_modules/vitest/vitest.mjs run src/pages/Payments.test.tsx src/services/operaciones.test.ts src/App.test.tsx src/components/Sidebar.test.tsx src/components/Navbar.test.tsx src/pages/BuySell.test.tsx
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Resultado: 230 tests backend, 47 tests frontend, TypeScript y build aprobados.
Prueba de navegador con Keycloak real: Sergio consulta y cambia A/B, filtra y
ve tarjetas consistentes; Enrique ve todas las operaciones, filtra por cliente
y obtiene el estado vacío. No se realizó ningún cobro externo.
