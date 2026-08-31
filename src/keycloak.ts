// keycloak.ts
import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'Global-Exchange',
  clientId: 'global-exchange-frontend',
});

let initPromise: Promise<boolean> | null = null;

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