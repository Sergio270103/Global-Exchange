# CHIA – PI-64: Cancelación de transacción por cambio de cotización

| Campo | Detalle |
|---|---|
| Hito | 5 – Sprint 3 |
| Historia (Jira) | PI-64 – Cancelación de transacción por cambio de cotización |
| Requerimientos relacionados | RF27 (la transacción permanece pendiente hasta la confirmación del pago), PI-65 (historial de transacciones) |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 25/09/2026 |

## 1. Objetivo de la conversación

Implementar la cancelación de una compra/venta de divisas cuando la cotización
cambia antes de confirmar el pago, con una ventana de tolerancia de algunos
segundos: si la tasa cambia dentro de esa ventana se respeta la tasa mostrada;
solo pasada la ventana se le muestra al cliente la nueva cotización para que la
acepte o cancele sin costo.

Criterios de aceptación de la historia:

1. Si la cotización cambia antes de confirmar el pago, el sistema muestra la nueva antes de continuar.
2. Si el cliente no acepta la cotización actualizada, puede cancelar sin costo ni penalidad.
3. La operación cancelada figura en el historial con estado "Cancelada".
4. Queda trazado quién la canceló y en qué momento (auditoría).

## 2. Desarrollo de la conversación

### 2.1 Contexto que se le dio a la IA
Se compartieron capturas de la estructura del repositorio y de la historia en
Jira. La IA pidió los archivos necesarios para no suponer el código existente:

- Backend (`backend/operaciones/`): `models.py`, `views.py`, `serializers.py`, `urls.py`.
- Backend (`backend/cotizaciones/`): `models.py`, `views.py`.
- Frontend: `pages/BuySell.tsx`, `services/operaciones.ts`, `services/cotizaciones.ts`, `types.ts`.

### 2.2 Problema detectado en el diseño original
El `POST /api/operaciones/` ejecutaba la operación de inmediato, sin un estado
intermedio, por lo que no había nada que cancelar. La IA propuso agregar un
ciclo de vida a la operación.

### 2.3 Solución propuesta
- La operación nace en estado **PENDIENTE** al presionar "Continuar" y se
  congela la cotización (`fecha_cotizacion`).
- `POST /api/operaciones/{id}/confirmar/` confirma el pago (**PAGADA**):
  - dentro de la tolerancia (`OPERACION_TOLERANCIA_SEGUNDOS`, 30 s por defecto) se respeta la tasa congelada aunque haya cambiado;
  - fuera de la tolerancia y con la misma tasa se confirma;
  - fuera de la tolerancia y con otra tasa **no** se confirma: se re-cotiza, se abre una nueva ventana y se responde `COTIZACION_CAMBIADA` con la cotización anterior y la nueva.
- `POST /api/operaciones/{id}/cancelar/` pasa la operación a **CANCELADA** y
  guarda `fecha_cancelacion`, `cancelada_por` (sub de Keycloak),
  `cancelada_por_nombre` y `motivo_cancelacion`.
- En el frontend, la pantalla de confirmación muestra una cuenta regresiva de
  la tasa garantizada y, si la tasa cambió, un aviso con los valores anteriores
  y nuevos y los botones "Aceptar nueva cotización" / "Cancelar transacción".

### 2.4 Ajustes pedidos durante la conversación
- **Estados según el diagrama de clases:** la IA había usado `CONFIRMADA`; se
  corrigió a la enumeración del diseño: `PENDIENTE`, `PAGADA`, `CANCELADA`,
  `ANULADA` (esta última queda reservada, fuera del alcance de PI-64).
- **Historial:** la operación cancelada no se veía porque `Transactions.tsx`
  tenía el estado fijo en `'Completada'`. Se cambió para mostrar el estado
  real con colores, un filtro por estado y, en las canceladas, quién y cuándo
  la canceló.
- **Pruebas manuales en localhost:** como dos pestañas comparten la sesión de
  Keycloak, se cambió la tasa desde `python manage.py shell` (o desde una
  ventana de incógnito como admin) para simular el cambio de cotización.
- **Entorno:** error `No module named 'django'` por no tener activado el
  entorno virtual antes de `makemigrations`.

## 3. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| La tolerancia la valida el backend; la cuenta regresiva del front es solo visual | No depender del reloj del cliente |
| `segundos_restantes` se calcula en el servidor | Evitar desfasajes de hora entre PC/celular y servidor |
| Si la tasa cambia, se responde 200 con `resultado: COTIZACION_CAMBIADA` en lugar de 409 | Compatibilidad con el manejo de errores actual de `apiFetch` |
| Confirmar y cancelar usan `select_for_update` dentro de una transacción | Evitar doble confirmación por doble clic |
| Cancelar una operación ya cancelada devuelve 200 | Idempotencia ante reintentos |
| "Volver" en la confirmación cancela la pendiente con motivo `DESISTIO` | No dejar operaciones pendientes huérfanas |
| Las pendientes no vencen solas | RF27: la transacción permanece pendiente hasta la confirmación del pago |

## 4. Archivos modificados o creados

**Backend**
- `backend/operaciones/models.py` – estados, `fecha_cotizacion`, `fecha_confirmacion` y campos de auditoría de cancelación.
- `backend/operaciones/serializers.py` – nuevos campos, `tolerancia_segundos`, `segundos_restantes` y `CancelarOperacionSerializer`.
- `backend/operaciones/views.py` – cálculo extraído a `_cotizar()`, acciones `confirmar` y `cancelar`, filtro `?estado=`.
- `backend/operaciones/migrations/` – migración generada con `makemigrations`.
- `backend/operaciones/test_cancelacion.py` – pruebas unitarias (nuevo).
- `backend/core/settings.py` – `OPERACION_TOLERANCIA_SEGUNDOS = 30`.

**Frontend**
- `frontend/src/services/operaciones.ts` – `confirmarOperacion()`, `cancelarOperacion()`, tipos de estado.
- `frontend/src/services/operaciones.test.ts` – pruebas unitarias (nuevo).
- `frontend/src/pages/BuySell.tsx` – flujo pendiente → confirmar/cancelar con cuenta regresiva.
- `frontend/src/pages/Transactions.tsx` – estado real, colores, filtro y datos de auditoría.

## 5. Pruebas unitarias

| Archivo | Cómo se ejecuta | Qué cubre |
|---|---|---|
| `backend/operaciones/test_cancelacion.py` | `python manage.py test operaciones.test_cancelacion` | RF27, tolerancia, re-cotización, aceptar nueva tasa, cancelación con auditoría, idempotencia, operaciones pagadas/canceladas, usuario no asociado, historial y filtro por estado (12 pruebas) |
| `frontend/src/services/operaciones.test.ts` | `npx vitest run src/services/operaciones.test.ts` | Llamadas a confirmar/cancelar, motivo enviado, mapeo de la respuesta con cotización cambiada, datos de auditoría y filtro de historial (7 pruebas) |

## 6. Revisión humana

- [X] Se revisó y entendió el código generado antes de integrarlo.
- [X] Se ejecutaron las migraciones y las pruebas unitarias localmente.
- [X] Se probó el flujo completo de forma manual (dentro y fuera de la tolerancia).
- [X] Se verificó la operación cancelada en el historial.