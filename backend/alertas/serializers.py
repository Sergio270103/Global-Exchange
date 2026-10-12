"""Serializers del módulo de alertas de tasas."""

from rest_framework import serializers

from .models import AlertaTasa, DisparoAlerta


class AlertaTasaSerializer(serializers.ModelSerializer):
    moneda_codigo = serializers.CharField(source='moneda.codigo', read_only=True)
    moneda_nombre = serializers.CharField(source='moneda.nombre', read_only=True)

    class Meta:
        model = AlertaTasa
        fields = [
            'id', 'moneda', 'moneda_codigo', 'moneda_nombre',
            'umbral', 'direccion', 'estado', 'creado', 'actualizado',
        ]
        read_only_fields = ['id', 'creado', 'actualizado']

    def validate_umbral(self, valor):
        if valor is None or valor <= 0:
            raise serializers.ValidationError('El umbral debe ser mayor a cero.')
        return valor


class DisparoAlertaSerializer(serializers.ModelSerializer):
    moneda_codigo = serializers.CharField(
        source='alerta.moneda.codigo', read_only=True)

    class Meta:
        model = DisparoAlerta
        fields = [
            'id', 'alerta', 'moneda_codigo', 'tasa_alcanzada',
            'umbral', 'direccion', 'creado',
        ]
        read_only_fields = fields
