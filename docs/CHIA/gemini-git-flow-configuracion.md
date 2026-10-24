# Conversación con IA — Configuración de Git Flow

> **Tema:** Configuración del sistema de control de cambios (GIT) con la metodología Git Flow para el proyecto Global Exchange.
> **Herramienta:** Gemini (Google AI).
> **Enlace al chat:** https://gemini.google.com/share/d/1S6vF-3e8Wn6kj_NJHNGttyUjVY48P6tz?usp=sharing
> **Hito correspondiente:** Hito 3 (Sprint 1) — Criterio SCC (Sistema de Control de Cambios).
> **Código de proyecto en Jira:** `PI` (Proyecto IS2).

---

## Contexto de la consulta

Se asignó la tarea de crear el repositorio Git del proyecto, trabajando con la metodología **Git Flow** para la gestión de versiones y ramas. El enunciado del proyecto exige:

- **Ramas de funcionalidad (feature branches):** desarrollo de nuevas funcionalidades partiendo de `develop`. Una vez finalizada la funcionalidad, la rama `feature` se integra a `develop` y se cierra.
- **Tag por release:** cada entrega formal (release) genera un tag en el repositorio, marcando el estado del código en ese momento. El tag se crea desde la rama principal.
- **Cada nueva funcionalidad** se desarrolla en una rama independiente creada a partir de `develop`, con el formato `feature/<PREFIX>-<ID>` (ej. `feature/SCRUM-1234`), donde `PREFIX` es el acrónimo del proyecto en Jira y `ID` el identificador de la historia de usuario.

En nuestro caso, el acrónimo del proyecto en Jira es `PI`, por lo que las ramas de funcionalidad usan el formato `feature/PI-<ID>` (ej. `feature/PI-15` para la historia "Integrar con Keycloak").

---

## Estructura base del repositorio

- **`main`:** alberga exclusivamente código estable listo para entrega/producción. Recibe integraciones al cerrar una versión y aquí se crean los tags (ej. `v1.0.0`).
- **`develop`:** rama base para el desarrollo activo. Refleja los últimos cambios integrados del equipo.
- **`feature/<PREFIX>-<ID>`:** ramas temporales que nacen de `develop` para trabajar una historia de usuario concreta (ej. `feature/PI-15`) y se eliminan tras fusionarse.

---

## Inicialización del repositorio local

```bash
# 1. Inicializar repositorio con la rama principal
git init -b main

# 2. Crear un commit inicial
touch README.md
git add README.md
git commit -m "chore: inicializar repositorio"

# 3. Crear y cambiar a la rama develop
git checkout -b develop

# 4. Vincular con el servidor remoto y subir ambas ramas
git remote add origin <URL_DE_TU_REPOSITORIO>
git push -u origin main
git push -u origin develop
```

---

## Configuración completa con GitHub y git-flow

### Paso 1: Preparar la carpeta local y el `.gitignore`

Asegurarse de que `.gitignore` contenga al menos los archivos pesados o sensibles:

```text
node_modules/
.env
dist/
build/
.DS_Store
```

### Paso 2: Crear el repositorio en GitHub

Crear el repositorio en GitHub **completamente vacío** (sin marcar "Add a README file", ni `.gitignore`, ni licencia).

### Paso 3: Inicializar Git y configurar git-flow

```bash
# 1. Inicializar repositorio local
git init

# 2. Renombrar la rama inicial a 'main'
git branch -M main

# 3. Vincular con el repositorio de GitHub
git remote add origin https://github.com/Enriqueacost/Global-exchange.git

# 4. Iniciar la extensión de git-flow
git flow init
```

Al ejecutar `git flow init`, la CLI hace preguntas interactivas. Aceptar los valores por defecto asegurando que coincidan con:

- Branch name for production releases: `main`
- Branch name for "next release" development: `develop`
- Feature branches: `feature/`
- Bugfix branches: `bugfix/`
- Release branches: `release/`
- Hotfix branches: `hotfix/`
- Support branches: `support/`
- Version tag prefix: `v` (o vacío para tags como `1.0.0`)

### Paso 4: Subir el código inicial a `develop` y `main`

