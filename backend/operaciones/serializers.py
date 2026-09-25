"""Serializers del módulo de operaciones."""

from rest_framework import serializers

from .models import Operacion


class OperacionSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    moneda_origen_codigo = serializers.CharField(source='moneda_origen.codigo', read_only=True)
    moneda_destino_codigo = serializers.CharField(source='moneda_destino.codigo', read_only=True)

    class Meta:
        model = Operacion
        fields = [
            'id', 'cliente', 'cliente_nombre', 'usuario_keycloak_id',
            'tipo_operacion', 'moneda_origen', 'moneda_origen_codigo',
            'moneda_destino', 'moneda_destino_codigo',
            'monto_enviado', 'monto_recibido', 'cotizacion_aplicada',
            'tasa_origen', 'tasa_destino',
            'porcentaje_comision_aplicado', 'monto_comision',
            'metodo_pago', 'fecha_creacion',
        ]
        read_only_fields = [
            'id', 'usuario_keycloak_id', 'monto_recibido', 'cotizacion_aplicada',
            'tasa_origen', 'tasa_destino', 'porcentaje_comision_aplicado',
            'monto_comision', 'fecha_creacion',
        ]


class CrearOperacionSerializer(serializers.Serializer):
    """Entrada del POST /api/operaciones/.

    El frontend envía la divisa y el monto en divisa (lo que el usuario
    tipea), más la contraparte (por defecto PYG):

    - COMPRA (cliente compra `moneda`): `monto_divisa` = cantidad de divisa
      deseada (`moneda_destino = moneda`). Se calcula el total a pagar en
      `moneda_contraparte` (origen): bruto + comisión.
    - VENTA (cliente vende `moneda`): `monto_divisa` = cantidad que entrega
      (`moneda_origen = moneda`). Se calcula lo a recibir en contraparte:
      bruto - comisión.
    """

    cliente = serializers.IntegerField()
    tipo_operacion = serializers.ChoiceField(choices=['COMPRA', 'VENTA', 'compra', 'venta'])
    moneda = serializers.CharField(max_length=3)
    monto_divisa = serializers.DecimalField(max_digits=18, decimal_places=2)
    moneda_contraparte = serializers.CharField(max_length=3, default='PYG')
    metodo_pago = serializers.CharField(max_length=24, required=False, allow_blank=True, default='')
