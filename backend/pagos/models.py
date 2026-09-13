"""Modelos del módulo de pagos (Hito 4: CRUD de medios de pago).

- ``MetodoPago``: catálogo global que el admin habilita/deshabilita
  (RF42: transferencias, billeteras digitales, etc.).
- ``CuentaBancaria``: cuenta externa vinculada por el cliente con los
  datos mínimos de RF16 (Nombre, Apellido, Nº Cédula, Entidad bancaria,
  Nº de cuenta y Código Bancario) para pagar vía RF26.
"""

from django.db import models


class MetodoPago(models.Model):
    """Medio de pago admitido por la plataforma."""

    codigo = models.CharField(
        'código', max_length=24, unique=True,
        help_text='Identificador estable. Ej.: transfer, wallet, card, qr.',
    )
    nombre = models.CharField('nombre', max_length=80)
    activo = models.BooleanField(
        'activo', default=True,
        help_text='Si está desactivado no se ofrece a los clientes.',
    )
    creado_en = models.DateTimeField('creado en', auto_now_add=True)
    actualizado_en = models.DateTimeField('actualizado en', auto_now=True)

    class Meta:
        ordering = ['codigo']
        verbose_name = 'método de pago'
        verbose_name_plural = 'métodos de pago'

    def __str__(self) -> str:
        return f'{self.codigo} - {self.nombre}'

    def save(self, *args, **kwargs):
        self.codigo = self.codigo.strip().lower()
        return super().save(*args, **kwargs)


class CuentaBancaria(models.Model):
    """Cuenta bancaria externa vinculada a un cliente."""

    cliente = models.ForeignKey(
        'clientes.Cliente', on_delete=models.CASCADE,
        related_name='cuentas', verbose_name='cliente',
    )
    nombre = models.CharField('nombre', max_length=80)
    apellido = models.CharField('apellido', max_length=80)
    cedula = models.CharField('nº cédula', max_length=32)
    banco = models.CharField('entidad bancaria', max_length=120)
    numero_cuenta = models.CharField('nº de cuenta bancaria', max_length=64)
    codigo_bancario = models.CharField('código bancario', max_length=32)
    moneda = models.ForeignKey(
        'monedas.Moneda', on_delete=models.PROTECT,
        related_name='cuentas', verbose_name='moneda',
    )
    activa = models.BooleanField('activa', default=True)
    creado_en = models.DateTimeField('creado en', auto_now_add=True)
    actualizado_en = models.DateTimeField('actualizado en', auto_now=True)

    class Meta:
        ordering = ['banco', 'numero_cuenta']
        verbose_name = 'cuenta bancaria'
        verbose_name_plural = 'cuentas bancarias'

    def __str__(self) -> str:
        ultimos = self.numero_cuenta[-4:] if len(self.numero_cuenta) >= 4 else self.numero_cuenta
        return f'{self.banco} •••• {ultimos} ({self.cliente.nombre})'
