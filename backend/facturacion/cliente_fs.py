"""Cliente HTTP de la API ESI de Factura Segura (``/misife00/v1/esi``).

Implementa el protocolo petición-respuesta del manual: cada llamada es un
``POST`` con ``{"operation": ..., "params": {...}}`` y el header
``Authentication-Token``; la respuesta trae ``code`` (>= 0 es OK),
``description``, ``operation_info`` y ``results``.

Modos (``settings.FACTURASEGURA['MODO']``):

- ``simulado`` (por defecto): NO hace ninguna llamada de red. Devuelve
  respuestas con el mismo formato del manual (CDC falso, estado
  "Aprobado"), para desarrollar y probar sin gastar números.
- ``real``: llama a la URL configurada con el token del usuario ESI.

Errores:

- :class:`ErrorFacturaSegura`: el servicio respondió con ``code``
  negativo o un error HTTP claro. No se generó el documento.
- :class:`SinRespuesta`: timeout, corte de conexión o respuesta ilegible.
  Si pasó en ``generar_de``, el resultado es INCIERTO: no reintentar.
"""

import hashlib
import uuid

import requests
from django.conf import settings
from django.utils import timezone


class ErrorFacturaSegura(Exception):
    """Factura Segura rechazó la petición (``code`` negativo)."""

    def __init__(self, mensaje: str, code: int | None = None, respuesta=None):
        super().__init__(mensaje)
        self.code = code
        self.respuesta = respuesta or {}


class SinRespuesta(Exception):
    """No se obtuvo una respuesta válida (timeout, red caída, 5xx)."""


def config() -> dict:
    return settings.FACTURASEGURA


def modo_simulado() -> bool:
    return config().get('MODO', 'simulado') != 'real'


def url_login() -> str:
    """URL del login de Factura Segura (``/login?include_auth_token``).

    Se puede sobrescribir con ``FACTURASEGURA_LOGIN_URL``. Por defecto se
    deriva de la URL de la API para no duplicar configuración.
    """
    cfg = config()
    if cfg.get('LOGIN_URL'):
        return str(cfg['LOGIN_URL'])
    base = str(cfg.get('URL', '')).split('/misife00/')[0].rstrip('/')
    return f'{base}/login?include_auth_token'


def obtener_token(email: str, password: str) -> str:
    """Pide un token nuevo a Factura Segura (helper aislado, no se usa solo).

    Devuelve el ``authentication_token`` para que un operador actualice
    ``FACTURASEGURA_TOKEN``. No se invoca automáticamente en cada emisión
    para no exponer credenciales ni multiplicar logins.
    """
    if modo_simulado():
        return 'token-simulado'
    try:
        resp = requests.post(
            url_login(), json={'email': email, 'password': password},
            headers={'accept': 'application/json'},
            timeout=config().get('TIMEOUT', 40),
        )
    except requests.RequestException as exc:
        raise SinRespuesta(f'Sin respuesta del login de Factura Segura: {exc}') from exc
    if resp.status_code in (401, 403):
        raise ErrorFacturaSegura(
            'Factura Segura rechazó las credenciales del ESI.')
    if resp.status_code >= 500:
        raise SinRespuesta(f'El login de Factura Segura respondió HTTP {resp.status_code}.')
    try:
        datos = resp.json()
        token = datos['response']['user']['authentication_token']
    except (ValueError, KeyError, TypeError) as exc:
        raise ErrorFacturaSegura(
            'El login de Factura Segura no devolvió authentication_token.'
        ) from exc
    return str(token)


# ---------------------------------------------------------------- real --