```bash
# En develop se inicia automáticamente tras git flow init
git add .
git commit -m "chore: estructura inicial del proyecto frontend"

# Subir la rama develop a GitHub
git push -u origin develop

# Sincronizar main con el commit inicial y subirla
git checkout main
git merge develop
git push -u origin main

# Volver a develop para trabajar siempre desde aquí
git checkout develop
```

### Paso 5: Proteger las ramas en GitHub

En `Settings > Branches > Add branch protection rule`, crear reglas para `main` y `develop` activando **"Require a pull request before merging"**. La opción **"Require approvals"** se deja desactivada mientras se configura el repo (evita que GitHub bloquee el merge al no permitirte aprobar tus propios cambios).

---

## Flujo de trabajo diario con la extensión git-flow

### Crear una nueva funcionalidad (Feature)

Para la historia de usuario `PI-15` (ej. "Integrar con Keycloak"):

```bash
# Iniciar la feature (crea automáticamente la rama feature/PI-15 desde develop)
git flow feature start PI-15
```

### Desarrollar y realizar commits

```bash
git add .
git commit -m "feat(auth): integración de Keycloak para autenticación de usuarios"
```

### Publicar y cerrar la feature

**Opción A (recomendada con Pull Request / Code Review):**

```bash
# Subir la rama a GitHub
git flow feature publish PI-15
```

Luego en GitHub se abre un Pull Request desde `feature/PI-15` hacia `develop`, el equipo revisa y hace Merge, y se borran las ramas remota y local.

**Opción B (cierre local con la extensión):**

```bash
# Fusiona automáticamente a develop y elimina la rama feature local
git flow feature finish PI-15

# Subir develop actualizado a GitHub
git push origin develop
```

### Crear una entrega formal (Release y Tag)

```bash
# 1. Iniciar el proceso de release desde develop
git flow release start 1.0.0

# 2. Finalizar el release (fusiona a main y develop, y genera el Tag)
git flow release finish 1.0.0

# 3. Subir los cambios de main, develop y los tags a GitHub
git checkout main
git push origin main
git push origin --tags

git checkout develop
git push origin develop
```

---

## Colaboración con compañeros (Pull / integración)

### Agregar a un compañero como colaborador

1. En GitHub: `Settings > Collaborators > Add people`, escribir el usuario/correo del compañero y `Add to this repository`.
2. El compañero acepta la invitación en https://github.com/Enriqueacost/Global-exchange/invitations.

### Clonar el repositorio por primera vez

```bash
git clone https://github.com/Enriqueacost/Global-exchange.git
cd Global-exchange
git checkout develop
git flow init   # opcional, Enter a todas las preguntas
```

### Traer los cambios de un repositorio al no propio (como fuente secundaria)

```bash
# Vincular el repo del compañero como remoto temporal
git remote add companero URL_DEL_REPO_DE_TU_COMPAÑERO.git
git fetch companero

# En develop propio
git checkout develop

# Fusionar sus cambios (si historias distintas/no relacionadas)
git merge companero/develop --allow-unrelated-histories

# Subir a tu repositorio
git push origin develop

# Limpiar el remoto temporal
git remote remove companero
```

---

## Resolución de conflictos

Al fusionar repositorios con historias independientes puede aparecer:

```
fatal: refusing to merge unrelated histories
```

Solución: usar la bandera `--allow-unrelated-histories`.

Si al fusionar hay conflictos `/add/add` en varios archivos y la versión del compañero debe prevalecer al 100%:

```bash
# Aceptar automáticamente la versión del compañero ('theirs') en TODOS los archivos
git checkout --theirs .

# Marcar todos los archivos como resueltos
git add .

# Completar el commit de la fusión
git commit -m "feat(auth): integrar cambios de Keycloak de companero"
```

**Nota importante:** los subrayados en rojo en VS Code tras el merge no siempre son conflictos; suelen ser errores de TypeScript/React por no tener aún las librerías nuevas del `package.json`. Se resuelven instalando dependencias:

```bash
npm install   # o pnpm install según el gestor del proyecto
```

---

## Cierre del proceso e integración de Keycloak

Al ejecutar `git flow feature finish PI-15`, la rama `feature/PI-15` se integró a `develop` y se eliminó localmente. Verificación:

