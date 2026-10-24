# Conversación con IA — Integración de Keycloak

> **Tema:** Explicación de Keycloak y su integración en el proyecto Global Exchange: autenticación, manejo de roles, registro de usuarios, verificación de correo (VERIFY_EMAIL) y actualización de contraseña (UPDATE_PASSWORD).
> **Herramienta:** Gemini (Google AI).
> **Enlace al chat:** https://chatgpt.com/share/6a90af9f-3bf4-83e9-9254-83bd99289503
> **Hito correspondiente:** Hito 3 (Sprint 1) — Criterios IDE, SCC, AMB y funcionalidades de autenticación/registro/roles.
> **Código de proyecto en Jira:** `PI` (Proyecto IS2).

---

## Contexto de la consulta

El proyecto Global-Exchange (React + TypeScript + Vite + Tailwind) requiere usar **Keycloak** para la autenticación y verificación de usuario, así como el manejo de roles. En la conversación se explica cómo funciona Keycloak, qué archivos modificar, cómo configurar Realm/Client/roles/usuarios, y cómo resolver el registro con verificación de correo y actualización de contraseña requeridos por el proyecto.

---

## Resumen por temas

### 1. Concepto clave

Keycloak **no reemplaza** el frontend ni el backend: se convierte en el servidor de autenticación (identidad), encargado de iniciar sesión, gestionar contraseñas, sesiones, roles y emitir tokens (OpenID Connect sobre OAuth 2.0). La aplicación usa esos tokens para saber quién está autenticado y qué puede hacer.

### 2. Arquitectura recomendada

```
Usuario → React/Vite (:5173) → Keycloak (:8080) → Token JWT → Django API (:8000) → PostgreSQL
```

- **React:** interfaz (muestra/oculta según rol).
- **Keycloak:** autenticación, identidad, roles, sesiones, MFA, verificación de correo.
- **Django:** API, lógica de negocio, validación del token (no confiar solo en lo que dice React).
- **PostgreSQL:** datos (clientes, cuentas, operaciones, divisas, cotizaciones).

### 3. Conceptos de Keycloak

- **Realm:** espacio aislado que administra usuarios, credenciales, roles y grupos (ej. `global-exchange`).
- **Client:** una aplicación que usa Keycloak (ej. `global-exchange-frontend`). Para una SPA React debe ser **público** (Client authentication desactivado) y con Redirect URIs y Web Origins bien configurados.
- **Roles:** se crean en Realm roles (ej. `ADMIN`, `OPERADOR`, `CLIENTE` / en el proyecto: `usuario-registrado`, `analista-cambiario`, `admin`). Van en el token como `realm_access.roles`.
- **Token:** Access Token, ID Token y Refresh Token. El adaptador JS los expone con `keycloak.token` y `keycloak.tokenParsed`.

### 4. Archivos a modificar

- **Agregar:** `src/auth/keycloak.ts`, `src/auth/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`.
- **Modificar:** `package.json`, `src/main.tsx`, `src/App.tsx`, y posiblemente `.env`.
- **No tocar inicialmente:** `vite.config.ts`, `index.css`, `types.ts`.

### 5. Configuración en Keycloak

1. Instalar/ejecutar Keycloak (p. ej. con Docker) en `http://localhost:8080`.
2. Crear Realm `global-exchange` (no usar `master` para la app).
3. Crear Client `global-exchange-frontend` (OpenID Connect, público).
4. Configurar Redirect URIs y Web Origins (desarrollo: `http://localhost:5173/*`).
5. Crear roles (ADMIN, OPERADOR, CLIENTE).
6. Crear usuarios de prueba y asignarles roles.

### 6. keycloak.ts (ejemplo)

```ts
import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: "http://localhost:8080",
  realm: "global-exchange",
  clientId: "global-exchange-frontend",
});

export default keycloak;
```

### 7. Verificación de correo (Verify Email)

- No se necesita API externa: Keycloak incorpora la verificación mediante **SMTP** configurado en `Realm settings → Email`.
- Configurar SMTP (Host, Port, From, Username, Password, SSL/TLS) con una cuenta Gmail del sistema.
- Habilitar `Verify Email` en `Authentication → Required actions` (Enabled y, si se desea, Set as default action) y activar `Verify email` en `Realm settings → Login`.
- **VERIFY_EMAIL** y **UPDATE_PASSWORD** son Required Actions distintas e independientes: una comprueba el acceso al correo; la otra obliga a cambiar la contraseña.

