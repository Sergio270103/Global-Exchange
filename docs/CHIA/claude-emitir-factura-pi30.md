# CHIA – PI-30: Emitir factura electrónica

| Campo | Detalle |
|---|---|
| Hito | Facturación electrónica (completar sprint y fechas) |
| Historias (Jira) | PI-30 – Emitir factura electrónica; PI-83 – Capturar y enviar la factura por correo |
| Requerimientos | (completar RF del ERS) |
| Relacionada con | PI-84 (visualizar el estado), PI-85 (reenviar o reintentar), PI-86 (descargar facturas), PI-42 (comprobante interno), PI-77 (Nota de Crédito) |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 23/10/2026 |

## 1. Objetivo

Como cajero o usuario, emitir y enviar la factura electrónica de cada
transacción al correo del cliente, para asegurar el registro legal de la venta
y confirmar la entrega del comprobante. La facturación es **real**: se integra
con la API ESI de Factura Segura (manual entregado por la cátedra), en el
ambiente TEST.

Criterios de aceptación:

1. Campo para capturar o confirmar el correo del cliente, precargado con su email.
2. La factura se emite con una acción explícita ("Emitir factura") y solo para operaciones PAGADAS.
3. La emisión se envía al servicio de facturación; se guardan número, estado (emitida, aprobada, rechazada) y la respuesta del servicio.
4. Una operación no puede tener dos facturas aprobadas.
5. Se muestra "emisiones usadas X de N"; al llegar al límite se bloquea la emisión con un mensaje claro.
6. Al quedar aprobada, la factura se envía al correo del cliente y se registra el envío (fecha, destinatario y resultado).

## 2. Contexto: acceso a Factura Segura

- El usuario ESI se registró con el correo institucional de Sergio. El portal web
  mostraba "No pudimos habilitar su acceso", pero el acceso ESI es **solo por API**:
  esa pantalla no indica un error.
- Soporte habilitó la cuenta para el emisor 2595733 (establecimiento 001, punto de
  expedición 003) con un rango de **12 facturas** (0000100 a 0000111) y 12 notas de
  crédito (0000013 a 0000024).
- Se verificó el acceso con un script local: el login devolvió el token y una
  consulta `get_estado_sifen` con un CDC inventado respondió un error de
  validación (`-80006`), lo que confirma que la autorización funciona. Ninguna de
  esas pruebas emite documentos ni gasta números.
- Faltaban datos del emisor (nombre, dirección, departamento, ciudad, correo y
  actividad económica). Se pidieron a soporte en lugar de inventarlos, porque
  SIFEN los valida y un rechazo gasta un número. Soporte los envió el 24/10/2026,
  con dos actividades económicas y el distrito (`cDisEmi`/`dDesDisEmi`), que el
  primer armado no contemplaba: se agregó el distrito (opcional) y varias
  actividades separadas con `|` en el `.env`.

## 3. Solución

### Backend (`backend/facturacion/`, app nueva)

- **`models.py`:** `FacturaElectronica` con número (`dNumDoc`), número completo,
  CDC, estado, total, correo destino, detalle, respuesta del servicio, DE enviado y
  el registro del envío (fecha, destinatario, resultado).
  - Estados: `ERROR` (no se generó, el número queda libre), `VERIFICAR` (sin
    respuesta de `generar_de`), `EMITIDA`, `APROBADA` y `RECHAZADA`.
  - Restricciones en base de datos: una sola factura activa por operación y cada
    número del rango usado una sola vez.
- **`cliente_fs.py`:** cliente del protocolo petición-respuesta del manual
  (`operation` + `params`, header `Authentication-Token`). Tiene un **modo
  simulado** (por defecto) que no usa la red y devuelve respuestas con el mismo
  formato, para desarrollar sin gastar números.
- **`armado.py`:** arma el JSON resumido de la factura (`iTiDE=1`): datos del
  emisor desde el `.env`, receptor con RUC (contribuyente) o con cédula (no
  contribuyente), pago al contado según el método de la operación y un ítem con
  el monto total de la operación en guaraníes.
- **`servicios.py`:**
  1. Valida la operación (PAGADA, sin otra factura activa) y el límite del rango.
  2. Llama a `calcular_de`, que **no genera nada**; si falla, no se gasta ningún número.
  3. Reserva el número y llama a `generar_de`. Si no hay respuesta (timeout), la
     factura queda en `VERIFICAR` y **no se reintenta**, como indica el manual,
     porque el documento pudo haberse generado.
  4. `actualizar_estado` consulta `get_estado_sifen` e interpreta los estados del
     manual; al quedar aprobada registra el envío al correo del cliente.
- **Endpoints:**
  - `POST /api/facturas/` (emitir)
  - `GET /api/facturas/` y `GET /api/facturas/{id}/`
  - `POST /api/facturas/{id}/estado/` (consultar SIFEN)
  - `GET /api/facturas/uso/?operacion={id}` (contador, correo precargado y última factura)
- **Configuración:** variables `FACTURASEGURA_*` en `backend/.env`
  (documentadas en `.env.example`). El token nunca llega al navegador ni al repositorio.

### Frontend

- **`services/facturas.ts`** (nuevo): uso, emisión y consulta de estado.
- **`components/EmitirFactura.tsx`** (nuevo): bloque "Factura electrónica"
  dentro del comprobante del cajero, con correo precargado, contador "Emisiones
  usadas X de 12" (con etiqueta "simulado" cuando corresponde), botón "Emitir
  factura" y botón "Consultar estado en SIFEN". En modo real pide confirmación antes de emitir.