```bash
# 1. Estado de la consola
git status            # On branch develop, working tree clean

# 2. Historial de cambios
git log --oneline -n 5

# 3. Verificación visual en GitHub (rama develop, carpeta src/)
# 4. Prueba de ejecución
npm run dev   # o pnpm dev
```

---

## Decisiones y conclusiones

- **Hosting:** GitHub.
- **Extensión git-flow:** se intentó instalar vía `winget`; el paquete CLI `git flow` no venía activado por defecto en Git para Windows. Se puede usar la extensión (tras instalarla) o aplicar la misma metodología con **comandos nativos de Git + Pull Requests** en GitHub, que es el estándar real en la industria.
- **Prefijo Jira:** `PI` (Proyecto IS2). Las historias de usuario dentro de epics tienen IDs como `PI-15` ("Integrar con Keycloak").
- **Flujo de versiones:** se respeta el modelo `main` (estable/entregas) + `develop` (integración diaria) + `feature/PI-<ID>`, con tags de release creados desde `main`.

---

## Diálogo completo de la conversación

A continuación se transcribe el desarrollo literal de la conversación mantenida con la IA, con los mensajes del usuario y las respuestas generadas.

### Consulta inicial

> **Usuario:**
> Buenas, tengo un proyecto en la materia ingeniería de software 2, y tengo asignada la tarea de crear el git, se va a trabajar con git flow, me gustaría tener bien estructuradas las ramas para empezar a trabajar despues, dime que detalles necesitas para guiarme paso a paso, te paso el enunciado o lo que se me pide; Sistema de control de cambios (GIT, Mercurial) montado y en funcionamiento. En este proyecto se aplicará la metodología Git Flow para la gestión de versiones y ramas:
> - Ramas de funcionalidad (feature branches): desarrollo de nuevas funcionalidades, partiendo de develop. Una vez finalizada la funcionalidad, la rama feature se integrará a develop y se cerrará.
> - Tag por release: Cada entrega formal (release) deberá generar un tag en el repositorio, marcando el estado del código en ese momento. El tag se creará desde la rama principal.
> - Cada nueva funcionalidad se desarrollará en una rama independiente creada a partir del develop. Ej feature/SCRUM-1234 donde: SCRUM representa el acrónimo abreviatura proyecto (segun el Jira); 1234 representa el id de la historia de usuario desarrollada.
> Usaremos github, me gustaria usar la extension de git flow, aun no tengo creado ningun repositorio, ademas no tengo nada para subir, osea si tengo pero ya esta el front completo, no se si está mal subirlo asi o debemos hacerlo de a poco, por ahora me gustaria tener el repo bien organizada con la metodologia que me piden.

> **IA:**
> Responderé primero a tu duda sobre el código que ya tienes y luego pasaremos a la guía paso a paso para dejar todo configurado con GitHub y la extensión git-flow.
>
> **¿Está mal subir todo el Frontend de una vez?**
> No está mal, es la práctica habitual cuando se arranca un proyecto con un "código base" o boilerplate. Lo correcto es subir ese código existente a la rama develop como el commit inicial del proyecto (o la estructura base). A partir de ahí, cualquier nuevo cambio, corrección o nueva pantalla se debe realizar abriendo ramas de funcionalidad (feature/<PREFIX>-<ID>) desde develop.
>
> **Guía paso a paso para configurar el repositorio:**
> - Paso 1: Preparar la carpeta local y el .gitignore (no subir node_modules, .env, dist/build). Contenido mínimo: `node_modules/`, `.env`, `dist/`, `build/`, `.DS_Store`.
> - Paso 2: Crear el repositorio en GitHub (completamente vacío, sin README ni .gitignore ni licencia).
> - Paso 3: Inicializar Git y configurar git-flow. Comandos: `git init`, `git branch -M main`, `git remote add origin <URL>`, `git flow init`. En `git flow init` aceptar valores por defecto confirmando main, develop, feature/, bugfix/, release/, hotfix/, support/ y el prefijo de tag `v`.
> - Paso 4: Subir el código inicial a develop y main.
> ```bash
> git add .
> git commit -m "chore: estructura inicial del proyecto frontend"
> git push -u origin develop
> git checkout main
> git merge develop
> git push -u origin main
> git checkout develop
> ```
> - Paso 5: Proteger las ramas en GitHub (Settings > Branches > Add branch protection rule) para main y develop activando "Require a pull request before merging".
>
> **Flujo de trabajo diario con git-flow:**
> - Crear feature: `git flow feature start SCRUM-1234`
> - Commit: `git add .` / `git commit -m "feat(login): maquetado del formulario de ingreso"`
> - Publicar: `git flow feature publish SCRUM-1234` (Opción A con Pull Request) o `git flow feature finish SCRUM-1234` (Opción B local) + `git push origin develop`.
> - Release y tag: `git flow release start 1.0.0`, `git flow release finish 1.0.0`, luego `git checkout main`, `git push origin main`, `git push origin --tags`, `git checkout develop`, `git push origin develop`.

