/**
 * Configuración e inicialización de Keycloak.
 *
 * Este módulo crea y exporta la instancia de Keycloak utilizada para la
 * autenticación de usuarios. La instancia se conecta al realm
 * `Global-Exchange` y al cliente público `global-exchange-frontend`.
 * Además expone la función {@link initKeycloak} que inicializa la sesión
 * con el flujo OpenID Connect (PKCE).
 *
 * @module keycloak
 */
// keycloak.ts
import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'Global-Exchange',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'global-exchange-frontend',
});

let initPromise: Promise<boolean> | null = null;

/**
 * Inicializa la sesión de Keycloak.
 *
 * La inicialización se ejecuta una sola vez (el resultado queda en caché)
 * usando `check-sso` para no redirigir automáticamente a usuarios que no
 * están autenticados, y PKCE con método S256 para el flujo de autorización.
 *
 * @returns Promesa que resuelve a `true` si el usuario está autenticado.
 */
export function initKeycloak() {
  if (!initPromise) {
    initPromise = keycloak.init({
      //onLoad: 'check-sso',
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });
  }
  return initPromise;
}

export default keycloak;