### 8. Registro y contraseña (UPDATE_PASSWORD)

- La alternativa recomendada: durante el registro Keycloak crea el usuario; se configuran `VERIFY_EMAIL` y `UPDATE_PASSWORD` como Required Actions. El usuario verifica su correo con el enlace y luego Keycloak muestra el formulario para que establezca su contraseña. **No se requiere una contraseña temporal**.
- La contraseña temporal por Gmail es una opción de mayor complejidad (requiere backend/Admin API para generarla y establecerla en Keycloak) y se reserva solo si el requisito lo exige explícitamente. **No** guardar contraseñas temporales en archivos (mala práctica).
- En el proyecto la rama de integración de Keycloak se nombró `feature/PI-15` (historia "Integrar con Keycloak").

### 9. Protección por rol

`ProtectedRoute` verifica `keycloak.tokenParsed?.realm_access?.roles`; si no hay rol permitido redirige a "no autorizado". **Importante:** ocultar botones en la UI no es suficiente — el backend (Django) debe validar el token y los permisos.

---

## Diálogo completo de la conversación

### Consulta inicial

> **Usuario:**
> La carpeta de mi proyecto global-exchange, está configurada por las siguientes carpetas y archivos que te muestro en imagen. Nos están pidiendo que para dicho proyecto debemos usar keycloak para la autenticación y verificación de usuario, así como el manejo de roles. ¿Podrías explicarme cómo funciona keycloak, qué archivos debo modificar para empezar a utilizarlo?

> **IA:**
> Por la estructura, el proyecto es React + TypeScript + Vite + Tailwind, y Keycloak encaja bien para centralizar la autenticación y los roles. Keycloak no reemplaza el frontend ni el backend: se convierte en el servidor de identidad (registrar, iniciar sesión, gestionar contraseñas, sesiones, roles y emitir tokens). Implementa OpenID Connect (OIDC) sobre OAuth 2.0.

Se describe la estructura sugerida (`src/auth/keycloak.ts`, `AuthContext.tsx`, `components/ProtectedRoute.tsx`), los diagramas de flujo (usuario → keycloak → token → Django), los cuatro conceptos (Realm, Client, Roles, Token), y los pasos: instalar `keycloak-js`, ejecutar Keycloak (Docker en `:8080`), crear Realm `global-exchange`, crear Client `global-exchange-frontend` (público, con Redirect URIs y Web Origins), crear roles (ADMIN/OPERADOR/CLIENTE), crear usuarios.

También se recomienda:
- `keycloak.ts` con la instancia (ver resumen).
- Inicializar en `main.tsx` con `keycloak.init({ onLoad: "check-sso" })`.
- `ProtectedRoute` que verifique `realm_access.roles` y redirija a "no autorizado".
- **No** proteger solo la interfaz: Django debe validar el token y los permisos (modificar tasas, crear usuarios, comprar/vender, saldos, etc.).
- No duplicar el manejo de contraseñas en Django; Keycloak es la fuente de autenticación y Django puede relacionar al usuario por su `keycloak_user_id`.
- `vite.config.ts` generalmente no requiere cambios para Keycloak (solo que la URL de Vite coincida con las Redirect URIs).
- Se recomienda `.env` con `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` (ojo: `VITE_*` queda disponible en el frontend, no usar secretos ahí; una SPA no debe esconder un `client_secret`).
- Orden ideal: instalar Keycloak → crear Realm → Client → roles → usuario de prueba → instalar keycloak-js → keycloak.ts → inicializar en main.tsx → AuthContext → proteger rutas → mostrar/ocultar según rol → configurar Django para validar JWT → proteger endpoints según roles.

---

### Segunda consulta: registro y roles

> **Usuario:**
> Ya pude ingresar a keycloak. Explicame cómo estaría funcionando el proceso de registro siendo que tengo varios roles para distintos usuarios, ya creé dichos roles en realm roles. Necesito que me expliques: cada apartado de keycloak; si los roles creados son correctos; si debo tener varios usuarios para cada tipo de rol; y cómo conectar por medio de la URL y clave secreta mi página web.

> **IA:** (respuesta sobre el funcionamiento de los apartados de Keycloak, la conveniencia de usuarios de prueba por rol, y cómo enlazar la app.)

> **Usuario:**
> Ya está ejecutándose keycloak en el contenedor de Docker. Antes de iniciar el enlace de mi frontend (botón de iniciar sesión, botón de registrarse) con keycloak, tengo las ventanas de inicio de sesión y registro propias. Si anexo directamente el botón de iniciar sesión con keycloak, esa interfaz será la que utilice keycloak. ¿Podría modificar dicha interfaz para que se parezca a la mía, o simplemente pasar esos datos a keycloak para que realice el inicio de sesión y registro?

