"""Registro de las monedas en el admin de Django."""

from django.contrib import admin

from .models import Moneda


@admin.register(Moneda)
class MonedaAdmin(admin.ModelAdmin):
    list_display = ('codigo', 'nombre', 'simbolo', 'decimales', 'activo')
    list_filter = ('activo',)
    search_fields = ('codigo', 'nombre')
    ordering = ('codigo',)