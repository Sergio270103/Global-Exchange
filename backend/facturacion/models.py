"""Modelos de facturación electrónica con Factura Segura (PI-30).

Cada intento de emisión de una operación PAGADA queda registrado en
``FacturaElectronica`` con el número usado, el CDC devuelto, el estado
y la respuesta completa del servicio.

Estados:

- ``ERROR``: Factura Segura rechazó la petición antes de generar el
  documento (``code`` negativo en ``calcular_de``/``generar_de``) o faltó
  configuración. No se generó nada y el número queda libre.
- ``VERIFICAR``: se envió ``generar_de`` pero no hubo respuesta (timeout
  o corte). El documento pudo haberse generado: el número queda usado y
  NO se reintenta automáticamente (ver manual, "Petición estándar").
- ``EMITIDA``: Factura Segura devolvió el CDC; se espera la respuesta
  de SIFEN (consultar ``get_estado_sifen`` ~1 minuto después).
- ``APROBADA``: SIFEN aprobó (incluye "Aprobado con observación").
- ``RECHAZADA``: SIFEN rechazó; se puede volver a emitir con otro número.

Las facturas del modo simulado (``simulada=True``) llevan su propia
numeración y no cuentan para el límite real, así las pruebas locales no
gastan los números asignados por Factura Segura.

Además de la emisión, el módulo guarda la gestión posterior:

- ``EventoSIFEN``: solicitudes y consultas de cancelación/inutilización.
- ``NotaCreditoElectronica``: notas de crédito (``iTiDE=5``) con su propio
  rango de numeración y estado en SIFEN.
"""

from django.db import models
from django.db.models import Q

#: Estados de los eventos SIFEN (cancelación / inutilización).
EVENTO_PENDIENTE = 'PENDIENTE'
EVENTO_APROBADA = 'APROBADA'
EVENTO_RECHAZADA = 'RECHAZADA'
EVENTO_ERROR = 'ERROR'
ESTADOS_EVENTO = (
    (EVENTO_PENDIENTE, 'Pendiente de SIFEN'),
    (EVENTO_APROBADA, 'Aprobado por SIFEN'),
    (EVENTO_RECHAZADA, 'Rechazado por SIFEN'),
    (EVENTO_ERROR, 'Error de SIFEN'),
)

#: Motivos de emisión de nota de crédito (iMotEmi del Manual SIFEN).
MOTIVOS_NC = (
    ('1', 'Devolución de mercadería'),
    ('2', 'Descuento por volumen'),
    ('3', 'Bonificación'),
    ('4', 'Crédito incobrable'),
    ('5', 'Ajuste de precio'),
    ('6', 'Comisión'),
    ('7', 'Otros'),
)
MOTIVOS_NC_CODIGOS = tuple(codigo for codigo, _ in MOTIVOS_NC)