def _llamar(operation: str, params: dict) -> dict:
    cfg = config()
    if not cfg.get('TOKEN'):
        raise ErrorFacturaSegura(
            'Falta FACTURASEGURA_TOKEN en el .env del backend.')
    try:
        resp = requests.post(
            cfg['URL'],
            json={'operation': operation, 'params': params},
            headers={
                'accept': 'application/json',
                'Authentication-Token': cfg['TOKEN'],
            },
            timeout=cfg.get('TIMEOUT', 40),
        )
    except requests.RequestException as exc:
        raise SinRespuesta(f'Sin respuesta de Factura Segura: {exc}') from exc

    if resp.status_code in (401, 403):
        raise ErrorFacturaSegura(
            'Factura Segura rechazó el token (sin autorización). '
            'Revisá FACTURASEGURA_TOKEN.',
            respuesta={'http_status': resp.status_code, 'body': resp.text[:500]})
    if resp.status_code >= 500:
        raise SinRespuesta(
            f'Factura Segura respondió HTTP {resp.status_code}.')
    try:
        datos = resp.json()
    except ValueError as exc:
        raise SinRespuesta(
            f'Respuesta no JSON de Factura Segura (HTTP {resp.status_code}).'
        ) from exc
    if not isinstance(datos, dict) or 'code' not in datos:
        raise SinRespuesta('Respuesta de Factura Segura sin el campo "code".')
    if int(datos['code']) < 0:
        raise ErrorFacturaSegura(
            str(datos.get('description') or 'Error de Factura Segura.'),
            code=int(datos['code']), respuesta=datos)
    return datos


# ----------------------------------------------------------- simulado --

def _respuesta_simulada(results: list) -> dict:
    return {
        'code': 0,
        'description': 'OK (simulado)',
        'operation_info': {'id': str(uuid.uuid4()), 'simulado': True},
        'results': results,
    }


def _cdc_simulado(de: dict) -> str:
    """CDC de 44 dígitos con la forma del real (no es válido en SIFEN)."""
    base = (
        f"{int(de.get('iTiDE', 1)):02d}"
        f"{str(de.get('dRucEm', '0')).zfill(8)[-8:]}"
        f"{str(de.get('dDVEmi', '0'))[-1:]}"
        f"{str(de.get('dEst', '001')).zfill(3)}"
        f"{str(de.get('dPunExp', '001')).zfill(3)}"
        f"{str(de.get('dNumDoc', '0')).zfill(7)}"
    )
    relleno = hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()
    digitos = ''.join(str(int(c, 16) % 10) for c in relleno)
    return (base + digitos)[:44]


# ------------------------------------------------------------ pública --

def calcular_de(de_resumido: dict) -> dict:
    """``calcular_de``: completa los montos según SIFEN. No genera nada.

    Devuelve el DE completo (``results[0]['DE']``) listo para generar.
    """
    if modo_simulado():
        return dict(de_resumido)
    datos = _llamar('calcular_de', {'DE': de_resumido})
    try:
        return datos['results'][0]['DE']
    except (KeyError, IndexError, TypeError) as exc:
        raise ErrorFacturaSegura(
            'calcular_de respondió sin el DE calculado.', respuesta=datos
        ) from exc


def generar_de(de: dict) -> tuple[str, dict]:
    """``generar_de``: genera el documento y pide su aprobación.

    Devuelve ``(cdc, respuesta)``. CONSUME el número ``dNumDoc``.
    """
    if modo_simulado():
        cdc = _cdc_simulado(de)
        return cdc, _respuesta_simulada([{'CDC': cdc}])
    datos = _llamar('generar_de', {'DE': de})
    try:
        cdc = str(datos['results'][0]['CDC'])
    except (KeyError, IndexError, TypeError) as exc:
        # Respondió OK pero sin CDC: no sabemos si quedó generado.
        raise SinRespuesta('generar_de respondió OK pero sin CDC.') from exc
    return cdc, datos


def solicitar_cancelacion(cdc: str, ruc_emisor: str) -> dict:
    """``sol_cancelacion``: pide cancelar un DE aprobado.

    SIFEN procesa el evento de forma asíncrona: ``code: 0`` y ``results: []``
    solo confirman la recepción. Hay que consultar ``get_estado_sifen``
    (campos ``estado_can``/``desc_can``) después de ~1 minuto.
    """
    if modo_simulado():
        return _respuesta_simulada([])
    return _llamar('sol_cancelacion', {'CDC': cdc, 'dRucEm': ruc_emisor})


def solicitar_inutilizacion(
    ruc_emisor: str, itide: str, num_tim: str, est: str, pun_exp: str,
    num_doc: str,
) -> dict:
    """``sol_inutilizacion``: inutiliza el número de un DE no aprobado.

    Si el documento ya existe en Factura Segura, ``results`` viene vacío y
    se debe consultar con el CDC conocido. Si no existe, devuelve un CDC
    ficticio que hay que guardar para consultar ``estado_inu``.
    """
    params = {
        'dRucEm': ruc_emisor,
        'iTiDE': str(itide),
        'dNumTim': str(num_tim),
        'dEst': str(est),
        'dPunExp': str(pun_exp),
        'dNumDoc': str(num_doc),
    }
    if modo_simulado():
        # En simulación el documento "existe": imita el caso results=[].
        return _respuesta_simulada([])
    return _llamar('sol_inutilizacion', params)


