# CHIA ‚Äî Sesi√≥n frontend Hito 4 (2026-09-13)

Asistente: Muse Spark (opencode). Sin commits ni push, solo trabajo local.

## 1. Qu√© se conect√≥ al backend
- Nuevo `src/services/api.ts`: `apiFetch` con `Authorization: Bearer <token>`
  de Keycloak (con `updateToken`), base `VITE_API_URL` (defecto
  `http://127.0.0.1:8000/api`) y errores con el `detail` del backend.
- `services/monedas.ts` reescrito contra `GET/POST/PATCH /api/monedas/`
  (misma firma, `reiniciarMonedas()` queda sin-op).
- Nuevos `services/cotizaciones.ts` (vigentes, historial con rango,
  alta), `services/simulador.ts` (`/api/simulador/` + comisiones),
  `services/clientes.ts` (lista + `misClientes()` v√≠a
  `/asociaciones/?mine=1`), `services/cuentas.ts` (CRUD + baja l√≥gica,
  n√∫mero enmascarado).
- `Rates.tsx`: vigentes, historial por per√≠odo (Hoy/Semana/Mes/A√±o +
  Personalizado con fechas desde/hasta), alta de tasa solo admin/analista.
  El historial es inmutable: "Actualizar" crea un punto nuevo (RNF26),
  se elimin√≥ el borrado f√≠sico.
- `Simulator.tsx`: usa `/api/simulador/` con tasa vigente + comisi√≥n por
  categor√≠a (RF21/RF22), toggle compra/venta, ticker y panel con vigentes.
- `Banks.tsx`: selector de cliente + CRUD contra `/cuentas-bancarias/`.
- `Navbar.tsx`: selector de cliente carga `misClientes()` con respaldo
  a `demoClients` si la API falla.
- `frontend/.env` (local, gitignored) + `.env.example`; `.gitignore`
  ajustado con `!.env.example` para poder commitear el ejemplo.

## 2. Tests corregidos
- `Rates.test.tsx` y `Banks.test.tsx`: mockean `fetch` (antes usaban mocks
  s√≠ncronos).
- `App.test.tsx` y `Sidebar.test.tsx`: expectativa obsoleta
  "Roles y Permisos" (el m√≥dulo se elimin√≥ al delegar roles a Keycloak,
  RF44); ahora afirman su ausencia.

## 3. Verificaci√≥n
- `tsc --noEmit`: limpio. `npm run build`: OK.
- Vitest por archivos: Rates 5/5, Banks 6/6, App+Navbar+Sidebar+admin 37/38
  (luego 47/47 en la segunda tanda con Landing/Login/Register/mockData).
  Nota: `npm test` completo sufre timeouts del pool de workers en esta
  m√°quina (entorno, no asserts); por archivos todo pasa.
- E2E con token real de Keycloak (usuario `tester@local.py`, rol admin):
  `GET /monedas/` 200, `POST /cotizaciones/` 201 con `creado_por`,
  `GET /vigentes/` 200, `GET /simulador/` 200 con desglose.
  Usuario com√∫n: GET 200, POST tasa 403, simulador 200.
- Hallazgo Keycloak: crear usuarios por Admin API exige `username`
  + `firstName`/`lastName` + `attributes.tipo_persona` (requeridos por el
  realm); `editUsernameAllowed=false` no exime el username en la creaci√≥n.
  El `directAccessGrantsEnabled` se activ√≥ solo para la prueba y se
  restaur√≥ a `false` (como est√° en `realm-export.json`).

## 4. SesiÛn Hito 3 frontend (2026-09-13)
- Servicios extendidos: CRUD clientes + asociaciones + comisiones (clientes.ts), mÈtodos de pago (metodos.ts nuevo), actualizarComision (simulador.ts).
- Clients.tsx contra /api/clientes/ (tipo fÌsica/jurÌdica, categorÌa, baja lÛgica, toggle estado, modal de usuarios asociados).
- Users.tsx reenfocado a asociaciones usuario-cliente (las cuentas/roles viven en Keycloak, RF44); alta/baja de asociaciones.
- Configuration.tsx: Monedas, MÈtodos de pago y Comisiones reales contra la API; Seguridad/Notificaciones quedan como preferencias locales.
- Tests: Clients.test y Users.test reescritos con fetch mockeado.
- VerificaciÛn: tsc limpio, build OK, 82 tests frontend en verde por archivos, 25 tests backend en verde.


