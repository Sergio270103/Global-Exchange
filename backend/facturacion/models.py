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
"""

from django.db import models
from django.db.models import Q


class FacturaElectronica(models.Model):
    """Factura electrónica emitida (o intentada) para una operación."""

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
    #: Estados que impiden emitir otra factura para la misma operación.
    ESTADOS_ACTIVOS = (ESTADO_VERIFICAR, ESTADO_EMITIDA, ESTADO_APROBADA)
    #: Estados que consumen un número del rango asignado.
    ESTADOS_CON_NUMERO = (
        ESTADO_VERIFICAR, ESTADO_EMITIDA, ESTADO_APROBADA, ESTADO_RECHAZADA)

    consume_emision = models.BooleanField(default=False)

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


class IntentoFactura(models.Model):
    factura = models.ForeignKey(FacturaElectronica, on_delete=models.PROTECT, related_name='intentos')
    accion = models.CharField(max_length=16)
    usuario_sub = models.CharField(max_length=160, blank=True)
    usuario_nombre = models.CharField(max_length=160, blank=True)
    fecha = models.DateTimeField(auto_now_add=True)
    email = models.EmailField(max_length=160, blank=True)
    resultado = models.CharField(max_length=500)

    class Meta:
        ordering = ['-fecha']
