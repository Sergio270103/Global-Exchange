
"""Serializers del módulo de operaciones."""

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from .models import Operacion


def tolerancia_segundos() -> int:
    """Ventana (en segundos) en la que se respeta la tasa congelada.

    Configurable en settings con ``OPERACION_TOLERANCIA_SEGUNDOS``.
    """
    return int(getattr(settings, 'OPERACION_TOLERANCIA_SEGUNDOS', 30))


class OperacionSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    moneda_origen_codigo = serializers.CharField(source='moneda_origen.codigo', read_only=True)
    moneda_destino_codigo = serializers.CharField(source='moneda_destino.codigo', read_only=True)
    billetera_destino_detalle = serializers.SerializerMethodField()
    cuenta_origen_detalle = serializers.SerializerMethodField()
    billetera_origen_detalle = serializers.SerializerMethodField()
    tolerancia_segundos = serializers.SerializerMethodField()
    segundos_restantes = serializers.SerializerMethodField()

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
            'billetera_destino', 'billetera_destino_detalle',
            'cuenta_origen', 'cuenta_origen_detalle',
            'billetera_origen', 'billetera_origen_detalle',
            'estado', 'fecha_cotizacion', 'fecha_confirmacion',
            'fecha_cancelacion', 'cancelada_por', 'cancelada_por_nombre',
            'motivo_cancelacion',
            'tolerancia_segundos', 'segundos_restantes',
        ]
        read_only_fields = fields

    def get_tolerancia_segundos(self, obj: Operacion) -> int:
        return tolerancia_segundos()

    def get_billetera_destino_detalle(self, obj: Operacion) -> str:
        return str(obj.billetera_destino) if obj.billetera_destino_id else ''

    def get_cuenta_origen_detalle(self, obj: Operacion) -> str:
        return str(obj.cuenta_origen) if obj.cuenta_origen_id else ''

    def get_billetera_origen_detalle(self, obj: Operacion) -> str:
        return str(obj.billetera_origen) if obj.billetera_origen_id else ''

    def get_segundos_restantes(self, obj: Operacion) -> int:
        """Segundos que le quedan a la tasa garantizada (0 si no aplica).

        Se calcula en el servidor para no depender del reloj del cliente.
        """
        if obj.estado != Operacion.ESTADO_PENDIENTE or not obj.fecha_cotizacion:
            return 0
        transcurrido = (timezone.now() - obj.fecha_cotizacion).total_seconds()
        return max(0, int(tolerancia_segundos() - transcurrido))


class OperacionPublicSerializer(OperacionSerializer):
    """Respuesta para el cliente: precio final, sin desglose del ajuste.

    El porcentaje y el monto del ajuste se conservan en el modelo para
    auditoría interna, pero no se exponen en el contrato público.
    """

    class Meta(OperacionSerializer.Meta):
        fields = [
            field for field in OperacionSerializer.Meta.fields
            if field not in ('porcentaje_comision_aplicado', 'monto_comision')
        ]
        read_only_fields = fields


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

    La operación nace en estado PENDIENTE; se confirma con
    ``POST /api/operaciones/{id}/confirmar/``.
    """

    cliente = serializers.IntegerField()
    tipo_operacion = serializers.ChoiceField(choices=['COMPRA', 'VENTA', 'compra', 'venta'])
    moneda = serializers.CharField(max_length=3)
    monto_divisa = serializers.DecimalField(max_digits=18, decimal_places=2)
    moneda_contraparte = serializers.CharField(max_length=3, default='PYG')
    metodo_pago = serializers.CharField(max_length=24, required=False, allow_blank=True, default='')
    # PI-66: vinculación (solo registro, sin mover fondos).
    billetera_destino = serializers.IntegerField(required=False, allow_null=True, default=None)
    cuenta_origen = serializers.IntegerField(required=False, allow_null=True, default=None)
    # PI-66c: débito de billetera origen (opción B).
    billetera_origen = serializers.IntegerField(required=False, allow_null=True, default=None)


class CancelarOperacionSerializer(serializers.Serializer):
    """Entrada del POST /api/operaciones/{id}/cancelar/."""

    motivo = serializers.ChoiceField(
        choices=[m for m, _ in Operacion.MOTIVOS_CANCELACION],
        default=Operacion.MOTIVO_DESISTIO,
    )