class FacturaElectronica(models.Model):
    """Factura electrónica emitida (o intentada) para una operación."""

    ESTADO_ANULADA = 'ANULADA'
    ESTADO_DEVUELTA = 'DEVUELTA'
    pdf_pendiente = models.BooleanField(default=False)
    pdf_cdc = models.CharField(max_length=64, blank=True)
    ESTADO_ERROR = 'ERROR'
    ESTADO_VERIFICAR = 'VERIFICAR'
    ESTADO_EMITIDA = 'EMITIDA'
    ESTADO_APROBADA = 'APROBADA'
    ESTADO_RECHAZADA = 'RECHAZADA'
    ESTADOS = (
        (ESTADO_ANULADA, 'Anulada'),
        (ESTADO_DEVUELTA, 'Devuelta'),
        (ESTADO_ERROR, 'Error (no generada)'),
        (ESTADO_VERIFICAR, 'Pendiente de verificar'),
        (ESTADO_EMITIDA, 'Emitida'),
        (ESTADO_APROBADA, 'Aprobada'),
        (ESTADO_RECHAZADA, 'Rechazada'),
    )
    #: Estados que impiden emitir otra factura para la misma operación.
    ESTADOS_ACTIVOS = (ESTADO_VERIFICAR, ESTADO_EMITIDA, ESTADO_APROBADA, ESTADO_ANULADA, ESTADO_DEVUELTA)
    #: Estados que consumen un número del rango asignado.
    ESTADOS_CON_NUMERO = (
        ESTADO_VERIFICAR, ESTADO_EMITIDA, ESTADO_APROBADA, ESTADO_RECHAZADA, ESTADO_ANULADA, ESTADO_DEVUELTA)

    operacion = models.ForeignKey(
        'operaciones.Operacion', on_delete=models.PROTECT,
        related_name='facturas', verbose_name='operación',
    )
    simulada = models.BooleanField(
        'simulada', default=False,
        help_text='Emitida en modo simulado: no pasó por Factura Segura.',
    )
    numero = models.CharField(
        'número (dNumDoc)', max_length=7, null=True, blank=True,
        help_text='Siete dígitos con ceros a la izquierda. Vacío si hubo error.',
    )
    numero_completo = models.CharField(
        'número completo', max_length=20, blank=True,
        help_text='Establecimiento-punto-número, ej. 001-003-0000100.',
    )
    cdc = models.CharField('CDC', max_length=44, blank=True)
    estado = models.CharField(
        'estado', max_length=10, choices=ESTADOS, default=ESTADO_VERIFICAR,
        db_index=True,
    )
    # Resumen de los eventos posteriores a la emisión. El detalle completo
    # queda en ``EventoSIFEN``; estos campos se desnormalizan para que el
    # listado y la pantalla de facturas no tengan que recorrer los eventos.
    estado_cancelacion = models.CharField(
        'estado de cancelación', max_length=10, choices=ESTADOS_EVENTO,
        blank=True, default='', db_index=True,
    )
    estado_inutilizacion = models.CharField(
        'estado de inutilización', max_length=10, choices=ESTADOS_EVENTO,
        blank=True, default='', db_index=True,
    )
    cancelacion_solicitada = models.DateTimeField(
        'cancelación: solicitada', null=True, blank=True)
    cancelacion_consultada = models.DateTimeField(
        'cancelación: consultada', null=True, blank=True)
    cancelacion_detalle = models.CharField(
        'cancelación: detalle', max_length=500, blank=True)
    inutilizacion_solicitada = models.DateTimeField(
        'inutilización: solicitada', null=True, blank=True)
    inutilizacion_consultada = models.DateTimeField(
        'inutilización: consultada', null=True, blank=True)
    inutilizacion_detalle = models.CharField(
        'inutilización: detalle', max_length=500, blank=True)
    cancelada_por_sub = models.CharField(
        'cancelada por (sub)', max_length=160, blank=True)
    cancelada_por_nombre = models.CharField(
        'cancelada por', max_length=160, blank=True)
    inutilizada_por_sub = models.CharField(
        'inutilizada por (sub)', max_length=160, blank=True)
    inutilizada_por_nombre = models.CharField(
        'inutilizada por', max_length=160, blank=True)
    total = models.DecimalField(
        'total facturado (PYG)', max_digits=18, decimal_places=0, default=0)
    email_destino = models.EmailField('correo del cliente', max_length=160)
    detalle = models.CharField(
        'detalle', max_length=500, blank=True,
        help_text='Descripción del error o del estado devuelto por SIFEN.',
    )
    respuesta_servicio = models.JSONField(
        'respuesta del servicio', default=dict, blank=True,
        help_text='Última respuesta completa de Factura Segura.',
    )
    de_enviado = models.JSONField(
        'DE enviado', default=dict, blank=True,
        help_text='JSON del documento electrónico enviado a generar_de.',
    )
    # Registro del envío al correo del cliente. Factura Segura envía el
    # XML y el KuDE a dEmailRec cuando SIFEN aprueba; acá se registra.
    envio_fecha = models.DateTimeField('envío: fecha', null=True, blank=True)
    envio_destinatario = models.EmailField(
        'envío: destinatario', max_length=160, blank=True)
    envio_resultado = models.CharField(
        'envío: resultado', max_length=255, blank=True)

    emitida_por_sub = models.CharField('emitida por (sub)', max_length=160, blank=True)
    emitida_por_nombre = models.CharField('emitida por', max_length=160, blank=True)
    creada = models.DateTimeField('creada', auto_now_add=True)
    actualizada = models.DateTimeField('actualizada', auto_now=True)
    estado_consultado = models.DateTimeField(
        'último estado consultado', null=True, blank=True)

    class Meta:
        ordering = ['-creada']
        verbose_name = 'factura electrónica'
        verbose_name_plural = 'facturas electrónicas'
        constraints = [
            # Una operación no puede tener dos facturas activas (ni dos
            # aprobadas) en el mismo modo.
            models.UniqueConstraint(
                fields=['operacion', 'simulada'],
                condition=Q(estado__in=('VERIFICAR', 'EMITIDA', 'APROBADA')),
                name='una_factura_activa_por_operacion',
            ),
            # Un número del rango se usa una sola vez por modo.
            models.UniqueConstraint(
                fields=['numero', 'simulada'],
                condition=Q(numero__isnull=False),
                name='numero_factura_unico',
            ),
        ]

    def __str__(self) -> str:
        return self.numero_completo or f'sin número (op {self.operacion_id})'


