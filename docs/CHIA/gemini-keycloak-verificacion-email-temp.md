# Conversación con IA — Verificación de correo y contraseña temporal en Keycloak

> **Tema:** Implementación de la verificación de correo electrónico (VERIFY_EMAIL) con Keycloak, incluyendo el envío de una contraseña temporal al usuario durante el registro (flujo exigido por la regla de negocio del proyecto).
> **Herramienta:** Gemini (Google AI).
> **Enlace al chat:** https://share.gemini.google/v7kIVRO4x8dV
> **Hito correspondiente:** Hito 3 (Sprint 1) — Criterios IDE, AMB y funcionalidades de autenticación/registro/verificación de correo.
> **Código de proyecto en Jira:** `PI` (Proyecto IS2).

---

## Contexto de la consulta

El flujo de negocio del proyecto exige que, cuando el usuario se registra en Global Exchange, reciba por correo tanto el **enlace de verificación de Gmail** como una **contraseña temporal**. Con esa contraseña temporal el usuario inicia sesión y luego, mediante la acción `UPDATE_PASSWORD`, establece su contraseña definitiva. La conversación analiza si esto se puede hacer de forma 100% nativa con Keycloak y las alternativas para implementarlo.

Flujo objetivo planteado:

```
Usuario se registra
  → Keycloak crea el usuario
      ├── Rol: usuario-registrado
      ├── Email verificado: NO
      ├── Contraseña temporal: SÍ
      └── Required Actions: VERIFY_EMAIL, UPDATE_PASSWORD
  → Se envía correo (enlace verificar Gmail + contraseña temporal)
  → Usuario hace clic en el enlace → Keycloak verifica el correo
  → Usuario inicia sesión con contraseña temporal
  → Keycloak exige UPDATE_PASSWORD
  → Usuario establece su contraseña definitiva → Global Exchange
```

---

## Resumen por temas

### 1. Bloqueo técnico de Keycloak

Por seguridad, Keycloak **encripta las contraseñas al instante**. Cuando el sistema intenta enviar la plantilla de correo VERIFY_EMAIL, Keycloak ya no conoce la contraseña en texto plano y **no puede inyectarla en el mensaje**. Por lo tanto, enviar una contraseña temporal junto con el correo de verificación **no se puede hacer de forma 100% nativa** con las pantallas de registro de Keycloak.

### 2. Tres caminos posibles

1. **Orquestación desde un Backend propio (la más flexible):** el backend recibe los datos, genera una contraseña temporal, crea el usuario en Keycloak. A través de la Keycloak Admin REST API (`POST /admin/realms/{realm}/users`), asigna rol `usuario-registrado`, establece la contraseña temporal (`temporary: true`) y fija las Required Actions (`VERIFY_EMAIL`, `UPDATE_PASSWORD`). Luego el propio backend envía el correo personalizado con el enlace y la contraseña.
2. **Flujo nativo "Magic Link" (el estándar más seguro):** se crea el usuario sin contraseña y se usa la API Execute Actions Email para que el usuario haga clic en un enlace temporal que lo lleva a establecer su contraseña definitiva. Verifica el correo y evita gestionar contraseñas temporales.
3. **Extensión con un SPI en Java (Keycloak autónomo):** programar un `EventListenerProvider` (SPI) que intercepte el registro, genere la contraseña, la fuerce en la base de datos y use el `EmailTemplateProvider` para enviar una plantilla FreeMarker (.ftl) personalizada con la contraseña generada como variable.

### 3. Importante: no llamar a la Admin API desde React

No se puede implementar la opción 1 directamente en el frontend (React): nunca se debe llamar a la Keycloak Admin REST API desde el navegador, porque requeriría exponer credenciales de administrador (fallo crítico de seguridad). Se necesita un backend intermediario con un **Service Account** (cliente con `Client authentication` activado y `Service accounts roles`, rol `realm-admin`), que obtenga un token vía `grant_type=client_credentials` y cree los usuarios.

### 4. Configuración nativa (verificación por correo sin backend)

Cuando NO se toca el backend y solo se conectan Keycloak + frontend, el flujo nativo se configura así:

