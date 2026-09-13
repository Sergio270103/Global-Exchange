"""Serializers del módulo de pagos."""

from rest_framework import serializers

from .models import CuentaBancaria, MetodoPago


class MetodoPagoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetodoPago
        fields = ['id', 'codigo', 'nombre', 'activo', 'creado_en', 'actualizado_en']
        read_only_fields = ['id', 'creado_en', 'actualizado_en']

    def validate_codigo(self, value: str) -> str:
        value = value.strip().lower()
        existentes = MetodoPago.objects.filter(codigo=value)
        if self.instance is not None:
            existentes = existentes.exclude(pk=self.instance.pk)
        if existentes.exists():
            raise serializers.ValidationError('Ya existe un método con este código.')
        return value


class CuentaBancariaSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    moneda_codigo = serializers.CharField(source='moneda.codigo', read_only=True)
    numero_enmascarado = serializers.SerializerMethodField()

    class Meta:
        model = CuentaBancaria
        fields = [
            'id', 'cliente', 'cliente_nombre', 'nombre', 'apellido', 'cedula',
            'banco', 'numero_cuenta', 'numero_enmascarado', 'codigo_bancario',
            'moneda', 'moneda_codigo', 'activa', 'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['id', 'creado_en', 'actualizado_en']
        extra_kwargs = {'numero_cuenta': {'write_only': True}}

    def get_numero_enmascarado(self, obj) -> str:
        digitos = ''.join(c for c in obj.numero_cuenta if c.isdigit())
        return f'•••• •••• {digitos[-4:]}' if len(digitos) > 4 else '••••'

    def validate_numero_cuenta(self, value: str) -> str:
        digitos = ''.join(c for c in value if c.isdigit())
        if len(digitos) < 6:
            raise serializers.ValidationError('El Nº de cuenta debe tener al menos 6 dígitos.')
        return value
