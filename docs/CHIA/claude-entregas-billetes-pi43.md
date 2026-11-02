# CHIA – PI-43: Registrar billetes entregados

| Campo | Detalle |
|---|---|
| Hito | Sprint 4 (08/10 – 12/10/2026) |
| Historia (Jira) | PI-43 – Registrar billetes entregados |
| Requerimientos | RF57 (registrar la entrega de billetes por divisa y denominación al cajero, con cantidad, fecha y hora) |
| Relacionada con | PI-44 (saldo de billetes por caja), PI-75 (operación cambiaria presencial) |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 09/10/2026 |

## 1. Objetivo

Que el administrador registre los billetes que le entrega a una caja (el fondo
de apertura o una reposición de efectivo) y que esos billetes se sumen al
saldo de la caja construido en PI-44.

Criterios de aceptación (corregidos en Jira para cumplir RF57):

1. Registro por cajero, caja y divisa.
2. Detalle de la cantidad entregada por denominación de billete.
3. Fecha y hora de la entrega guardadas automáticamente.
4. Cálculo del total entregado por divisa.
5. Al confirmar, los billetes se suman al saldo de la caja (PI-44).

## 2. Análisis y decisión de diseño

En la casa de cambio el cajero no opera con dinero propio: tesorería (el
administrador) le entrega un **fondo de caja** al abrir y le **repone**
efectivo cuando se queda sin una divisa.

Se evaluaron dos alternativas:

| Alternativa | Ventaja | Problema |
|---|---|---|
| Entrega directa: el admin registra y se suma al saldo en el momento | Más simple | Nadie controla que el cajero recibió lo que figura; además el admin tendría que escribir a mano a qué cajero fue, porque los usuarios viven en Keycloak y el backend no tiene una lista de cajeros |
| **Entrega con confirmación** (elegida) | El cajero cuenta y confirma. Queda registrado automáticamente qué cajero la recibió (sale de su sesión) y cuándo | Agrega un estado intermedio |

Con la confirmación, el criterio "registro por cajero" se resuelve sin
mantener una lista de cajeros: el cajero queda identificado por el token de
Keycloak al confirmar.

En PI-44 el administrador podía registrar una "entrega" como un movimiento
más, que se sumaba al instante. Con PI-43 eso se quitó: las entregas solo se
registran por el nuevo flujo con confirmación.

## 3. Solución

### Backend (`backend/cajas/`)

- **Modelos nuevos:**
  - `EntregaBilletes`, con caja, estado, quién entregó, fecha y hora, observación, quién respondió, fecha de respuesta y motivo.
  - `DetalleEntrega`, con denominación y cantidad.
  - Una entrega puede incluir varias divisas.
- **Estados:**
  - `PENDIENTE`: al registrarla, sin tocar el saldo.
  - `CONFIRMADA`: la confirmó el cajero y se sumó al saldo.
  - `RECHAZADA`: la rechazó el cajero, con motivo.
  - `CANCELADA`: la anuló el admin mientras estaba pendiente, con motivo.
- **`MovimientoCaja.entrega`:** al confirmar, se genera un movimiento `ENTREGA` por cada divisa, vinculado a la entrega. Así se ve en el historial de la caja (PI-44).
- **`servicios.py`:** `crear_entrega`, `confirmar_entrega`, `rechazar_entrega`, `cancelar_entrega` y `totales_entrega`.
  - La confirmación es atómica (o se suman todas las divisas o ninguna).
  - La entrega se bloquea para que no se pueda responder dos veces.
  - Reutiliza `registrar_movimiento` de PI-44.
- **Endpoints:**
  - `GET|POST /api/entregas/` (filtros `?caja=` y `?estado=`)
  - `POST /api/entregas/{id}/confirmar/`
  - `POST /api/entregas/{id}/rechazar/`
  - `POST /api/entregas/{id}/cancelar/`
- **Permisos (`PermisoEntregas`):**
  - Registrar y cancelar: administrador.
  - Confirmar y rechazar: cajero.
  - Ver: ambos.
  - Quien entregó no puede confirmar su propia entrega (separación de funciones).
- **Movimientos:** `POST /api/cajas/{id}/movimientos/` ahora acepta solo `INGRESO` y `RETIRO`.
- **Migración:** `0003_entregas_billetes`.

### Frontend

- **`pages/admin/CashDeliveries.tsx`** (nueva, menú del admin "Entregas de Billetes"):
  - **Formulario de nueva entrega:** se elige la caja y se cargan las cantidades por divisa (con pestañas) y denominación. Al pie se ve el total de cada divisa.
  - **Listado:** muestra el estado, los totales, quién entregó, quién recibió o rechazó y cuándo, y el motivo. Tiene filtros por estado y por caja, detalle por denominación y cancelación de las pendientes.
- **`pages/cashier/CashCountView.tsx`:**
  - Aviso de "entregas pendientes de confirmar".
  - Modal con el detalle para contar y confirmar la recepción, o rechazarla indicando el motivo.
  - El movimiento manual queda solo con Ingreso y Retiro.
- **`pages/cashier/ComponentesCaja.tsx`** (nuevo): modal, campo de cantidad, tabla de entrega y formatos compartidos por las dos pantallas.
- **`services/cajas.ts`:** `listarEntregas`, `crearEntrega`, `confirmarEntrega`, `rechazarEntrega` y `cancelarEntrega`.
- **Navegación:** `types.ts`, `Sidebar.tsx`, `Navbar.tsx` y `App.tsx` con la nueva página `admin-cash-deliveries`.

## 4. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Entrega pendiente hasta que el cajero confirma | Control de recepción: el cajero cuenta antes de aceptar la responsabilidad del efectivo |
| El cajero se identifica por su sesión al confirmar | El backend no tiene lista de cajeros (están en Keycloak); evita que el admin tipee nombres o identificadores |
| Quien entregó no puede confirmar | Separación de funciones, aunque un usuario tenga ambos roles |
| Una entrega puede tener varias divisas | El fondo de apertura suele incluir guaraníes y dólares a la vez |
| Un movimiento `ENTREGA` por divisa al confirmar | El historial y el saldo de PI-44 siguen funcionando igual, sin casos especiales |
| Rechazo y cancelación con motivo obligatorio | Queda trazado por qué no se aceptó o se anuló |
| Sin edición ni borrado de entregas | Son registros de auditoría; un error se corrige cancelando (si está pendiente) o con una entrega o retiro nuevos |

## 5. Verificación

- **Backend:**
  - 18 pruebas nuevas en `cajas/test_entregas.py`, más una prueba de PI-44 ajustada.
  - Todo el proyecto en verde (136 pruebas), probado sobre PostgreSQL.
  - La migración es reversible.
- **Frontend:**
  - Pruebas nuevas en `CashDeliveries.test.tsx` y `services/cajas.test.ts`.
  - Casos de entregas pendientes en `CashCountView.test.tsx`.
  - Todo el proyecto en verde (214 pruebas) y `npm run build` sin errores.
- **Revisión visual** de las dos pantallas y sus modales en tamaño notebook.
