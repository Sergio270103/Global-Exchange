"""Configuración de Keycloak para el ambiente de producción (PI-96).

Se ejecuta después de levantar los servicios, como tarea de una sola vez
con la imagen del backend (servicio ``keycloak-init`` de
``docker-compose.prod.yml``)::

    docker compose ... run --rm -T keycloak-init

El realm se importa desde ``frontend/realm-export.json`` (el mismo que en
desarrollo). Este script completa lo que depende del ambiente y no puede
venir en ese archivo:

1. Espera a que Keycloak termine de arrancar e importar el realm.
2. Agrega la dirección pública (ngrok) a las URLs permitidas del cliente
   del frontend (redirect URIs y web origins).
3. Carga la contraseña SMTP (el export la trae enmascarada), para que
   salgan los correos de verificación del registro.
4. Crea los usuarios iniciales (``USUARIOS_INICIALES``) con su rol.

Es idempotente: se puede ejecutar todas las veces que haga falta y no pisa
usuarios ni contraseñas que ya existan. Solo usa la biblioteca estándar.
Los mensajes van sin tildes a propósito: la consola de Windows PowerShell
muestra mal los acentos que llegan desde un contenedor.

Variables de entorno (las arma ``docker-compose.prod.yml`` con ``.env.prod``):
``PUBLIC_URL``, ``KEYCLOAK_INTERNAL_URL``, ``KEYCLOAK_REALM``,
``KEYCLOAK_CLIENT_ID``, ``KEYCLOAK_ADMIN_USER``, ``KEYCLOAK_ADMIN_PASSWORD``,
``KEYCLOAK_SMTP_PASSWORD`` (opcional) y ``USUARIOS_INICIALES`` (opcional).
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ESPERA_MAXIMA_SEGUNDOS = 300


class ErrorKeycloak(Exception):
    """Fallo de configuración; el mensaje se muestra tal cual en la consola."""


def _env(nombre: str, defecto: str = '') -> str:
    return (os.environ.get(nombre) or defecto).strip()


def _pedir(metodo, url, token=None, cuerpo=None, formulario=None):
    """Hace una petición HTTP y devuelve ``(status, json | None, cabeceras)``."""
    datos = None
    cabeceras = {'Accept': 'application/json'}
    if formulario is not None:
        datos = urllib.parse.urlencode(formulario).encode()
        cabeceras['Content-Type'] = 'application/x-www-form-urlencoded'
    elif cuerpo is not None:
        datos = json.dumps(cuerpo).encode()
        cabeceras['Content-Type'] = 'application/json'
    if token:
        cabeceras['Authorization'] = f'Bearer {token}'
    peticion = urllib.request.Request(url, data=datos, headers=cabeceras, method=metodo)
    try:
        with urllib.request.urlopen(peticion, timeout=20) as resp:
            texto = resp.read().decode() or 'null'
            return resp.status, _json(texto), resp.headers
    except urllib.error.HTTPError as err:
        return err.code, _json(err.read().decode() or 'null'), err.headers


def _json(texto: str):
    try:
        return json.loads(texto)
    except ValueError:
        return {'respuesta': texto[:300]}


def _exigir(resultado, accion: str):
    status, cuerpo, cabeceras = resultado
    if status >= 300:
        raise ErrorKeycloak(f'{accion}: Keycloak respondio HTTP {status}: {cuerpo}')
    return cuerpo, cabeceras


def esperar_keycloak(base: str, realm: str) -> None:
    """Espera hasta que el realm importado responda (Keycloak tarda en subir)."""
    url = f'{base}/realms/{urllib.parse.quote(realm)}'
    limite = time.monotonic() + ESPERA_MAXIMA_SEGUNDOS
    avisado = False
    while True:
        try:
            status, _, _ = _pedir('GET', url)
            if status == 200:
                print(f'  OK: Keycloak responde y el realm "{realm}" existe.')
                return
            detalle = f'HTTP {status}'
        except (urllib.error.URLError, OSError) as exc:
            detalle = str(getattr(exc, 'reason', exc))
        if time.monotonic() > limite:
            raise ErrorKeycloak(
                f'Keycloak no respondio en {ESPERA_MAXIMA_SEGUNDOS} s ({detalle}). '
                'Revisa los logs del servicio keycloak (docker compose logs keycloak)')
        if not avisado:
            print('  Esperando a que Keycloak termine de arrancar '
                  '(la primera vez puede tardar un par de minutos)...')
            avisado = True
        time.sleep(4)


def obtener_token(base: str, usuario: str, clave: str) -> str:
    status, cuerpo, _ = _pedir(
        'POST', f'{base}/realms/master/protocol/openid-connect/token',
        formulario={
            'grant_type': 'password', 'client_id': 'admin-cli',
            'username': usuario, 'password': clave,
        })
    if status != 200 or not isinstance(cuerpo, dict) or 'access_token' not in cuerpo:
        raise ErrorKeycloak(
            f'No se pudo iniciar sesion como "{usuario}" en Keycloak (HTTP {status}). '
            'KEYCLOAK_ADMIN_USER / KEYCLOAK_ADMIN_PASSWORD de .env.prod solo se '
            'aplican la primera vez que se crea la base de Keycloak: si las '
            'cambiaste despues, volve a poner las originales.')
    return cuerpo['access_token']


def configurar_cliente(admin: str, token: str, client_id: str, publica: str) -> None:
    """Permite que el frontend publicado en ``publica`` use el login."""
    clientes, _ = _exigir(
        _pedir('GET', f'{admin}/clients?clientId={urllib.parse.quote(client_id)}', token),
        'Buscar el cliente del frontend')
    if not clientes:
        raise ErrorKeycloak(
            f'El realm no tiene el cliente "{client_id}". Revisa KEYCLOAK_CLIENT_ID.')
    cliente = clientes[0]
    redirects = list(cliente.get('redirectUris') or [])
    origenes = list(cliente.get('webOrigins') or [])
    cambios = False
    if f'{publica}/*' not in redirects:
        redirects.append(f'{publica}/*')
        cambios = True
    if publica not in origenes and '*' not in origenes:
        origenes.append(publica)
        cambios = True
    if cliente.get('baseUrl') != f'{publica}/':
        cambios = True
    if not cambios:
        print(f'  OK: el cliente "{client_id}" ya acepta {publica}.')
        return
    cliente.update(redirectUris=redirects, webOrigins=origenes, baseUrl=f'{publica}/')
    _exigir(_pedir('PUT', f"{admin}/clients/{cliente['id']}", token, cuerpo=cliente),
            'Actualizar el cliente del frontend')
    print(f'  OK: cliente "{client_id}" actualizado para {publica}.')


def configurar_tema_acceso(admin: str, token: str) -> None:
    apariencia = {
        'displayName': 'Global Exchange',
        'loginTheme': 'global-exchange',
        'internationalizationEnabled': True,
        'supportedLocales': ['en', 'es'],
        'defaultLocale': 'es',
    }
    _exigir(_pedir('PUT', admin, token, cuerpo=apariencia), 'Activar el tema de acceso')
    print('  OK: tema de acceso Global Exchange activado.')


def configurar_smtp(admin: str, token: str, clave_smtp: str) -> None:
    if not clave_smtp:
        print('  AVISO: KEYCLOAK_SMTP_PASSWORD esta vacio; no se toca el correo de '
              'Keycloak. Si es el primer despliegue, los correos de verificacion '
              'del registro no van a salir.')
        return
    realm, _ = _exigir(_pedir('GET', admin, token), 'Leer el realm')
    smtp = dict(realm.get('smtpServer') or {})
    if not smtp.get('host'):
        print('  AVISO: el realm no tiene servidor SMTP configurado; se omite.')
        return
    smtp['password'] = clave_smtp
    realm['smtpServer'] = smtp
    _exigir(_pedir('PUT', admin, token, cuerpo=realm), 'Guardar la clave SMTP')
    print(f"  OK: clave SMTP cargada para {smtp.get('user') or smtp.get('host')}.")


def _leer_usuarios(texto: str) -> list[dict]:
    usuarios = []
    for item in filter(None, (parte.strip() for parte in texto.split(';'))):
        campos = [c.strip() for c in item.split(':')]
        if len(campos) != 4 or not all(campos):
            raise ErrorKeycloak(
                'USUARIOS_INICIALES tiene un usuario mal escrito (no se muestra '
                'porque incluye la clave). Formato: '
                'usuario:correo:clave:rol, separados por ";".')
        usuarios.append(dict(zip(('usuario', 'correo', 'clave', 'rol'), campos)))
    return usuarios


def _atributos_obligatorios(admin: str, token: str) -> dict:
    """Valores por defecto para los atributos obligatorios del perfil.

    El realm exige atributos propios (por ejemplo ``tipo_persona``). Para los
    que tienen una lista de opciones se usa la primera; después se pueden
    cambiar desde la consola de Keycloak.
    """
    status, perfil, _ = _pedir('GET', f'{admin}/users/profile', token)
    if status != 200 or not isinstance(perfil, dict):
        return {}
    atributos = {}
    for atributo in perfil.get('attributes') or []:
        if atributo.get('name') in ('username', 'email', 'firstName', 'lastName'):
            continue
        opciones = ((atributo.get('validations') or {}).get('options') or {}).get('options')
        if atributo.get('required') and opciones:
            atributos[atributo['name']] = [opciones[0]]
    return atributos


def crear_usuarios(admin: str, token: str, texto: str) -> None:
    usuarios = _leer_usuarios(texto)
    if not usuarios:
        print('  AVISO: USUARIOS_INICIALES esta vacio; no se crean usuarios. '
              'Podes crearlos despues desde la consola de Keycloak.')
        return
    atributos = _atributos_obligatorios(admin, token)
    for datos in usuarios:
        nombre = datos['usuario']
        rol, _ = _exigir(
            _pedir('GET', f"{admin}/roles/{urllib.parse.quote(datos['rol'])}", token),
            f'Buscar el rol "{datos["rol"]}" (revisa que este bien escrito)')
        existentes, _ = _exigir(
            _pedir('GET', f'{admin}/users?exact=true&username={urllib.parse.quote(nombre)}', token),
            f'Buscar el usuario "{nombre}"')
        if existentes:
            usuario_id = existentes[0]['id']
            print(f'  OK: el usuario "{nombre}" ya existe (no se cambia su clave).')
        else:
            _, cabeceras = _exigir(
                _pedir('POST', f'{admin}/users', token, cuerpo={
                    'username': nombre,
                    'email': datos['correo'],
                    'firstName': nombre,
                    'lastName': 'Global Exchange',
                    'enabled': True,
                    'emailVerified': True,
                    'attributes': atributos,
                    'credentials': [{
                        'type': 'password', 'value': datos['clave'], 'temporary': False,
                    }],
                }),
                f'Crear el usuario "{nombre}"')
            usuario_id = (cabeceras.get('Location') or '').rstrip('/').rsplit('/', 1)[-1]
            print(f'  OK: usuario "{nombre}" creado.')
        _exigir(
            _pedir('POST', f'{admin}/users/{usuario_id}/role-mappings/realm', token,
                   cuerpo=[{'id': rol['id'], 'name': rol['name']}]),
            f'Asignar el rol "{datos["rol"]}" a "{nombre}"')
        print(f'      rol "{datos["rol"]}" asignado a "{nombre}".')


def main() -> int:
    base = _env('KEYCLOAK_INTERNAL_URL', 'http://keycloak:8080/auth').rstrip('/')
    realm = _env('KEYCLOAK_REALM', 'Global-Exchange')
    client_id = _env('KEYCLOAK_CLIENT_ID', 'global-exchange-frontend')
    publica = _env('PUBLIC_URL').rstrip('/')
    usuario = _env('KEYCLOAK_ADMIN_USER', 'admin')
    clave = _env('KEYCLOAK_ADMIN_PASSWORD')
    try:
        if not publica or not clave:
            raise ErrorKeycloak('Faltan PUBLIC_URL o KEYCLOAK_ADMIN_PASSWORD en el entorno.')
        esperar_keycloak(base, realm)
        token = obtener_token(base, usuario, clave)
        admin = f'{base}/admin/realms/{urllib.parse.quote(realm)}'
        configurar_cliente(admin, token, client_id, publica)
        configurar_smtp(admin, token, _env('KEYCLOAK_SMTP_PASSWORD'))
        configurar_tema_acceso(admin, token)
        crear_usuarios(admin, token, _env('USUARIOS_INICIALES'))
    except ErrorKeycloak as exc:
        print(f'  ERROR: {exc}')
        return 1
    print('  Keycloak quedo configurado.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
