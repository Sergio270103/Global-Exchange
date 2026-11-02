# PI-85: reenviar factura o reintentar emisión

Se agregan POST /api/facturas/{id}/reintentar/ y /reenviar/, ambos con
{email}, restringidos a cajeros y administradores y al alcance de facturas
visibles para el usuario. El reintento crea una factura de la misma venta;
no modifica ni repite la operación. El reenvío adjunta el KuDE y XML existentes.
El correo se puede editar sin modificar los datos fiscales originales.

La pantalla Facturas ofrece las acciones según el estado electrónico y muestra
el historial de la operación con usuario, fecha, destinatario y resultado.

El cupo efectivo es el menor entre el rango configurado y 49: se conserva
un margen para no llegar a 50. Los rechazos explícitos con code negativo
consumen cupo; los fallos de conexión no. Un timeout al generar conserva
el número reservado y bloquea otra factura para esa venta hasta verificar
el resultado con soporte. Esa reserva reduce las emisiones disponibles,
aunque no se muestra como emisión consumida. La asignación se serializa
con un bloqueo de la moneda PYG compartido por todos los emisores.

La migración 0002 conserva el consumo histórico de facturas emitidas,
aprobadas, rechazadas y errores con code negativo. Registra los intentos
nuevos; no inventa usuarios ni fechas históricas de intentos inexistentes.

Para correo real, configurar SMTP con las variables comentadas en
backend/.env.example. Con el backend de consola se informa que falta
configuración; nunca se informa un correo real como enviado. En simulación
se registra expresamente que no se envió correo ni se gastaron emisiones reales.

Aplicar con: backend/venv/Scripts/python.exe backend/manage.py migrate

Las pruebas usan SQLite temporal, simulación y mocks. No consumen emisiones
reales ni envían correos. Ejecutar pruebas en PostgreSQL al integrar para
verificar también el bloqueo concurrente de la base de producción.
