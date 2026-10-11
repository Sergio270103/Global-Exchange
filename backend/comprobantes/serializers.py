"""Serializers del módulo de comprobantes internos."""

from rest_framework import serializers

from .models import Comprobante


class ComprobanteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comprobante
        fields = [
            'id', 'numero', 'operacion', 'cliente_nombre',
            'cliente_documento', 'tipo_operacion', 'moneda_origen_codigo',
            'moneda_destino_codigo', 'monto_enviado', 'monto_recibido',
            'tasa_origen', 'tasa_destino', 'monto_comision', 'metodo_pago',
            'fecha_operacion', 'cajero_sub', 'cajero_nombre', 'estado',
            'creado',
        ]
        read_only_fields = fields
