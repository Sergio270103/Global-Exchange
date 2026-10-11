"""Serializers del módulo de clientes."""

from rest_framework import serializers

from .models import Cliente, ClienteUsuario, Comision


class ClienteSerializer(serializers.ModelSerializer):
    """Cliente del catálogo general (lectura para autenticados, escritura admin)."""

    nombre_completo = serializers.CharField(read_only=True)
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    categoria_display = serializers.CharField(source='get_categoria_display', read_only=True)

    class Meta:
        model = Cliente
        fields = [
            'id', 'nombre', 'apellido', 'nombre_completo',
            'documento', 'email', 'telefono',
            'tipo', 'tipo_display', 'categoria', 'categoria_display',
            'activo', 'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['id', 'creado_en', 'actualizado_en']


class ClientePresencialSerializer(serializers.ModelSerializer):
    """Alta de cliente presencial desde ventanilla (PI-45).

    El cajero registra a quien attends sin cuenta en Keycloak, por eso
    exige nombre, apellido, tipo, documento y correo. El teléfono es
    obligatorio solo para personas físicas, que son las que se atienden
    en ventanilla; las jurídicas suelen traer razón social y RUC.
    """

    nombre_completo = serializers.CharField(read_only=True)

    class Meta:
        model = Cliente
        fields = [
            'id', 'nombre', 'apellido', 'nombre_completo',
            'documento', 'email', 'telefono', 'tipo', 'categoria',
        ]
        read_only_fields = ['id', 'nombre_completo']

    def validate_documento(self, value: str):
        """Rechaza un documento ya registrado, normalizado sin espacios."""
        documento = value.strip()
        if Cliente.objects.filter(documento__iexact=documento).exists():
            raise serializers.ValidationError(
                'Ya existe un cliente registrado con este documento.',
            )
        return documento

    def validate(self, attrs):
        tipo = attrs.get('tipo') or Cliente.TIPO_FISICA
        if tipo == Cliente.TIPO_FISICA:
            faltantes = [
                campo for campo in ('nombre', 'apellido', 'documento', 'email')
                if not (attrs.get(campo) or '').strip()
            ]
            if faltantes:
                raise serializers.ValidationError(
                    {'apellido': 'Para persona física son obligatorios el nombre, '
                                 'el apellido, el documento y el correo.'}
                    if faltantes == ['apellido'] else 'Faltan datos obligatorios.',
                )
            if not (attrs.get('telefono') or '').strip():
                raise serializers.ValidationError(
                    {'telefono': 'El teléfono es obligatorio para clientes '
                                 'persona física.'},
                )
        return attrs


class ClienteUsuarioSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)

    class Meta:
        model = ClienteUsuario
        fields = [
            'id', 'cliente', 'cliente_nombre', 'keycloak_id',
            'username', 'email', 'creado_en',
        ]
        read_only_fields = ['id', 'creado_en']


class AjustePrecioSerializer(serializers.ModelSerializer):
    """Configuración interna del ajuste de precio por categoría."""

    categoria_display = serializers.CharField(source='get_categoria_display', read_only=True)

    class Meta:
        model = Comision
        fields = ['id', 'categoria', 'categoria_display', 'porcentaje', 'actualizado_en']
        read_only_fields = ['id', 'actualizado_en']


# Alias temporal para consumidores internos que aún importan el nombre viejo.
ComisionSerializer = AjustePrecioSerializer