> **IA:** (explicación sobre que keycloak gestiona el flujo de login/registro con su propia interfaz, la posibilidad de personalizar temas/plantillas, y la recomendación de usar las funcionalidades nativas de keycloak.)

> **Usuario:**
> Tengo los roles que te comparto en imagen, y suponiendo que a uno de los usuarios le añadí el rol de analista-cambiario, me debería cargar el dashboard de analyst que se encuentra en types.ts, pero no lo realiza. ¿A qué se debería eso?

> **IA:**
> Sí. No necesitas una API externa para verificar el Gmail; Keycloak ya tiene el mecanismo de verificación de correo mediante SMTP. Además, con la idea del "token como contraseña temporal" hay una diferencia importante: no recomiendo implementar la verificación de esa manera, porque Keycloak ya separa correctamente ambas cosas.
>
> - Flujo de registro: el usuario pulsa Registrarse → React ejecuta `keycloak.register()` → Keycloak muestra su formulario de registro → se crea el usuario → se marca Verify Email → se envía correo por SMTP → el usuario pulsa el enlace → Keycloak confirma el correo → el usuario puede entrar.
> - No se necesita API de Gmail: Keycloak se comunica directamente con un servidor SMTP (Realm settings → Email).
> - **Verify Email** y **Update Password** son Required Actions distintas: una comprueba si la persona tiene acceso al correo; la otra obliga a cambiar la contraseña. Son independientes.
> - El rol inicial del usuario registrado es `usuario-registrado`; luego el administrador puede cambiarlo a `analista-cambiario` o `admin`.
> - Como actualmente hay `onLoad: 'login-required'`, un usuario no autenticado es llevado automáticamente a la pantalla de login de Keycloak. Tras completar la verificación vuelve al redirectUri y `App.tsx` lee `keycloak.tokenParsed` para decidir el dashboard.

---

### Tercera consulta: contraseña temporal + verificación de Gmail

> **Usuario:**
> La contraseña temporal es un requerimiento del proyecto, y creo que sería más fácil si se enviara junto con la verificación de gmail, es decir; verificacion de gmail: link, contraseña temporal: 12345. ¿Se podría hacer de esa forma a partir de keycloak o debería generar las contraseñas temporales en un archivo aparte?

> **IA:**
> Sí se puede implementar, y para Global Exchange recomiendo no crear un archivo con contraseñas temporales. La contraseña temporal debe ser una credencial administrada por Keycloak, mientras que el envío del correo puede apoyarse en SMTP.
>
> - La contraseña temporal NO debería estar en un archivo ni en un objeto JS (mala práctica de seguridad). Debe estar administrada por Keycloak, pudiendo establecerse mediante su Admin REST API con `temporary = true`.
> - Para una demo se puede usar `12345`, pero es muy débil; mejor algo como `GE-8fK2#mP91`.
> - Keycloak puede enviar el correo por SMTP (verificación, recuperación y otras notificaciones).
> - **Token de verificación ≠ contraseña temporal.** El token del enlace demuestra acceso al correo; la contraseña autentica al usuario. Deben ser dos elementos distintos.
> - Opción A (sencilla): Keycloak envía el correo de verificación, y el sistema envía otro correo con la contraseña temporal. Luego `UPDATE_PASSWORD` obliga a cambiarla.
> - Opción B (un único correo): más compleja, requiere personalización de plantillas.
> - El rol inicial es `usuario-registrado`; el administrador puede cambiarlo después.
> - Para producción, enviar contraseñas por correo no es ideal; se implementa como requisito académico pero conviene documentarlo como decisión derivada del requerimiento.

---

### Cuarta consulta: cómo resolver "update password" tras el registro

> **Usuario:**
> Ya realicé la parte de verificación de gmail. Nos piden realizar la update password, una vez registrado el usuario. Quiere decir que debemos enviar una contraseña temporal o dar acceso directo a la web una vez registrado. Si realizamos lo de actualizar contraseña, la única manera factible es enviar la contraseña temporal por gmail (cuando complete el formulario de registro), ya que el formulario de registro que proporciona keycloak solamente tiene los campos username, email, first name, last name; y la segunda forma sería modificar la redirección una vez que el usuario verifique su cuenta email, es decir, le llega al correo "verificar email: link", al abrir el enlace se verifica con keycloak y lo lleva directamente a un apartado donde pueda asignar una contraseña (no lo veo tan factible como el anterior). ¿Puedes explicar detalladamente si existe algún método más fácil para resolver el problema o, en tal caso, si mi lógica está acertada, muéstrame los pasos a seguir?