- **Paso 1 — SMTP en Keycloak:** en `Realm settings → Email` configurar host, puerto, From, Authentication (ON), usuario y contraseña del SMTP (para Gmail usar una **contraseña de aplicación**, no la contraseña normal). Usar `Test connection`.
- **Paso 2 — Registro y verificación obligatoria:** en `Realm settings → Login` activar `User registration` (ON) y `Verify email` (ON).
- **Paso 3 — keycloak.ts:** el `keycloak.ts` del proyecto debe usar `onLoad: 'check-sso'` (no `login-required`), para que la Landing pública se vea y los botones `keycloak.login()` / `keycloak.register()` funcionen cuando el usuario haga clic.

### 5. Errores frecuentes resueltos

- **"No se permite el registro":** no tiene que ver con el código; hay que activar `User registration` en el realm correcto.
- **Configurar en el realm correcto:** todo debe hacerse en el realm `Global-Exchange`, no en `master`. El `master` es solo para administrar el servidor y no afecta a la app.
- **Fallo al enviar correo:** el registro funciona pero el envío falla por SMTP mal configurado. Revisar Host `smtp.gmail.com`, Port `465` con `Enable SSL` ON (o `587` con `Enable StartTLS`), `Authentication` ON, y usar **contraseña de aplicación** de Gmail.
- **ERR_CONNECTION_REFUSED al abrir el enlace:** Keycloak está apagado/inaccesible en ese momento; hay que tener el servidor corriendo y abrir el enlace desde la misma PC donde corre Keycloak (el enlace usa `localhost`).
- **"El usuario ya existe":** la cuenta de prueba ya se creó; borrarla desde `Users` o iniciar sesión con ella y reenviar el correo.

### 6. Contraseña temporal: se puede o no nativamente

- **No se puede 100% nativo** con las pantallas de registro de Keycloak: el sistema no genera ni envía contraseñas temporales durante el auto-registro por estándares de seguridad.
- Para exigir el envío de una contraseña temporal hay que: construir un **Backend Intermediario** (crear usuario vía Admin API con `temporary: true` y `UPDATE_PASSWORD`, y enviar el correo con la contraseña) o desarrollar un **plugin Java (SPI)**.

### 7. ¿PIN / OTP por correo (SMTP)?

- Keycloak, de forma **100% nativa**, aplica la misma lógica pero con **enlaces (Action Tokens)** en lugar de PIN numérico (un enlace de verificación/actualización es una contraseña temporal de un solo uso incrustada en una URL).
- OTP por correo **sí** existe nativamente, pero para el **inicio de sesión (2FA)**, no para el registro.
- Para un **PIN numérico en el registro** hay dos caminos:
  1. **Plugin de la comunidad (SPI):** descargar un `.jar` (p. ej. keycloak-email-otp-authenticator), copiarlo en la carpeta `providers`, reconstruir (`bin\kc.bat build`), reiniciar (`bin\kc.bat start-dev`), **duplicar** el flujo Registration, agregar el nuevo paso como Required (y deshabilitar el nativo de Verify Email por enlace), y asignar el flujo duplicado en `Bindings` como `Registration flow`.
  2. **Passwordless Registration nativa (sin PIN):** desactivar el campo de contraseña en el registro; Keycloak envía un enlace de un solo uso, y al hacer clic lleva al usuario a una pantalla obligatoria "Actualiza tu contraseña". Así el usuario no tiene contraseña activa ni acceso hasta demostrar que controla el correo.

---

## Diálogo completo de la conversación

### Consulta inicial: verificación por correo + contraseña temporal

> **Usuario:** (describe el flujo con VERIFY_EMAIL y contraseña temporal en el registro) "...me ayudas a implementar la verificación por correo con keycloak donde el correo también debe contener la contraseña temporal?"

