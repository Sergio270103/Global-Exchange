"""Pruebas de la URL interna de Keycloak para descargar las claves (PI-96).

En producción el backend valida el ``issuer`` contra la URL pública (ngrok)
pero baja las claves públicas (JWKS) por la red interna de Docker. No se
usa la red: ``PyJWKClient`` recién pide las claves al validar un token.
"""

from django.test import SimpleTestCase, override_settings

from monedas import autenticacion

KEYCLOAK_BASE = {
    'SERVER_URL': 'https://publico.example/auth',
    'REALM': 'Global-Exchange',
    'CLIENT_ID': 'global-exchange-frontend',
}
RUTA_CERTS = '/realms/Global-Exchange/protocol/openid-connect/certs'


class UrlJwksTest(SimpleTestCase):

    def setUp(self):
        # El cliente JWKS se cachea a nivel de módulo: se reinicia en cada prueba.
        autenticacion._jwks_client = None
        self.addCleanup(setattr, autenticacion, '_jwks_client', None)

    @override_settings(KEYCLOAK={**KEYCLOAK_BASE, 'INTERNAL_URL': 'http://keycloak:8080/auth/'})
    def test_usa_la_url_interna_si_esta_configurada(self):
        cliente = autenticacion._cliente_jwks()
        self.assertEqual(cliente.uri, 'http://keycloak:8080/auth' + RUTA_CERTS)

    @override_settings(KEYCLOAK={**KEYCLOAK_BASE, 'INTERNAL_URL': ''})
    def test_sin_url_interna_usa_la_publica(self):
        cliente = autenticacion._cliente_jwks()
        self.assertEqual(cliente.uri, 'https://publico.example/auth' + RUTA_CERTS)

    @override_settings(KEYCLOAK=KEYCLOAK_BASE)
    def test_configuracion_anterior_sin_la_clave_sigue_funcionando(self):
        cliente = autenticacion._cliente_jwks()
        self.assertEqual(cliente.uri, 'https://publico.example/auth' + RUTA_CERTS)
