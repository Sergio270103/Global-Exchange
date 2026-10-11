"""Modelos del módulo de alertas de tasas (PI-38, RF45/RNF27).

El usuario configura un par de divisas y un umbral; cuando una nueva
cotización alcanza el valor parametrizado, la alerta se dispara una
sola vez (estado ``ejecutada``) y queda registrada en el historial
(``DisparoAlerta``) para evitar notificaciones duplicadas.
"""

from django.core.validators import MinValueValidator
from django.db import models


class AlertaTasa(models.Model):
    """Alerta de tipo de cambio configurada por un usuario registrado."""

    DIRECCION_SUPERA = 'supera'
    DIRECCION_BAJA = 'baja'
    DIRECCIONES = [
        (DIRECCION_SUPERA, 'La tasa alcanza o supera el umbral'),
        (DIRECCION_BAJA, 'La tasa baja hasta el umbral o menos'),
    ]

    ESTADO_ACTIVA = 'activa'
    ESTADO_PAUSADA = 'pausada'
    ESTADO_EJECUTADA = 'ejecutada'
    ESTADOS = [
        (ESTADO_ACTIVA, 'activa'),
        (ESTADO_PAUSADA, 'pausada'),
        (ESTADO_EJECUTADA, 'ejecutada'),
    ]

    usuario_sub = models.CharField(
        'sub de Keycloak', max_length=160, db_index=True,
        help_text='Identificador del usuario dueño de la alerta.',
    )
    usuario_email = models.EmailField(
        'correo del usuario', blank=True,
        help_text='Destino del aviso (RF45).',
    )
    moneda = models.ForeignKey(
        'monedas.Moneda', on_delete=models.PROTECT,
        related_name='alertas', verbose_name='moneda',
    )
    umbral = models.DecimalField(
        'umbral objetivo', max_digits=14, decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text='Valor objetivo de la tasa de cambio.',
    )
    direccion = models.CharField(
        'dirección', max_length=10, choices=DIRECCIONES,
        default=DIRECCION_SUPERA,
        help_text='supera: compara la venta; baja: compara la compra.',
    )
    estado = models.CharField(
        'estado', max_length=10, choices=ESTADOS,
        default=ESTADO_ACTIVA,
    )
    creado = models.DateTimeField('creado', auto_now_add=True)
    actualizado = models.DateTimeField('actualizado', auto_now=True)

    class Meta:
        ordering = ['-creado']
        verbose_name = 'alerta de tasa'
        verbose_name_plural = 'alertas de tasas'

    def __str__(self) -> str:
        return f'{self.moneda.codigo} {self.direccion} {self.umbral} ({self.estado})'


class DisparoAlerta(models.Model):
    """Historial de alertas enviadas (una fila por disparo)."""

    alerta = models.ForeignKey(
        AlertaTasa, on_delete=models.CASCADE,
        related_name='disparos', verbose_name='alerta',
    )
    tasa_alcanzada = models.DecimalField(
        'tasa alcanzada', max_digits=14, decimal_places=2,
    )
    umbral = models.DecimalField(
        'umbral al disparar', max_digits=14, decimal_places=2,
        help_text='Foto del umbral configurado en ese momento.',
    )
    direccion = models.CharField('dirección', max_length=10)
    creado = models.DateTimeField('disparado el', auto_now_add=True)

    class Meta:
        ordering = ['-creado']
        verbose_name = 'disparo de alerta'
        verbose_name_plural = 'historial de alertas'

    def __str__(self) -> str:
        return f'{self.alerta} -> {self.tasa_alcanzada}'