> **IA:**
> El flujo que planteas es excelente para un onboarding corporativo, pero implementarlo de forma 100% nativa en Keycloak tiene un bloqueo técnico: por seguridad, Keycloak encripta las contraseñas al instante. Cuando el sistema intenta enviar la plantilla de correo VERIFY_EMAIL, Keycloak ya no conoce la contraseña en texto plano y no puede inyectarla en el mensaje.
>
> Tres caminos viables:
> - **Opción 1: Orquestación desde tu Backend (la más flexible).** El backend genera una contraseña temporal, llama a la Keycloak Admin REST API (`POST /admin/realms/{realm}/users`) para crear el usuario, asignarle el rol usuario-registrado, establecer la contraseña temporal y fijar las Required Actions (VERIFY_EMAIL, UPDATE_PASSWORD); luego solicita el token/enlace de verificación y el backend envía el correo final (con SendGrid, AWS SES, NodeMailer, etc.) con el link y la contraseña temporal.
> - **Opción 2: El flujo nativo "Magic Link" (el estándar más seguro).** Se crea el usuario sin contraseña; se usa la API Execute Actions Email para enviar un correo con la acción UPDATE_PASSWORD; el usuario hace clic en un enlace seguro y temporal y Keycloak le pide que ingrese su nueva contraseña. Verifica el correo y evita generar/enviar contraseñas temporales.
> - **Opción 3: Extensión con un SPI en Java (Keycloak autónomo).** Programar un plugin EventListenerProvider (SPI) en Java, interceptar el registro, generar la contraseña, forzarla en la base de datos y usar EmailTemplateProvider con una plantilla FreeMarker (.ftl) personalizada pasándole la contraseña generada como variable.

> **Usuario:** "Sí [quiero ver los endpoints y JSON]. Estos son mis documentos, me guías para implementar la opción 1"

> **IA:**
> Al analizar App.tsx y Landing.tsx hay un concepto arquitectónico crucial: **No puedes implementar la Opción 1 directamente en tu frontend (React)**. En Landing.tsx el botón de registro llama a la interfaz nativa de Keycloak (`keycloak.register()`). Para la Opción 1 hay que construir un formulario de registro propio en React y enviar esos datos a un Backend Intermediario (Node.js, Python, Java, etc.). **Nunca** llamar a la Keycloak Admin REST API desde React (expondría credenciales de administrador en el navegador, fallo crítico de seguridad).
>
> Guía para el Backend Intermediario:
> - **Paso 1: Service Account en Keycloak.** Crear un cliente (ej. `backend-api`), activar `Client authentication` y `Service accounts roles`, y asignarle el rol `realm-admin`.
> - **Paso 2: Token de administrador.** `POST /realms/{tu-realm}/protocol/openid-connect/token` con `client_id=backend-api`, `client_secret=...`, `grant_type=client_credentials`.
> - **Paso 3: Crear el usuario y la contraseña temporal.** `POST /admin/realms/{tu-realm}/users` con `Authorization: Bearer {token}`, payload JSON con `username`, `email`, `firstName`, `lastName`, `enabled: true`, `emailVerified: false`, `credentials: [{ type: "password", value: "TempPass123!", temporary: true }]` y `requiredActions: ["UPDATE_PASSWORD", "VERIFY_EMAIL"]`. El backend genera la cadena aleatoria.
> - **Paso 4: Enviar el correo personalizado** (Nodemailer, AWS SES, SendGrid).
>
> **Experiencia del usuario:** como la API de Keycloak no devuelve un "enlace mágico" para pegar en el correo propio, el flujo más limpio es: el correo del backend dice "Bienvenido. Tu contraseña temporal es: TempPass123!. Ingresa aquí: [enlace a tu App]"; el usuario inicia sesión normal; Keycloak valida la contraseña temporal pero detiene el login por las requiredActions; pide cambiar la contraseña (UPDATE_PASSWORD); luego dice "Necesitas verificar tu correo" (VERIFY_EMAIL) y envía su correo oficial nativo con el enlace de verificación.
>
> **Cambios en React:** en Landing.tsx cambiar el botón de `keycloak.register()` a redirigir al componente propio de registro (`navigate('register')`), y en `<Register/>` armar el formulario que hace POST a un backend (ej. `https://api.tudominio.com/auth/register`).

---

### Nueva consulta: solución más simple solo con SMTP (sin tocar backend)

> **Usuario:**
> keycloak puede realizar la autenticación de email por medio de correo, lo que necesito es que me ayudes a realizar el proceso para conectar con SMTP, y una vez el usuario ingrese a la web de global exchange y se registre le solicite la verificación de correo; es decir, al presionar el botón de registro, además de `keycloak.register()`, keycloak deberá enviar un correo de verificación a la cuenta indicada. Ten en cuenta que en esta fase del proyecto no vamos a tocar aún el backend; solamente es la conexión de keycloak con mi frontend y la verificación por email. Te comparto el archivo keycloak.ts que utilizo.

