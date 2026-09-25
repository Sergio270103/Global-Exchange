"""Registro de operaciones en el admin de Django."""

from django.contrib import admin

from .models import Operacion


@admin.register(Operacion)
class OperacionAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'tipo_operacion', 'cliente', 'moneda_origen',
        'moneda_destino', 'monto_enviado', 'monto_recibido',
        'fecha_creacion',
    )
    list_filter = ('tipo_operacion', 'moneda_origen', 'moneda_destino')
    search_fields = ('cliente__nombre', 'usuario_keycloak_id')
    readonly_fields = (
        'cliente', 'usuario_keycloak_id', 'tipo_operacion', 'moneda_origen',
        'moneda_destino', 'monto_enviado', 'monto_recibido',
        'cotizacion_aplicada', 'tasa_origen', 'tasa_destino',
        'porcentaje_comision_aplicado', 'monto_comision',
        'metodo_pago', 'fecha_creacion',
    )

    def has_delete_permission(self, request, obj=None):
        return False