> **IA:**
> Tu lógica va bien encaminada, pero hay una tercera alternativa más sencilla: la clave es entender qué significa realmente `UPDATE_PASSWORD` en Keycloak.
>
> **Primero: no necesitas necesariamente enviar una contraseña temporal.** Cuando Keycloak tiene `UPDATE_PASSWORD` como Required Action, significa que el usuario debe cambiar su contraseña antes de completar el flujo de autenticación, y Keycloak ejecuta esto mediante su propia interfaz. No es obligatorio inventar una contraseña temporal.
>
> El flujo recomendado:
> REGISTRO → Keycloak crea usuario → VERIFY_EMAIL → usuario recibe email → clic en "Verificar correo" → Keycloak verifica email → UPDATE_PASSWORD → Keycloak muestra "Nueva contraseña / Confirmar" → usuario establece contraseña → Global Exchange.
>
> - El registro y el cambio de contraseña son flujos diferentes. Keycloak puede crear el usuario con username/email/first name/last name y luego exigir `UPDATE_PASSWORD` mostrando la pantalla para establecer la contraseña.
> - **Ventajas** de esta opción: no creas archivo de contraseñas temporales, ni API para enviarlas, ni lógica de almacenamiento, ni pantalla React de cambio de contraseña, ni sistema de expiración.
> - No necesitas crear una ruta `/register-password` en React ni redirigir manualmente; Keycloak gestiona las Required Actions. La API `executeActionsEmail` permite enviar un enlace que ejecuta acciones como `VERIFY_EMAIL` y `UPDATE_PASSWORD` y luego redirige al cliente.
> - **Cuándo usar contraseña temporal:** solo si el requisito lo exige explícitamente ("se debe enviar una contraseña temporal al correo"). Implica backend/Admin API.
>
> **Pasos de prueba sugeridos (sin tocar React primero):**
> 1. Habilitar `Update Password` en Realm → Authentication → Required actions.
> 2. Crear un usuario de prueba (username, email, first name, last name).
> 3. Configurar en el usuario las Required user actions: Verify email y Update password.
> 4. Probar iniciar sesión desde `http://localhost:5173` y ver qué pantallas encadena Keycloak.
>
> **Comparativa:**
> | Método | Complejidad | ¿Recomendado? |
> |---|---|---|
> | Contraseña temporal por Gmail | Media/alta | 🟡 Si el requisito lo exige explícitamente |
> | VERIFY_EMAIL + UPDATE_PASSWORD | Baja | 🟢 Sí |
> | Crear pantalla propia de contraseña | Media | 🔴 No es necesario |
> | Guardar contraseñas temporales en archivo | Mala práctica | 🔴 No |
>
> **Recomendación final:** no implementar todavía la contraseña temporal; usar `VERIFY_EMAIL` + `UPDATE_PASSWORD` con las funcionalidades nativas de Keycloak. Si el profesor exige "contraseña temporal enviada por Gmail", entonces sí implementarla desde el backend y mantener `UPDATE_PASSWORD` para obligar al cambio posterior.

---

## Decisiones y conclusiones

- **Autenticación, roles, sesiones, verificación de correo, recuperación de contraseña:** gestionadas por **Keycloak** (Realm `global-exchange`, Client `global-exchange-frontend` público).
- **Roles del proyecto (Jira `PI` / Keycloak):** `usuario-registrado` (inicial), `analista-cambiario`, `admin`, entre otros. El rol se lee de `keycloak.tokenParsed?.realm_access?.roles` para decidir el dashboard/interfaz.
- **Registro:** flujo nativo de Keycloak (`keycloak.register()`) con **VERIFY_EMAIL** mediante SMTP.
- **Update Password:** se resuelve como **Required Action de Keycloak** (`UPDATE_PASSWORD`), sin necesidad de contraseña temporal. La contraseña temporal solo se implementaría si el requisito lo exige explícitamente, y en ese caso administrada por Keycloak (no en archivos).
- **Seguridad:** el backend (Django) debe validar el JWT y los permisos; ocultar la UI por rol no es suficiente.
- **Rama de Git para la integración de Keycloak:** `feature/PI-15` (historia "Integrar con Keycloak").
