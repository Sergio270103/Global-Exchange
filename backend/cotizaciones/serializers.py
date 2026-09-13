"""Serializers del módulo de cotizaciones."""

from rest_framework import serializers

from .models import Cotizacion


class CotizacionSerializer(serializers.ModelSerializer):
    moneda_codigo = serializers.CharField(source='moneda.codigo', read_only=True)
    moneda_nombre = serializers.CharField(source='moneda.nombre', read_only=True)

    class Meta:
        model = Cotizacion
        fields = [
            'id', 'moneda', 'moneda_codigo', 'moneda_nombre',
            'compra', 'venta', 'vigente_desde', 'creado_por',
        ]
        read_only_fields = ['id', 'vigente_desde', 'creado_por']

    def validate(self, attrs):
        compra = attrs.get('compra', getattr(self.instance, 'compra', None))
        venta = attrs.get('venta', getattr(self.instance, 'venta', None))
        if compra is not None and venta is not None and venta < compra:
            raise serializers.ValidationError('La venta no puede ser menor que la compra.')
        return attrs
