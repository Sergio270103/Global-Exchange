# CHIA – PI-65: Historial de transacciones (solo consulta)

| Campo | Detalle |
|---|---|
| Hito | 5 – Sprint 3 |
| Historia (Jira) | PI-65 – Historial de transacciones |
| Requerimientos | RF34 (consultar y descargar el historial), RF35 (filtros por fecha, tipo de operación, moneda y estado) |
| Relacionada con | PI-64 (cancelación por cambio de cotización: estados y auditoría) |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 25/09/2026 |

## 1. Objetivo

Completar la pantalla de historial de transacciones del cliente para que
cumpla RF34 y RF35, con los datos restringidos al usuario desde el backend y
con pruebas unitarias.

Checklist planteado al inicio de la conversación:

1. Los cuatro filtros de RF35: fecha, tipo de operación, moneda y estado.
2. Descarga del historial (RF34 dice "descargar", no solo ver).
3. Los cuatro estados del diagrama: Pendiente, Pagada, Cancelada y Anulada.
4. Que cada usuario vea solo lo suyo, validado en el backend.
5. Pruebas unitarias del servicio de historial (PUD).
6. Este documento CHIA.

## 2. Diagnóstico del código existente

La IA revisó `Transactions.tsx`, `services/operaciones.ts` y
`backend/operaciones/views.py` (ya modificados en PI-64) y encontró:

| Punto | Situación encontrada |
|---|---|
| Filtro por fecha | No existía |
| Filtros tipo / moneda / estado | Existían, pero filtraban en React sobre los datos ya descargados |
| Descarga | No había botón |
| Cuatro estados | Ya contemplados desde PI-64 |
| Solo lo propio | **Falla de seguridad**: sin `?mine=1` la API devolvía las operaciones de todos los clientes, y `?cliente=<id>` devolvía las de cualquier cliente. El filtro dependía del frontend |
| Datos de prueba | Si el usuario no tenía operaciones, la tabla mostraba datos simulados (`mockData`) como si fueran reales |

## 3. Solución

### Backend (`backend/operaciones/views.py`)
- `get_queryset()` restringe a los clientes asociados al usuario (tabla
  `ClienteUsuario`, por el `sub` de Keycloak) **aunque no se envíe
  `?mine=1`**. Aplica al listado y al detalle `GET /operaciones/{id}/`
  (una operación ajena da 404).
- Solo el administrador ve todas las operaciones, detectado con
  `_es_personal_autorizado()`, que reutiliza `es_admin()` de
  `monedas/permisos.py`. Si envía `?mine=1`, ve solo lo propio (así su
  pantalla de historial personal no se llena con operaciones ajenas).
- En la conversación se había incluido también al cajero; se corrigió
  porque su tarea (recibir el dinero del administrador y hacer el arqueo al
  abrir y cerrar la caja) no requiere ver las operaciones de todos los
  clientes (principio de mínimo privilegio).
- Nuevos filtros por query string: `desde`, `hasta` (fechas inclusive, formato
  `AAAA-MM-DD`) y `moneda` (coincide con origen o destino). Se mantienen
  `tipo`, `estado`, `cliente` y `buscar`.
- `?cliente=` filtra *dentro* de lo que el usuario puede ver, así que un
  cliente no puede usarlo para ver datos ajenos.
- Antes de aplicar el cambio se hizo `git pull` de `develop` (dos veces) y
  se integró sobre la versión con billeteras (PI-66) y con la comisión
  oculta al cliente (`OperacionPublicSerializer`), para no pisar esos cambios.
- "Solo consulta": el ViewSet no acepta `PUT`, `PATCH` ni `DELETE` (405).

### Frontend
- `services/historial.ts` (nuevo): `listarHistorial()` con los filtros de
  RF35, `validarRangoFechas()`, `historialACsv()`,
  `nombreArchivoHistorial()` y `descargarHistorial()`.
- `services/operaciones.ts`: `listarOperaciones()` acepta `desde`, `hasta` y
  `moneda`.
- `pages/Transactions.tsx`: muestra el historial del **cliente activo** de la
  sesión (un usuario puede operar en nombre de varios clientes; si entró como
  "Cliente 1", ve solo lo de "Cliente 1"); filtros Desde/Hasta, Tipo, Moneda y Estado (con
  los 4 estados) que se envían al backend; búsqueda rápida por ID o cliente;
  botón **Descargar historial**; botón "Limpiar filtros"; mensaje si el rango
  de fechas es inválido; se eliminó el uso de datos de prueba.

### Ajustes tras la prueba manual
- **Columna Estado cortada:** se quitó la columna "Total" (repetía el monto
  recibido que ya muestra "Monto") y se le dio un ancho mínimo a "Estado".
- **El administrador no veía operaciones:** la pantalla siempre pedía
  `?mine=1`. Ahora, si el rol es admin, pide todas (el backend valida el rol).
- **Qué se ve en la columna Estado:** primero la IA propuso ocultar al
  cliente quién canceló; se revisó y se decidió lo contrario:
  - Cliente: el estado y **por quién** se canceló (nada más).
  - Administrador: la vista del historial es de **auditoría**; ve quién
    canceló y el motivo.
  - Para todos se quitó la fecha y la hora de la columna Estado porque
    repetían la columna Fecha. El momento exacto de la cancelación o del
    pago queda en el tooltip (al pasar el mouse) y en el CSV.

### Dashboard: operaciones recientes reales
- La IA propuso primero un dashboard aparte para el administrador
  (`AdminDashboard.tsx`). Se descartó: el admin debe ver el mismo Dashboard
  que el cliente.