---

### Primer error: `git flow` no es un comando reconocido

> **Usuario:**
> me salio esto:
> ```
> PS C:\Users\Enrique\Desktop\Global-Exchange-main> git remote add origin https://github.com/Enriqueacost/Global-exchange.git
> PS C:\Users\Enrique\Desktop\Global-Exchange-main> git flow init
> git: 'flow' is not a git command. See 'git --help'.
> The most similar commands are reflog, show
> ```

> **IA:**
> Ese error ocurre porque la extensión CLI de git-flow no está instalada o habilitada en tu versión de Git para Windows. Opciones:
>
> **Opción 1: Trabajar con comandos nativos de Git (Recomendado).** En la práctica profesional con GitHub, la extensión de git-flow casi no se utiliza porque las integraciones a develop y main se hacen mediante Pull Requests. Comandos: `git branch -M main`, `git add .`, `git commit -m "chore: estructura inicial..."`, `git checkout -b develop`, `git push -u origin main`, `git push -u origin develop`. Para features: `git checkout develop`, `git pull origin develop`, `git checkout -b feature/SCRUM-1234`, commits, `git push -u origin feature/SCRUM-1234` y Pull Request hacia develop. Para tags: `git checkout main`, `git pull origin main`, `git merge develop`, `git tag -a v1.0.0 -m "Release v1.0.0"`, `git push origin main`, `git push origin --tags`.
>
> **Opción 2: Instalar la extensión git-flow en Windows.** Ejecutar en PowerShell como Administrador:
> ```
> winget install --id Git.GitFlowAVH
> ```
> (o `choco install gitflow-avh`).

---

### Segundo error al instalar con winget

> **Usuario:**
> ```
> C:\Windows\system32>winget install --id Git.GitFlowAVH
> No se encontró ningún paquete coincidente con los criterios de busqueda.
> ```

> **IA:**
> winget no encontró ese identificador porque el paquete ya no existe con ese nombre en el repositorio oficial de Windows. Soluciones:
> 1. Usar "Git Bash" en lugar de PowerShell (la extensión git-flow ya viene preinstalada en Git Bash). Hacer clic derecho en la carpeta y "Git Bash Here", luego `git flow init`.
> 2. Buscar el paquete disponible en Winget: `winget search gitflow` y luego `winget install --id <ID_QUE_MUESTRE_LA_BUSQUEDA>`.
> 3. La alternativa más usada en proyectos reales: comandos nativos de Git + Pull Requests en GitHub.

---

### Error también en Git Bash

> **Usuario:**
> ```
> Enrique@DESKTOP-MVRF2JR MINGW64 ~
> $ git flow init
> git: 'flow' is not a git command.
> ```

> **IA:**
> Hay dos detalles: estás parado en la carpeta de usuario `~` en lugar de la carpeta del proyecto, y la CLI de git flow no viene activada en todas las instalaciones de Git. Para cumplir la metodología no necesitas la herramienta git-flow. Pasos: entrar a la carpeta con `cd /c/Users/Enrique/Desktop/Global-Exchange-main`; inicializar con `git init`, `git branch -M main`, `git add .`, `git commit -m "chore: estructura inicial del proyecto"`, `git checkout -b develop`, `git remote add origin https://github.com/Enriqueacost/Global-exchange.git`, `git push -u origin main`, `git push -u origin develop`. Luego guía de uso (features con Pull Request y tags desde main).

