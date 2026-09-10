"""
Autenticación de peticiones mediante el token de Keycloak.

Valida el JWT que envía el frontend en la cabecera ``Authorization:
Bearer <token>`` contra las claves públicas (JWKS) que publica el realm,
y expone los roles del usuario para que las clases de permisos puedan
consultarlos.

Si tu compañero de proyecto ya implementó la validación del token,
descartá este archivo y ajustá ``permisos.py`` para que lea los roles
desde su clase de usuario.

Requiere: ``pip install pyjwt[crypto]``
"""

from django.conf import settings
from jwt import PyJWKClient
import jwt
from rest_framework import authentication, exceptions

_jwks_client: PyJWKClient | None = None


def _cliente_jwks() -> PyJWKClient:
    """Devuelve el cliente JWKS, cacheado a nivel de módulo."""
    global _jwks_client
    if _jwks_client is None:
        conf = settings.KEYCLOAK
        url = f"{conf['SERVER_URL']}/realms/{conf['REALM']}/protocol/openid-connect/certs"
        _jwks_client = PyJWKClient(url, cache_keys=True)
    return _jwks_client


class UsuarioKeycloak:
    """Usuario no persistido, construido a partir de los claims del token."""

    def __init__(self, claims: dict):
        self.claims = claims
        self.id = claims.get('sub')
        self.username = claims.get('preferred_username', '')
        self.email = claims.get('email', '')
        self.nombre = claims.get('name', '')

        cliente = settings.KEYCLOAK.get('CLIENT_ID', '')
        roles_realm = claims.get('realm_access', {}).get('roles', [])
        roles_cliente = claims.get('resource_access', {}).get(cliente, {}).get('roles', [])
        self.roles = {r.lower() for r in [*roles_realm, *roles_cliente]}

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False

    def tiene_rol(self, *roles: str) -> bool:
        """Indica si el usuario tiene al menos uno de los roles indicados."""
        return any(rol.lower() in self.roles for rol in roles)

    def __str__(self) -> str:
        return self.username or self.id or 'usuario-keycloak'


class AutenticacionKeycloak(authentication.BaseAuthentication):
    """Autenticación DRF basada en los access tokens del realm."""

    keyword = 'Bearer'

    def authenticate(self, request):
        cabecera = authentication.get_authorization_header(request).split()
        if not cabecera or cabecera[0].decode().lower() != self.keyword.lower():
            return None
        if len(cabecera) != 2:
            raise exceptions.AuthenticationFailed('Cabecera Authorization mal formada.')

        token = cabecera[1].decode()
        conf = settings.KEYCLOAK
        try:
            clave = _cliente_jwks().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                clave.key,
                algorithms=['RS256'],
                issuer=f"{conf['SERVER_URL']}/realms/{conf['REALM']}",
                # Keycloak emite tokens con aud="account" para clientes
                # públicos, por eso no se valida la audiencia. Si más
                # adelante configurás un audience mapper hacia el backend,
                # activá la validación y pasá audience=...
                options={'verify_aud': False},
            )
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('El token expiró.')
        except jwt.InvalidTokenError as exc:
            raise exceptions.AuthenticationFailed(f'Token inválido: {exc}')

        return (UsuarioKeycloak(claims), token)

    def authenticate_header(self, request):
        return self.keyword