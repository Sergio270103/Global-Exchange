"""Lógica de emisión y consulta de facturas electrónicas (PI-30).

Flujo de :func:`emitir_factura`:

1. Valida la operación (PAGADA, sin factura activa) y el límite del rango.
2. Arma el JSON resumido y llama a ``calcular_de`` (no genera nada). Si
   falla, queda una factura ``ERROR`` sin número y no se gastó nada.
3. Reserva el número (fila ``VERIFICAR``) y llama a ``generar_de``:
   - OK → ``EMITIDA`` con el CDC.
   - ``code`` negativo → ``ERROR`` y el número queda libre.
   - Sin respuesta → queda ``VERIFICAR``: el número se da por usado y no
     se reintenta solo (el documento pudo haberse generado).

:func:`actualizar_estado` consulta ``get_estado_sifen`` e interpreta la
respuesta según el manual. Al quedar aprobada se registra el envío al
correo del cliente (Factura Segura envía el XML y el KuDE a ``dEmailRec``).
"""

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone

from operaciones.models import Operacion

from . import cliente_fs
from .armado import DatosIncompletos, armar_de_resumido
from .models import FacturaElectronica


class EmisionRechazada(Exception):
    """No se puede emitir (validación previa, antes de llamar a la API)."""


# ------------------------------------------------------------ números --

def rango() -> tuple[int, int]:
    cfg = cliente_fs.config()
    return int(cfg['NUMERO_DESDE']), int(cfg['NUMERO_HASTA'])


def numeros_usados(simulada: bool) -> set[int]:
    valores = FacturaElectronica.objects.filter(
        simulada=simulada, numero__isnull=False,
        estado__in=FacturaElectronica.ESTADOS_CON_NUMERO,
    ).values_list('numero', flat=True)
    return {int(v) for v in valores if str(v).isdigit()}


def siguiente_numero(simulada: bool) -> str | None:
    """Primer número libre del rango, como texto de 7 dígitos."""
    desde, hasta = rango()
    usados = numeros_usados(simulada)
    for n in range(desde, hasta + 1):
        if n not in usados:
            return str(n).zfill(7)
    return None


def uso(simulada: bool | None = None) -> dict:
    """Emisiones usadas del rango ("emisiones usadas X de N")."""
    if simulada is None:
        simulada = cliente_fs.modo_simulado()
    desde, hasta = rango()
    limite = hasta - desde + 1
    usadas = len([n for n in numeros_usados(simulada) if desde <= n <= hasta])
    return {
        'modo': 'simulado' if simulada else 'real',
        'usadas': usadas,
        'limite': limite,
        'disponibles': max(limite - usadas, 0),
        'siguiente_numero': siguiente_numero(simulada),
    }


def _numero_completo(de: dict, numero: str) -> str:
    return f"{de.get('dEst', '001')}-{de.get('dPunExp', '001')}-{numero}"


# ------------------------------------------------------------ emisión --

def emitir_factura(operacion_id: int, email: str, usuario_sub: str = '',
                   usuario_nombre: str = '') -> FacturaElectronica:
    """Emite la factura electrónica de una operación PAGADA."""
    simulada = cliente_fs.modo_simulado()
    email = (email or '').strip()
    try:
        validate_email(email)
    except ValidationError as exc:
        raise EmisionRechazada('Ingresá un correo válido para el cliente.') from exc

    try:
        op = Operacion.objects.select_related(
            'cliente', 'moneda_origen', 'moneda_destino').get(pk=operacion_id)
    except Operacion.DoesNotExist as exc:
        raise EmisionRechazada('La operación no existe.') from exc
    if op.estado != Operacion.ESTADO_PAGADA:
        raise EmisionRechazada(
            'Solo se emite factura de una operación PAGADA '
            '(no de pendientes ni canceladas).')
    if FacturaElectronica.objects.filter(
            operacion=op, simulada=simulada,
            estado__in=FacturaElectronica.ESTADOS_ACTIVOS).exists():
        raise EmisionRechazada(
            'La operación ya tiene una factura emitida o aprobada.')
    numero = siguiente_numero(simulada)
    if numero is None:
        info = uso(simulada)
        raise EmisionRechazada(
            f"Se alcanzó el límite de emisiones ({info['usadas']} de "
            f"{info['limite']}). No se pueden emitir más facturas.")

    comunes = {
        'operacion': op, 'simulada': simulada, 'email_destino': email,
        'emitida_por_sub': usuario_sub[:160],
        'emitida_por_nombre': usuario_nombre[:160],
    }

    # 1) Armar y calcular (no consume números).
    try:
        de_resumido = armar_de_resumido(op, numero, email)
        de = cliente_fs.calcular_de(de_resumido)
    except DatosIncompletos as exc:
        raise EmisionRechazada(str(exc)) from exc
    except cliente_fs.ErrorFacturaSegura as exc:
        return FacturaElectronica.objects.create(
            **comunes, estado=FacturaElectronica.ESTADO_ERROR,
            detalle=f'calcular_de: {exc}'[:500],
            respuesta_servicio=exc.respuesta, de_enviado=de_resumido,
        )
    except cliente_fs.SinRespuesta as exc:
        # calcular_de no genera nada: se puede reintentar sin riesgo.
        raise EmisionRechazada(
            f'No se pudo contactar a Factura Segura: {exc}') from exc

    total = de_resumido['gCamItem'][0]['dPUniProSer']

    # 2) Reservar el número (fila VERIFICAR) dentro de una transacción.
    try:
        with transaction.atomic():
            Operacion.objects.select_for_update().get(pk=op.pk)
            if FacturaElectronica.objects.filter(
                    operacion=op, simulada=simulada,
                    estado__in=FacturaElectronica.ESTADOS_ACTIVOS).exists():
                raise EmisionRechazada(
                    'La operación ya tiene una factura emitida o aprobada.')
            numero = siguiente_numero(simulada)
            if numero is None:
                raise EmisionRechazada('Se alcanzó el límite de emisiones.')
            de['dNumDoc'] = numero
            factura = FacturaElectronica.objects.create(
                **comunes, numero=numero,
                numero_completo=_numero_completo(de, numero),
                estado=FacturaElectronica.ESTADO_VERIFICAR,
                total=total, de_enviado=de,
                detalle='Enviando a Factura Segura…',
            )
    except IntegrityError as exc:
        raise EmisionRechazada(
            'Otra emisión tomó el mismo número u operación. Intentá de nuevo.'
        ) from exc

    # 3) Generar (consume el número).
    try:
        cdc, respuesta = cliente_fs.generar_de(de)
    except cliente_fs.ErrorFacturaSegura as exc:
        factura.estado = FacturaElectronica.ESTADO_ERROR
        factura.numero = None  # no se generó: el número queda libre
        factura.detalle = f'generar_de: {exc}'[:500]
        factura.respuesta_servicio = exc.respuesta
        factura.save()
        return factura
    except cliente_fs.SinRespuesta as exc:
        factura.detalle = (
            f'Sin respuesta de generar_de ({exc}). El documento pudo haberse '
            'generado: NO reintentar; verificar con soporte de Factura Segura.'
        )[:500]
        factura.save(update_fields=['detalle', 'actualizada'])
        return factura

    factura.estado = FacturaElectronica.ESTADO_EMITIDA
    factura.cdc = cdc
    factura.respuesta_servicio = respuesta
    factura.detalle = 'Generada. Esperando la aprobación de SIFEN.'
    factura.save()
    return factura


