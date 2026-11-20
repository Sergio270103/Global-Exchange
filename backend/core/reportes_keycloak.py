"""Lectura de usuarios y roles efectivos mediante Keycloak Admin REST API."""
from urllib.parse import quote
import requests
from django.conf import settings
from rest_framework.exceptions import APIException

ROLES = {'admin', 'administrador', 'user', 'usuario', 'analyst', 'analista', 'cashier', 'cajero'}


class KeycloakNoDisponible(APIException):
    status_code = 503
    default_detail = 'No se pudo consultar Keycloak. Revisá la conexión y los permisos de lectura de usuarios del servicio de reportes.'


def usuarios_habilitados(request):
    cfg = settings.KEYCLOAK
    base = (cfg.get('INTERNAL_URL') or cfg['SERVER_URL']).rstrip('/')
    realm = quote(cfg['REALM'], safe='')
    try:
        with requests.Session() as sesion:
            client = getattr(settings, 'KEYCLOAK_REPORTES_CLIENT_ID', '')
            secret = getattr(settings, 'KEYCLOAK_REPORTES_CLIENT_SECRET', '')
            if client and secret:
                respuesta = sesion.post(f'{base}/realms/{realm}/protocol/openid-connect/token',
                    data={'grant_type': 'client_credentials', 'client_id': client, 'client_secret': secret}, timeout=15)
                respuesta.raise_for_status()
                autorizacion = 'Bearer ' + respuesta.json()['access_token']
            else:
                autorizacion = request.headers.get('Authorization', '')
            sesion.headers['Authorization'] = autorizacion
            def obtener(ruta, params=None):
                respuesta = sesion.get(f'{base}/admin/realms/{realm}/{ruta}', params=params, timeout=15)
                respuesta.raise_for_status()
                return respuesta.json()
            clientes = obtener('clients', {'clientId': cfg['CLIENT_ID']})
            if len(clientes) != 1:
                raise KeycloakNoDisponible()
            client_uuid = quote(clientes[0]['id'], safe='')
            filas = []
            primero = 0
            while True:
                usuarios = obtener('users', {'first': primero, 'max': 100, 'enabled': 'true', 'briefRepresentation': 'false'})
                for usuario in usuarios:
                    if not usuario.get('enabled') or usuario.get('serviceAccountClientId'):
                        continue
                    roles = obtener(f"users/{quote(usuario['id'], safe='')}/role-mappings/realm/composite")
                    roles += obtener(f"users/{quote(usuario['id'], safe='')}/role-mappings/clients/{client_uuid}/composite")
                    nombres = sorted({rol['name'] for rol in roles if rol['name'].lower() in ROLES})
                    if nombres:
                        filas.append([' '.join(filter(None, [usuario.get('firstName'), usuario.get('lastName')])),
                                      usuario.get('username', ''), usuario.get('email', ''), ', '.join(nombres)])
                if len(usuarios) < 100:
                    break
                primero += len(usuarios)
            return sorted(filas, key=lambda fila: fila[1].lower())
    except (requests.RequestException, KeyError, ValueError, TypeError):
        raise KeycloakNoDisponible() from None
