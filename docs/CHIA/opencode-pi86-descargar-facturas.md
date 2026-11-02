# CHIA – PI-86: Descargar facturas (v2, sobre PI-30)

| Campo | Detalle |
|---|---|
| Hito | 5 – Sprint 5 |
| Historia (Jira) | PI-86 – Descargar Facturas |
| Épica | PI-28 – Reportes y Facturación |
| Criterios | PDF por fila con el número de factura en el archivo; las rechazadas no se descargan como válidas; el listado filtrado se exporta a Excel/CSV; el PDF muestra los datos que devuelve el servicio de facturación |
| Relacionada con | PI-30 (emitir factura electrónica, JohanaBea), PI-28 (estado de factura, Ivana), PI-42 (comprobante interno) |
| Integrante | Enrique |
| Herramienta de IA | OpenCode (DeepSeek V4.1 Flash Free) |
| Fecha | 24/10/2026 |

## 1. Objetivo

Que el botón PDF de cada fila de la pantalla de Facturas descargue la
factura **aprobada por SIFEN** (con el número real del servicio en el
nombre del archivo), que las rechazadas no se descarguen como válidas y
que el listado filtrado se exporte a CSV para Excel.

## 2. Contexto y antecedentes (por qué una v2)

- **PI-28** (Ivana) armó la pantalla: una fila por operación con estado
  visual Emitida/Aprobada/Rechazada, tarjetas, filtros y Actualizar.
- **PI-30** (Johana, integrado el 24/10) emitió facturas electrónicas
  reales contra Factura Segura y las persistió en
  `facturacion.FacturaElectronica` con número, CDC, estado
  (ERROR/VERIFICAR/EMITIDA/APROBADA/RECHAZADA) y envío por correo. Su
  `GET /api/facturas/` ya viene restringido por rol.
- La primera versión de PI-86 se hizo **en paralelo** a PI-30 sin saberlo
  (deriva facturas de la operación, sin datos de SIFEN). Además quedó
  **sin commitear** por un error de procedimiento mío: se corrió
  `git flow feature finish` sobre una rama sin commits, el merge salió
  vacío y un `--rebase` posterior lo descartó. Nada llegó al remoto.

**Decisión (v2):** rehacer PI-86 consumiendo el backend de PI-30. El
número y el CDC del PDF ahora son los reales del servicio de facturación
y no se duplica ningún concepto de "factura" en el proyecto.

## 3. Solución

### Qué NO se toca

- El backend de PI-30 (`backend/facturacion/`): ni una línea.
- `frontend/src/services/facturas.ts` (la emisión de PI-30): ni una línea.
- La pantalla de PI-28 se **conserva** (filas por operación, estados,
  colores, motivos, filtros, tarjetas, Actualizar).

### Nuevo módulo `frontend/src/services/facturasDescarga.ts`

- `listarFacturasElectronicas()`: consume `GET /api/facturas/` (PI-30)
  y normaliza el DTO, incluido `emitida_por_nombre`.
- `elegirFactura()`: la factura electrónica "vigente" de una operación
  (prioridad APROBADA > EMITIDA/VERIFICAR > RECHAZADA > ERROR), porque
  puede haber intentos previos rechazados.
- `descargarFacturaPdf(factura, operacion)`: genera el PDF con `jsPDF`
  (mismo patrón que el comprobante interno de PI-42). El archivo se
  llama **`001-003-0000100.pdf`**: el `numero_completo` real que devolvió
  el servicio. Guard de seguridad: si la factura no está `APROBADA`
  lanza error y no genera nada.
- `facturasACsv()` / `descargarFacturasCsv()`: CSV con `;`, coma decimal
  y BOM UTF-8 (Excel en español), con columnas de factura electrónica
  (número, CDC, estado FE, total facturado, email destino, resultado del
  envío) y de la operación (número, estado, motivo).
- `motivoPdf()`: el texto del tooltip por estado, para que el usuario sepa
  por qué no puede descargar.

### Pantalla `frontend/src/pages/Invoices.tsx`

- Carga en paralelo `/operaciones/`, `/comprobantes/` y `/facturas/`.
  Si `/facturas/` falla, la pantalla de PI-28 sigue funcionando con los
  PDF deshabilitados (degradación elegante).
- Columna nueva **“Nº Factura FE”** con el `numero_completo` (o `—`).
- **PDF por fila**: habilitado solo cuando la factura electrónica está
  `APROBADA`; en otro caso queda deshabilitado con `title`/`aria-label`
  que explica el motivo (rechazada por SIFEN, pendiente de verificación,
  sin emitir, con error).
- **Exportar CSV** en la cabecera, con exactamente las filas filtradas.
- Se eliminaron los botones decorativos (PDF/Excel de cabecera, Enviar).

### Regla de descarga (criterios de aceptación)

| Estado de la factura electrónica | Botón PDF | Motivo |
|---|---|---|
| `APROBADA` | ✅ descarga `001-003-0000100.pdf` | — |
| `RECHAZADA` | ❌ deshabilitado | `SIFEN rechazó la factura: <detalle>` |
| `EMITIDA` / `VERIFICAR` | ❌ deshabilitado | `La factura todavía no está aprobada por SIFEN.` |
| `ERROR` | ❌ deshabilitado | `No se generó la factura: <detalle>` |
| Sin factura electrónica | ❌ deshabilitado | `Todavía no se emitió la factura electrónica…` |

### Fix global de tests: `frontend/src/test/setup.ts`

