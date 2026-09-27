"""Modelos del módulo de billeteras (PI-66, Hito 5 Sprint 3).

- ``Billetera``: saldo multidivisa por cliente (ERS RF15/RF17). Nace en
  cero de forma perezosa (``get_or_create`` al consultar).
- ``MedioAcreditacion``: CRUD del medio de acreditación de fondos del
  cliente (guía Hito 5): qué billetera o cuenta bancaria recibe los
  fondos por defecto. Solo vinculación: el movimiento real de fondos
  ocurre al confirmar operaciones (fuera de PI-66).
"""

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


class Billetera(models.Model):
    """Saldo de un cliente en una moneda."""

    cliente = models.ForeignKey(
        'clientes.Cliente', on_delete=models.CASCADE,
        related_name='billeteras', verbose_name='cliente',
    )
    moneda = models.ForeignKey(
        'monedas.Moneda', on_delete=models.PROTECT,
        related_name='billeteras', verbose_name='moneda',
    )
    saldo = models.DecimalField(
        'saldo', max_digits=18, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
        help_text='Nace en cero; se mueve al confirmar operaciones.',
    )
    actualizado_en = models.DateTimeField('actualizado en', auto_now=True)

    class Meta:
        ordering = ['moneda__codigo']
        verbose_name = 'billetera'
        verbose_name_plural = 'billeteras'
        constraints = [
            models.UniqueConstraint(
                fields=['cliente', 'moneda'],
                name='uniq_billetera_cliente_moneda',
            )
        ]

    def __str__(self) -> str:
        return f'{self.cliente.nombre} · {self.moneda.codigo}: {self.saldo}'


class MedioAcreditacion(models.Model):
    """Medio donde el cliente recibe los fondos (billetera o cuenta)."""

    TIPO_BILLETERA = 'BILLETERA'
    TIPO_CUENTA = 'CUENTA'
    TIPOS = (
        (TIPO_BILLETERA, 'Billetera digital'),
        (TIPO_CUENTA, 'Cuenta bancaria'),
    )

    cliente = models.ForeignKey(
        'clientes.Cliente', on_delete=models.CASCADE,
        related_name='medios_acreditacion', verbose_name='cliente',
    )
    tipo = models.CharField('tipo', max_length=10, choices=TIPOS)
    billetera = models.ForeignKey(
        Billetera, on_delete=models.CASCADE,
        null=True, blank=True, related_name='medios',
        verbose_name='billetera',
    )
    cuenta = models.ForeignKey(
        'pagos.CuentaBancaria', on_delete=models.CASCADE,
        null=True, blank=True, related_name='medios',
        verbose_name='cuenta bancaria',
    )
    es_default = models.BooleanField(
        'medio por defecto', default=False,
        help_text='Se preselecciona al operar.',
    )
    creado_en = models.DateTimeField('creado en', auto_now_add=True)

    class Meta:
        ordering = ['-es_default', 'id']
        verbose_name = 'medio de acreditación'
        verbose_name_plural = 'medios de acreditación'

    def __str__(self) -> str:
        destino = self.billetera or self.cuenta
        marca = ' (defecto)' if self.es_default else ''
        return f'{self.cliente.nombre} -> {destino}{marca}'

    def clean(self):
        if self.tipo == self.TIPO_BILLETERA and not self.billetera_id:
            raise ValidationError('Indicá la billetera de destino.')
        if self.tipo == self.TIPO_CUENTA and not self.cuenta_id:
            raise ValidationError('Indicá la cuenta bancaria de destino.')
        if self.billetera_id and self.billetera.cliente_id != self.cliente_id:
            raise ValidationError('La billetera no pertenece al cliente.')
        cuenta = self.cuenta
        if self.cuenta_id and cuenta.cliente_id != self.cliente_id:
            raise ValidationError('La cuenta no pertenece al cliente.')


class Movimiento(models.Model):
    """Asiento de auditoría por cada acreditación o débito (RNF6).

    Se crea en el mismo bloque atómico que confirma la operación, así
    que nunca existe uno sin su PAGADA ni viceversa.
    """

    TIPO_CREDITO = 'CREDITO'
    TIPO_DEBITO = 'DEBITO'
    TIPOS = (
        (TIPO_CREDITO, 'Crédito'),
        (TIPO_DEBITO, 'Débito'),
    )

    billetera = models.ForeignKey(
        Billetera, on_delete=models.CASCADE,
        related_name='movimientos', verbose_name='billetera',
    )
    operacion = models.ForeignKey(
        'operaciones.Operacion', on_delete=models.CASCADE,
        related_name='movimientos', verbose_name='operación',
    )
    tipo = models.CharField(
        'tipo', max_length=8, choices=TIPOS, default=TIPO_CREDITO,
    )
    monto = models.DecimalField(
        'monto del movimiento', max_digits=18, decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    saldo_resultante = models.DecimalField(
        'saldo resultante', max_digits=18, decimal_places=2,
    )
    creado_en = models.DateTimeField('creado en', auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']
        verbose_name = 'movimiento'
        verbose_name_plural = 'movimientos'

    def __str__(self) -> str:
        signo = '+' if self.tipo == self.TIPO_CREDITO else '-'
        return f'{signo}{self.monto} -> {self.billetera} (op {self.operacion_id})'
