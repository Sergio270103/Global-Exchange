# CHIA â€” SesiÃ³n frontend Hito 4 (2026-09-13)

Asistente: Muse Spark (opencode). Sin commits ni push, solo trabajo local.

## 1. QuÃ© se conectÃ³ al backend
- Nuevo `src/services/api.ts`: `apiFetch` con `Authorization: Bearer <token>`
  de Keycloak (con `updateToken`), base `VITE_API_URL` (defecto
  `http://127.0.0.1:8000/api`) y errores con el `detail` del backend.
- `services/monedas.ts` reescrito contra `GET/POST/PATCH /api/monedas/`
  (misma firma, `reiniciarMonedas()` queda sin-op).
- Nuevos `services/cotizaciones.ts` (vigentes, historial con rango,
  alta), `services/simulador.ts` (`/api/simulador/` + comisiones),
  `services/clientes.ts` (lista + `misClientes()` vÃ­a
  `/asociaciones/?mine=1`), `services/cuentas.ts` (CRUD + baja lÃ³gica,
  nÃºmero enmascarado).
- `Rates.tsx`: vigentes, historial por perÃ­odo (Hoy/Semana/Mes/AÃ±o +
  Personalizado con fechas desde/hasta), alta de tasa solo admin/analista.
  El historial es inmutable: "Actualizar" crea un punto nuevo (RNF26),
  se eliminÃ³ el borrado fÃ­sico.
- `Simulator.tsx`: usa `/api/simulador/` con tasa vigente + comisiÃ³n por
  categorÃ­a (RF21/RF22), toggle compra/venta, ticker y panel con vigentes.
- `Banks.tsx`: selector de cliente + CRUD contra `/cuentas-bancarias/`.
- `Navbar.tsx`: selector de cliente carga `misClientes()` con respaldo
  a `demoClients` si la API falla.
- `frontend/.env` (local, gitignored) + `.env.example`; `.gitignore`
  ajustado con `!.env.example` para poder commitear el ejemplo.

## 2. Tests corregidos
- `Rates.test.tsx` y `Banks.test.tsx`: mockean `fetch` (antes usaban mocks
  sÃ­ncronos).
- `App.test.tsx` y `Sidebar.test.tsx`: expectativa obsoleta
  "Roles y Permisos" (el mÃ³dulo se eliminÃ³ al delegar roles a Keycloak,
  RF44); ahora afirman su ausencia.

## 3. VerificaciÃ³n
- `tsc --noEmit`: limpio. `npm run build`: OK.
- Vitest por archivos: Rates 5/5, Banks 6/6, App+Navbar+Sidebar+admin 37/38
  (luego 47/47 en la segunda tanda con Landing/Login/Register/mockData).
  Nota: `npm test` completo sufre timeouts del pool de workers en esta
  mÃ¡quina (entorno, no asserts); por archivos todo pasa.
- E2E con token real de Keycloak (usuario `tester@local.py`, rol admin):
  `GET /monedas/` 200, `POST /cotizaciones/` 201 con `creado_por`,
  `GET /vigentes/` 200, `GET /simulador/` 200 con desglose.
  Usuario comÃºn: GET 200, POST tasa 403, simulador 200.
- Hallazgo Keycloak: crear usuarios por Admin API exige `username`
  + `firstName`/`lastName` + `attributes.tipo_persona` (requeridos por el
  realm); `editUsernameAllowed=false` no exime el username en la creaciÃ³n.
  El `directAccessGrantsEnabled` se activÃ³ solo para la prueba y se
  restaurÃ³ a `false` (como estÃ¡ en `realm-export.json`).

## 4. Sesión Hito 3 frontend (2026-09-13)
- Servicios extendidos: CRUD clientes + asociaciones + comisiones (clientes.ts), métodos de pago (metodos.ts nuevo), actualizarComision (simulador.ts).
- Clients.tsx contra /api/clientes/ (tipo física/jurídica, categoría, baja lógica, toggle estado, modal de usuarios asociados).
- Users.tsx reenfocado a asociaciones usuario-cliente (las cuentas/roles viven en Keycloak, RF44); alta/baja de asociaciones.
- Configuration.tsx: Monedas, Métodos de pago y Comisiones reales contra la API; Seguridad/Notificaciones quedan como preferencias locales.
- Tests: Clients.test y Users.test reescritos con fetch mockeado.
- Verificación: tsc limpio, build OK, 82 tests frontend en verde por archivos, 25 tests backend en verde.


## 5. Bug Vincular + seeds (2026-09-13)
- Reporte: botón Vincular no hacía nada. Causa: BD sin clientes (clienteId null, retorno silencioso) porque el backend en ejecución usaba la base local 5432 sin seeds.
- Fix: seeds 0003_clientes_demo + 0002_cotizaciones_demo aplicadas en AMBAS bases (contenedor 5433 y local 5432); Banks muestra aviso y guía si no hay clientes; submit avisa en vez de retornar en silencio.
- Rates: el modal muestra la vigente actual al re-registrar una moneda (aclara que crea un punto nuevo, no duplica).
- Verificado: POST /cuentas-bancarias/ 201 con número enmascarado; 25 tests backend + Banks/Clients 12/12 en verde; tsc limpio.


## 6. Verificación Sprint 2 (2026-09-13)
- Backend cotizaciones 5/5 OK tras aislar tests de los seeds (get_or_create + limpieza de historial + update_or_create en comisiones). Suite completa: 25/25.
- Frontend: Rates 5/5, Banks 6/6, nuevo simulador.test.ts 3/3 (desglose, comisiones, error 404). Total módulo: 14/14. tsc limpio.