> **Usuario:**
> yo quiero usar git flow

> **IA:**
> Instalar la versión moderna con Winget:
> ```
> winget install GitTower.GitFlowNext
> ```
> Cerrar por completo todas las terminales y reabrir. Luego `cd C:\Users\Enrique\Desktop\Global-Exchange-main`, `git init`, `git flow init` (Enter a todas). Después `git remote add origin https://github.com/Enriqueacost/Global-exchange.git`, `git add .`, `git commit -m "chore: estructura inicial del frontend"`, `git push -u origin develop`, `git checkout main`, `git merge develop`, `git push -u origin main`, `git checkout develop`. Para features con git-flow: `git flow feature start SCRUM-1234`, `git add .`, `git commit -m "feat: descripción"`, `git flow feature finish SCRUM-1234`, `git push origin develop`. Para release: `git flow release start 1.0.0`, `git flow release finish 1.0.0`, `git push origin main develop --tags`.

---

### Error después de supuestamente instalar git-flow

> **Usuario:**
> ya me salio que descarge git flow en el power shell pero cuando fui a mi capeta y di git flow init me salio esto de nuevo:
> ```
> PS C:\Users\Enrique\Desktop\Global-Exchange-main> git flow init
> git: 'flow' is not a git command.
> ```

> **IA:**
> Ese error sucede porque las terminales ya abiertas no actualizan automáticamente sus variables de entorno (PATH). Pasos:
> 1. Reiniciar la terminal por completo y ejecutar `git flow version`. Si responde con una versión (ej. 1.12.3), la extensión quedó vinculada.
> 2. Si continúa el fallo, recargar variables de entorno: `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`.
> 3. Alternativa con Chocolatey: `choco install gitflow-avh`.
> 4. Confirmado el comando, ejecutar: `git flow init`, `git remote add origin <URL>`, `git add .`, `git commit -m "chore: estructura inicial del proyecto"`, `git push -u origin develop`, `git checkout main`, `git merge develop`, `git push -u origin main`, `git checkout develop`.

---

### Protección de ramas y la opción "Require approvals"

> **Usuario:**
> cuando protejo las ramas marco el que me dices pero tambien me sale este predeterminado, lo dejo o quito la marca? : "Require approvals - When enabled, pull requests targeting a matching branch require a number of approvals..."

> **IA:**
> Quítale la marca (desactívala) por ahora mientras terminas de configurar el repositorio y subes la estructura inicial. Si dejas "Require approvals" activada, GitHub bloqueará el merge de cualquier Pull Request hasta que otro compañero apruebe, y como GitHub no te permite aprobar tus propios cambios quedarías trabado. Recomendación: sin la marca ahora; activarla más adelante con contador en 1 cuando el equipo esté programando activamente.

---

### Integración de Keycloak y dónde subirla

> **Usuario:**
> ahora integre el keycloak a mi proyecto, en donde deberia subir ese cambio?

> **IA:**
> La integración de Keycloak es una nueva funcionalidad (autenticación/seguridad), por lo que debe ir en una rama feature y finalmente integrarse a develop. Nunca directamente a main. Antes de empezar: verificar que ninguna clave/secreto esté quemado en el código y que `.env` esté en `.gitignore`. Luego identificar el ID de Jira (ej. SCRUM-105):
> - Con git-flow: `git flow feature start SCRUM-105`
> - Con Git nativo: `git checkout develop`, `git checkout -b feature/SCRUM-105`
> - Commits: `git status`, `git add .`, `git commit -m "feat(auth): integración de Keycloak para autenticación de usuarios"`
> - Integrar con git-flow local: `git flow feature finish SCRUM-105`, `git push origin develop`
> - O con Pull Request: `git push -u origin feature/SCRUM-105` y en GitHub abrir PR hacia develop (no main).

---

### Cómo hacer el pull (que lo haga un compañero al repo)

> **Usuario:**
> me haces un paso a paso para hacer el pull, tiene que hacerlo un compañero, a mi repo

