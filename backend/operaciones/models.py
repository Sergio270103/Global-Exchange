"""Modelos del módulo de operaciones (Hito Operaciones: compra/venta).

Registra cada compra/venta de divisas con trazabilidad completa:
cliente, usuario Keycloak, par origen/destino, montos, tasas aplicadas,
comisión (guardada en moneda destino) y método de pago informativo.

Conversión siempre vía PYG como pivote (las cotizaciones son vs PYG):
- PYG -> DIV: bruto = monto_origen_pyg / tasa_venta_destino
- DIV -> PYG: bruto = monto_origen_div * tasa_compra_origen
- DIV -> DIV: pyg = monto_origen * tasa_compra_origen;
  bruto = pyg / tasa_venta_destino

Comisión (pct según categoría del cliente):
- COMPRA (el cliente compra destino): paga bruto + comisión en origen;
  recibe el bruto íntegro en destino. monto_comision se guarda convertida
  a moneda destino para un comprobante prolijo.
- VENTA (el cliente vende origen): recibe bruto - comisión en destino.

Ciclo de vida (PI-64, cancelación por cambio de cotización):
- PENDIENTE: el cliente inició la operación; se congela la cotización
  en ``fecha_cotizacion``.
  Permanece así hasta que se confirma el pago (RF27).
- PAGADA: se confirmó el pago. Si se confirma dentro de la ventana de
  tolerancia (``OPERACION_TOLERANCIA_SEGUNDOS``) se respeta la tasa
  congelada aunque haya cambiado; pasada la ventana, si la tasa cambió,
  se re-cotiza y se le muestra la nueva antes de continuar.
- CANCELADA: el cliente desistió antes de pagar (sin costo). Se guarda
  quién y cuándo.
- ANULADA: reservado para anular una operación ya pagada (fuera de PI-64).
"""

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class Operacion(models.Model):
    """Compra o venta de divisas."""

    TIPO_COMPRA = 'COMPRA'
    TIPO_VENTA = 'VENTA'
    TIPOS = (
        (TIPO_COMPRA, 'Compra'),
        (TIPO_VENTA, 'Venta'),
    )

    ESTADO_PENDIENTE = 'PENDIENTE'
    ESTADO_PAGADA = 'PAGADA'
    ESTADO_CANCELADA = 'CANCELADA'
    ESTADO_ANULADA = 'ANULADA'
    ESTADOS = (
        (ESTADO_PENDIENTE, 'Pendiente'),
        (ESTADO_PAGADA, 'Pagada'),
        (ESTADO_CANCELADA, 'Cancelada'),
        (ESTADO_ANULADA, 'Anulada'),
    )

    MOTIVO_COTIZACION = 'COTIZACION_CAMBIADA'
    MOTIVO_DESISTIO = 'DESISTIO'
    MOTIVOS_CANCELACION = (
        (MOTIVO_COTIZACION, 'No aceptó la nueva cotización'),
        (MOTIVO_DESISTIO, 'El cliente desistió'),
    )

    cliente = models.ForeignKey(
        'clientes.Cliente', on_delete=models.PROTECT,
        related_name='operaciones', verbose_name='cliente',
    )
    usuario_keycloak_id = models.CharField(
        'sub de Keycloak', max_length=64,
        help_text='Claim "sub" del access token que ejecutó la operación.',
    )
    tipo_operacion = models.CharField(
        'tipo de operación', max_length=6, choices=TIPOS,
    )
    moneda_origen = models.ForeignKey(
        'monedas.Moneda', on_delete=models.PROTECT,
        related_name='operaciones_origen', verbose_name='moneda origen',
    )
    moneda_destino = models.ForeignKey(
        'monedas.Moneda', on_delete=models.PROTECT,
        related_name='operaciones_destino', verbose_name='moneda destino',
    )
    monto_enviado = models.DecimalField(
        'monto enviado (origen)', max_digits=18, decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    monto_recibido = models.DecimalField(
        'monto recibido neto (destino)', max_digits=18, decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    cotizacion_aplicada = models.DecimalField(
        'tipo efectivo origen->destino', max_digits=18, decimal_places=6,
        help_text='Factor efectivo bruto (bruto_destino / monto_enviado_origen).',
    )
    tasa_origen = models.DecimalField(
        'tasa PYG de origen', max_digits=14, decimal_places=2,
        null=True, blank=True,
        help_text='Tasa compra si origen es divisa; 1 si es PYG.',
    )
    tasa_destino = models.DecimalField(
        'tasa PYG de destino', max_digits=14, decimal_places=2,
        null=True, blank=True,
        help_text='Tasa venta si destino es divisa; 1 si es PYG.',
    )
    porcentaje_comision_aplicado = models.DecimalField(
        'comisión aplicada (%)', max_digits=5, decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    monto_comision = models.DecimalField(
        'comisión en moneda destino', max_digits=18, decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text='Siempre expresada en moneda destino.',
    )
    metodo_pago = models.CharField(
        'método de pago', max_length=24, blank=True,
        help_text='Informativo: transfer, wallet, card, qr.',
    )
    fecha_creacion = models.DateTimeField('fecha de creación', auto_now_add=True)

    # --- PI-64: estado y cotización congelada ---
    estado = models.CharField(
        'estado', max_length=10, choices=ESTADOS, default=ESTADO_PENDIENTE,
        db_index=True,
    )
    fecha_cotizacion = models.DateTimeField(
        'cotización congelada en', default=timezone.now,
        help_text='Momento en que se fijaron las tasas; arranca la ventana de tolerancia.',
    )
    fecha_confirmacion = models.DateTimeField(
        'fecha de confirmación de pago', null=True, blank=True,
    )

    # --- PI-64: auditoría de cancelación ---
    fecha_cancelacion = models.DateTimeField(
        'fecha de cancelación', null=True, blank=True,
    )
    cancelada_por = models.CharField(
        'cancelada por (sub Keycloak)', max_length=64, blank=True,
    )
    cancelada_por_nombre = models.CharField(
        'cancelada por (usuario)', max_length=160, blank=True,
    )
    motivo_cancelacion = models.CharField(
        'motivo de cancelación', max_length=24, blank=True,
        choices=MOTIVOS_CANCELACION,
    )

    class Meta:
        ordering = ['-fecha_creacion']
        verbose_name = 'operación'
        verbose_name_plural = 'operaciones'

    def __str__(self) -> str:
        return (
            f'[{self.estado}] {self.tipo_operacion} {self.monto_enviado} '
            f'{self.moneda_origen_id} -> {self.monto_recibido} '
            f'{self.moneda_destino_id} ({self.cliente_id})'
        )