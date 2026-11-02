# CHIA – Gestión SIFEN: anulación, inutilización y nota de crédito

| Campo | Detalle |
|---|---|
| Hito | 5 – Sprint 5 |
| Épica | PI-28 – Reportes y Facturación |
| Relacionada con | PI-30 (emitir factura electrónica), PI-86 (descargas), PI-42 (comprobante interno) |
| Herramienta de IA | OpenCode (DeepSeek V4.1 Flash Free) |
| Fecha | 26/10/2026 |

## 1. Objetivo

Completar la facturación electrónica con las operaciones posteriores a la
emisión que exige el protocolo ESI de Factura Segura:

- **Anular comprobante** (`sol_cancelacion`): cancela un DE aprobado.
- **Inutilizar número** (`sol_inutilizacion`): inutiliza el número de un
  DE que no llegó a aprobarse.
- **Emitir nota de crédito** (`generar_de` con `iTiDE=5`): acredita
  total o parcialmente una factura aprobada.

La gestión es **fiscal**. No revierte caja, billeteras ni la operación
interna: eso sigue siendo un proceso administrativo separado.

## 2. Alcance y decisiones

### Modelos

- `FacturaElectronica` conserva su estado fiscal (`APROBADA` sigue siendo
  `APROBADA` después de una cancelación) y agrega un resumen:
  `estado_cancelacion`, `estado_inutilizacion`, fechas, detalle y usuario.
- `EventoSIFEN`: historial de solicitudes y consultas de
  `CANCELACION` / `INUTILIZACION`. Guarda la respuesta de la solicitud y
  la de la consulta, el CDC del evento y el motivo interno.
- `NotaCreditoElectronica`: documento independiente con FK `PROTECT` a la
  factura, estados `ERROR`/`VERIFICAR`/`EMITIDA`/`APROBADA`/`RECHAZADA`,
  número, CDC, total, motivo (`iMotEmi`), correo y respuestas del servicio.

### Reglas

- Solo **admin** o el **cajero que emitió la factura** pueden anular,
  inutilizar o acreditar. Un `user` normal no ve el botón y el backend
  responde `403`.
- `sol_cancelacion` solo para facturas `APROBADA`, con CDC y dentro de
  `FACTURASEGURA_CANCELACION_VENTANA_HORAS`.
- `sol_inutilizacion` solo para `RECHAZADA`, `ERROR` o `VERIFICAR` con
  número consumido. Nunca para `APROBADA` ni para una factura ya
  cancelada.
- La NC del MVP es **total**: replica ítems, tasa de IVA, total y datos
  del emisor/receptor de la factura original. Se permite una NC activa
  por factura; las parciales quedan para una etapa posterior con
  validación de totales acumulados.
- El rango de NC es independiente del de facturas
  (`FACTURASEGURA_NC_NUMERO_DESDE`–`HASTA`, por defecto `13`–`24`), con
  el mismo establecimiento y punto de expedición.
- `generar_de` con `code` negativo deja la NC en `ERROR` y libera el
  número. Un timeout/5xx la deja en `VERIFICAR` y **no se reintenta
  automáticamente**.
- En modo simulado la solicitud devuelve `code: 0` y la consulta devuelve
  un evento aprobado determinista, sin llamar a la red.

### Orden de estados en una consulta

`get_estado_sifen` puede traer `estado_sifen`, `estado_can` y
`estado_inu`. Se aplica este orden:

1. Inutilización (estado final del número).
2. Cancelación (estado final del DE).
3. Aprobación/rechazo del DE.

El detalle visible prioriza `Inutilizado` sobre `Cancelado`; los estados
quedan además en los campos de resumen y en el historial de eventos.

## 3. Backend

### Endpoints