class EventoSIFEN(models.Model):
    """Solicitud de cancelación o inutilización de un DE.

    Guarda la respuesta de la solicitud y la de la consulta posterior, para
    que el historial no dependa del último ``respuesta_servicio`` de la
    factura. La factura conserva además un resumen (``estado_cancelacion`` /
    ``estado_inutilizacion``) para las consultas rápidas del listado.
    """

    TIPO_CANCELACION = 'CANCELACION'
    TIPO_INUTILIZACION = 'INUTILIZACION'
    TIPOS = (
        (TIPO_CANCELACION, 'Cancelación'),
        (TIPO_INUTILIZACION, 'Inutilización'),
    )
    ESTADO_PENDIENTE = EVENTO_PENDIENTE
    ESTADO_APROBADA = EVENTO_APROBADA
    ESTADO_RECHAZADA = EVENTO_RECHAZADA
    ESTADO_ERROR = EVENTO_ERROR
    ESTADOS = ESTADOS_EVENTO
    ESTADOS_ACTIVOS = (EVENTO_PENDIENTE, EVENTO_APROBADA)

    factura = models.ForeignKey(
        FacturaElectronica, on_delete=models.PROTECT,
        related_name='eventos', verbose_name='factura',
    )
    tipo = models.CharField('tipo', max_length=14, choices=TIPOS, db_index=True)
    estado = models.CharField(
        'estado', max_length=10, choices=ESTADOS,
        default=ESTADO_PENDIENTE, db_index=True,
    )
    cdc_evento = models.CharField(
        'CDC del evento', max_length=44, blank=True,
        help_text='CDC devuelto por sol_inutilizacion o el CDC conocido del DE.',
    )
    motivo = models.CharField(
        'motivo interno', max_length=255, blank=True,
        help_text='Motivo cargado por el operador; SIFEN no lo recibe.',
    )
    solicitado_por_sub = models.CharField(
        'solicitado por (sub)', max_length=160, blank=True)
    solicitado_por_nombre = models.CharField(
        'solicitado por', max_length=160, blank=True)
    solicitado = models.DateTimeField('solicitado', auto_now_add=True)
    consultado = models.DateTimeField(
        'consultado', null=True, blank=True)
    detalle = models.CharField('detalle', max_length=500, blank=True)
    respuesta_solicitud = models.JSONField(
        'respuesta de la solicitud', default=dict, blank=True)
    respuesta_consulta = models.JSONField(
        'respuesta de la consulta', default=dict, blank=True)

    class Meta:
        ordering = ['-solicitado', '-id']
        verbose_name = 'evento SIFEN'
        verbose_name_plural = 'eventos SIFEN'
        constraints = [
            models.UniqueConstraint(
                fields=['factura'],
                condition=Q(tipo='CANCELACION',
                            estado__in=('PENDIENTE', 'APROBADA')),
                name='una_cancelacion_activa',
            ),
            models.UniqueConstraint(
                fields=['factura'],
                condition=Q(tipo='INUTILIZACION',
                            estado__in=('PENDIENTE', 'APROBADA')),
                name='una_inutilizacion_activa',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.get_tipo_display()} {self.factura_id}: {self.estado}'


class NotaCreditoElectronica(models.Model):
    """Nota de crédito electrónica (iTiDE=5) asociada a una factura.

    En el MVP es siempre una nota total: replica los ítems, la tasa de IVA y
    el total de la factura original. El número se toma de un rango propio
    (``FACTURASEGURA_NC_NUMERO_DESDE/HASTA``) y no consume el de facturas.
    """

    ESTADO_ERROR = 'ERROR'
    ESTADO_VERIFICAR = 'VERIFICAR'
    ESTADO_EMITIDA = 'EMITIDA'
    ESTADO_APROBADA = 'APROBADA'
    ESTADO_RECHAZADA = 'RECHAZADA'
    ESTADOS = (
        (ESTADO_ERROR, 'Error (no generada)'),
        (ESTADO_VERIFICAR, 'Pendiente de verificar'),
        (ESTADO_EMITIDA, 'Emitida'),
        (ESTADO_APROBADA, 'Aprobada'),
        (ESTADO_RECHAZADA, 'Rechazada'),
    )
    ESTADOS_ACTIVOS = (ESTADO_VERIFICAR, ESTADO_EMITIDA, ESTADO_APROBADA)
    ESTADOS_CON_NUMERO = (
        ESTADO_VERIFICAR, ESTADO_EMITIDA, ESTADO_APROBADA, ESTADO_RECHAZADA)

    factura = models.ForeignKey(
        FacturaElectronica, on_delete=models.PROTECT,
        related_name='notas_credito', verbose_name='factura',
    )
    simulada = models.BooleanField(
        'simulada', default=False,
        help_text='Emitida en modo simulado: no pasó por Factura Segura.',
    )
    numero = models.CharField(
        'número (dNumDoc)', max_length=7, null=True, blank=True,
        help_text='Siete dígitos con ceros a la izquierda. Vacío si hubo error.',
    )
    numero_completo = models.CharField(
        'número completo', max_length=20, blank=True,
        help_text='Establecimiento-punto-número, ej. 001-003-0000013.',
    )
    cdc = models.CharField('CDC', max_length=44, blank=True)
    estado = models.CharField(
        'estado', max_length=10, choices=ESTADOS,
        default=ESTADO_VERIFICAR, db_index=True,
    )
    total = models.DecimalField(
        'total acreditado (PYG)', max_digits=18, decimal_places=0, default=0)
    motivo = models.CharField(
        'motivo de emisión (iMotEmi)', max_length=2,
        choices=MOTIVOS_NC, default='5',
    )
    email_destino = models.EmailField('correo del cliente', max_length=160)
    detalle = models.CharField(
        'detalle', max_length=500, blank=True,
        help_text='Descripción del error o del estado devuelto por SIFEN.',
    )
    respuesta_servicio = models.JSONField(
        'respuesta del servicio', default=dict, blank=True)
    de_enviado = models.JSONField(
        'DE enviado', default=dict, blank=True,
        help_text='JSON del documento electrónico enviado a generar_de.',
    )
    envio_fecha = models.DateTimeField('envío: fecha', null=True, blank=True)
    envio_destinatario = models.EmailField(
        'envío: destinatario', max_length=160, blank=True)
    envio_resultado = models.CharField(
        'envío: resultado', max_length=255, blank=True)
    emitida_por_sub = models.CharField(
        'emitida por (sub)', max_length=160, blank=True)
    emitida_por_nombre = models.CharField(
        'emitida por', max_length=160, blank=True)
    creada = models.DateTimeField('creada', auto_now_add=True)
    actualizada = models.DateTimeField('actualizada', auto_now=True)
    estado_consultado = models.DateTimeField(
        'último estado consultado', null=True, blank=True)

    class Meta:
        ordering = ['-creada']
        verbose_name = 'nota de crédito electrónica'
        verbose_name_plural = 'notas de crédito electrónicas'
        constraints = [
            # Una factura no puede tener dos NC activas en el mismo modo.
            models.UniqueConstraint(
                fields=['factura'],
                condition=Q(estado__in=('VERIFICAR', 'EMITIDA', 'APROBADA')),
                name='una_nc_activa_por_factura',
            ),
            # Un número del rango de NC se usa una sola vez por modo.
            models.UniqueConstraint(
                fields=['numero', 'simulada'],
                condition=Q(numero__isnull=False),
                name='numero_nc_unico',
            ),
        ]

    def __str__(self) -> str:
        return self.numero_completo or f'sin número (factura {self.factura_id})'
