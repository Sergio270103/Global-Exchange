"""
Modelos del módulo de monedas.

Define la entidad :class:`Moneda`, que representa una divisa admitida por
la plataforma Global Exchange. Las tasas de cambio viven en su propio
módulo y apuntan a este modelo mediante una clave foránea.
"""

from django.core.validators import MaxValueValidator, RegexValidator
from django.db import models


class Moneda(models.Model):
    """Divisa admitida por la plataforma.

    La baja de una moneda es siempre lógica (``activo = False``): una
    moneda dada de baja deja de ofrecerse a los clientes pero sigue
    disponible para el histórico de tasas y transacciones.
    """

    codigo = models.CharField(
        'código ISO 4217',
        max_length=3,
        unique=True,
        validators=[
            RegexValidator(
                r'^[A-Za-z]{3}$',
                'El código debe tener exactamente 3 letras (ISO 4217). Ej.: USD.',
            )
        ],
        help_text='Código de 3 letras, por ejemplo USD, EUR o PYG.',
    )
    nombre = models.CharField(
        'nombre',
        max_length=80,
        help_text='Nombre descriptivo. Ej.: Dólar Americano.',
    )
    simbolo = models.CharField(
        'símbolo',
        max_length=8,
        blank=True,
        help_text='Símbolo usado al mostrar montos. Ej.: $, €, Gs.',
    )
    decimales = models.PositiveSmallIntegerField(
        'decimales',
        default=2,
        validators=[MaxValueValidator(8)],
        help_text='Cantidad de decimales con la que se muestran los montos. '
                  'El guaraní usa 0, la mayoría de las divisas usa 2.',
    )
    pais_iso = models.CharField(
        'código de país ISO 3166-1',
        max_length=2,
        blank=True,
        help_text='Código de 2 letras usado para mostrar la bandera. Ej.: US, PY.',
    )
    activo = models.BooleanField(
        'activa',
        default=True,
        help_text='Si está desactivada, la moneda no se ofrece a los clientes.',
    )
    creado_en = models.DateTimeField('creado en', auto_now_add=True)
    actualizado_en = models.DateTimeField('actualizado en', auto_now=True)

    class Meta:
        ordering = ['codigo']
        verbose_name = 'moneda'
        verbose_name_plural = 'monedas'

    def __str__(self) -> str:
        return f'{self.codigo} - {self.nombre}'

    def save(self, *args, **kwargs):
        """Normaliza los códigos a mayúsculas antes de guardar."""
        self.codigo = self.codigo.strip().upper()
        self.pais_iso = self.pais_iso.strip().upper()
        return super().save(*args, **kwargs)