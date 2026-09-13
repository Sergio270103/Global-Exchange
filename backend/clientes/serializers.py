"""Serializers del módulo de clientes."""

from rest_framework import serializers

from .models import Cliente, ClienteUsuario, Comision


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = [
            'id', 'nombre', 'documento', 'email', 'tipo', 'categoria',
            'activo', 'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['id', 'creado_en', 'actualizado_en']


class ClienteUsuarioSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)

    class Meta:
        model = ClienteUsuario
        fields = [
            'id', 'cliente', 'cliente_nombre', 'keycloak_id',
            'username', 'email', 'creado_en',
        ]
        read_only_fields = ['id', 'creado_en']


class ComisionSerializer(serializers.ModelSerializer):
    categoria_display = serializers.CharField(source='get_categoria_display', read_only=True)

    class Meta:
        model = Comision
        fields = ['id', 'categoria', 'categoria_display', 'porcentaje', 'actualizado_en']
        read_only_fields = ['id', 'actualizado_en']
