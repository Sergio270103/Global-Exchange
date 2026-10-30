"""Serializers de facturación electrónica (PI-30 y gestión SIFEN)."""

from rest_framework import serializers

from .models import (
    EVENTO_APROBADA,
    EVENTO_PENDIENTE,
    EventoSIFEN,
    FacturaElectronica,
    NotaCreditoElectronica,
)


class EventoSIFENSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = EventoSIFEN
        fields = [
            'id', 'factura', 'tipo', 'tipo_display', 'estado',
            'estado_display', 'cdc_evento', 'motivo', 'solicitado_por_nombre',
            'solicitado', 'consultado', 'detalle', 'respuesta_solicitud',
            'respuesta_consulta',
        ]
        read_only_fields = fields


class NotaCreditoResumenSerializer(serializers.ModelSerializer):
    motivo_display = serializers.CharField(source='get_motivo_display', read_only=True)

    class Meta:
        model = NotaCreditoElectronica
        fields = [
            'id', 'numero', 'numero_completo', 'cdc', 'estado', 'total',
            'motivo', 'motivo_display', 'detalle', 'creada', 'simulada',
        ]
        read_only_fields = fields


class NotaCreditoElectronicaSerializer(serializers.ModelSerializer):
    factura_numero = serializers.CharField(
        source='factura.numero_completo', read_only=True)
    cliente_nombre = serializers.SerializerMethodField()
    motivo_display = serializers.CharField(source='get_motivo_display', read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = NotaCreditoElectronica
        fields = [
            'id', 'factura', 'factura_numero', 'cliente_nombre', 'simulada',
            'numero', 'numero_completo', 'cdc', 'estado', 'estado_display',
            'total', 'motivo', 'motivo_display', 'email_destino', 'detalle',
            'respuesta_servicio', 'envio_fecha', 'envio_destinatario',
            'envio_resultado', 'emitida_por_nombre', 'creada', 'actualizada',
            'estado_consultado',
        ]
        read_only_fields = fields

    def get_cliente_nombre(self, obj) -> str:
        cliente = obj.factura.operacion.cliente
        return getattr(cliente, 'nombre_completo', '') or str(cliente)


class FacturaElectronicaSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.SerializerMethodField()
    tipo_operacion = serializers.CharField(source='operacion.tipo_operacion', read_only=True)
    tipo_operacion_display = serializers.SerializerMethodField()
    eventos = EventoSIFENSerializer(many=True, read_only=True)
    notas_credito = NotaCreditoResumenSerializer(many=True, read_only=True)
    puede_gestionar = serializers.SerializerMethodField()
    puede_cancelar = serializers.SerializerMethodField()
    puede_inutilizar = serializers.SerializerMethodField()
    puede_nota_credito = serializers.SerializerMethodField()

    class Meta:
        model = FacturaElectronica
        fields = [
            'id', 'operacion', 'cliente_nombre', 'tipo_operacion', 'tipo_operacion_display', 'simulada', 'numero',
            'numero_completo', 'cdc', 'estado', 'total', 'email_destino',
            'detalle', 'respuesta_servicio', 'envio_fecha',
            'envio_destinatario', 'envio_resultado', 'emitida_por_nombre',
            'creada', 'actualizada', 'estado_consultado',
            'estado_cancelacion', 'estado_inutilizacion',
            'cancelacion_solicitada', 'cancelacion_consultada',
            'cancelacion_detalle', 'inutilizacion_solicitada',
            'inutilizacion_consultada', 'inutilizacion_detalle',
            'cancelada_por_nombre', 'inutilizada_por_nombre',
            'puede_cancelar', 'puede_inutilizar', 'puede_nota_credito',
            'eventos', 'notas_credito', 'pdf_pendiente', 'puede_gestionar',
        ]
        read_only_fields = fields

    def get_cliente_nombre(self, obj) -> str:
        cliente = obj.operacion.cliente
        return getattr(cliente, 'nombre_completo', '') or str(cliente)

    def get_tipo_operacion_display(self, obj):
        return 'Compra' if obj.operacion.tipo_operacion == 'COMPRA' else 'Venta'

    def get_puede_gestionar(self, obj):
        from .views import _puede_gestionar
        request = self.context.get('request')
        return bool(request and _puede_gestionar(request.user, obj))

    def get_puede_cancelar(self, obj) -> bool:
        return bool(
            obj.estado == FacturaElectronica.ESTADO_APROBADA
            and obj.estado_cancelacion not in (EVENTO_PENDIENTE, EVENTO_APROBADA)
            and obj.estado_inutilizacion != EVENTO_APROBADA
        )

    def get_puede_inutilizar(self, obj) -> bool:
        return bool(
            obj.estado in (
                FacturaElectronica.ESTADO_RECHAZADA,
                FacturaElectronica.ESTADO_ERROR,
                FacturaElectronica.ESTADO_VERIFICAR,
            )
            and obj.numero
            and obj.estado_cancelacion != EVENTO_APROBADA
            and obj.estado_inutilizacion not in (EVENTO_PENDIENTE, EVENTO_APROBADA)
        )

    def get_puede_nota_credito(self, obj) -> bool:
        activas = obj.notas_credito.filter(
            estado__in=NotaCreditoElectronica.ESTADOS_ACTIVOS)
        return bool(
            obj.estado == FacturaElectronica.ESTADO_APROBADA
            and obj.estado_cancelacion != EVENTO_APROBADA
            and not activas.exists()
        )
