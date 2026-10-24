# CHIA – PI-78: Adaptar el saldo de caja a totales por divisa

| Campo | Detalle |
|---|---|
| Hito | Sprint 4 (08/10 – 12/10/2026) |
| Tarea (Jira) | PI-78 – Adaptar el saldo de caja a totales por divisa (vinculada a PI-44) |
| Requerimientos | RF56 y RF58 (saldo de caja por divisa) |
| Relacionada con | PI-44 (saldo de caja), PI-43 (entregas de billetes), PI-79 (apertura y cierre), PI-75 (operación presencial) |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 09/10/2026 |

## 1. Origen del cambio

En PI-44 el saldo de la caja se llevaba **billete por billete**: cada ingreso,
retiro y arqueo pedía la cantidad de cada denominación.

Al revisar el módulo con la Product Owner (09/10/2026) se definió lo siguiente:

- **Una sola caja**, en una sola sucursal.
- **El detalle por divisa y denominación solo se registra al entregar dinero
  físico**, es decir, en la entrega del administrador que el cajero cuenta y
  confirma (PI-43). Cargar billetes en cada operación demoraría demasiado la
  atención en ventanilla.
- **Después de la entrega, todo se maneja por total de cada divisa:**
  operaciones, ingresos, retiros y el recuento final.

PI-44 ya estaba terminada, así que el ajuste se hizo en esta tarea aparte.

## 2. Solución

### Backend (`backend/cajas/`)

- **Modelos:**
  - `SaldoCaja` (caja, moneda, monto) reemplaza a `SaldoBillete`.
  - `MovimientoCaja` guarda el monto y el **saldo resultante** de la divisa; ya no tiene detalle por billete (`DetalleMovimiento` se eliminó).
  - `ArqueoMoneda` (total según sistema vs. contado por moneda) reemplaza a `DetalleArqueo`.
  - `DetalleEntrega` (PI-43) queda como **único registro por denominación**.
- **Servicios:**
  - `registrar_movimiento(caja, tipo, moneda, monto, ...)` valida que el monto sea positivo y que respete los decimales de la moneda (PYG sin decimales), no deja retirar más que el saldo y bloquea la caja para evitar movimientos simultáneos.
  - `confirmar_entrega` suma el total de cada divisa de la entrega.
  - `registrar_arqueo` recibe `{moneda: monto contado}`.
- **API:**
  - `POST /api/cajas/{id}/movimientos/` recibe `monto`, en lugar del detalle de billetes.
  - `POST /api/cajas/{id}/arqueos/` recibe `conteo: [{moneda, monto}]`.
  - `GET /api/cajas/{id}/saldo/` devuelve el total por moneda.
  - `GET /api/denominaciones/?activas=1` es el catálogo para el formulario de entregas.
- **Migraciones en tres pasos**, para conservar los datos que ya existían:
  1. `0004`: crea las tablas nuevas.
  2. `0005`: convierte los datos. Suma valor × cantidad por moneda para el saldo y los arqueos, y reconstruye el saldo resultante de cada movimiento en orden cronológico.
  3. `0006`: borra las tablas por billete.

  Están separadas porque en PostgreSQL mezclar cambios de estructura y de datos en una misma migración puede fallar.

### Frontend

- **`services/cajas.ts`:** `SaldoMoneda` pasa a ser el total por divisa, los movimientos y el arqueo van por monto, y se agrega `listarDenominaciones()`.
- **`pages/cashier/CashCountView.tsx`:**
  - Tarjetas con el saldo de cada divisa.
  - Últimos movimientos con monto y saldo resultante.
  - Movimiento por monto, que avisa si no alcanza el saldo y muestra el saldo que va a quedar.
  - Arqueo en una tabla por moneda con sistema, contado y diferencia (faltante o sobrante).
  - Las entregas pendientes de PI-43 siguen igual.
- **`pages/admin/CashDeliveries.tsx`:** el formulario de nueva entrega toma los billetes del catálogo de denominaciones.
- **`pages/cashier/ComponentesCaja.tsx`:** se agregan `CampoMonto` y `leerMonto`, que valida los decimales.

## 3. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Saldo por total de cada divisa | Pedido de la Product Owner: más rápido en ventanilla; además, con operaciones sin detalle, un saldo por billete dejaría de cuadrar |
| Denominación solo en la entrega | Es el único momento en que el dinero físico cambia de manos de forma controlada (admin → cajero) |
| Guardar el saldo resultante en cada movimiento | Permite seguir la evolución del saldo sin recalcular todo el historial |
| Migraciones en tres pasos con conversión de datos | No se pierden los saldos ni los arqueos ya cargados en la base de cada integrante |
| Validar los decimales según la moneda | El guaraní no tiene decimales; evita montos imposibles |
| El arqueo sigue sin modificar el saldo | Deja constancia de faltantes y sobrantes; el cierre formal de caja queda para PI-79 |

## 4. Verificación

- **Backend:**
  - `cajas` tiene 40 pruebas (22 de saldo, movimientos, arqueo y permisos, más 18 de entregas) y todo el proyecto está en verde (137 pruebas) sobre PostgreSQL.
  - **Migración probada con datos previos:** se cargaron un saldo por billete (USD 8 × 100 + 5 × 20, PYG 3 × 100.000), movimientos y un arqueo con faltante. Después de migrar quedó USD 900 y PYG 300.000, el saldo resultante de cada movimiento quedó reconstruido y el arqueo pasó a USD 900 contra 800 (−100). La migración también se puede deshacer.
- **Frontend:** todo el proyecto en verde (216 pruebas) y `npm run build` sin errores.
- **Revisión visual:** pantalla del cajero, movimiento por monto y arqueo por moneda.
