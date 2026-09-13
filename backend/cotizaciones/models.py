"""Modelos del módulo de cotizaciones (Hito 4: CRUD de Cotizaciones).

Cada modificación de tasa crea un registro nuevo (historial inmutable);
la tasa vigente de una moneda es el registro más reciente. Esto permite:
- RF31: mostrar las tasas vigentes del día.
- RF32/RF33: evolución histórica con gráficos y consulta por rango.
- RF41/RF47: registro manual por administrador o analista cambiario.
"""

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


class Cotizacion(models.Model):
    """Tasa de cambio compra/venta de una moneda frente al PYG."""

    moneda = models.ForeignKey(
        'monedas.Moneda', on_delete=models.PROTECT,
        related_name='cotizaciones', verbose_name='moneda',
    )
    compra = models.DecimalField(
        'precio de compra', max_digits=14, decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text='Guaraníes que la casa paga por 1 unidad.',
    )
    venta = models.DecimalField(
        'precio de venta', max_digits=14, decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text='Guaraníes que el cliente paga por 1 unidad.',
    )
    vigente_desde = models.DateTimeField(
        'vigente desde', auto_now_add=True,
        help_text='Marca temporal de la cotización (RNF25).',
    )
    creado_por = models.CharField(
        'creado por', max_length=160, blank=True,
        help_text='Usuario de Keycloak que registró la tasa (trazabilidad, RNF26).',
    )

    class Meta:
        ordering = ['-vigente_desde']
        verbose_name = 'cotización'
        verbose_name_plural = 'cotizaciones'

    def __str__(self) -> str:
        return f'{self.moneda.codigo} C:{self.compra} V:{self.venta}'

    def clean(self):
        if self.compra is not None and self.venta is not None and self.venta < self.compra:
            raise ValidationError('La venta no puede ser menor que la compra.')
