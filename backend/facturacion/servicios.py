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

Gestión posterior: :func:`anular_factura` (``sol_cancelacion``),
:func:`inutilizar_factura` (``sol_inutilizacion``) y
:func:`emitir_nota_credito` (``generar_de`` con ``iTiDE=5``). La consulta
aplica la precedencia inutilización → cancelación → aprobación y no
modifica la caja ni la operación interna.
"""

from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone

from operaciones.models import Operacion

from . import cliente_fs
from .armado import DatosIncompletos, armar_de_resumido, armar_nc_resumido
from .models import (
    EVENTO_APROBADA,
    EVENTO_ERROR,
    EVENTO_PENDIENTE,
    EVENTO_RECHAZADA,
    MOTIVOS_NC_CODIGOS,
    EventoSIFEN,
    FacturaElectronica,
    NotaCreditoElectronica,
)


class EmisionRechazada(Exception):
    """No se puede emitir (validación previa, antes de llamar a la API)."""


class GestionRechazada(EmisionRechazada):
    """No se puede anular, inutilizar o acreditar un comprobante."""


# ------------------------------------------------------------ números --

def rango() -> tuple[int, int]:
    cfg = cliente_fs.config()
    return int(cfg['NUMERO_DESDE']), int(cfg['NUMERO_HASTA'])


def rango_nc() -> tuple[int, int]:
    """Rango propio de notas de crédito (independiente del de facturas)."""
    cfg = cliente_fs.config()
    return int(cfg.get('NC_NUMERO_DESDE', 13)), int(cfg.get('NC_NUMERO_HASTA', 24))


def numeros_usados(simulada: bool) -> set[int]:
    valores = FacturaElectronica.objects.filter(
        simulada=simulada, numero__isnull=False,
        estado__in=FacturaElectronica.ESTADOS_CON_NUMERO,
    ).values_list('numero', flat=True)
    return {int(v) for v in valores if str(v).isdigit()}


def numeros_nc_usados(simulada: bool) -> set[int]:
    valores = NotaCreditoElectronica.objects.filter(
        simulada=simulada, numero__isnull=False,
        estado__in=NotaCreditoElectronica.ESTADOS_CON_NUMERO,
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


def siguiente_numero_nc(simulada: bool) -> str | None:
    desde, hasta = rango_nc()
    usados = numeros_nc_usados(simulada)
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
    nc_desde, nc_hasta = rango_nc()
    nc_limite = nc_hasta - nc_desde + 1
    nc_usadas = len(
        [n for n in numeros_nc_usados(simulada) if nc_desde <= n <= nc_hasta])
    return {
        'modo': 'simulado' if simulada else 'real',
        'usadas': usadas,
        'limite': limite,
        'disponibles': max(limite - usadas, 0),
        'siguiente_numero': siguiente_numero(simulada),
        'nc_usadas': nc_usadas,
        'nc_limite': nc_limite,
        'nc_disponibles': max(nc_limite - nc_usadas, 0),
        'nc_siguiente_numero': siguiente_numero_nc(simulada),
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


def _consultar_estado(
    factura: FacturaElectronica, eventos: tuple[str, ...] = (),
    cdc: str | None = None,
) -> tuple[dict, dict]:
    """Llama a ``get_estado_sifen`` validando modo y CDC."""
    cdc = cdc or factura.cdc
    if not cdc:
        raise GestionRechazada(
            'La factura no tiene CDC: no se puede consultar su estado.')
    if factura.simulada != cliente_fs.modo_simulado():
        raise GestionRechazada(
            'Esta factura se emitió en otro modo (simulado/real).')
    ruc = cliente_fs.config()['EMISOR'].get('dRucEm', '')
    try:
        return cliente_fs.get_estado_sifen(cdc, ruc, eventos=eventos)
    except cliente_fs.ErrorFacturaSegura as exc:
        raise GestionRechazada(f'get_estado_sifen: {exc}') from exc
    except cliente_fs.SinRespuesta as exc:
        raise GestionRechazada(
            f'No se pudo consultar el estado: {exc}') from exc


def _evento_activo(factura: FacturaElectronica, tipo: str):
    return factura.eventos.filter(
        tipo=tipo,
        estado__in=(EVENTO_PENDIENTE, EVENTO_APROBADA),
    ).order_by('-solicitado', '-id').first()


def _estado_evento(estado_raw: str) -> str:
    if estado_raw in ('Aprobado', 'Aprobado con observación'):
        return EVENTO_APROBADA
    if estado_raw == 'Rechazado':
        return EVENTO_RECHAZADA
    if estado_raw in ERRORES_SIFEN:
        return EVENTO_ERROR
    return EVENTO_PENDIENTE


def _aplicar_evento(
    factura: FacturaElectronica, tipo: str, resultado: dict,
    respuesta: dict, ahora,
) -> None:
    """Actualiza el último evento del tipo indicado y el resumen de la factura."""
    clave_estado = 'estado_can' if tipo == EventoSIFEN.TIPO_CANCELACION else 'estado_inu'
    clave_desc = 'desc_can' if tipo == EventoSIFEN.TIPO_CANCELACION else 'desc_inu'
    clave_error = 'error_can' if tipo == EventoSIFEN.TIPO_CANCELACION else 'error_inu'
    estado_raw = str(resultado.get(clave_estado) or '').strip()
    if not estado_raw:
        return
    evento = factura.eventos.filter(tipo=tipo).order_by(
        '-solicitado', '-id').first()
    if evento is None:
        return
    prefijo = ('Cancelación' if tipo == EventoSIFEN.TIPO_CANCELACION
               else 'Inutilización')
    detalle = _texto(resultado.get(clave_desc), resultado.get(clave_error))
    evento.estado = _estado_evento(estado_raw)
    evento.consultado = ahora
    evento.detalle = _texto(prefijo, estado_raw, detalle)[:500]
    evento.respuesta_consulta = respuesta
    evento.save(update_fields=[
        'estado', 'consultado', 'detalle', 'respuesta_consulta'])

    if tipo == EventoSIFEN.TIPO_CANCELACION:
        factura.estado_cancelacion = evento.estado
        factura.cancelacion_consultada = ahora
        factura.cancelacion_detalle = evento.detalle
    else:
        factura.estado_inutilizacion = evento.estado
        factura.inutilizacion_consultada = ahora
        factura.inutilizacion_detalle = evento.detalle


def _aplicar_resultado(
    factura: FacturaElectronica, resultado: dict, respuesta: dict,
) -> FacturaElectronica:
    """Aplica el orden normativo: inutilización, cancelación y aprobación."""
    ahora = timezone.now()
    factura.respuesta_servicio = respuesta
    factura.estado_consultado = ahora

    # 1) Inutilización y 2) cancelación: se actualizan los eventos y el
    # resumen de la factura; no cambian su estado fiscal principal.
    if str(resultado.get('estado_inu') or '').strip():
        _aplicar_evento(
            factura, EventoSIFEN.TIPO_INUTILIZACION, resultado, respuesta, ahora)
    if str(resultado.get('estado_can') or '').strip():
        _aplicar_evento(
            factura, EventoSIFEN.TIPO_CANCELACION, resultado, respuesta, ahora)

    # 3) Aprobación/rechazo del DE.
    estado_sifen = str(resultado.get('estado_sifen') or '').strip()
    descripcion = _texto(resultado.get('desc_sifen'), resultado.get('error_sifen'))
    if estado_sifen in ('Aprobado', 'Aprobado con observación'):
        factura.estado = FacturaElectronica.ESTADO_APROBADA
        factura.detalle = descripcion or estado_sifen
        if not factura.envio_fecha:
            factura.envio_fecha = ahora
            factura.envio_destinatario = factura.email_destino
            factura.envio_resultado = (
                'Simulado: no se envió ningún correo.' if factura.simulada
                else 'Enviada por Factura Segura (XML y KuDE) al aprobarse.')
    elif estado_sifen in ('Rechazado', 'Reingresado'):
        factura.estado = FacturaElectronica.ESTADO_RECHAZADA
        factura.detalle = descripcion or estado_sifen
    elif estado_sifen in ERRORES_SIFEN:
        factura.detalle = _texto('Error SIFEN (Apr.)', descripcion)
    elif estado_sifen:
        factura.detalle = _texto('En proceso', estado_sifen)
    else:
        factura.detalle = _texto(
            factura.detalle or 'En proceso', 'sin respuesta de SIFEN todavía')

    # El estado final tiene prioridad para el texto que ve el operador.
    if factura.estado_inutilizacion == EVENTO_APROBADA:
        factura.detalle = _texto('Inutilizado', factura.inutilizacion_detalle)
    elif factura.estado_inutilizacion == EVENTO_RECHAZADA:
        factura.detalle = _texto(
            'Inutilización rechazada', factura.inutilizacion_detalle)
    elif factura.estado_cancelacion == EVENTO_APROBADA:
        factura.detalle = _texto('Cancelado', factura.cancelacion_detalle)
    elif factura.estado_cancelacion == EVENTO_RECHAZADA:
        factura.detalle = _texto(
            'Aprobada (Rech.Can.)', factura.cancelacion_detalle)
    factura.detalle = factura.detalle[:500]
    if factura.estado_cancelacion == EVENTO_APROBADA:
        finalizar_gestion(factura, 'ANULADA', factura.cdc)
    factura.save()
    return factura


def actualizar_estado(factura: FacturaElectronica) -> FacturaElectronica:
    """Consulta ``get_estado_sifen`` y actualiza factura y eventos."""
    if factura.estado in ('ANULADA', 'DEVUELTA'):
        sincronizar_gestion(factura)
        return factura
    eventos = tuple(
        factura.eventos.filter(estado=EVENTO_PENDIENTE)
        .values_list('tipo', flat=True).distinct())
    resultado, respuesta = _consultar_estado(factura, eventos=eventos)
    return _aplicar_resultado(factura, resultado, respuesta)


def actualizar_evento(
    factura: FacturaElectronica, tipo: str,
) -> EventoSIFEN:
    """Consulta el estado del evento indicado (cancelación/inutilización)."""
    evento = factura.eventos.filter(tipo=tipo).order_by(
        '-solicitado', '-id').first()
    if evento is None:
        etiqueta = ('cancelación' if tipo == EventoSIFEN.TIPO_CANCELACION
                    else 'inutilización')
        raise GestionRechazada(f'La factura no tiene una solicitud de {etiqueta}.')
    resultado, respuesta = _consultar_estado(
        factura, eventos=(tipo,), cdc=evento.cdc_evento or factura.cdc)
    _aplicar_resultado(factura, resultado, respuesta)
    evento.refresh_from_db()
    return evento


# -------------------------------------------------------- cancelación --

def _validar_ventana_cancelacion(factura: FacturaElectronica) -> None:
    horas = int(cliente_fs.config().get('CANCELACION_VENTANA_HORAS', 48))
    if horas <= 0:
        return
    if timezone.now() - factura.creada > timedelta(hours=horas):
        raise GestionRechazada(
            f'Pasaron más de {horas} horas desde la emisión: SIFEN ya no '
            'admite la cancelación. Emití una nota de crédito.')


def bloquear_factura(func):
    from functools import wraps
    @wraps(func)
    def protegida(factura, *args, **kwargs):
        with transaction.atomic():
            FacturaElectronica.objects.select_for_update().get(pk=factura.pk)
            factura.refresh_from_db()
            return func(factura, *args, **kwargs)
    return protegida


@bloquear_factura
def anular_factura(
    factura: FacturaElectronica, motivo: str = '', usuario_sub: str = '',
    usuario_nombre: str = '',
) -> EventoSIFEN:
    """Solicita la cancelación de una factura aprobada (``sol_cancelacion``)."""
    if factura.estado != FacturaElectronica.ESTADO_APROBADA:
        raise GestionRechazada(
            'Solo se anula una factura aprobada. Para números rechazados '
            'usá la inutilización.')
    if factura.simulada != cliente_fs.modo_simulado():
        raise GestionRechazada(
            'Esta factura se emitió en otro modo (simulado/real).')
    if not factura.cdc:
        raise GestionRechazada('La factura no tiene CDC: no se puede anular.')
    if factura.estado_inutilizacion == EVENTO_APROBADA:
        raise GestionRechazada('El número de la factura ya fue inutilizado.')
    if factura.estado_cancelacion in (EVENTO_PENDIENTE, EVENTO_APROBADA):
        raise GestionRechazada('La factura ya tiene una cancelación en curso o aprobada.')
    if _evento_activo(factura, EventoSIFEN.TIPO_CANCELACION):
        raise GestionRechazada('La factura ya tiene una cancelación en curso o aprobada.')
    if factura.notas_credito.filter(estado__in=NotaCreditoElectronica.ESTADOS_ACTIVOS).exists():
        raise GestionRechazada('La factura ya tiene una nota de crédito activa.')
    _validar_ventana_cancelacion(factura)

    ahora = timezone.now()
    motivo = (motivo or '').strip()[:255]
    evento = EventoSIFEN.objects.create(
        factura=factura, tipo=EventoSIFEN.TIPO_CANCELACION,
        estado=EVENTO_PENDIENTE, cdc_evento=factura.cdc, motivo=motivo,
        solicitado_por_sub=usuario_sub[:160],
        solicitado_por_nombre=usuario_nombre[:160],
        detalle='Solicitud enviada. Consultá el estado en SIFEN en ~1 minuto.',
    )
    factura.estado_cancelacion = EVENTO_PENDIENTE
    factura.cancelacion_solicitada = ahora
    factura.cancelacion_detalle = evento.detalle
    factura.cancelada_por_sub = usuario_sub[:160]
    factura.cancelada_por_nombre = usuario_nombre[:160]
    factura.save()

    ruc = cliente_fs.config()['EMISOR'].get('dRucEm', '')
    try:
        respuesta = cliente_fs.solicitar_cancelacion(factura.cdc, ruc)
    except cliente_fs.ErrorFacturaSegura as exc:
        evento.estado = EVENTO_ERROR
        evento.respuesta_solicitud = exc.respuesta
        evento.detalle = f'sol_cancelacion: {exc}'[:500]
        evento.save()
        factura.estado_cancelacion = EVENTO_ERROR
        factura.cancelacion_detalle = evento.detalle
        factura.save()
        return evento
    except cliente_fs.SinRespuesta as exc:
        evento.detalle = (
            f'Sin respuesta de sol_cancelacion ({exc}). No se reintenta '
            'automáticamente: consultá el estado en SIFEN.'
        )[:500]
        evento.save()
        factura.cancelacion_detalle = evento.detalle
        factura.save()
        return evento

    evento.respuesta_solicitud = respuesta
    evento.detalle = evento.detalle[:500]
    evento.save()
    return evento


# ------------------------------------------------------ inutilización --

def inutilizar_factura(
    factura: FacturaElectronica, motivo: str = '', usuario_sub: str = '',
    usuario_nombre: str = '',
) -> EventoSIFEN:
    """Solicita inutilizar el número de un DE no aprobado."""
    if factura.estado == FacturaElectronica.ESTADO_APROBADA:
        raise GestionRechazada(
            'Una factura aprobada se anula con sol_cancelacion; no se inutiliza.')
    if factura.estado not in (
        FacturaElectronica.ESTADO_RECHAZADA,
        FacturaElectronica.ESTADO_ERROR,
        FacturaElectronica.ESTADO_VERIFICAR,
    ):
        raise GestionRechazada(
            'Solo se inutiliza un número rechazado, con error o pendiente de verificar.')
    if not factura.numero:
        raise GestionRechazada(
            'La factura no consumió un número: no hay nada que inutilizar.')
    if factura.simulada != cliente_fs.modo_simulado():
        raise GestionRechazada(
            'Esta factura se emitió en otro modo (simulado/real).')
    if factura.estado_cancelacion == EVENTO_APROBADA:
        raise GestionRechazada('La factura ya fue cancelada.')
    if factura.estado_inutilizacion in (EVENTO_PENDIENTE, EVENTO_APROBADA):
        raise GestionRechazada('La factura ya tiene una inutilización en curso o aprobada.')
    if _evento_activo(factura, EventoSIFEN.TIPO_INUTILIZACION):
        raise GestionRechazada('La factura ya tiene una inutilización en curso o aprobada.')

    cfg = cliente_fs.config()
    emisor = cfg['EMISOR']
    ahora = timezone.now()
    motivo = (motivo or '').strip()[:255]
    evento = EventoSIFEN.objects.create(
        factura=factura, tipo=EventoSIFEN.TIPO_INUTILIZACION,
        estado=EVENTO_PENDIENTE, cdc_evento=factura.cdc or '', motivo=motivo,
        solicitado_por_sub=usuario_sub[:160],
        solicitado_por_nombre=usuario_nombre[:160],
        detalle='Solicitud enviada. Consultá el estado en SIFEN en ~1 minuto.',
    )
    factura.estado_inutilizacion = EVENTO_PENDIENTE
    factura.inutilizacion_solicitada = ahora
    factura.inutilizacion_detalle = evento.detalle
    factura.inutilizada_por_sub = usuario_sub[:160]
    factura.inutilizada_por_nombre = usuario_nombre[:160]
    factura.save()

    try:
        respuesta = cliente_fs.solicitar_inutilizacion(
            emisor.get('dRucEm', ''), '1',
            emisor.get('dNumTim', ''), emisor.get('dEst', '001'),
            emisor.get('dPunExp', '001'), factura.numero,
        )
    except cliente_fs.ErrorFacturaSegura as exc:
        evento.estado = EVENTO_ERROR
        evento.respuesta_solicitud = exc.respuesta
        evento.detalle = f'sol_inutilizacion: {exc}'[:500]
        evento.save()
        factura.estado_inutilizacion = EVENTO_ERROR
        factura.inutilizacion_detalle = evento.detalle
        factura.save()
        return evento
    except cliente_fs.SinRespuesta as exc:
        evento.detalle = (
            f'Sin respuesta de sol_inutilizacion ({exc}). No se reintenta '
            'automáticamente: consultá el estado en SIFEN.'
        )[:500]
        evento.save()
        factura.inutilizacion_detalle = evento.detalle
        factura.save()
        return evento

    evento.respuesta_solicitud = respuesta
    resultados = respuesta.get('results') or []
    if resultados and isinstance(resultados[0], dict):
        cdc = str(resultados[0].get('CDC') or '').strip()
        if cdc:
            evento.cdc_evento = cdc
    evento.detalle = evento.detalle[:500]
    evento.save()
    return evento


# ---------------------------------------------------- nota de crédito --

def _validar_nc(factura: FacturaElectronica, motivo: str, email: str) -> str:
    if factura.estado != FacturaElectronica.ESTADO_APROBADA:
        raise GestionRechazada(
            'Solo se emite una nota de crédito de una factura aprobada.')
    if factura.simulada != cliente_fs.modo_simulado():
        raise GestionRechazada(
            'Esta factura se emitió en otro modo (simulado/real).')
    if not factura.cdc:
        raise GestionRechazada('La factura no tiene CDC: no se puede acreditar.')
    if factura.estado_cancelacion == EVENTO_APROBADA:
        raise GestionRechazada(
            'La factura está cancelada en SIFEN: no se emite nota de crédito.')
    if NotaCreditoElectronica.objects.filter(
            factura=factura, simulada=factura.simulada,
            estado__in=NotaCreditoElectronica.ESTADOS_ACTIVOS).exists():
        raise GestionRechazada(
            'La factura ya tiene una nota de crédito activa.')
    if motivo not in MOTIVOS_NC_CODIGOS:
        raise GestionRechazada('Elegí un motivo de nota de crédito válido.')
    email = (email or factura.email_destino or '').strip()
    try:
        validate_email(email)
    except ValidationError as exc:
        raise GestionRechazada(
            'Ingresá un correo válido para enviar la nota de crédito.') from exc
    return email


@bloquear_factura
def emitir_nota_credito(
    factura: FacturaElectronica, motivo: str = '5', email: str = '',
    usuario_sub: str = '', usuario_nombre: str = '',
) -> NotaCreditoElectronica:
    """Emite una nota de crédito total (iTiDE=5) de una factura aprobada."""
    simulada = cliente_fs.modo_simulado()
    email = _validar_nc(factura, motivo, email)
    numero = siguiente_numero_nc(simulada)
    if numero is None:
        desde, hasta = rango_nc()
        raise GestionRechazada(
            f'Se alcanzó el límite de notas de crédito ({hasta - desde + 1}).')

    comunes = {
        'factura': factura, 'simulada': simulada, 'email_destino': email,
        'motivo': motivo, 'total': factura.total,
        'emitida_por_sub': usuario_sub[:160],
        'emitida_por_nombre': usuario_nombre[:160],
    }

    try:
        de_resumido = armar_nc_resumido(factura, numero, email, motivo)
        de = cliente_fs.calcular_de(de_resumido)
    except DatosIncompletos as exc:
        raise GestionRechazada(str(exc)) from exc
    except cliente_fs.ErrorFacturaSegura as exc:
        return NotaCreditoElectronica.objects.create(
            **comunes, estado=NotaCreditoElectronica.ESTADO_ERROR,
            detalle=f'calcular_de: {exc}'[:500],
            respuesta_servicio=exc.respuesta, de_enviado=de_resumido,
        )
    except cliente_fs.SinRespuesta as exc:
        raise GestionRechazada(
            f'No se pudo contactar a Factura Segura: {exc}') from exc

    try:
        with transaction.atomic():
            FacturaElectronica.objects.select_for_update().get(pk=factura.pk)
            if NotaCreditoElectronica.objects.filter(
                    factura=factura, simulada=simulada,
                    estado__in=NotaCreditoElectronica.ESTADOS_ACTIVOS).exists():
                raise GestionRechazada(
                    'La factura ya tiene una nota de crédito activa.')
            numero = siguiente_numero_nc(simulada)
            if numero is None:
                raise GestionRechazada(
                    'Se alcanzó el límite de notas de crédito.')
            de['dNumDoc'] = numero
            nota = NotaCreditoElectronica.objects.create(
                **comunes, numero=numero,
                numero_completo=_numero_completo(de, numero),
                estado=NotaCreditoElectronica.ESTADO_VERIFICAR,
                de_enviado=de, detalle='Enviando a Factura Segura…',
            )
    except IntegrityError as exc:
        raise GestionRechazada(
            'Otra emisión tomó el mismo número. Intentá de nuevo.') from exc

    try:
        cdc, respuesta = cliente_fs.generar_de(de)
    except cliente_fs.ErrorFacturaSegura as exc:
        nota.estado = NotaCreditoElectronica.ESTADO_ERROR
        nota.numero = None
        nota.numero_completo = ''
        nota.detalle = f'generar_de: {exc}'[:500]
        nota.respuesta_servicio = exc.respuesta
        nota.save()
        return nota
    except cliente_fs.SinRespuesta as exc:
        nota.detalle = (
            f'Sin respuesta de generar_de ({exc}). El documento pudo haberse '
            'generado: NO reintentar; verificar con soporte de Factura Segura.'
        )[:500]
        nota.save(update_fields=['detalle', 'actualizada'])
        return nota

    nota.estado = NotaCreditoElectronica.ESTADO_EMITIDA
    nota.cdc = cdc
    nota.respuesta_servicio = respuesta
    nota.detalle = 'Generada. Esperando la aprobación de SIFEN.'
    nota.save()
    if nota.estado == NotaCreditoElectronica.ESTADO_APROBADA:
        finalizar_gestion(nota.factura, 'DEVUELTA', nota.cdc)
    return nota


def actualizar_estado_nc(nota: NotaCreditoElectronica) -> NotaCreditoElectronica:
    """Consulta ``get_estado_sifen`` para una nota de crédito."""
    if not nota.cdc:
        raise GestionRechazada(
            'La nota de crédito no tiene CDC: no se puede consultar su estado.')
    if nota.simulada != cliente_fs.modo_simulado():
        raise GestionRechazada(
            'Esta nota de crédito se emitió en otro modo (simulado/real).')
    ruc = cliente_fs.config()['EMISOR'].get('dRucEm', '')
    try:
        resultado, respuesta = cliente_fs.get_estado_sifen(nota.cdc, ruc)
    except cliente_fs.ErrorFacturaSegura as exc:
        raise GestionRechazada(f'get_estado_sifen: {exc}') from exc
    except cliente_fs.SinRespuesta as exc:
        raise GestionRechazada(
            f'No se pudo consultar el estado: {exc}') from exc

    estado_sifen = str(resultado.get('estado_sifen') or '').strip()
    descripcion = _texto(resultado.get('desc_sifen'), resultado.get('error_sifen'))
    nota.respuesta_servicio = respuesta
    nota.estado_consultado = timezone.now()
    if estado_sifen in ('Aprobado', 'Aprobado con observación'):
        nota.estado = NotaCreditoElectronica.ESTADO_APROBADA
        nota.detalle = descripcion or estado_sifen
        if not nota.envio_fecha:
            nota.envio_fecha = timezone.now()
            nota.envio_destinatario = nota.email_destino
            nota.envio_resultado = (
                'Simulado: no se envió ningún correo.' if nota.simulada
                else 'Enviada por Factura Segura (XML y KuDE) al aprobarse.')
    elif estado_sifen in ('Rechazado', 'Reingresado'):
        nota.estado = NotaCreditoElectronica.ESTADO_RECHAZADA
        nota.detalle = descripcion or estado_sifen
    elif estado_sifen in ERRORES_SIFEN:
        nota.detalle = _texto('Error SIFEN (NC)', descripcion)
    else:
        nota.detalle = _texto(
            'En proceso', estado_sifen or 'sin respuesta de SIFEN todavía')
    nota.detalle = nota.detalle[:500]
    nota.save()
    if nota.estado == NotaCreditoElectronica.ESTADO_APROBADA:
        finalizar_gestion(nota.factura, 'DEVUELTA', nota.cdc)
    return nota


def ruta_pdf(factura):
    from pathlib import Path
    from django.conf import settings
    return Path(settings.MEDIA_ROOT) / 'facturas' / f'{factura.pk}.pdf'


def finalizar_gestion(factura, estado, cdc):
    factura.estado = estado
    factura.pdf_cdc = cdc
    factura.pdf_pendiente = not factura.simulada
    factura.save(update_fields=['estado', 'pdf_cdc', 'pdf_pendiente'])
    actualizar_pdf(factura)


def actualizar_pdf(factura):
    if not factura.pdf_pendiente:
        return
    import os
    import tempfile
    temporal = None
    try:
        contenido = cliente_fs.descargar('dwn_kude', cliente_fs.config()['EMISOR'].get('dRucEm', ''), factura.pdf_cdc)
        if not contenido.startswith(b'%PDF-'):
            raise ValueError('Respuesta PDF inválida')
        ruta = ruta_pdf(factura)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=ruta.parent, delete=False) as archivo:
            temporal = archivo.name
            archivo.write(contenido)
        os.replace(temporal, ruta)
        factura.pdf_pendiente = False
        factura.save(update_fields=['pdf_pendiente'])
    except (cliente_fs.ErrorFacturaSegura, cliente_fs.SinRespuesta, OSError, ValueError):
        # El estado fiscal ya fue confirmado; la próxima consulta reintenta el PDF.
        pass
    finally:
        if temporal and os.path.exists(temporal):
            os.unlink(temporal)


def sincronizar_gestion(factura):
    try:
        if factura.estado_cancelacion == EVENTO_PENDIENTE:
            actualizar_evento(factura, EventoSIFEN.TIPO_CANCELACION)
        for nota in factura.notas_credito.filter(estado__in=['EMITIDA', 'VERIFICAR']).exclude(cdc=''):
            actualizar_estado_nc(nota)
        factura.refresh_from_db()
        actualizar_pdf(factura)
    except GestionRechazada:
        pass
    return factura