> **IA:**
> Perfecto, este enfoque es mucho más sencillo y es ideal cuando no hay backend. Al delegar todo a Keycloak, el flujo es: el usuario hace clic en "Registrarse" → se abre la pantalla nativa de Keycloak (Nombre, Apellido, Correo y contraseña definitiva) → Keycloak detiene el acceso y muestra "Verifica tu correo" y envía un email con un enlace seguro → el usuario hace clic en el enlace → Keycloak confirma la cuenta y redirige a la plataforma autenticado.
>
> **Paso 1: Configurar el servidor SMTP en Keycloak.** En la consola (`http://localhost:8080/admin`), seleccionar el realm Global-Exchange, ir a Realm Settings → Email. Completar: Host (ej. `smtp.gmail.com` o `smtp.sendgrid.net`), Port (`465` para SSL o `587` para TLS), From, Enable SSL / Enable StartTLS, Authentication (ON), Username y Password. Para Gmail usar una **Contraseña de aplicación**. Luego `Test connection`.
>
> **Paso 2: Habilitar Registro y Verificación Obligatoria.** En Realm Settings → Login: `User registration` → ON y `Verify email` → ON. Guardar.
>
> **Paso 3: Corrección vital en keycloak.ts.** El código usa `onLoad: 'login-required'`, que **romperá la Landing pública** (forzaría a ir a Login apenas se entra al sitio). Debe cambiarse a `onLoad: 'check-sso'` para que la Landing sea pública y los botones `keycloak.login()` / `keycloak.register()` funcionen al hacer clic.

---

### Consulta: ¿host = mi Gmail o servidor SMTP web?

> **Usuario:** ¿el host debería ser mi Gmail que utilizo o algún servidor smtp que encuentre en la web?

> **IA:**
> Depende de la fase del proyecto:
> - **Para Desarrollo y Pruebas (usa tu Gmail):** Host `smtp.gmail.com`, Port `465` con Enable SSL (o `587` con Enable StartTLS), Username = tu correo, Password = **Contraseña de aplicación de Google** (no la contraseña normal; activar la verificación en 2 pasos y crear una contraseña de aplicación de 16 letras con el nombre "Keycloak").
> - **Para Producción y Usuarios Reales (servicio SMTP web):** no usar Gmail personal (confianza, límites de envío, spam). Usar servicios con planes gratuitos: **Resend** (3.000 correos/mes), **Brevo** (300/día), **SendGrid** (100/día), **Mailtrap**.
> - Plan de acción: hoy configurar Gmail con contraseña de aplicación y probar; antes de lanzar, crear cuenta en Resend/SendGrid/Brevo y solo cambiar las credenciales en Keycloak (el código de la app no cambia).

---

### Consulta: "No se permite el registro"

> **Usuario:** Al intentar registrarme me aparece de esta forma, dime formas de solucionarlo y si tiene que ver con los cambios que hice.

> **IA:**
> El mensaje "No se permite el registro" no tiene que ver con el cambio de código; `onLoad: 'check-sso'` está perfecto. El error ocurre porque Keycloak, por defecto, viene con la creación de cuentas bloqueada por seguridad. Solución: activar `User registration` en la consola (Realm Settings → Login → User registration → ON → Save), asegurándose de estar en el realm **Global-Exchange**.

---

### Consulta: ¿en qué pestaña está cada opción y el Test connection?

> **Usuario:** ... ¿tenía que hacer manager realms Global-Exchange? ¿tengo que presionar ON también en Verify email y hacer desde ahí el Test connection?

> **IA:**
> Todo debe hacerse administrando el realm **Global-Exchange**. 
> - **Pestaña Login:** `User registration` → ON (soluciona el error) y `Verify email` → ON (obliga a enviar correo al registrarse). Luego Save.
> - **Pestaña Email:** aquí está el botón `Test connection` (no en Login). Cargar los datos de Gmail (host, puerto, correo, contraseña de aplicación) y presionar Test connection; si llega el correo de prueba, todo está perfecto → Save.
> Con ambas pestañas configuradas, al presionar "Registrarse" en React pedirá los datos, creará la cuenta e inmediatamente enviará el correo de verificación.

---

### Consulta: ¿borrar lo configurado en el realm master?

> **Usuario:** el master en el que creo que configure el login y email al principio, ¿esos tengo que borrar o no?

