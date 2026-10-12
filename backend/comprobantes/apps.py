"""Configuración de la app de comprobantes internos (PI-42)."""

from django.apps import AppConfig


class ComprobantesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'comprobantes'
    verbose_name = 'comprobantes internos'
