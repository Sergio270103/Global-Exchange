"""Modelos del módulo de comprobantes internos (PI-42, RF63).

El comprobante interno NO es factura electrónica (eso es otro PI con
DNIT): es el recibo que el cajero entrega al cliente en ventanilla al
confirmar una operación en efectivo. Guarda una foto inmutable de la
operación y lleva un número único secuencial (``CPB-000123``).
"""

from django.db import models


class Comprobante(models.Model):
    """Recibo interno de una operación pagada."""

    ESTADO_EMITIDO = 'emitido'
    ESTADO_ANULADO = 'anulado'
    ESTADOS = [(ESTADO_EMITIDO, 'emitido'), (ESTADO_ANULADO, 'anulado')]

    numero = models.CharField(
        'número', max_length=20, unique=True, null=True, blank=True,
        help_text='Se genera solo como CPB-000123 a partir del id.',
    )
    operacion = models.OneToOneField(
        'operaciones.Operacion', on_delete=models.PROTECT,
        related_name='comprobante', verbose_name='operación',
        help_text='Una operación tiene como máximo un comprobante.',
    )
    # Foto inmutable de la operación al emitir.
    cliente_nombre = models.CharField('cliente', max_length=200)
    cliente_documento = models.CharField('documento', max_length=40, blank=True)
    tipo_operacion = models.CharField('tipo', max_length=10)
    moneda_origen_codigo = models.CharField('moneda origen', max_length=10)
    moneda_destino_codigo = models.CharField('moneda destino', max_length=10)
    monto_enviado = models.DecimalField('monto enviado', max_digits=18, decimal_places=2)
    monto_recibido = models.DecimalField('monto recibido', max_digits=18, decimal_places=2)
    tasa_origen = models.DecimalField(
        'tasa origen', max_digits=18, decimal_places=6, null=True, blank=True)
    tasa_destino = models.DecimalField(
        'tasa destino', max_digits=18, decimal_places=6, null=True, blank=True)
    monto_comision = models.DecimalField(
        'comisión', max_digits=18, decimal_places=2, null=True, blank=True)
    metodo_pago = models.CharField('método de pago', max_length=24, blank=True)
    fecha_operacion = models.DateTimeField('fecha de la operación')
    cajero_sub = models.CharField('sub del cajero', max_length=160, blank=True)
    cajero_nombre = models.CharField('cajero', max_length=160, blank=True)
    estado = models.CharField(
        'estado', max_length=10, choices=ESTADOS, default=ESTADO_EMITIDO)
    motivo_anulacion = models.CharField(
        'motivo de anulación', max_length=255, blank=True)
    anulado_por_sub = models.CharField(
        'anulado por (sub)', max_length=160, blank=True)
    anulado_por_nombre = models.CharField(
        'anulado por', max_length=160, blank=True)
    fecha_anulacion = models.DateTimeField(
        'fecha y hora de anulación', null=True, blank=True)
    creado = models.DateTimeField('emitido el', auto_now_add=True)

    class Meta:
        ordering = ['-creado']
        verbose_name = 'comprobante'
        verbose_name_plural = 'comprobantes'

    def __str__(self) -> str:
        return self.numero or f'sin número (op {self.operacion_id})'

    def save(self, *args, **kwargs):
        recien_creado = self.pk is None
        super().save(*args, **kwargs)
        if recien_creado and not self.numero:
            self.numero = f'CPB-{self.pk:06d}'
            super().save(update_fields=['numero'])