> **IA:**
> Hay que cambiarse inmediatamente al realm **Global-Exchange** y hacer allí todas las configuraciones. Actualmente está seleccionado `master`, que es de uso exclusivo para administrar el servidor (superadministradores) y nunca debe usarse para los usuarios de la app (el frontend se conecta al realm Global-Exchange, por lo que lo hecho en master no afecta a la web).
> - **User registration en master:** apagarlo (OFF); es un riesgo de seguridad grave dejarlo encendido (cualquiera podría registrarse y acceder a la consola).
> - **Configuración de Email SMTP en master:** no es necesario borrarla, pero no servirá para la app.
> - Pasos: cambiar a Global-Exchange; en Realm Settings > Login encender User registration y Verify email; en Realm Settings > Email cargar los datos de SMTP y hacer la prueba allí; guardar.

---

### Consulta: fallo al enviar el correo

> **Usuario:** Me sale de esta forma cuando intento registrarme.

> **IA:**
> El error significa que Keycloak intentó enviar el correo de verificación pero falló por SMTP mal configurado. El registro funcionó (la cuenta se creó en Users); el bloqueo ocurrió al intentar enviar el email. Revisar en Realm Settings > Email (realm Global-Exchange): Host `smtp.gmail.com`, Port `465` con Enable SSL ON (o `587` con Enable StartTLS ON y SSL OFF), Authentication ON, Username = Gmail completo, Password = **contraseña de aplicación** de Gmail.
>
> Cómo generar la contraseña de aplicación: Gestión de tu cuenta de Google → Seguridad → activar Verificación en 2 pasos → buscar "Contraseñas de aplicación" → crear una con nombre "Keycloak" (clave de 16 letras) → pegarla en Password.
>
> Antes de reintentar, presionar `Test connection` y ver un mensaje verde. Como la cuenta de prueba ya existe, si se re-registra con el mismo correo dirá "El usuario ya existe": borrar el usuario de prueba en Users y registrarse de cero, o iniciar sesión y reenviar el correo.

---

### Consulta: no se puede acceder al enlace del correo

> **Usuario:** Al querer entrar al link del correo me sale que no se puede acceder al sitio.

> **IA:**
> Que llegara el correo significa que la configuración de Gmail y SMTP fue un éxito. El error ERR_CONNECTION_REFUSED es un problema de conexión: el navegador intentó entrar al enlace (localhost:8080) pero el servidor de Keycloak está apagado o inaccesible en ese momento. Solución: asegurarse de que la terminal donde corre Keycloak siga abierta; reiniciarlo; recargar la página (F5). Nota: el enlace usa `localhost`, así que debe abrirse desde la misma PC donde corre Keycloak, no desde el celular u otra PC. Si el enlace expiró, iniciar sesión en Global Exchange y usar el botón para reenviar el correo.

---

### Consulta: ¿es posible la contraseña temporal en el flujo?

> **Usuario:** Ya hice todo esto y funcionó, pero la validación de email no incluye la contraseña temporal. Mi flujo de negocio exige que se le dé al usuario una contraseña temporal que introducirá y luego podrá establecer una nueva. ¿Se puede hacer eso con Keycloak o no?

> **IA:**
> De forma directa y sincera: **No, no se puede de forma 100% nativa** usando solo las pantallas de registro de Keycloak. Keycloak está diseñado bajo estándares modernos de ciberseguridad que consideran enviar contraseñas en texto plano por correo una vulnerabilidad crítica; no tiene función integrada para generar y enviar contraseñas temporales durante el auto-registro. Si la regla de negocio es innegociable, hay dos soluciones:
> 1. **Backend Intermediario (recomendado):** el frontend deja de usar `keycloak.register()`; se crea un formulario propio en `<Register/>`; React envía los datos al backend; el backend genera una contraseña temporal, se comunica de servidor a servidor con la API REST de Keycloak para crear el usuario, inyectar la contraseña con `temporary: true` y asignar `UPDATE_PASSWORD`; y el backend envía el correo personalizado con la contraseña.
> 2. **Plugin en Java (Keycloak SPI):** programar un proveedor de eventos (EventListener SPI) que intercepte el registro, genere la clave, fuerce su guardado y modifique el motor de correos (FreeMarker) para inyectar la contraseña en la plantilla HTML.

---

### Consulta: PIN temporal vía SMTP

> **Usuario:** Y no se podría implementar la clave temporal vía SMTP?

