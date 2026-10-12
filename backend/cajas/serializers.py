"""Serializers del módulo de control de cajas."""

from decimal import Decimal

from rest_framework import serializers

from clientes.models import Cliente
from monedas.models import Moneda
from operaciones.models import Operacion

from .models import (
    ArqueoCaja, ArqueoMoneda, Caja, DetalleEntrega, Denominacion,
    EntregaBilletes, MovimientoCaja, TurnoCaja,
)
from .servicios import totales_entrega, turno_abierto
from .servicios_operacion import MEDIO_EFECTIVO, MEDIOS_PAGO


def _texto_valor(valor) -> str:
    return f'{valor.normalize():f}'


class TurnoResumenSerializer(serializers.ModelSerializer):
    """Turno abierto de una caja (PI-79), para mostrar quién la tiene."""

    class Meta:
        model = TurnoCaja
        fields = ['id', 'cajero_nombre', 'abierto_en', 'entrega_apertura']


class CajaSerializer(serializers.ModelSerializer):
    abierta = serializers.SerializerMethodField()
    turno_actual = serializers.SerializerMethodField()

    class Meta:
        model = Caja
        fields = ['id', 'nombre', 'sucursal', 'activa', 'abierta', 'turno_actual', 'creado_en']
        read_only_fields = ['id', 'abierta', 'turno_actual', 'creado_en']

    def get_abierta(self, obj) -> bool:
        return turno_abierto(obj) is not None

    def get_turno_actual(self, obj):
        turno = turno_abierto(obj)
        return TurnoResumenSerializer(turno).data if turno else None


class DenominacionSerializer(serializers.ModelSerializer):
    moneda_codigo = serializers.CharField(source='moneda.codigo', read_only=True)
    moneda_nombre = serializers.CharField(source='moneda.nombre', read_only=True)
    simbolo = serializers.CharField(source='moneda.simbolo', read_only=True)
    decimales = serializers.IntegerField(source='moneda.decimales', read_only=True)

    class Meta:
        model = Denominacion
        fields = [
            'id', 'moneda', 'moneda_codigo', 'moneda_nombre', 'simbolo',
            'decimales', 'valor', 'activa',
        ]
        read_only_fields = ['id']


# --- Movimientos (PI-44 / PI-78: por monto) ----------------------------

class MovimientoSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    moneda_codigo = serializers.CharField(source='moneda.codigo', read_only=True)
    caja_nombre = serializers.CharField(source='caja.__str__', read_only=True)

    class Meta:
        model = MovimientoCaja
        fields = [
            'id', 'caja', 'caja_nombre', 'tipo', 'tipo_display', 'moneda',
            'moneda_codigo', 'total', 'saldo_resultante', 'usuario_nombre',
            'observacion', 'entrega', 'creado_en',
        ]


class LineaBilletesSerializer(serializers.Serializer):
    """Billetes de una denominación (solo se usa en entregas, PI-43)."""

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
    monto = serializers.DecimalField(max_digits=18, decimal_places=2)
    observacion = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


# --- Operación cambiaria presencial (PI-75) ----------------------------

class CotizacionVentanillaSerializer(serializers.Serializer):
    """Desglose que el cajero muestra antes de confirmar (PI-75)."""

    cliente = serializers.PrimaryKeyRelatedField(queryset=Cliente.objects.all())
    tipo_operacion = serializers.ChoiceField(choices=Operacion.TIPOS)
    moneda = serializers.CharField(max_length=3, help_text='Divisa a comprar o vender.')
    monto = serializers.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Monto que escribió el cajero, en moneda_del_monto.')
    moneda_del_monto = serializers.CharField(max_length=3, required=False)
    moneda_contraparte = serializers.CharField(max_length=3, required=False, default='PYG')


class OperacionPresencialSerializer(serializers.Serializer):
    """Alta de la operación presencial (PI-75)."""

    cliente = serializers.PrimaryKeyRelatedField(queryset=Cliente.objects.all())
    tipo_operacion = serializers.ChoiceField(choices=Operacion.TIPOS)
    moneda = serializers.CharField(max_length=3)
    monto = serializers.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Monto que escribió el cajero, en moneda_del_monto.')
    moneda_del_monto = serializers.CharField(
        max_length=3, required=False,
        help_text='Moneda del campo de monto. Si se omite, se asume que es '
                  'la divisa operada.')
    moneda_contraparte = serializers.CharField(max_length=3, required=False, default='PYG')
    medio_pago = serializers.ChoiceField(
        choices=MEDIOS_PAGO, default=MEDIO_EFECTIVO,
        help_text='Efectivo, tarjeta o transferencia. No se usa billetera.',
    )
    observacion = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default='')

    def validate_monto(self, value):
        if value <= 0:
            raise serializers.ValidationError('El monto debe ser mayor a cero.')
        return value

    def validate(self, attrs):
        # Compatibilidad: antes el campo se llamaba `monto_divisa` y ya
        # venía convertido a la divisa operada.
        legacy = attrs.pop('monto_divisa', None)
        if legacy is not None:
            attrs.setdefault('monto', legacy)
        if attrs.get('monto') is None:
            raise serializers.ValidationError({'monto': 'Indicá el monto.'})
        return attrs


# --- Arqueos (PI-78: por total de cada moneda) -------------------------

class ArqueoMonedaSerializer(serializers.ModelSerializer):
    moneda_codigo = serializers.CharField(source='moneda.codigo', read_only=True)
    simbolo = serializers.CharField(source='moneda.simbolo', read_only=True)
    decimales = serializers.IntegerField(source='moneda.decimales', read_only=True)
    diferencia = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        model = ArqueoMoneda
        fields = [
            'moneda', 'moneda_codigo', 'simbolo', 'decimales',
            'monto_sistema', 'monto_contado', 'diferencia',
        ]


class ArqueoSerializer(serializers.ModelSerializer):
    caja_nombre = serializers.CharField(source='caja.__str__', read_only=True)
    detalle = ArqueoMonedaSerializer(many=True, read_only=True)
    es_cierre = serializers.SerializerMethodField()

    class Meta:
        model = ArqueoCaja
        fields = [
            'id', 'caja', 'caja_nombre', 'usuario_nombre', 'observacion',
            'con_diferencias', 'es_cierre', 'creado_en', 'detalle',
        ]

    def get_es_cierre(self, obj) -> bool:
        return hasattr(obj, 'turno_cierre')


class TurnoSerializer(serializers.ModelSerializer):
    """Turno de caja completo (PI-79): apertura, cierre y recuento final."""

    caja_nombre = serializers.CharField(source='caja.__str__', read_only=True)
    abierto = serializers.BooleanField(read_only=True)
    arqueo_cierre = ArqueoSerializer(read_only=True)

    class Meta:
        model = TurnoCaja
        fields = [
            'id', 'caja', 'caja_nombre', 'abierto', 'cajero_nombre', 'abierto_en',
            'entrega_apertura', 'cerrado_en', 'cerrado_por_nombre', 'arqueo_cierre',
        ]


class LineaConteoSerializer(serializers.Serializer):
    moneda = serializers.PrimaryKeyRelatedField(queryset=Moneda.objects.all())
    monto = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal('0'))


class NuevoArqueoSerializer(serializers.Serializer):
    conteo = LineaConteoSerializer(many=True, required=False, default=list)
    observacion = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

    def validate_conteo(self, lineas):
        ids = [linea['moneda'].pk for linea in lineas]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('Hay monedas repetidas en el conteo.')
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
