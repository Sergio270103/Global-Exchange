# Reportes administrativos (PI-91)

La vista Reportes permite descargar PDF o Excel después de elegir filtros. Los datos de los reportes administrativos se consultan en `GET /api/reportes/{transacciones|ganancias|clientes|facturas|accesos}/`; el backend exige administrador. Tasas reutiliza `/api/cotizaciones/evolucion/`.

- Transacciones: las 16 columnas solicitadas, con **Tasa**, rango inclusivo por fecha de creación y estado (Todos inicialmente).
- Clientes: búsqueda por nombre/apellido, documento/RUC y correo; elección obligatoria de un cliente; sus datos, resumen y operaciones filtradas.
- Ganancias: últimos 30 días calendario inicialmente, rango editable. Comisiones cobradas, comisiones revertidas y ganancia neta por moneda destino. El cobro usa fecha de confirmación; la reversión usa fecha de cancelación de una operación anteriormente pagada. La reversión descuenta solo `monto_comision`, nunca el principal. El mismo cálculo alimenta la vista de ganancias existente.
- Tasas: Hoy desde medianoche de Paraguay y ventanas de 7/30/365 días; personalizado. Se incluye la última cotización anterior, identificada como tasa inicial y con su fecha original.
- Facturas: solo reales; no se exportan pendientes ni simuladas. Cada fila es un estado confirmado: APROBADA → Pagada, ANULADA interna (cancelación fiscal) → Cancelada, DEVUELTA (nota de crédito aprobada) → Anulada y RECHAZADA → Rechazada.
- Accesos: usuarios habilitados del realm configurado, con roles efectivos de Global Exchange a nivel realm o cliente. Excluye cuentas de servicio y usuarios sin roles de la aplicación.

## Historial fiscal

Las migraciones `facturacion.0008_historialfactura` y `0009_historial_existente` crean y cargan `HistorialFactura`, relacionada con la factura por FK. Guarda una instantánea de los datos de exportación, estado y momento en que el sistema registra el resultado confirmado. Los cambios posteriores del cliente no alteran la instantánea. La restricción factura/estado evita duplicados por consultas, reenvíos y reintentos. Se guarda en la misma transacción de la factura.

Los registros anteriores se importan con fecha nula cuando no hay evidencia de la fecha de transición; se muestran como **Fecha de transición no disponible** y solo se incluyen al consultar todo el historial. Una cancelación/nota de crédito aprobada acredita la aprobación previa, pero no permite inventar su hora. La fecha de última consulta no se usa como fecha histórica.

Aplicar en cada ambiente:

```powershell
.\.venv\Scripts\python.exe backend/manage.py migrate
```

## Lectura de Keycloak

La API no usa las asociaciones cliente/usuario como sustituto del directorio de Keycloak. Usa una cuenta de servicio configurada mediante `KEYCLOAK_REPORTES_CLIENT_ID` y `KEYCLOAK_REPORTES_CLIENT_SECRET` en el entorno del backend; si no se configura, intenta el token del administrador autenticado, que debe tener los permisos correspondientes.

Configurar desde la consola de Keycloak:

1. En el realm `Global-Exchange`, crear un cliente OpenID Connect, por ejemplo `global-exchange-reportes`.
2. Activar **Client authentication** y **Service accounts roles**; desactivar los flujos interactivos que no se utilizan.
3. En **Service account roles**, asignar del cliente `realm-management`: `view-users`, `query-users` y `view-clients`.
4. En `backend/.env`, configurar `KEYCLOAK_REPORTES_CLIENT_ID=global-exchange-reportes` y `KEYCLOAK_REPORTES_CLIENT_SECRET` con el secreto de la pestaña **Credentials**. No enviar el secreto por chat ni incluirlo en Git.
5. Reiniciar el backend y descargar Reporte de accesos para verificar la conexión.

Los secretos nunca se envían al frontend. Si Keycloak falla, el reporte informa error y no descarga un listado parcial.

Referencia: [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/).

## Validación

```powershell
.\.venv\Scripts\python.exe backend/manage.py test core.test_reportes operaciones facturacion --settings=core.settings_test
cd frontend
npm test -- src/services/reportes.test.ts src/pages/admin/Reports.test.tsx src/pages/analyst/Earnings.test.tsx
npx tsc --noEmit
npm run build
```

Las pruebas fiscales usan la base temporal y respuestas simuladas; no emiten documentos reales ni consumen números de Factura Segura. Las pruebas de exportación reabren el Excel generado y comprueban PDF multipágina. `REPORT_QA_DIR` permite guardar los archivos de prueba para inspección visual.