> **IA:**
> El método estándar (Email OTP / PIN temporal) con SMTP es un patrón de diseño excelente y común (email OTP), pero hay una distinción técnica sobre cómo Keycloak lo maneja de forma nativa frente a la regla de negocio:
> - **Filosofía nativa de Keycloak:** 100% nativo aplica la misma lógica pero con **Enlaces (Action Token)** en lugar de PIN numérico. Un enlace de verificación/actualización es, a nivel técnico, una contraseña temporal de un solo uso, larga y ultra segura, incrustada en una URL. Keycloak prefiere el enlace por UX. OTP por correo **sí** se soporta nativamente, pero para el **Inicio de Sesión (2FA)**, no para el registro.
> - Para un **PIN numérico en el registro** (no viene por defecto) hay dos caminos:
>   1. **Plugin de la comunidad (SPI):** instalar una extensión `.jar` como `keycloak-email-otp-authenticator` para agregar "Verify Email via PIN".
>   2. **Passwordless Registration nativa (sin código):** desactivar el campo de contraseña del registro; Keycloak envía un enlace de un solo uso; al hacer clic lo lleva a una pantalla obligatoria "Actualiza tu contraseña". Cumple el mismo objetivo de seguridad (no puede tener contraseña activa ni acceso hasta demostrar control del correo) sin PIN.
>
> En resumen: si se exige sí o sí un PIN numérico tipeable, hay que instalar un SPI de la comunidad o un backend intermediario. Si la regla es solo "no puede crear contraseña hasta verificar su correo", la opción nativa Passwordless Registration + Required Action soluciona el problema hoy mismo.

---

### Consulta: paso a paso del plugin de la comunidad

> **Usuario:** me das el paso a paso del 1. Usar un Plugin de la Comunidad.

> **IA:**
> **Paso 1 — Descargar el plugin (.jar):** buscar en GitHub repositorios como "Keycloak Email OTP SPI" (por ejemplo el de dasniko o mesutpiskin). En la sección Releases descargar el `.jar` compatible con la versión de Keycloak.
> **Paso 2 — Instalar el plugin:** copiar el `.jar` dentro de la carpeta `providers` de la estructura de Keycloak.
> **Paso 3 — Reconstruir y reiniciar:** detener Keycloak (Ctrl+C); ejecutar `bin\kc.bat build`; iniciar de nuevo con `bin\kc.bat start-dev`.
> **Paso 4 — Duplicar el flujo de registro:** en la consola (realm Global-Exchange) → Authentication → pestaña Flows → flujo `Registration` → botón de tres puntos → `Duplicate` → nombre como `Registration-with-PIN`.
> **Paso 5 — Configurar el nuevo flujo:** dentro de `Registration-with-PIN`, buscar el paso Profile Validation / Email Verification → `Add execution` → buscar el módulo instalado ("Email OTP Authenticator") → añadirlo → marcarlo como `Required`; si el paso nativo de verificación por enlace sigue, cambiarlo a `Disabled`.
> **Paso 6 — Activar el flujo en el realm:** en la pestaña `Bindings` (o Realm Settings > Login), en `Registration flow` seleccionar `Registration-with-PIN` → Guardar. Al presionar "Registrarse", el usuario completará sus datos y la siguiente pantalla le pedirá el código de 6 dígitos enviado a su correo.

---

## Decisiones y conclusiones

- **En esta fase del proyecto** (sin backend) se implementó la **verificación de correo nativa de Keycloak + SMTP** con Gmail (usando contraseña de aplicación) en el realm `Global-Exchange`, con `User registration` y `Verify email` en ON, y `onLoad: 'check-sso'` en `keycloak.ts`.
- **La contraseña temporal en el correo de registro NO es posible 100% nativa** en Keycloak (por seguridad encripta las contraseñas).
- Para cumplir la regla de negocio de la contraseña temporal se recomienda un **backend intermediario** que use la Keycloak Admin REST API (`temporary: true` + `UPDATE_PASSWORD` + envío de correo con la contraseña), o un **plugin SPI** si se quiere todo en Keycloak.
- **Alternativa nativa más simple:** Passwordless Registration + Required Action (enlace de un solo uso → pantalla "Actualiza tu contraseña"), que cumple el objetivo de seguridad sin PIN ni backend.
- **Seguridad:** nunca llamar a la Keycloak Admin REST API desde React (expone credenciales de administrador); todo el manejo administrativo debe ir por el backend.
