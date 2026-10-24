# CHIA – PI-79: Apertura y cierre de caja

| Campo | Detalle |
|---|---|
| Hito | Sprint 4 (08/10 – 12/10/2026) |
| Historia (Jira) | PI-79 – Apertura y cierre de caja |
| Requerimientos | Propuestos para el ERS: RF65 (apertura) y RF66 (cierre con recuento por moneda) |
| Relacionada con | PI-43 (entregas de billetes), PI-78 (saldo por divisa), PI-75 (operación presencial) |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 09/10/2026 |

## 1. Objetivo

La Product Owner pidió, en la pizarra del 09/10/2026, que el cajero trabaje
con **apertura y cierre** de caja:

- **Apertura:** el dinero con el que empieza (euros, guaraníes, dólares…).
- Durante el día, las operaciones.
- **Cierre:** el recuento final de cada moneda.

Criterios de aceptación:

1. La caja se abre al confirmar la entrega inicial de billetes del administrador (PI-43).
2. Solo se puede operar con la caja abierta.
3. El cierre pide el recuento final del total de cada moneda.
4. Compara lo contado con el saldo del sistema y registra las diferencias (faltante o sobrante).
5. Guarda la fecha y hora de apertura y de cierre y el cajero responsable; una vez cerrada, no se opera hasta una nueva apertura.

## 2. Decisión consultada

**¿Qué pasa con el efectivo al cerrar?** Se eligió que **se devuelve a tesorería**:
el saldo queda en 0 y la caja del día siguiente empieza solo con la nueva
entrega del administrador. Coincide con la pizarra ("dinero con lo que
empieza" → operaciones → "recuento final") y evita que el saldo de un turno
se mezcle con el del siguiente.

## 3. Solución

### Backend (`backend/cajas/`)

- **Modelo `TurnoCaja`:**
  - Caja, cajero responsable, entrega de apertura, fecha y hora de apertura, fecha y hora de cierre, quién cerró y recuento de cierre.
  - Una restricción en la base de datos impide que haya **más de un turno abierto por caja**.
- **`MovimientoCaja`:**
  - Nuevo tipo `DEVOLUCION` ("Devolución a tesorería").
  - Cada movimiento queda asociado a su turno.
- **Servicios:**
  - **`confirmar_entrega`:**
    - Si la caja está cerrada, crea el turno: es la **apertura**.
    - Si ya está abierta, la entrega es una **reposición**.
    - Si la caja está abierta por otro cajero, no deja confirmar.
  - **`registrar_movimiento`:** rechaza ingresos y retiros con la caja cerrada (`CajaCerrada`). Esto también vale para PI-75, que usa esta misma función.
  - **`registrar_arqueo`:** el arqueo intermedio requiere la caja abierta y no la cierra.
  - **`cerrar_caja`:**
    1. Registra el recuento final (sistema vs. contado por moneda, con diferencias).
    2. Registra una devolución por cada moneda con saldo, que queda en 0.
    3. Cierra el turno.
- **API:**
  - `GET /api/cajas/{id}/turno/`: turno abierto, o `null` si la caja está cerrada.
  - `GET /api/cajas/{id}/turnos/`: historial de aperturas y cierres.
  - `POST /api/cajas/{id}/cerrar/`: cierre de caja.
  - `GET /api/cajas/` ahora incluye `abierta` y `turno_actual`.
- **Migración:** `0007_apertura_y_cierre`.

### Frontend

- **`pages/cashier/CashCountView.tsx`:**
  - Indicador "Caja abierta desde las HH:MM · cajero" o "Caja cerrada".
  - Con la caja cerrada se muestra un aviso de cómo se abre y quedan deshabilitados Registrar movimiento y Registrar arqueo.
  - Al confirmar la entrega inicial aparece el mensaje "Caja abierta con la entrega #N".
  - **"Cerrar caja"** abre el recuento final por moneda, con la advertencia de que el efectivo se devuelve a tesorería.
  - Los cierres se marcan con la etiqueta "Cierre" en la lista de arqueos.
- **`pages/admin/CashDeliveries.tsx`:**
  - Muestra el estado de cada caja ("abierta por … desde …" o "cerrada").
  - En una entrega nueva avisa si **será la apertura** o si **es una reposición**.
- **`services/cajas.ts`:** `obtenerTurno`, `listarTurnos` y `cerrarCaja`; además, `confirmarEntrega` ahora devuelve el turno.

## 4. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| La apertura es la confirmación de la entrega inicial | Así lo define la historia; no hace falta un botón "abrir" aparte, y el "dinero con lo que empieza" queda registrado por denominación |
| Un solo turno abierto por caja, con restricción en la base | Evita dos cajeros sobre la misma caja, incluso con pedidos simultáneos |
| Mientras la caja está abierta, solo su cajero recibe entregas | El efectivo del turno es responsabilidad de quien la abrió |
| Al cerrar, el saldo vuelve a 0 con movimientos "Devolución a tesorería" | El efectivo regresa a tesorería y queda trazado como cualquier movimiento |
| El administrador también puede cerrar | Por ejemplo, si el cajero se olvidó; queda registrado quién cerró |
| El arqueo intermedio se mantiene y no cierra la caja | Sirve para controles a mitad del turno |
| La validación de caja abierta está en `registrar_movimiento` | PI-75 (operación presencial) la hereda sin código extra |

## 5. Verificación

- **Backend:**
  - 18 pruebas nuevas en `cajas/test_turnos.py` y 2 en `cajas/tests.py`.
  - `cajas` tiene 58 pruebas y todo el proyecto está en verde (155 pruebas) sobre PostgreSQL.
  - La migración se puede deshacer.
- **Frontend:** todo el proyecto en verde (225 pruebas) y `npm run build` sin errores.
- **Revisión visual:** caja abierta, modal de cierre, caja cerrada con devolución y recuento, y pantalla del admin con el estado de la caja.

## 6. Corrección durante las pruebas manuales

- **Síntoma:** al entrar como cajero con la caja cerrada, la pantalla de Arqueo de Caja mostraba
  *"Failed to execute 'json' on 'Response': Unexpected end of JSON input"* y no cargaba ni el saldo
  ni el historial.
- **Causa:** `GET /api/cajas/{id}/turno/` devolvía `Response(None)` cuando no había turno abierto.
  DRF envía eso como un cuerpo **vacío**, y `res.json()` falla con un cuerpo vacío. Como la
  pantalla carga todo junto (`Promise.all`), un solo fallo dejaba la pantalla sin datos.
- **Por qué no lo detectaron las pruebas:** el cliente de pruebas de DRF expone `res.data` (el `None`
  original) sin leer el cuerpo, y en el frontend la API estaba simulada con `JSON.stringify(null)`.
- **Arreglo:**
  - El endpoint ahora responde siempre un objeto: `{"turno": ... | null}`.
  - `obtenerTurno` lee `datos.turno`.
  - `apiFetch` devuelve `null` si el cuerpo viene vacío, en vez de romper.
- **Pruebas de regresión:**
  - Backend: se lee el cuerpo real (`res.content`) del turno de una caja cerrada.
  - Frontend: una respuesta vacía no rompe `obtenerTurno`.
