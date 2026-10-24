"""Serializers de facturación electrónica (PI-30)."""

from rest_framework import serializers

from .models import FacturaElectronica


class FacturaElectronicaSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.SerializerMethodField()

    class Meta:
        model = FacturaElectronica
        fields = [
            'id', 'operacion', 'cliente_nombre', 'simulada', 'numero',
            'numero_completo', 'cdc', 'estado', 'total', 'email_destino',
            'detalle', 'respuesta_servicio', 'envio_fecha',
            'envio_destinatario', 'envio_resultado', 'emitida_por_nombre',
            'creada', 'actualizada', 'estado_consultado',
        ]
        read_only_fields = fields

    def get_cliente_nombre(self, obj) -> str:
        cliente = obj.operacion.cliente
        return getattr(cliente, 'nombre_completo', '') or str(cliente)
