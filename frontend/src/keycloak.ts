/**
 * Configuración e inicialización de Keycloak.
 *
 * Lee la URL, Realm y Client ID desde las variables de entorno de Vite.
 * Si no existen, utiliza los valores por defecto locales para el equipo.
 *
 * @module keycloak
 */
import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'Global-Exchange',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'global-exchange-frontend',
});

let initPromise: Promise<boolean> | null = null;

/**
 * Inicializa la sesión de Keycloak con flujo PKCE.
 *
 * @returns Promesa que resuelve a `true` si el usuario está autenticado.
 */
export function initKeycloak() {
  if (!initPromise) {
    initPromise = keycloak.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });
  }
  return initPromise;
}

export default keycloak;