# Conversación con IA — CRUD de medios de pago del cliente

> **Tema:** Implementación del CRUD de medios de pago del cliente (Hito 4, Sprint 2, criterio ALC) con datos en `mockData` (sin base de datos aún).
> **Herramienta:** Muse Spark (Meta) vía OpenCode.
> **Enlace al chat:** conversación local, sin enlace público.
> **Hito correspondiente:** Hito 4 (Sprint 2) — Criterios ALC (alcance), PUD (pruebas unitarias y documentación) y SCC (rama feature).
> **Historia Jira / rama:** `feature/PI-62`.

---

## Contexto de la consulta

El ítem "CRUD de medios de pago cliente" del Sprint 2 se sostiene en la ERS:

- **RF26:** pagos mediante transferencias bancarias o billeteras digitales.
- **RF16:** vinculación de cuentas bancarias con datos mínimos (Nombre, Apellido, Nº Cédula, Entidad bancaria, Nº de cuenta bancaria y Código Bancario).
- **RF15/RF17:** billetera digital multidivisa por cliente y consulta de saldos.
- No es el RF42 (habilitar/deshabilitar métodos a nivel plataforma, lado admin) ni el "CRUD de medio de acreditación" del Sprint 3 (destino de fondos). Es la gestión de los **propios medios de pago del cliente** (rol `user`).

Estado previo en código: el menú `user` tenía "Cuentas Bancarias" (`banks`) pero renderizaba `BankAccountsPlaceholder`; `Wallets.tsx` mostraba cuentas solo en lectura (botones sin handlers); `Payments.tsx` es historial con filtro, sin CRUD.

## Decisiones tomadas con la IA

1. Nueva página `src/pages/Banks.tsx` conectada al `case 'banks'` de `App.tsx`, reemplazando el placeholder.
2. Interfaz `BankAccount` en `src/types.ts` con los 6 campos del RF16 + moneda + estado.
3. `bankAccounts` en `mockData.ts` extendido de forma aditiva (se conservan todos los campos que lee `Wallets.tsx`, archivo de un compañero que no se tocó).
4. El CRUD opera sobre copia local (`useState([...bankAccounts])`), sin mutar el módulo, para no afectar a `Wallets.tsx` en la misma sesión.
5. Eliminación definitiva con modal de confirmación (alcance literal de "CRUD").
6. Al editar una cuenta cuyo número viaja enmascarado, el campo puede quedar vacío y se conserva el valor original (se valida solo si se escribe uno nuevo).
7. Alcance mínimo estricto: no se tocaron `Payments.tsx`, menús, admin/analyst/cashier ni Keycloak. En `Wallets.tsx` (archivo del compañero) solo se habilitó el botón muerto "+ Agregar cuenta" para que navegue al CRUD (`navigate('banks')`), más el prop `navigate` necesario y su paso desde `App.tsx`; el resto de esa vista quedó intacto.

## Archivos creados/modificados

- `frontend/src/pages/Banks.tsx` (nuevo): listado, modal alta/edición con validación, modal de confirmación de borrado, estado vacío.
- `frontend/src/pages/Banks.test.tsx` (nuevo): 6 pruebas (listado, validación, alta, edición, borrado con confirmación, estado vacío).
- `frontend/src/App.tsx`: `case 'banks'` → `<Banks />`; eliminado `BankAccountsPlaceholder` en desuso.
- `frontend/src/types.ts`: interfaz `BankAccount`.
- `frontend/src/data/mockData.ts`: campos RF16 en `bankAccounts` + tipado del array.

## Verificación

- `npx vitest run src/pages/Banks.test.tsx`: 6/6 pasando.
- Suite completa: 82/84. Los 2 fallos (`App.test.tsx` admin, `Sidebar.test.tsx` admin) son **preexistentes en `develop`** — se verificó con los cambios apartados (`git stash`) que fallan igual sin este feature; provienen del refactor de roles de los compañeros, fuera de este alcance.
- `npm run build`: compila sin errores.