| Método | Ruta | Resultado |
|---|---|---|
| `POST` | `/api/facturas/{id}/cancelar/` | `202` con evento `PENDIENTE`; `400` si no corresponde o SIFEN rechaza la solicitud |
| `POST` | `/api/facturas/{id}/cancelacion/estado/` | Consulta y actualiza el evento |
| `POST` | `/api/facturas/{id}/inutilizar/` | `202` con evento `PENDIENTE`; `400` si no corresponde |
| `POST` | `/api/facturas/{id}/inutilizacion/estado/` | Consulta y actualiza el evento |
| `POST` | `/api/facturas/{id}/nota-credito/` | `201` con la NC; `400` con `detail` y `nota` si `code < 0` |
| `GET` | `/api/notas-credito/` | Listado visible por rol; acepta `?factura=` |
| `GET` | `/api/notas-credito/{id}/` | Detalle |
| `POST` | `/api/notas-credito/{id}/estado/` | Consulta el estado en SIFEN |
| `GET` | `/api/notas-credito/{id}/kude/` | KuDE oficial (solo real y aprobada) |
| `GET` | `/api/notas-credito/{id}/xml/` | XML firmado (solo real y aprobada) |

`GET /api/facturas/` sigue listando solo facturas. El detalle incluye
`eventos`, `notas_credito` resumidas y los flags `puede_cancelar`,
`puede_inutilizar`, `puede_nota_credito`.

### Archivos principales

- `backend/facturacion/models.py`: modelos y restricciones.
- `backend/facturacion/cliente_fs.py`: `sol_cancelacion`,
  `sol_inutilizacion`, `get_estado_sifen` con eventos y helper de login.
- `backend/facturacion/armado.py`: `armar_nc_resumido` con `iTiDE=5`,
  `iMotEmi` y `gCamDEAsoc` (CDC de la factura original).
- `backend/facturacion/servicios.py`: solicitud, consulta, numeración de
  NC y precedencia de estados.
- `backend/facturacion/views.py` / `urls.py`: acciones y ViewSet de NC.
- `backend/facturacion/serializers.py`: resumen de eventos/NC y flags.
- `backend/core/settings.py` / `.env.example`: rango de NC, ventana de
  cancelación y URL de login.

### Migración

`backend/facturacion/migrations/0002_facturaelectronica_cancelacion_consultada_and_more.py`
agrega los campos de resumen, `EventoSIFEN` y `NotaCreditoElectronica`.
Aplicar con:

```bash
cd backend
venv\Scripts\python.exe manage.py migrate
```

## 4. Frontend

- `frontend/src/services/facturas.ts`: tipos de eventos/NC y funciones
  `cancelarFactura`, `consultarCancelacion`, `inutilizarFactura`,
  `consultarInutilizacion`, `emitirNotaCredito`,
  `consultarEstadoNotaCredito` y `listarNotasCredito`.
- `frontend/src/services/facturasDescarga.ts`:
  `descargarNotaCreditoOficial` y `nombreArchivoNotaCredito`.
- `frontend/src/components/GestionFactura.tsx`: modal de gestión con
  confirmación explícita, motivo, selector `iMotEmi`, correo editable,
  historial de eventos y descargas de NC.
- `frontend/src/pages/Invoices.tsx`: muestra los badges de cancelación,
  inutilización y NC, y el botón **Gestionar** solo para `admin`/`cashier`.
  El backend vuelve a validar que el cajero sea el emisor.

La NC no modifica la operación ni la caja. Tampoco se dispara desde el
`Comprobante.anular` interno: son dos procesos distintos.

## 5. Pruebas

Backend (sin red; simulado o `requests.post` mockeado):

```bash
cd backend
venv\Scripts\python.exe manage.py test facturacion
```

Frontend:

```bash
cd frontend
npx vitest run
npx tsc --noEmit
npm run build
```

Casos cubiertos: anulación aprobada/rechazada/timeout, una sola
cancelación activa, permisos, inutilización con CDC ficticio,
precedencia inutilización → cancelación → aprobación, NC total con
`iTiDE=5` y `gCamDEAsoc`, NC con error que libera el número, timeout de
NC en `VERIFICAR`, listado/consulta y descargas KuDE/XML de NC.

## 6. Limitaciones y siguientes pasos

- NC parcial: requiere validar que la suma de NC activas no supere el
  total de la factura.
- La ventana real de cancelación de SIFEN debe confirmarse con la
  cátedra; por eso es configurable.
- `FACTURASEGURA_TOKEN` se mantiene estático. `obtener_token` es un
  helper aislado para cuando el ESI pida renovarlo.
- Si una factura histórica no tiene `emitida_por_sub`, solo el admin
  puede gestionarla.