- La sección "Operaciones recientes" del Dashboard mostraba datos de prueba.
  Se reemplazó por el componente `components/OperacionesRecientes.tsx`, con
  las últimas 5 operaciones reales: del cliente activo para el usuario y de
  todos los clientes para el admin. "Ver todo →" lleva al historial (para el
  admin, la vista de auditoría). El resto del Dashboard (PI-72) no se tocó.
- Se hizo en un componente aparte porque `Dashboard.tsx` retorna antes para
  el cajero y React no permite hooks después de un `return` condicional.

### Quién realizó cada operación
- En la columna Estado, **Pagada** muestra "por <usuario>" (quién la hizo) y
  **Cancelada** "por <usuario>" (quién la canceló). Pendiente y Anulada no
  muestran nada: la anulación la hace el administrador, no un usuario del
  cliente. Así el responsable de una persona jurídica ve qué funcionario hizo
  cada operación.
- La operación solo guardaba el `sub` de Keycloak. Se agregó
  `usuario_nombre` al serializer, obtenido de `ClienteUsuario.username` (sin
  migraciones y funciona para operaciones viejas). En el listado se resuelve
  con un `Subquery` para no hacer una consulta por fila.
- El CSV suma la columna "Realizada por".
- En la prueba manual se vio que Pagada mostraba el nombre completo y
  Cancelada el usuario de Keycloak. Se unificó: `cancelada_por_nombre` también
  se resuelve desde `ClienteUsuario` y, si el usuario ya no está asociado,
  se usa el valor guardado al cancelar. El dato original queda intacto en la
  base para auditoría.

## 4. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Filtrar en el backend y no en React | Los datos que no le corresponden al usuario nunca salen del servidor; además escala mejor |
| Restricción por usuario siempre activa, no solo con `?mine=1` | Alguien podría llamar a la API directamente sin ese parámetro |
| Descarga en CSV generado en el navegador a partir de lo que se ve | Descarga exactamente lo filtrado, sin endpoint extra; se abre directo en Excel |
| Cliente ve "por quién" canceló; admin además el motivo | El cliente necesita saber quién de su empresa la canceló; el admin audita |
| Sin fecha en la columna Estado | Evita repetir la columna Fecha; el momento exacto sigue en tooltip y CSV (criterio de auditoría de PI-64) |
| Operaciones recientes en un componente aparte | Cambio mínimo en `Dashboard.tsx` (PI-72); su test sigue valiendo (solo se le simuló la API) |
| "Por quién" solo en Pagada y Cancelada | Son las acciones que hace un usuario del cliente; Anulada la hace el admin |
| El CSV no incluye la comisión | El equipo decidió no exponer la comisión al cliente; la descarga respeta lo mismo que devuelve la API |
| CSV con `;`, coma decimal y BOM UTF-8 | Excel en español lo abre en columnas y con los acentos correctos |
| Nombre de archivo con el rango filtrado y la fecha | Permite distinguir descargas |
| El historial se filtra por el cliente activo | Coherente con Comprar/Vender, que opera en nombre del cliente activo; `?cliente=` solo acepta clientes asociados al usuario |
| Se quitaron los datos de prueba | En un historial real, mostrar datos inventados es engañoso |
| Solo el admin ve todo; cajero y analista no | Mínimo privilegio: el arqueo de caja no necesita el historial de todos, y el analista no tiene otros privilegios administrativos (RF49) |

## 5. Pruebas unitarias

| Archivo | Comando | Qué cubre |
|---|---|---|
| `backend/operaciones/test_historial.py` | `python manage.py test operaciones.test_historial` | Seguridad (sin `mine`, `cliente` ajeno, detalle ajeno, usuario sin clientes), usuario con varios clientes filtrando por el activo, roles (admin ve todo y filtra por cliente, con `mine` ve lo suyo; cajero y analista no ven lo ajeno), solo consulta (405), filtro por cada uno de los 4 estados, tipo, moneda, rango de fechas inclusive, fecha inválida, combinados, orden, quién realizó y quién canceló la operación (mismo nombre) y comisión no expuesta (26 pruebas) |
| `frontend/src/services/historial.test.ts` | `npm test -- historial` | Filtros enviados al backend, vista admin (todas), cliente activo, filtros vacíos, rango invertido, los 4 estados, CSV (BOM, encabezado, sin columnas de comisión, columnas, coma decimal, quién/cuándo/por qué de una cancelada, escape de `;` y comillas, columna "Realizada por") y nombre del archivo (25 pruebas) |

| `frontend/src/components/OperacionesRecientes.test.tsx` | `npm test -- OperacionesRecientes` | Usuario ve su cliente activo, admin ve todos, datos reales, máximo 5, "Ver todo" navega al historial, error de carga (6 pruebas) |
| `frontend/src/pages/Transactions.test.tsx` (reescrito) | `npm test -- Transactions` | El test anterior verificaba el respaldo con datos de prueba, que se eliminó. Ahora prueba: historial real del cliente activo, error visible si la API falla (sin datos inventados), "por quién" en Pagada y Cancelada y no en Pendiente, motivo solo para el admin, filtro de estado en el backend con los 4 estados, rango de fechas inválido, descarga y botón deshabilitado sin datos, vista de auditoría del admin (10 pruebas) |
| `frontend/src/pages/Dashboard.test.tsx` (de PI-72, ajustado) | `npm test -- Dashboard` | Se simuló la API y se agregó que el segundo "Ver todo" va al historial |

## 6. Revisión humana

- [X] Se revisó y entendió el código generado antes de integrarlo.
- [X] Se ejecutaron las pruebas unitarias de backend y frontend localmente.
- [X] Se probaron manualmente los cuatro filtros y la combinación entre ellos.
- [X] Se descargó el CSV y se abrió correctamente en Excel.
- [X] Se verificó con dos usuarios distintos que cada uno ve solo lo suyo.