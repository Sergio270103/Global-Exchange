"""Registro de cotizaciones en el admin de Django."""

from django.contrib import admin

from .models import Cotizacion


@admin.register(Cotizacion)
class CotizacionAdmin(admin.ModelAdmin):
    list_display = ('moneda', 'compra', 'venta', 'vigente_desde', 'creado_por')
    list_filter = ('moneda',)
    search_fields = ('moneda__codigo', 'creado_por')
    readonly_fields = ('vigente_desde',)
