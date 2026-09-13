"""Modelos del módulo de clientes (Hito 3 + Hito 4).

Cubre ERS RF7-RF12 y RF43:
- Cliente persona física o jurídica, con segmentación
  minorista / corporativo / VIP.
- Asociación de usuarios Keycloak a clientes (un usuario puede operar
  en nombre de varios clientes; el frontend guarda el cliente activo
  de la sesión — RF10/RF11).
- Comisión configurada por categoría de cliente (Hito 4: el simulador
  y las operaciones aplican este porcentaje).
"""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Cliente(models.Model):
    """Cliente de la casa de cambios (persona física o jurídica)."""

    TIPO_FISICA = 'FISICA'
    TIPO_JURIDICA = 'JURIDICA'
    TIPOS = (
        (TIPO_FISICA, 'Persona física'),
        (TIPO_JURIDICA, 'Persona jurídica'),
    )

    CAT_MINORISTA = 'MINORISTA'
    CAT_CORPORATIVO = 'CORPORATIVO'
    CAT_VIP = 'VIP'
    CATEGORIAS = (
        (CAT_MINORISTA, 'Minorista'),
        (CAT_CORPORATIVO, 'Corporativo'),
        (CAT_VIP, 'VIP'),
    )

    nombre = models.CharField('nombre / razón social', max_length=160)
    documento = models.CharField('documento / RUC', max_length=32, unique=True)
    email = models.EmailField('correo electrónico', max_length=160)
    tipo = models.CharField('tipo de cliente', max_length=10, choices=TIPOS, default=TIPO_FISICA)
    categoria = models.CharField('categoría', max_length=12, choices=CATEGORIAS, default=CAT_MINORISTA)
    activo = models.BooleanField('activo', default=True)
    creado_en = models.DateTimeField('creado en', auto_now_add=True)
    actualizado_en = models.DateTimeField('actualizado en', auto_now=True)

    class Meta:
        ordering = ['nombre']
        verbose_name = 'cliente'
        verbose_name_plural = 'clientes'

    def __str__(self) -> str:
        return f'{self.nombre} ({self.get_categoria_display()})'


class ClienteUsuario(models.Model):
    """Asociación usuario Keycloak <-> cliente (RF8/RF9/RF43).

    El usuario se identifica por su ``sub`` de Keycloak; un mismo usuario
    puede estar asociado a varios clientes y viceversa.
    """

    cliente = models.ForeignKey(
        Cliente, on_delete=models.CASCADE, related_name='asociaciones',
        verbose_name='cliente',
    )
    keycloak_id = models.CharField(
        'sub de Keycloak', max_length=64,
        help_text='Claim "sub" del access token del usuario.',
    )
    username = models.CharField('usuario', max_length=160, blank=True)
    email = models.EmailField('correo', blank=True)
    creado_en = models.DateTimeField('creado en', auto_now_add=True)

    class Meta:
        ordering = ['cliente__nombre', 'username']
        verbose_name = 'asociación usuario-cliente'
        verbose_name_plural = 'asociaciones usuario-cliente'
        constraints = [
            models.UniqueConstraint(
                fields=['cliente', 'keycloak_id'],
                name='uniq_cliente_usuario',
            )
        ]

    def __str__(self) -> str:
        return f'{self.username or self.keycloak_id} -> {self.cliente.nombre}'


class Comision(models.Model):
    """Porcentaje de comisión por categoría de cliente (Hito 4).

    El simulador y las operaciones aplican este porcentaje sobre el monto
    convertido. Una fila por categoría.
    """

    categoria = models.CharField(
        'categoría', max_length=12, choices=Cliente.CATEGORIAS, unique=True,
    )
    porcentaje = models.DecimalField(
        'porcentaje (%)', max_digits=5, decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text='Ej.: 1.00 = 1%.',
    )
    actualizado_en = models.DateTimeField('actualizado en', auto_now=True)

    class Meta:
        ordering = ['categoria']
        verbose_name = 'comisión por categoría'
        verbose_name_plural = 'comisiones por categoría'

    def __str__(self) -> str:
        return f'{self.get_categoria_display()}: {self.porcentaje}%'