## 5. Bug Vincular + seeds (2026-09-13)
- Reporte: botÛn Vincular no hacÌa nada. Causa: BD sin clientes (clienteId null, retorno silencioso) porque el backend en ejecuciÛn usaba la base local 5432 sin seeds.
- Fix: seeds 0003_clientes_demo + 0002_cotizaciones_demo aplicadas en AMBAS bases (contenedor 5433 y local 5432); Banks muestra aviso y guÌa si no hay clientes; submit avisa en vez de retornar en silencio.
- Rates: el modal muestra la vigente actual al re-registrar una moneda (aclara que crea un punto nuevo, no duplica).
- Verificado: POST /cuentas-bancarias/ 201 con n˙mero enmascarado; 25 tests backend + Banks/Clients 12/12 en verde; tsc limpio.


## 6. VerificaciÛn Sprint 2 (2026-09-13)
- Backend cotizaciones 5/5 OK tras aislar tests de los seeds (get_or_create + limpieza de historial + update_or_create en comisiones). Suite completa: 25/25.
- Frontend: Rates 5/5, Banks 6/6, nuevo simulador.test.ts 3/3 (desglose, comisiones, error 404). Total mÛdulo: 14/14. tsc limpio.


## 7. PI-71 comprar/vender seg˙n monedas activas (rama feature/PI-71)
- Bug: selects de divisa y pagar-con/recibir-en nacÌan solo de vigentes; el admin desactivaba y seguÌa apareciendo (y PYG fijo).
- Fix en BuySell.tsx: carga listarMonedas(true); universo operable = vigentes n activas; PYG solo si activo; reseteo de selecciones inv·lidas; decimales del cat·logo en formato/redondeo; aviso si no hay tasas operables.
- Test BuySell.test.ts 2/2 (GBP activa visible, ARS con vigente pero inactiva oculta, PYG presente). VerificaciÛn: tsc limpio, 21/21 en suites del ·rea.


## 8. PI-71b activas sin tasa (2026-09-13)
- Reporte: con ARS/USD/PYG activas solo salÌan USD/PYG y solo PYG como contraparte. Causa: ARS activa pero SIN cotizaciÛn (verificado en BD); el filtro la ocultaba en silencio.
- Fix: las activas sin vigente aparecen deshabilitadas '(sin cotizaciÛn)' en ambos selects; BRL deshabilitada con vigente vieja sigue oculta.
- OJO: las dos BD locales divergieron (contenedor 5433 vs local 5432); el runserver del usuario usa una sola. Recomendado reiniciar backend contra 5433.
- Tests BuySell 2/2, ·rea 19/19, tsc limpio.


## 9. PI-71c registro de primera tasa in situ (2026-09-13)
- Pedido: poder dar tasa a monedas sin cotizaciÛn desde Comprar/Vender. Panel ·mbar solo admin/analista (moneda + compra + venta) que POSTea y refresca vigentes.
- Bug propio detectado por el test: el aviso de Èxito vivÌa dentro del panel que se desmonta al quedar sin morosos; se moviÛ fuera.
- Tests BuySell 4/4, ·rea 19/19, tsc limpio. Rama feature/PI-71 sin pushear.


## 10. PI-71d alta de tasa en Monedas (2026-09-13)
- El admin no opera en Comprar/Vender: se quitÛ el panel ·mbar de BuySell (vuelve auth sin uso).
- Currencies (admin) muestra por tarjeta la vigente (C/V) o badge 'Sin cotizaciÛn' + botÛn Registrar tasa (modal con compra/venta, valida venta>=compra, refresca vigentes).
- Tests: Currencies.test.ts nuevo 2/2, BuySell 2/2, ·rea 29/29, tsc limpio, build OK. Rama feature/PI-71 sin pushear.