- **`components/ComprobanteVista.tsx`:** muestra el bloque, salvo en comprobantes anulados.
- **Rol usuario:** el mismo bloque aparece en el comprobante de "Transacción
  Exitosa" (`BuySell.tsx`) y en la pantalla de pago acreditado por Stripe
  (`RetornoPago.tsx`). El backend ya permitía facturar al dueño de la operación
  o a un usuario asociado al cliente.
- **No se tocó la pantalla Facturas (`Invoices.tsx`):** es de PI-84 (Visualizar
  el estado de la factura, de otra integrante). Puede leer las facturas reales
  desde `GET /api/facturas/`, que devuelve número, CDC, estado, total y envío.

## 4. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Se factura el monto total de la operación en PYG | Es lo que paga o recibe el cliente y coincide con el monto de la pantalla de facturas (PI-28). Al principio se facturaba solo la comisión, pero con comisión 0 la operación no se podía facturar. **Pendiente de confirmar con la PO**, igual que la tasa de IVA |
| Modo simulado por defecto | Solo hay 12 números: el desarrollo y las pruebas no deben gastarlos |
| Facturas simuladas con numeración aparte | Al pasar a modo real se empieza igual desde 0000100 |
| `calcular_de` antes de `generar_de` | Valida el JSON sin consumir números |
| Sin reintento automático ante un timeout | El manual advierte que el documento pudo haberse generado |
| No se envía un correo propio | Factura Segura envía el XML y el KuDE a `dEmailRec` cuando SIFEN aprueba; el sistema registra ese envío |
| Límite "X de 12" en lugar de 50 | Es el rango que asignó Factura Segura |
| Botón "Consultar estado en SIFEN" (antes "Actualizar estado") | El estado lo define SIFEN (DNIT), no el cajero: el botón solo consulta. Hace falta porque Factura Segura no avisa al sistema cuando SIFEN responde |

## 5. Ajustes del repositorio en la misma entrega

- **Sin Django Admin** (pedido de la cátedra): se borraron los `admin.py` de
  `billeteras`, `clientes`, `cotizaciones`, `monedas`, `operaciones` y `pagos`, y se
  quitaron `django.contrib.admin` de `INSTALLED_APPS` y la ruta `admin/`.
- **CHIA unificado:** los registros de `frontend/docs/CHIA` y `backend/docs/CHIA`
  se movieron a `docs/CHIA` en la raíz del repositorio. La documentación del
  código (`frontend/docs/PDO`) queda donde estaba.
- **Fecha fija del encabezado:** se quitó "Lun, 15 Enero 2024 · 14:32" de
  `Navbar.tsx`; era texto de la plantilla y mostraba una fecha falsa.
- **Divisas del cajero (PI-75):** cada desplegable ocultaba la divisa elegida en
  el otro, así que con PYG → USD no se podía pasar directo a USD → PYG (había que
  pasar por una tercera divisa). No era una regla de negocio: la venta USD → PYG
  es válida. Ahora se muestran todas y, si se elige en un lado la divisa del otro,
  se intercambian. Prueba nueva en `CashierDashboard.test.tsx`.
- **Monto que cambiaba solo:** en los campos `type="number"`, girar la rueda del
  mouse con el foco en el campo suma o resta en vez de desplazar la página, y un
  monto de 100 quedaba en 93 u 80 al bajar por la pantalla. Se agregó
  `utils/inputNumero.ts`, registrado en `main.tsx`: si llega la rueda con un campo
  numérico enfocado, se le quita el foco. Vale para todos los campos numéricos
  del sistema.

## 6. Verificación

- **Backend:** 16 pruebas nuevas en `facturacion/tests.py`; todo el proyecto en
  verde (271 pruebas). Ninguna prueba usa la red: el modo real se prueba con
  `requests.post` reemplazado por un mock, y una protección hace fallar cualquier
  test que intente salir a internet.
  - Casos cubiertos: emisión de operación pagada; rechazo de pendientes, de
    duplicados y de correos inválidos; límite del rango; precarga del correo;
    aprobación con registro del envío; receptor con RUC o cédula; error de
    `calcular_de` y de `generar_de` sin gastar números; timeout sin reintento;
    rechazo de SIFEN con reemisión; datos del emisor incompletos sin llamar a la API.
- **Frontend:** 5 pruebas nuevas en `EmitirFactura.test.tsx`; todo el proyecto en
  verde (348 pruebas) y sin errores de tipos.
- **Prueba manual (modo simulado):** el bloque aparece en el comprobante con la
  etiqueta "simulado" y el correo precargado del cliente; una operación con
  comisión 0 se emitió como `001-003-0000100`.

### Ajuste tras la prueba manual: doble scroll

- **Síntoma:** al agregar el bloque de factura, el comprobante quedó más largo y
  aparecían dos barras de desplazamiento (la de la ventana y la de la página);
  los botones Imprimir, Descargar PDF y Cerrar quedaban fuera de la vista.
- **Causa:** la ventana tenía su propio scroll dentro de un fondo que también
  scrolleaba, y se dibujaba dentro de un contenedor con animación (`transform`),
  como el caso ya resuelto en PI-44.
- **Arreglo:** el mismo patrón de `ComponentesCaja.Modal`: *portal* a
  `document.body`, un solo scroll en el contenido, botones fijos abajo y bloqueo
  del scroll de la página mientras la ventana está abierta.

## 7. Pendientes

- Confirmar con la PO qué monto se factura y con qué tratamiento de IVA.
- Cargar los datos del emisor cuando los envíe soporte y recién ahí pasar a modo real.
- PI-84: que la pantalla Facturas muestre las facturas reales de `GET /api/facturas/`
  en lugar de derivarlas de las operaciones (números `F001-…` ficticios).
- Notas de crédito (PI-77): reutilizar los datos del emisor y el cliente de
  Factura Segura con su propio rango (0000013 a 0000024).
