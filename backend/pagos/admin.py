"""Registro de pagos en el admin de Django."""

from django.contrib import admin

from .models import CuentaBancaria, MetodoPago


@admin.register(MetodoPago)
class MetodoPagoAdmin(admin.ModelAdmin):
    list_display = ('codigo', 'nombre', 'activo')
    list_filter = ('activo',)


@admin.register(CuentaBancaria)
class CuentaBancariaAdmin(admin.ModelAdmin):
    list_display = ('banco', 'cliente', 'moneda', 'activa')
    list_filter = ('activa', 'banco')
    search_fields = ('banco', 'cliente__nombre', 'cedula')
