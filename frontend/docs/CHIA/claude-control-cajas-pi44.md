# CHIA – PI-44: Consultar y actualizar saldo de billetes por caja

| Campo | Detalle |
|---|---|
| Hito | Sprint 4 (08/10 – 12/10/2026) |
| Historia (Jira) | PI-44 – Consultar y actualizar saldo de billetes por caja |
| Requerimientos | RF56 (consultar billetes por caja, divisa y denominación), RF58 (actualizar el saldo con entregas y retiros) |
| Relacionada con | PI-43 (registrar billetes entregados), PI-75 (operación cambiaria presencial) |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 08/10/2026 |

## 1. Objetivo

Revisar si el módulo de Control de Cajas del ERS (RF56 a RF64) quedaba cubierto
con las historias del sprint, ordenar el trabajo y desarrollar PI-44 con
backend, frontend y pruebas unitarias.

Criterios de aceptación de PI-44:

1. Vista detallada de billetes agrupados por divisa y denominación.
2. Total acumulado por moneda según el inventario de billetes en caja.
3. Actualización inmediata del saldo al confirmar un ingreso, una entrega o un retiro.
4. Registro de auditoría del estado de caja para cierres de turno y arqueos.

## 2. Análisis del módulo frente al ERS

Se cruzaron RF56–RF64 con las historias del sprint y con el código del repositorio.

| RF | Historia | Situación encontrada |
|---|---|---|
| RF56 | PI-44 | Pantalla de arqueo con datos simulados, sin concepto de caja ni backend |
| RF57 | PI-43 | Modal que pedía solo un monto total; sin denominación, cajero ni caja |
| RF58 | PI-44 | No existía |
| RF59 | Sin historia | Parcial: `Operacion` guarda fecha, divisas, tasa y montos, pero sin comprobante y sin operaciones de ventanilla |
| RF60 | Sin historia | Modal sin guardar; además, solo el admin puede crear clientes en el backend |
| RF61 | PI-45 | Búsqueda sobre una lista fija de dos clientes |
| RF62–RF64 | Sin historia | Solo interfaz simulada (selector, `alert`, cambio de texto) |

Resultado en Jira:

- **PI-45 ampliada** a "Identificar o registrar cliente presencial" (RF60 + RF61).
- **Historias nuevas:** PI-75 (operación cambiaria presencial, RF59), PI-76 (emitir e imprimir comprobante, RF62–RF63) y PI-77 (anular comprobante o emitir Nota de Crédito, RF64).
- **PI-43:** se completaron los criterios con denominación, cantidad, caja, fecha y hora.
- **Orden de trabajo:** PI-44 → PI-43 → PI-75 → PI-76 → PI-77, con PI-45 en paralelo. PI-44 va primero porque define el modelo de caja y saldo que usan las demás.

## 3. Solución

### Backend (`backend/cajas/`, app nueva)

- **Modelos:** `Caja` (nombre y sucursal), `Denominacion` (billetes por moneda), `SaldoBillete` (cantidad por caja y denominación), `MovimientoCaja` + `DetalleMovimiento` (ingreso, entrega o retiro, con usuario, fecha y saldo resultante) y `ArqueoCaja` + `DetalleArqueo` (cantidad según sistema vs. contada).
- **`servicios.py`:** `registrar_movimiento` actualiza el saldo y guarda el movimiento en una misma transacción, bloqueando la caja para evitar movimientos simultáneos (RNF13). Un retiro que deja una denominación en negativo se rechaza sin modificar nada. La función queda lista para que PI-43 y PI-75 la reutilicen.
- **Endpoints:**
  - `GET /api/cajas/`
  - `GET /api/cajas/{id}/saldo/`
  - `GET|POST /api/cajas/{id}/movimientos/` (filtros `?moneda=` y `?tipo=`)
  - `GET|POST /api/cajas/{id}/arqueos/`
  - `GET /api/denominaciones/`
- **Permisos:** solo cajero y administrador. El alta de cajas y denominaciones, y la entrega de billetes, son exclusivas del administrador.
- **Migración de datos:** crea "Caja 1 · Casa Central" y los billetes de las seis monedas sembradas.
- **Configuración:** `cajas` agregada en `core/settings.py` y `core/urls.py`.

### Frontend

- **`services/cajas.ts`** (nuevo): listar cajas, consultar saldo, registrar y listar movimientos y arqueos.
- **`pages/cashier/CashCountView.tsx`** (rehecha sobre la API):
  - totales por moneda;
  - tabla por denominación;
  - últimos movimientos;
  - arqueos marcados como "Cuadrado" o "Con diferencias";
  - actualización automática cada 30 segundos.
- **`App.tsx`:** la vista recibe `auth`, para mostrar la opción de entrega solo al administrador.

### Ajustes tras la prueba manual

- **Doble scroll:** los modales tenían doble barra de desplazamiento y el botón Guardar quedaba fuera de la pantalla. La causa era que el modal se dibujaba dentro de un contenedor con animación (`transform`), por lo que `position: fixed` se ubicaba respecto de la página y no de la ventana. Se solucionó con un *portal* a `document.body`, encabezado y botones fijos, y bloqueo del scroll de fondo.
- **Arqueo por moneda:** se pasó a pestañas por moneda, con un resumen de las monedas que tienen diferencias.

## 4. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| El saldo solo cambia mediante movimientos | Cada cambio queda trazado: quién, cuándo, qué billetes y saldo resultante (RNF6) |
| Movimientos y arqueos sin edición ni borrado | Son registros de auditoría |
| El arqueo no corrige el saldo | Deja constancia de la diferencia; la corrección se hace con un movimiento aparte, también trazado |
| Entrega de billetes solo para el administrador | Coincide con PI-43: el fondo de caja lo entrega tesorería al abrir o al reponer efectivo |
| Se quitó el gráfico de evolución del efectivo | Mostraba datos inventados |
| Sin uso de Django Admin | Pedido de la cátedra; la auditoría se consulta desde la pantalla del cajero |
| En ventanilla opera el cajero en nombre del cliente | El cliente presencial no necesita usuario ni asociación; queda registrado el cajero que operó (a implementar en PI-75) |

## 5. Verificación

- **Backend:** 21 pruebas nuevas en `cajas/tests.py`, con todo el proyecto en verde (118 pruebas), probado también sobre PostgreSQL. La migración de datos es reversible.
- **Frontend:** pruebas nuevas en `CashCountView.test.tsx` y `services/cajas.test.ts`, con todo el proyecto en verde (200 pruebas) y `npm run build` sin errores.
- **Prueba manual** como cajero:
  - ingreso;
  - retiro con y sin billetes suficientes;
  - arqueo con y sin diferencias;
  - actualización en otra ventana.