"""Registro de billeteras en el admin de Django."""

from django.contrib import admin

from .models import Billetera, MedioAcreditacion, Movimiento


@admin.register(Billetera)
class BilleteraAdmin(admin.ModelAdmin):
    list_display = ('cliente', 'moneda', 'saldo', 'actualizado_en')
    search_fields = ('cliente__nombre', 'moneda__codigo')
    readonly_fields = ('saldo',)


@admin.register(MedioAcreditacion)
class MedioAcreditacionAdmin(admin.ModelAdmin):
    list_display = ('cliente', 'tipo', 'es_default', 'creado_en')
    list_filter = ('tipo', 'es_default')


@admin.register(Movimiento)
class MovimientoAdmin(admin.ModelAdmin):
    list_display = ('billetera', 'operacion', 'tipo', 'monto', 'saldo_resultante', 'creado_en')
    list_filter = ('tipo',)
    readonly_fields = ('billetera', 'operacion', 'tipo', 'monto', 'saldo_resultante', 'creado_en')

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