Con Vitest 4 + Vite 8 el import lateral de
`@testing-library/jest-dom/vitest` se pierde en el tree-shaking y TODOS
los tests del frontend fallaban con `Invalid Chai property:
toBeInTheDocument`. Se registran los matchers explícitamente con
`expect.extend(matchers)`. Esto repara también los tests del resto del
equipo.

## 4. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Consumir el endpoint de PI-30 en vez del backend propio de la v1 | Un solo concepto de factura; el PDF muestra el número y CDC reales del servicio de facturación (criterio 4) |
| Cero cambios de backend | No se arriesga el trabajo de Johana integrado hoy; el endpoint ya existía y ya filtra por rol |
| PDF solo para facturas `APROBADA` | “Las facturas rechazadas no se descargan como válidas”; además la función misma revalida (guard) |
| Mantener las filas de PI-28 y enriquecerlas | No rompe la historia de Ivana: mismos estados visuales, filtros y tarjetas; PI-86 se nota en la columna FE y las descargas |
| `elegirFactura()` con prioridad APROBADA > EMITIDA > RECHAZADA > ERROR | Una operación puede reintentar la emisión; manda la última válida |
| Degradación elegante si falla `/facturas/` | La pantalla de PI-28 nunca se rompe por PI-86 |
| Archivo `001-003-0000100.pdf` | Es el número real asignado por Factura Segura (establecimiento-punto-número) |
| CSV con `;`, coma decimal y BOM | Excel en español lo abre en columnas y con acentos correctos |
| Exportar `filasFiltradas` | El archivo contiene exactamente lo que el usuario ve |

## 5. Pruebas unitarias

| Archivo | Comando | Qué cubre |
|---|---|---|
| `frontend/src/services/facturasDescarga.test.ts` | `npx vitest run src/services/facturasDescarga.test.ts` | Mapeo del endpoint de PI-30, elección de la factura vigente (prioridades), motivos por estado, nombre del PDF (y su saneamiento), líneas del PDF (número, CDC, envío), guard de no aprobadas, CSV (BOM, encabezados, escape, filas sin factura) y nombre del CSV con filtros (9 pruebas) |
| `frontend/src/pages/Invoices.test.tsx` | `npx vitest run src/pages/Invoices.test.tsx` | PI-28: tres estados, colores, error de API, anuladas, motivos, refresco, filtros y limpiar. PI-86: columna Nº FE, PDF habilitado solo con APROBADA, rechazada/emitida/sin emitir bloqueadas y sin descarga, CSV solo con filas filtradas, exportación deshabilitada sin filas (17 pruebas) |

Suite completa tras los cambios: **toda la suite del frontend en verde**
(incluidos los tests de PI-28/PI-30 que antes fallaban por los matchers),
`npx tsc --noEmit` sin errores y `npm run build` correcto. El backend no
se tocó (`manage.py test` sin cambios).

## 6. Guía de prueba manual

Servicios: backend `8000`, Keycloak `8080`, Vite `5173`, PostgreSQL `5433`.

1. `cd backend && .\venv\Scripts\python.exe manage.py migrate` — aplica la
   migración de PI-30 (`facturacion.0001_initial`) si todavía no se aplicó.
2. Entrar a la app y abrir **Facturas**. Las filas de PI-28 se ven igual
   (número, fecha, cliente, monto, transacción, estado, motivo).
3. **Columna “Nº Factura FE”**: en operaciones con factura electrónica
   emitida aparece el número real (`001-003-0000100`); en el resto, `—`.
4. **Emitir una factura de prueba** (si no hay ninguna): desde
   Comprar/Vender, pagar una operación en efectivo con el cajero y usar
   “Emitir factura” (queda en modo `simulado`; no gasta números reales).
   Esperar a que quede `APROBADA` (el botón de consultar estado llama a
   SIFEN).
5. **PDF aprobada**: clic en **📄 PDF** de esa fila. Se descarga
   `001-003-0000100.pdf`. Abrirlo y verificar: número, CDC, fecha de
   emisión, emisor, modo de emisión (simulada), datos de la operación
   (cliente, tipo, monedas, montos, tipo efectivo, método de pago) y
   datos del envío (destinatario, resultado, fecha). El total facturado
   coincide con el monto en PYG.
6. **Rechazada / pendiente / sin emitir**: el botón está deshabilitado y
   el tooltip explica el motivo (SIFEN la rechazó, no está aprobada, no
   se emitió). Al intentar hacer clic no se descarga nada.
7. **Filtros**: probar estado y rango de fechas; tarjetas y tabla se
   actualizan (comportamiento de PI-28 intacto).
8. **Exportar CSV**: con filtros aplicados, clic en **📊 Exportar CSV**.
   Abrir en Excel: solo las filas filtradas, acentos correctos, y las
   columnas de factura electrónica completas para las filas que la
   tienen.
9. **Roles**: el backend de PI-30 ya restringe `/facturas/` (cliente ve
   lo suyo; cajero lo suyo y lo de sus clientes; admin todo), igual que
   `/operaciones/` para las filas.
10. Regresión: `npx vitest run`, `npx tsc --noEmit`, `npm run build` y
    `python manage.py test`.

## 7. Revisión humana

- [ ] Se revisó y entendió el código generado antes de integrarlo.
- [ ] Se ejecutaron las pruebas unitarias de backend y frontend.
- [ ] Se descargó el PDF de una factura aprobada y se verificó su contenido.
- [ ] Se comprobó que una factura rechazada no descarga un PDF válido.
- [ ] Se exportó el CSV con filtros y se abrió correctamente en Excel.
- [ ] Se verificó que la pantalla de PI-28 sigue funcionando igual.
- [ ] El usuario dio el OK para cerrar la historia.