def get_estado_sifen(
    cdc: str, ruc_emisor: str, eventos: tuple[str, ...] = (),
) -> tuple[dict, dict]:
    """``get_estado_sifen``: estado del DE en SIFEN. Solo consulta.

    Devuelve ``(resultado, respuesta)`` donde ``resultado`` es el primer
    elemento de ``results`` (``estado_sifen``, ``desc_sifen``, ...).

    ``eventos`` solo se usa en modo simulado: permite que una consulta de
    cancelación/inutilización devuelva el evento aprobado de forma
    determinista, sin marcar como canceladas todas las facturas.
    """
    if modo_simulado():
        resultado = {
            'estado_sifen': 'Aprobado', 'desc_sifen': '0260 - Aprobado (simulado)',
            'error_sifen': '', 'fch_sifen': '',
            'estado_can': '', 'desc_can': '', 'error_can': '', 'fch_can': '',
            'estado_inu': '', 'desc_inu': '', 'error_inu': '', 'fch_inu': '',
        }
        if 'CANCELACION' in eventos:
            resultado.update({
                'estado_can': 'Aprobado',
                'desc_can': 'Cancelación aprobada (simulado)',
                'fch_can': timezone.localtime().strftime('%Y-%m-%d %H:%M:%S'),
            })
        if 'INUTILIZACION' in eventos:
            resultado.update({
                'estado_inu': 'Aprobado',
                'desc_inu': 'Inutilización aprobada (simulado)',
                'fch_inu': timezone.localtime().strftime('%Y-%m-%d %H:%M:%S'),
            })
        return resultado, _respuesta_simulada([resultado])
    datos = _llamar('get_estado_sifen', {'CDC': cdc, 'dRucEm': ruc_emisor})
    resultados = datos.get('results') or []
    return (resultados[0] if resultados else {}), datos


#: Descargas de un DE aprobado (manual: "operation dwn_kude / dwn_xml").
DESCARGAS = {
    'dwn_kude': ('application/pdf', b'%PDF'),
    'dwn_xml': ('application/xml', b'<'),
}


def descargar(operation: str, ruc_emisor: str, cdc: str) -> bytes:
    """``dwn_kude`` / ``dwn_xml``: archivo oficial del DE. Solo descarga.

    ``GET {URL}/{operation}/{dRucEm}/{CDC}`` con el ``Authentication-Token``
    del ESI. No genera ni consume ningún número.
    """
    if operation not in DESCARGAS:
        raise ValueError(f'Operación de descarga desconocida: {operation}')
    if modo_simulado():
        raise ErrorFacturaSegura(
            'En modo simulado no hay documento oficial para descargar.')
    cfg = config()
    if not cfg.get('TOKEN'):
        raise ErrorFacturaSegura(
            'Falta FACTURASEGURA_TOKEN en el .env del backend.')
    url = f"{cfg['URL'].rstrip('/')}/{operation}/{ruc_emisor}/{cdc}"
    try:
        resp = requests.get(
            url, headers={'Authentication-Token': cfg['TOKEN']},
            timeout=cfg.get('TIMEOUT', 40))
    except requests.RequestException as exc:
        raise SinRespuesta(f'Sin respuesta de Factura Segura: {exc}') from exc
    if resp.status_code in (401, 403):
        raise ErrorFacturaSegura(
            'Factura Segura rechazó el token (sin autorización).')
    if resp.status_code >= 500:
        raise SinRespuesta(f'Factura Segura respondió HTTP {resp.status_code}.')
    _, firma = DESCARGAS[operation]
    contenido = resp.content or b''
    if resp.status_code != 200 or not contenido.lstrip().startswith(firma):
        # Ante un error la API responde JSON con "code" y "description".
        mensaje = 'Factura Segura no devolvió el archivo.'
        try:
            datos = resp.json()
            if isinstance(datos, dict) and datos.get('description'):
                mensaje = str(datos['description'])
        except ValueError:
            pass
        raise ErrorFacturaSegura(mensaje)
    return contenido
