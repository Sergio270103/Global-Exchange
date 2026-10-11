"""Configuración de la app de alertas de tasas (PI-38)."""

from django.apps import AppConfig


class AlertasConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'alertas'
    verbose_name = 'alertas de tasas'