> **IA:**
> Si el repo es privado, agregar al compañero como colaborador (Settings > Collaborators > Add people). 
> - Caso 1 (primera vez): `git clone https://github.com/Enriqueacost/Global-exchange.git`, `cd Global-exchange`, `git checkout develop`, `git flow init`.
> - Caso 2 (ya clonado): `git checkout develop`, `git pull origin develop`.
> Luego el compañero inicia su propia historia: `git flow feature start SCRUM-5678` (o `git checkout -b feature/SCRUM-5678`).

---

### Agregar al compañero como colaborador

> **Usuario:**
> pero el no esta en mi repositorio aun, como se va ahi primero y dp para el pull

> **IA:**
> 1. Invitarlo en GitHub: Settings > Collaborators > Add people, escribir el usuario/correo y "Add to this repository".
> 2. El compañero acepta en https://github.com/Enriqueacost/Global-exchange/invitations.
> 3. Descarga: `git clone https://github.com/Enriqueacost/Global-exchange.git`, `cd Global-exchange`, `git checkout develop`.

---

### Compañero con el código de Keycloak

> **Usuario:**
> el debe subir el que tiene el kaycloak

> **IA:**
> El compañero acepta la invitación, vincula su local: `git init`, `git remote add origin https://github.com/Enriqueacost/Global-exchange.git`, `git fetch origin`, `git checkout -b develop origin/develop`, crea la feature (`git flow feature start SCRUM-105` o `git checkout -b feature/SCRUM-105`), commitea (`git add .`, `git commit -m "feat(auth): integracion de Keycloak al frontend"`), sube (`git push -u origin feature/SCRUM-105`) y en GitHub crea el Pull Request hacia develop y hace merge.

---

### Cómo saber el ID real de la tarea en Jira

> **Usuario:**
> como puedo saber cual es el id real de mi tarea en jira

> **IA:**
> El ID real (Issue Key / Clave de incidencia) es el código único con las iniciales del proyecto y un número consecutivo. Se encuentra: en la URL del navegador (`https://tu-dominio.atlassian.net/browse/SCRUM-45`), en la tarjeta del tablero, o en el encabezado de la tarea. Ejemplo: si aparece GE-105, la rama debe llamarse `feature/GE-105`.

> **Usuario:**
> lo unico que tengo en mi jira son estos epics creados, dime donde deberia de entrar para ver mi id

> **IA:**
> El acrónimo del proyecto en Jira es **PI** (de "Proyecto IS2"). Para la tarea de Keycloak, el Epic correspondiente es **PI-11** (Seguridad y Acceso). Dos opciones: usar el ID del Epic directamente (`feature/PI-11`) o crear la historia de usuario dentro del Epic (práctica recomendada), a la que Jira asignará un número (ej. PI-43) → `feature/PI-43`.

> **Usuario:**
> si tengo historias dentro de ese epic

> **IA:**
> El ID exacto para la tarea de Keycloak es **PI-15** ("Integrar con Keycloak"), por lo que la rama debe llamarse `feature/PI-15`. Comandos: `git flow feature start PI-15`, `git add .`, `git commit -m "feat(auth): integracion con Keycloak"`, `git push -u origin feature/PI-15` (o cerrar local con `git flow feature finish PI-15` y `git push origin develop`).

---

### Descargar los cambios del compañero y subirlos al repo propio

> **Usuario:**
> mi compañero subio los cambios a su repo, me ayudas a descargarlo y subirlo a mi repositorio?

> **IA:**
> Agregar su repo como remoto temporal:
> ```
> git remote add companero URL_DEL_REPO_DE_TU_COMPAÑERO.git
> git fetch companero
> git checkout develop
> git merge companero/develop   # o companero/feature/PI-15
> git push origin develop
> git remote remove companero
> ```

> **Usuario:**
> lo que yo quiero es sus cambios, pero creo que el no subio bien con el feature entonces quiero descargar lo que el tiene, y subirlo yo bien

