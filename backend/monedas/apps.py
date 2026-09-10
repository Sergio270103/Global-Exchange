"""Configuración de la app de monedas."""

from django.apps import AppConfig


class MonedasConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'monedas'
    verbose_name = 'Monedas'