## 11. PI-71e PYG moneda base (2026-09-13)
- El guaranÌ es la moneda pivote: sus tasas serÌan 1/1 y no significan nada. Su tarjeta muestra 'Moneda base' sin botÛn de tasa.
- Test: PYG sin aviso ni botÛn; resto igual. Currencies 3/3, ·rea 29/29 (reverificado), tsc limpio.


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


## 17. PI-72 revision de test (2026-09-13, rama feature/PI-72)
- Backend 100% cubierto (60/60, 7 archivos): nada que agregar, solo re-verificado.
- Frontend: 6 suites de servicios nuevas (20 casos) + 11 paginas + Layout (Notifications, Invoices, Payments, Simulator, Transactions, Dashboard, Configuration, CashierDashboard, CashCountView, RatesManagement, Earnings).
- Full suite 35 archivos 142/142 en verde; 2 timeouts ampliados a 30s (Register, Clients) por carga paralela.
- tests-global-exchange.txt en Escritorio para la profesora. Sin push.


## 18. PI-38 alertas de tasas (2026-10-10, rama feature/PI-38)
- services/alertas.ts nuevo (listar/crear/actualizar/pausar/eliminar/historial) + 6 tests.
- components/AlertasTasas.tsx nuevo: pestana real en Notifications (form par+direccion+umbral, editar/pausar/eliminar, historial) + 5 tests.
- Notifications.tsx: disparos ejecutados tambien en el feed (filtro Rate); resto mock hasta PI de notificaciones generales.
- Fix tsc latente PI-72 en CashierDashboard.test.tsx (cast HTMLElement). Full suite 41 archivos 236/236, build OK. Sin push.


## 19. PI-38 flujo real del analista (2026-10-10, rama feature/PI-38)
- RatesManagement era mock (setTimeout, sin POST): se conecto al backend (vigentes + listarMonedas al abrir, crearCotizacion por moneda editada al guardar, historial real en auditoria, validacion venta>=compra, error 403 visible).
- RatesManagement.test.tsx reescrito con servicios mockeados (3 tests). Full suite 41 archivos 238/238, tsc limpio, build OK. Sin push.


## 20. PI-38 campanita real + modal al entrar (2026-10-10, rama feature/PI-38)
- Navbar: campanita con disparos reales (historialDisparos), sin mocks; vacio muestra 'Sin notificaciones'.
- Notifications: feed real sin mocks (filtros Todas/No leidas/Tasas/Alertas); Transactions/Invoice mock eliminados.
- ModalAlerta nuevo: recuadro grande al entrar al dashboard (rol user) con disparos no vistos + X (sessionStorage una vez por sesion) + boton Ver en Notificaciones.
- Tests: Navbar (11), Notifications (4), ModalAlerta (4), Dashboard mock alertas. Full suite 42 archivos 244/244, tsc limpio, build OK. Sin push.


## 21. PI-38 re-arme + modal + leidas persistentes (2026-10-10, rama feature/PI-38)
- Re-arme: si la tasa vuelve al lado previo, ejecutada->activa y el proximo cruce dispara de nuevo (historial suma disparo; sin duplicar del mismo lado).
- ModalAlerta: max-h 90vh con scroll + responsive (estaba cortado).
- Leidas/eliminadas persisten recargas (localStorage, helpers en services/alertas.ts) en campanita y feed.
- Backend 168/168 (13 alertas), frontend 42 archivos 245/245, tsc limpio, build OK. Sin push.


## 22. PI-42 comprobante interno (2026-10-11, rama feature/PI-42)
- services/comprobantes.ts nuevo (emitir/listar/detalle) + 3 tests.
- ComprobanteVista nuevo: recibo imprimible (window.print + CSS print) + Descargar PDF (jspdf) + 2 tests.
- CashierDashboard: emision real (crear+confirmar efectivo, comprobante, vista, historial real con Reimprimir) + 3 tests; NC queda informativa (PI facturacion).
- index.css: reglas @media print. Full suite 45 archivos 270/270, tsc limpio, build OK. Sin push.

