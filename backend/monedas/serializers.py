"""Serializers del módulo de monedas."""

from rest_framework import serializers

from .models import Moneda


class MonedaSerializer(serializers.ModelSerializer):
    """Representación de una moneda en la API."""

    class Meta:
        model = Moneda
        fields = [
            'id',
            'codigo',
            'nombre',
            'simbolo',
            'decimales',
            'pais_iso',
            'activo',
            'creado_en',
            'actualizado_en',
        ]
        read_only_fields = ['id', 'creado_en', 'actualizado_en']

    def validate_codigo(self, value: str) -> str:
        """Normaliza el código y verifica que no esté repetido."""
        value = value.strip().upper()
        existentes = Moneda.objects.filter(codigo=value)
        if self.instance is not None:
            existentes = existentes.exclude(pk=self.instance.pk)
        if existentes.exists():
            raise serializers.ValidationError('Ya existe una moneda con este código.')
        return value

    def validate_pais_iso(self, value: str) -> str:
        value = value.strip().upper()
        if value and (len(value) != 2 or not value.isalpha()):
            raise serializers.ValidationError('El código de país debe tener 2 letras. Ej.: PY.')
        return value


class EstadoMonedaSerializer(serializers.Serializer):
    """Cuerpo esperado por el endpoint de activación/desactivación."""

    activo = serializers.BooleanField()