## 7. PI-71 comprar/vender según monedas activas (rama feature/PI-71)
- Bug: selects de divisa y pagar-con/recibir-en nacían solo de vigentes; el admin desactivaba y seguía apareciendo (y PYG fijo).
- Fix en BuySell.tsx: carga listarMonedas(true); universo operable = vigentes n activas; PYG solo si activo; reseteo de selecciones inválidas; decimales del catálogo en formato/redondeo; aviso si no hay tasas operables.
- Test BuySell.test.ts 2/2 (GBP activa visible, ARS con vigente pero inactiva oculta, PYG presente). Verificación: tsc limpio, 21/21 en suites del área.


## 8. PI-71b activas sin tasa (2026-09-13)
- Reporte: con ARS/USD/PYG activas solo salían USD/PYG y solo PYG como contraparte. Causa: ARS activa pero SIN cotización (verificado en BD); el filtro la ocultaba en silencio.
- Fix: las activas sin vigente aparecen deshabilitadas '(sin cotización)' en ambos selects; BRL deshabilitada con vigente vieja sigue oculta.
- OJO: las dos BD locales divergieron (contenedor 5433 vs local 5432); el runserver del usuario usa una sola. Recomendado reiniciar backend contra 5433.
- Tests BuySell 2/2, área 19/19, tsc limpio.


## 9. PI-71c registro de primera tasa in situ (2026-09-13)
- Pedido: poder dar tasa a monedas sin cotización desde Comprar/Vender. Panel ámbar solo admin/analista (moneda + compra + venta) que POSTea y refresca vigentes.
- Bug propio detectado por el test: el aviso de éxito vivía dentro del panel que se desmonta al quedar sin morosos; se movió fuera.
- Tests BuySell 4/4, área 19/19, tsc limpio. Rama feature/PI-71 sin pushear.


## 10. PI-71d alta de tasa en Monedas (2026-09-13)
- El admin no opera en Comprar/Vender: se quitó el panel ámbar de BuySell (vuelve auth sin uso).
- Currencies (admin) muestra por tarjeta la vigente (C/V) o badge 'Sin cotización' + botón Registrar tasa (modal con compra/venta, valida venta>=compra, refresca vigentes).
- Tests: Currencies.test.ts nuevo 2/2, BuySell 2/2, área 29/29, tsc limpio, build OK. Rama feature/PI-71 sin pushear.


## 11. PI-71e PYG moneda base (2026-09-13)
- El guaraní es la moneda pivote: sus tasas serían 1/1 y no significan nada. Su tarjeta muestra 'Moneda base' sin botón de tasa.
- Test: PYG sin aviso ni botón; resto igual. Currencies 3/3, área 29/29 (reverificado), tsc limpio.


## 12. PI-71f alta movida a Monedas (2026-09-13)
- El panel ambar en BuySell se quito: el admin no opera ahi. BuySell solo informa activas sin tasa (deshabilitadas).
- El alta vive en Monedas (admin): vigente por tarjeta + modal Registrar tasa. Tests 16/16 en el area, tsc limpio, build OK.


## 13. PI-66 vinculacion billetera/cuenta (2026-09-13, rama feature/PI-66)
- Backend app billeteras: Billetera (saldo 0 lazy, unica por cliente+moneda) + MedioAcreditacion CRUD con default unico; Operacion suma billetera_destino/cuenta_origen (registro, validando cliente y moneda) + migracion 0004. Se registro INSTALLED_APPS a operaciones (tus compas la habian creado sin registrar).
- Frontend: billeteras.ts, Wallets real (saldos + CRUD medios + link a Banks), BuySell con Pagar con (cuentas) y Acreditar en (billeteras) + default preseleccionado; operaciones.ts extendido.
- Tests: backend 53/53 (8 billeteras + 4 vinculacion nuevos), frontend Wallets 3/3 + BuySell 3/3, area 32/32, tsc limpio, build OK. Sin push.


## 14. PI-66 decision menu admin (2026-09-13)
- Se evaluo agregar Billeteras al menu admin y se REVERTIO: ERS RF15/RF17 asigna billetera al cliente que opera (rol user); el admin cubre usuarios/monedas/tasas/ganancias. Para admin, Wallets mostraria 'Sin cliente asociado' (misClientes vacio).
- Verificacion admin: Django admin (billeteras/medios/operaciones con vinculacion) + Clientes/Usuarios. Sidebar y App en verde.


## 15. PI-66b acreditacion al confirmar (2026-09-13)
- Movimiento real: _marcar_confirmada acredita billetera_destino += monto_recibido con select_for_update + Movimiento de auditoria (RNF6), todo en el atomic existente. Solo rama PAGADA; re-cotizacion no mueve; re-confirmar da 400 (idempotente); cuenta_origen externa no se toca; sin vinculo confirma igual.
- Migracion billeteras.0002 en ambas BD. Tests backend 57/57 (4 acreditacion nuevos). Sin cambios frontend, sin push.


## 16. PI-66c debito origen opcion B (2026-09-13)
- Operacion suma billetera_origen (migracion 0005); alta valida existencia/dueno/moneda/fondos con 400 'No hay saldo suficiente...'; confirmar re-valida con lock y si no alcanza va 400 con rollback (sigue PENDIENTE); debito+credito con Movimiento CREDITO/DEBITO.
- BuySell Pagar con ofrece cuentas y billeteras; operaciones.ts extendido. Tests backend 60/60 (3 debito nuevos), frontend area 35/35 + BuySell/Wallets, tsc limpio, build OK, ambas BD migradas. Sin push.

