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
    except (requests.Timeout, requests.ConnectionError) as exc:
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


def get_estado_sifen(cdc: str, ruc_emisor: str) -> tuple[dict, dict]:
    """``get_estado_sifen``: estado del DE en SIFEN. Solo consulta.

    Devuelve ``(resultado, respuesta)`` donde ``resultado`` es el primer
    elemento de ``results`` (``estado_sifen``, ``desc_sifen``, ...).
    """
    if modo_simulado():
        resultado = {
            'estado_sifen': 'Aprobado', 'desc_sifen': '0260 - Aprobado (simulado)',
            'error_sifen': '', 'fch_sifen': '',
            'estado_can': '', 'desc_can': '', 'error_can': '', 'fch_can': '',
            'estado_inu': '', 'desc_inu': '', 'error_inu': '', 'fch_inu': '',
        }
        return resultado, _respuesta_simulada([resultado])
    datos = _llamar('get_estado_sifen', {'CDC': cdc, 'dRucEm': ruc_emisor})
    resultados = datos.get('results') or []
    return (resultados[0] if resultados else {}), datos
