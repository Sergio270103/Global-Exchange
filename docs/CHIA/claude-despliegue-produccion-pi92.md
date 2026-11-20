# CHIA – PI-92: Script de despliegue automático

| Campo | Detalle |
|---|---|
| Hito | Hito 8 (Sprint 6) |
| Historia (Jira) | PI-92 – Script de despliegue automático |
| Relacionada con | PI-88 (primer script de despliegue), PI-96 (ambiente de producción) |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 16/11/2026 |

## 1. Objetivo

Que el ambiente de producción de PI-96 (backend, frontend, Keycloak y ngrok
en Docker) se levante con **un solo comando**, en Windows y en Linux, sin
riesgo de mover dinero real con Stripe ni de gastar emisiones de Factura
Segura por error. La IA solo tuvo acceso de lectura al repositorio y entregó
los cambios como un *patch*.

## 2. Solución

`scripts/deploy.sh prod` y `scripts/deploy.ps1 prod`:

1. Si no existe `.env.prod`, lo crea desde `.env.prod.example` con las claves
   internas generadas al azar y se detiene indicando qué completar.
2. Revisa `.env.prod`: dominio de ngrok, claves obligatorias, Stripe y
   Factura Segura. Corta si falta algo indispensable.
3. Construye y levanta los contenedores de `docker-compose.prod.yml`.
4. Espera al backend (las migraciones se aplican al arrancar).
5. Configura Keycloak con la tarea `keycloak-init`.
6. Comprueba desde afuera que la dirección pública responde y muestra las
   URLs; si algo falla, muestra los logs del servicio afectado.

Además se agregaron los modos `status` y `logs`, `check` revisa
`.env.prod`, y `stop` baja los contenedores conservando los datos. Se
quitaron el compose y las plantillas `.env.prod.example` anteriores, que
quedaron reemplazados por los de PI-96. El modo `dev` no cambió.

## 3. Decisiones

| Decisión | Motivo |
|---|---|
| Rechazar claves `sk_live_` de Stripe (salvo `PERMITIR_STRIPE_LIVE=si`) | No mover dinero real por error |
| Avisar el rango de números cuando Factura Segura está en `real` | La base nueva no conoce los números ya usados en desarrollo |
| Generar las claves internas al crear `.env.prod` | No dejar claves por defecto ni pedir inventarlas |
| Nunca imprimir valores de secretos | La salida se puede compartir para pedir ayuda |
| Si no hay authtoken de ngrok, levantar todo menos el túnel | Permite usar el ngrok instalado en la compu |
| Quitar los contenedores del despliegue anterior (PI-88) | Ocupaban los mismos puertos; sus datos no se tocan |
| Mismo comportamiento en `deploy.sh` y `deploy.ps1` | El equipo usa Windows y Linux |
| `.sh` siempre con LF en `.gitattributes` | bash no acepta CRLF |

## 4. Verificación

La IA no tenía acceso a la computadora anfitriona ni a un Docker con
imágenes, así que probó los scripts contra el ambiente de PI-96 montado por
partes en su entorno (Keycloak 26.7.2, nginx, backend y PostgreSQL reales),
con Docker simulado:

- `deploy.sh` y `deploy.ps1` (PowerShell 7) en modo `prod`: flujo completo,
  fallo de Keycloak y backend que no responde, con su salida y código de error.
- Primera corrida: crea `.env.prod` con las claves y el resto igual a la
  plantilla; también con fines de línea CRLF.
- Validaciones: dominio con `https://`, clave `sk_live_`, Factura Segura en
  `real`, authtoken vacío.
- `--dry-run` / `-DryRun`, `check`, `status`, `logs` y `stop`.
- El filtro que quita los contenedores anteriores, con un Docker real.

No se llamó a Stripe ni a Factura Segura en ninguna prueba. **Queda por
hacer en la computadora anfitriona** la primera corrida completa con Docker
y ngrok reales, y probar `deploy.ps1` en Windows PowerShell 5.1.