> **IA:**
> Sí, es lo ideal. Rescatar sus cambios dentro de tu rama `feature/PI-15`:
> ```
> git remote add companero URL_DEL_REPOSITORIO_DE_TU_COMPAÑERO.git
> git fetch companero
> git checkout develop
> git flow feature start PI-15
> git merge companero/main
> ```
> Luego cerrar: `git flow feature finish PI-15` + `git push origin develop`, o subir la rama `git push -u origin feature/PI-15` y abrir PR. Al final `git remote remove companero`.

---

### Error "refusing to merge unrelated histories"

> **Usuario:**
> me salio este error al hacer el merge:
> ```
> fatal: refusing to merge unrelated histories
> ```

> **IA:**
> Ese error ocurre porque ambos repositorios se crearon por separado y no comparten un commit inicial en común. Solución: añadir la bandera `--allow-unrelated-histories`:
> ```
> git merge companero/main --allow-unrelated-histories
> ```
> Manejar lo que suceda: si abre editor (Vim: Esc + `:wq`; VS Code: guardar y cerrar), o resolver conflictos de fusión si ambos tenían archivos con el mismo nombre.

---

### Conflictos de fusión (add/add)

> **Usuario:**
> me salio esto:
> ```
> Auto-merging package-lock.json
> CONFLICT (add/add): Merge conflict in package-lock.json
> ... (package.json, src/App.tsx, src/pages/Landing.tsx, src/types.ts, tsconfig.json)
> Automatic merge failed; fix conflicts and then commit the result.
> ```

> **IA:**
> Es normal: como no compartían historial, Git no sabe qué líneas conservar. Resolver en VS Code: abrir los archivos marcados y usar "Accept Current Change", "Accept Incoming Change" o "Accept Both Changes". Para la mayoría (App.tsx, Landing.tsx, types.ts, package.json) elegir la versión que trae Keycloak. Luego `git add .`, `git commit -m "docs: resolver conflictos e integrar Keycloak de companero"`. Si persiste conflicto en package-lock.json, ejecutar `npm install` tras resolver package.json. Luego `git flow feature finish PI-15`, `git push origin develop`, `git remote remove companero`.

---

### Aceptar todos los cambios del compañero de una vez

> **Usuario:**
> son demasiados cambios para ir uno a uno, no hay una forma de aceptar todos los cambios del compañero, al fin y al cabo esa es la ultima version

> **IA:**
> Sí. Para sobreescribir todos los archivos en conflicto con los del compañero:
> ```
> git checkout --theirs .
> git add .
> git commit -m "feat(auth): aceptar todos los cambios de Keycloak de companero"
> ```
> Luego `git flow feature finish PI-15`, `git push origin develop`, `git remote remove companero`.

---

### Errores en rojo en VS Code tras el merge

> **Usuario:**
> me siguen marcando muchos erroes asi aun, no se si ihual ya hago el commit

> **IA:**
> Haz el commit de inmediato. Los subrayados rojos no son conflictos de Git, son errores de TypeScript/React porque aún no se instalaron las librerías nuevas del package.json. Ejecutar:
> ```
> git commit -m "feat(auth): integrar cambios de Keycloak de companero"
> git flow feature finish PI-15
> npm install    # o pnpm install
> git push origin develop
> git remote remove companero
> ```

---

### Instalación de dependencias exitosa

> **Usuario:**
> me sale lo siguiente:
> ```
> npm install
> added 131 packages ...
> 1 high severity vulnerability
> ```

> **IA:**
> La instalación fue un éxito total. El aviso "1 high severity vulnerability" es estándar de npm y no bloquea el proyecto (se puede ignorar). Últimos pasos: `git push origin develop` y `git remote remove companero`.

---

### Verificar que todo quedó en la rama feature

> **Usuario:**
> como verifica que esta todo bien y creado en la rama feature?

> **IA:**
> Como se ejecutó `git flow feature finish PI-15`, la rama se integró a develop y se eliminó localmente. Verificar con:
> - `git status` → "On branch develop / nothing to commit, working tree clean".
> - `git log --oneline -n 5` → ver el commit de integración de Keycloak en develop.
> - En GitHub: cambiar a la rama develop y confirmar que en `src/` aparecen archivos como `keycloak.ts` o `auto-register...`.
> - Prueba de ejecución: `npm run dev` (o `pnpm dev`). Si arranca sin errores, la integración fue un éxito.
