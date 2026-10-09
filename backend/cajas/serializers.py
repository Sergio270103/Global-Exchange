"""Serializers del módulo de control de cajas."""

from rest_framework import serializers

from monedas.models import Moneda

from .models import (
    ArqueoCaja, Caja, DetalleArqueo, DetalleEntrega, DetalleMovimiento,
    Denominacion, EntregaBilletes, MovimientoCaja,
)
from .servicios import totales_entrega


def _texto_valor(valor) -> str:
    return f'{valor.normalize():f}'


class CajaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Caja
        fields = ['id', 'nombre', 'sucursal', 'activa', 'creado_en']
        read_only_fields = ['id', 'creado_en']


class DenominacionSerializer(serializers.ModelSerializer):
    moneda_codigo = serializers.CharField(source='moneda.codigo', read_only=True)

    class Meta:
        model = Denominacion
        fields = ['id', 'moneda', 'moneda_codigo', 'valor', 'activa']
        read_only_fields = ['id']


# --- Movimientos -------------------------------------------------------

class DetalleMovimientoSerializer(serializers.ModelSerializer):
    valor = serializers.SerializerMethodField()

    class Meta:
        model = DetalleMovimiento
        fields = ['denominacion', 'valor', 'cantidad', 'saldo_resultante']

    def get_valor(self, obj) -> str:
        return _texto_valor(obj.denominacion.valor)


class MovimientoSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    moneda_codigo = serializers.CharField(source='moneda.codigo', read_only=True)
    caja_nombre = serializers.CharField(source='caja.__str__', read_only=True)
    detalle = DetalleMovimientoSerializer(many=True, read_only=True)

    class Meta:
        model = MovimientoCaja
        fields = [
            'id', 'caja', 'caja_nombre', 'tipo', 'tipo_display', 'moneda',
            'moneda_codigo', 'total', 'usuario_nombre', 'observacion',
            'entrega', 'creado_en', 'detalle',
        ]


class LineaBilletesSerializer(serializers.Serializer):
    denominacion = serializers.PrimaryKeyRelatedField(
        queryset=Denominacion.objects.select_related('moneda'))
    cantidad = serializers.IntegerField(min_value=1)


class NuevoMovimientoSerializer(serializers.Serializer):
    # Las entregas tienen su propio flujo con confirmación (PI-43).
    tipo = serializers.ChoiceField(choices=[
        (MovimientoCaja.TIPO_INGRESO, 'Ingreso'),
        (MovimientoCaja.TIPO_RETIRO, 'Retiro'),
    ], error_messages={'invalid_choice': (
        'Tipo inválido. Las entregas de billetes se registran desde /api/entregas/.')})
    moneda = serializers.PrimaryKeyRelatedField(queryset=Moneda.objects.all())
    detalle = LineaBilletesSerializer(many=True, allow_empty=False)
    observacion = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        moneda = attrs['moneda']
        vistos = set()
        for linea in attrs['detalle']:
            den = linea['denominacion']
            if den.moneda_id != moneda.pk:
                raise serializers.ValidationError(
                    {'detalle': f'La denominación {den} no corresponde a {moneda.codigo}.'})
            if den.pk in vistos:
                raise serializers.ValidationError(
                    {'detalle': f'La denominación {den} está repetida.'})
            vistos.add(den.pk)
        return attrs


# --- Arqueos -----------------------------------------------------------

class DetalleArqueoSerializer(serializers.ModelSerializer):
    valor = serializers.SerializerMethodField()
    moneda_codigo = serializers.CharField(source='denominacion.moneda.codigo', read_only=True)
    diferencia = serializers.IntegerField(read_only=True)

    class Meta:
        model = DetalleArqueo
        fields = [
            'denominacion', 'moneda_codigo', 'valor', 'cantidad_sistema',
            'cantidad_contada', 'diferencia',
        ]

    def get_valor(self, obj) -> str:
        return _texto_valor(obj.denominacion.valor)


class ArqueoSerializer(serializers.ModelSerializer):
    caja_nombre = serializers.CharField(source='caja.__str__', read_only=True)
    detalle = DetalleArqueoSerializer(many=True, read_only=True)

    class Meta:
        model = ArqueoCaja
        fields = [
            'id', 'caja', 'caja_nombre', 'usuario_nombre', 'observacion',
            'con_diferencias', 'creado_en', 'detalle',
        ]


class LineaConteoSerializer(serializers.Serializer):
    denominacion = serializers.PrimaryKeyRelatedField(queryset=Denominacion.objects.all())
    cantidad = serializers.IntegerField(min_value=0)


class NuevoArqueoSerializer(serializers.Serializer):
    conteo = LineaConteoSerializer(many=True, required=False, default=list)
    observacion = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

    def validate_conteo(self, lineas):
        ids = [linea['denominacion'].pk for linea in lineas]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('Hay denominaciones repetidas en el conteo.')
        return lineas


# --- Entregas de billetes (PI-43) --------------------------------------

class DetalleEntregaSerializer(serializers.ModelSerializer):
    moneda_codigo = serializers.CharField(source='denominacion.moneda.codigo', read_only=True)
    valor = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = DetalleEntrega
        fields = ['denominacion', 'moneda_codigo', 'valor', 'cantidad', 'subtotal']

    def get_valor(self, obj) -> str:
        return _texto_valor(obj.denominacion.valor)

    def get_subtotal(self, obj) -> str:
        return _texto_valor(obj.subtotal)


class EntregaSerializer(serializers.ModelSerializer):
    caja_nombre = serializers.CharField(source='caja.__str__', read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)
    detalle = DetalleEntregaSerializer(many=True, read_only=True)
    totales = serializers.SerializerMethodField()

    class Meta:
        model = EntregaBilletes
        fields = [
            'id', 'caja', 'caja_nombre', 'estado', 'estado_display',
            'entregado_por_nombre', 'observacion', 'creado_en',
            'respondido_por_nombre', 'fecha_respuesta', 'motivo',
            'totales', 'detalle',
        ]

    def get_totales(self, obj) -> list[dict]:
        return totales_entrega(obj)


class NuevaEntregaSerializer(serializers.Serializer):
    caja = serializers.PrimaryKeyRelatedField(queryset=Caja.objects.all())
    detalle = LineaBilletesSerializer(many=True, allow_empty=False)
    observacion = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

    def validate_detalle(self, lineas):
        ids = [linea['denominacion'].pk for linea in lineas]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('Hay denominaciones repetidas.')
        return lineas


class MotivoSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=255, allow_blank=False, trim_whitespace=True,
                                   error_messages={'blank': 'Indicá el motivo.',
                                                   'required': 'Indicá el motivo.'})
