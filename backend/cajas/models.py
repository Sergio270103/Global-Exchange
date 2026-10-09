"""Modelos del módulo de control de cajas (PI-44, ERS RF56/RF58).

- ``Caja``: ventanilla de una sucursal donde hay efectivo físico.
- ``Denominacion``: catálogo de billetes por moneda (USD 100, PYG 50.000...).
- ``SaldoBillete``: cantidad de billetes de una denominación en una caja.
  Es el inventario que consulta el cajero (RF56). Solo lo modifica el
  servicio ``registrar_movimiento`` (ver ``servicios.py``).
- ``MovimientoCaja`` + ``DetalleMovimiento``: cada ingreso, entrega o
  retiro de billetes, con quién lo hizo y el saldo que dejó (RF58).
  Son inmutables: no hay endpoint para editarlos ni borrarlos (RNF6).
- ``ArqueoCaja`` + ``DetalleArqueo``: foto del estado de la caja al
  cerrar turno o hacer un arqueo, comparando lo que dice el sistema
  con lo contado físicamente (auditoría de PI-44).
"""

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


class Caja(models.Model):
    """Ventanilla de una sucursal que maneja efectivo."""

    nombre = models.CharField('nombre', max_length=60)
    sucursal = models.CharField('sucursal', max_length=80)
    activa = models.BooleanField('activa', default=True)
    creado_en = models.DateTimeField('creado en', auto_now_add=True)

    class Meta:
        ordering = ['sucursal', 'nombre']
        verbose_name = 'caja'
        verbose_name_plural = 'cajas'
        constraints = [
            models.UniqueConstraint(
                fields=['sucursal', 'nombre'], name='uniq_caja_sucursal_nombre',
            )
        ]

    def __str__(self) -> str:
        return f'{self.sucursal} · {self.nombre}'