# ------------------------------------------------------------- estado --

#: estado_sifen que todavía no son finales.
EN_PROCESO = {'', 'SOL.APROBACION', 'ENVIADO_A_SIFEN'}
ERRORES_SIFEN = {'ERROR_SIFEN', 'ERROR_ENVIO_LOTE', 'REINTENTAR_LOTE',
                 'ERROR_CONSULTA_LOTE'}


def _texto(*partes) -> str:
    return ' - '.join(str(p).strip() for p in partes if str(p or '').strip())


def actualizar_estado(factura: FacturaElectronica) -> FacturaElectronica:
    """Consulta ``get_estado_sifen`` y actualiza la factura (solo consulta)."""
    if not factura.cdc:
        raise EmisionRechazada(
            'La factura no tiene CDC: no se puede consultar su estado.')
    if factura.simulada != cliente_fs.modo_simulado():
        raise EmisionRechazada(
            'Esta factura se emitió en otro modo (simulado/real).')
    ruc = cliente_fs.config()['EMISOR'].get('dRucEm', '')
    try:
        resultado, respuesta = cliente_fs.get_estado_sifen(factura.cdc, ruc)
    except cliente_fs.ErrorFacturaSegura as exc:
        raise EmisionRechazada(f'get_estado_sifen: {exc}') from exc
    except cliente_fs.SinRespuesta as exc:
        raise EmisionRechazada(
            f'No se pudo consultar el estado: {exc}') from exc

    estado_sifen = str(resultado.get('estado_sifen') or '').strip()
    descripcion = _texto(resultado.get('desc_sifen'), resultado.get('error_sifen'))
    factura.respuesta_servicio = respuesta
    factura.estado_consultado = timezone.now()

    if estado_sifen in ('Aprobado', 'Aprobado con observación'):
        factura.estado = FacturaElectronica.ESTADO_APROBADA
        factura.detalle = descripcion or estado_sifen
        if not factura.envio_fecha:
            factura.envio_fecha = timezone.now()
            factura.envio_destinatario = factura.email_destino
            factura.envio_resultado = (
                'Simulado: no se envió ningún correo.' if factura.simulada
                else 'Enviada por Factura Segura (XML y KuDE) al aprobarse.')
    elif estado_sifen in ('Rechazado', 'Reingresado'):
        factura.estado = FacturaElectronica.ESTADO_RECHAZADA
        factura.detalle = descripcion or estado_sifen
    elif estado_sifen in ERRORES_SIFEN:
        factura.detalle = _texto('Error SIFEN (Apr.)', descripcion)
    else:
        factura.detalle = _texto(
            'En proceso', estado_sifen or 'sin respuesta de SIFEN todavía')

    # Eventos posteriores (cancelación/inutilización) quedan informados.
    for clave, etiqueta in (('estado_can', 'Cancelación'),
                            ('estado_inu', 'Inutilización')):
        if resultado.get(clave):
            factura.detalle = _texto(
                factura.detalle, f'{etiqueta}: {resultado[clave]}')
    factura.detalle = factura.detalle[:500]
    factura.save()
    return factura
