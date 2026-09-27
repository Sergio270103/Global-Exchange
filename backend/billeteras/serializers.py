"""Serializers del módulo de billeteras."""

from rest_framework import serializers

from .models import Billetera, MedioAcreditacion


class BilleteraSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    moneda_codigo = serializers.CharField(source='moneda.codigo', read_only=True)
    moneda_nombre = serializers.CharField(source='moneda.nombre', read_only=True)

    class Meta:
        model = Billetera
        fields = [
            'id', 'cliente', 'cliente_nombre', 'moneda', 'moneda_codigo',
            'moneda_nombre', 'saldo', 'actualizado_en',
        ]
        read_only_fields = ['id', 'saldo', 'actualizado_en']


class MedioAcreditacionSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    destino_detalle = serializers.SerializerMethodField()

    class Meta:
        model = MedioAcreditacion
        fields = [
            'id', 'cliente', 'cliente_nombre', 'tipo', 'tipo_display',
            'billetera', 'cuenta', 'destino_detalle', 'es_default',
            'creado_en',
        ]
        read_only_fields = ['id', 'creado_en']

    def get_destino_detalle(self, obj) -> str:
        return str(obj.billetera or obj.cuenta or '')

    def validate(self, attrs):
        tipo = attrs.get('tipo', getattr(self.instance, 'tipo', None))
        billetera = attrs.get('billetera', getattr(self.instance, 'billetera', None))
        cuenta = attrs.get('cuenta', getattr(self.instance, 'cuenta', None))
        cliente = attrs.get('cliente', getattr(self.instance, 'cliente', None))
        if tipo == MedioAcreditacion.TIPO_BILLETERA and not billetera:
            raise serializers.ValidationError('Indicá la billetera de destino.')
        if tipo == MedioAcreditacion.TIPO_CUENTA and not cuenta:
            raise serializers.ValidationError('Indicá la cuenta bancaria de destino.')
        if cliente and billetera and billetera.cliente_id != cliente.id:
            raise serializers.ValidationError('La billetera no pertenece al cliente.')
        if cliente and cuenta and cuenta.cliente_id != cliente.id:
            raise serializers.ValidationError('La cuenta no pertenece al cliente.')
        return attrs