class Denominacion(models.Model):
    """Billete de una moneda (por ejemplo USD 100 o PYG 50.000)."""

    moneda = models.ForeignKey(
        'monedas.Moneda', on_delete=models.PROTECT,
        related_name='denominaciones', verbose_name='moneda',
    )
    valor = models.DecimalField(
        'valor', max_digits=18, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    activa = models.BooleanField('activa', default=True)

    class Meta:
        ordering = ['moneda__codigo', '-valor']
        verbose_name = 'denominación'
        verbose_name_plural = 'denominaciones'
        constraints = [
            models.UniqueConstraint(
                fields=['moneda', 'valor'], name='uniq_denominacion_moneda_valor',
            )
        ]

    def __str__(self) -> str:
        return f'{self.moneda.codigo} {self.valor.normalize():f}'


class SaldoBillete(models.Model):
    """Cantidad de billetes de una denominación disponibles en una caja."""

    caja = models.ForeignKey(
        Caja, on_delete=models.CASCADE,
        related_name='saldos', verbose_name='caja',
    )
    denominacion = models.ForeignKey(
        Denominacion, on_delete=models.PROTECT,
        related_name='saldos', verbose_name='denominación',
    )
    cantidad = models.PositiveIntegerField('cantidad de billetes', default=0)
    actualizado_en = models.DateTimeField('actualizado en', auto_now=True)

    class Meta:
        ordering = ['denominacion__moneda__codigo', '-denominacion__valor']
        verbose_name = 'saldo de billetes'
        verbose_name_plural = 'saldos de billetes'
        constraints = [
            models.UniqueConstraint(
                fields=['caja', 'denominacion'], name='uniq_saldo_caja_denominacion',
            )
        ]

    @property
    def subtotal(self):
        return self.denominacion.valor * self.cantidad

    def __str__(self) -> str:
        return f'{self.caja}: {self.cantidad} x {self.denominacion}'


class MovimientoCaja(models.Model):
    """Ingreso, entrega o retiro de billetes de una caja (RF58)."""

    TIPO_INGRESO = 'INGRESO'
    TIPO_ENTREGA = 'ENTREGA'
    TIPO_RETIRO = 'RETIRO'
    TIPOS = (
        (TIPO_INGRESO, 'Ingreso'),
        (TIPO_ENTREGA, 'Entrega'),
        (TIPO_RETIRO, 'Retiro'),
    )
    #: Tipos que suman billetes a la caja; el resto los descuenta.
    TIPOS_SUMAN = (TIPO_INGRESO, TIPO_ENTREGA)

    caja = models.ForeignKey(
        Caja, on_delete=models.PROTECT,
        related_name='movimientos', verbose_name='caja',
    )
    tipo = models.CharField('tipo', max_length=8, choices=TIPOS)
    moneda = models.ForeignKey(
        'monedas.Moneda', on_delete=models.PROTECT,
        related_name='movimientos_caja', verbose_name='moneda',
    )
    total = models.DecimalField('total', max_digits=18, decimal_places=2)
    usuario_keycloak_id = models.CharField('usuario (sub)', max_length=64)
    usuario_nombre = models.CharField('usuario', max_length=160, blank=True)
    observacion = models.CharField('observación', max_length=255, blank=True)
    creado_en = models.DateTimeField('fecha y hora', auto_now_add=True)

    class Meta:
        ordering = ['-creado_en', '-id']
        verbose_name = 'movimiento de caja'
        verbose_name_plural = 'movimientos de caja'

    @property
    def suma(self) -> bool:
        return self.tipo in self.TIPOS_SUMAN

    def __str__(self) -> str:
        signo = '+' if self.suma else '-'
        return f'{self.get_tipo_display()} {signo}{self.total} {self.moneda.codigo} ({self.caja})'


class DetalleMovimiento(models.Model):
    """Billetes de una denominación dentro de un movimiento."""

    movimiento = models.ForeignKey(
        MovimientoCaja, on_delete=models.CASCADE,
        related_name='detalle', verbose_name='movimiento',
    )
    denominacion = models.ForeignKey(
        Denominacion, on_delete=models.PROTECT,
        related_name='detalles_movimiento', verbose_name='denominación',
    )
    cantidad = models.PositiveIntegerField(
        'cantidad de billetes', validators=[MinValueValidator(1)],
    )
    saldo_resultante = models.PositiveIntegerField(
        'billetes en caja después del movimiento',
    )

    class Meta:
        ordering = ['-denominacion__valor']
        verbose_name = 'detalle de movimiento'
        verbose_name_plural = 'detalles de movimiento'

    def __str__(self) -> str:
        return f'{self.cantidad} x {self.denominacion}'


class ArqueoCaja(models.Model):
    """Registro de auditoría del estado de la caja (cierre de turno / arqueo)."""

    caja = models.ForeignKey(
        Caja, on_delete=models.PROTECT,
        related_name='arqueos', verbose_name='caja',
    )
    usuario_keycloak_id = models.CharField('usuario (sub)', max_length=64)
    usuario_nombre = models.CharField('usuario', max_length=160, blank=True)
    observacion = models.CharField('observación', max_length=255, blank=True)
    con_diferencias = models.BooleanField(
        'con diferencias', default=False,
        help_text='Lo contado físicamente no coincide con el sistema.',
    )
    creado_en = models.DateTimeField('fecha y hora', auto_now_add=True)

    class Meta:
        ordering = ['-creado_en', '-id']
        verbose_name = 'arqueo de caja'
        verbose_name_plural = 'arqueos de caja'

    def __str__(self) -> str:
        return f'Arqueo {self.caja} {self.creado_en:%d/%m/%Y %H:%M}'


class DetalleArqueo(models.Model):
    """Cantidad según sistema vs. contada para una denominación."""

    arqueo = models.ForeignKey(
        ArqueoCaja, on_delete=models.CASCADE,
        related_name='detalle', verbose_name='arqueo',
    )
    denominacion = models.ForeignKey(
        Denominacion, on_delete=models.PROTECT,
        related_name='detalles_arqueo', verbose_name='denominación',
    )
    cantidad_sistema = models.PositiveIntegerField('según sistema')
    cantidad_contada = models.PositiveIntegerField('contada')

    class Meta:
        ordering = ['denominacion__moneda__codigo', '-denominacion__valor']
        verbose_name = 'detalle de arqueo'
        verbose_name_plural = 'detalles de arqueo'

    @property
    def diferencia(self) -> int:
        return self.cantidad_contada - self.cantidad_sistema

    def __str__(self) -> str:
        return f'{self.denominacion}: sistema {self.cantidad_sistema}, contado {self.cantidad_contada}'
