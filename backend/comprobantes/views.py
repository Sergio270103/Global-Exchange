"""Vistas del módulo de comprobantes internos (PI-42, RF63).

- ``POST /api/comprobantes/ {operacion}`` emite el comprobante de una
  operación PAGADA visible por el solicitante (número único
  secuencial + foto inmutable). Una operación tiene un solo comprobante.
- ``GET /api/comprobantes/`` y ``GET /api/comprobantes/<id>/`` listan
  y reimprimen (el cajero ve los que emitió; cada usuario, los de sus
  clientes; el admin, todos).
"""

from django.db import IntegrityError
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.permisos import es_cajero
from monedas.permisos import es_admin
from operaciones.models import Operacion

from .models import Comprobante
from .serializers import ComprobanteSerializer


def _sub(usuario) -> str:
    return getattr(usuario, 'id', '') or ''


def _clientes_del_sub(sub: str):
    from clientes.models import ClienteUsuario
    return ClienteUsuario.objects.filter(
        keycloak_id=sub).values_list('cliente_id', flat=True)


class ComprobanteViewSet(viewsets.ModelViewSet):
    serializer_class = ComprobanteSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = Comprobante.objects.select_related(
            'operacion', 'operacion__cliente').all()
        usuario = self.request.user
        sub = _sub(usuario)
        if getattr(usuario, 'is_superuser', False) or es_admin(usuario):
            return qs
        if es_cajero(usuario):
            return qs.filter(
                Q(cajero_sub=sub) | Q(operacion__cliente_id__in=_clientes_del_sub(sub)))
        return qs.filter(operacion__cliente_id__in=_clientes_del_sub(sub))

    def create(self, request, *args, **kwargs):
        try:
            operacion_id = int(request.data.get('operacion'))
        except (TypeError, ValueError):
            return Response(
                {'detail': 'Indicá la operación.'},
                status=status.HTTP_400_BAD_REQUEST)
        try:
            op = Operacion.objects.select_related(
                'cliente', 'moneda_origen', 'moneda_destino').get(pk=operacion_id)
        except Operacion.DoesNotExist:
            return Response(
                {'detail': 'La operación no existe.'},
                status=status.HTTP_404_NOT_FOUND)
        if op.estado != Operacion.ESTADO_PAGADA:
            return Response(
                {'detail': 'Solo se emite comprobante de una operación pagada.'},
                status=status.HTTP_400_BAD_REQUEST)
        usuario = request.user
        sub = _sub(usuario)
        permitida = (
            getattr(usuario, 'is_superuser', False) or es_admin(usuario)
            or op.usuario_keycloak_id == sub
            or op.cliente_id in _clientes_del_sub(sub)
        )
        if not permitida:
            return Response(
                {'detail': 'No podés emitir comprobante de esta operación.'},
                status=status.HTTP_403_FORBIDDEN)
        if hasattr(op, 'comprobante'):
            return Response(
                {'detail': 'La operación ya tiene comprobante.'},
                status=status.HTTP_400_BAD_REQUEST)
        try:
            comprobante = Comprobante.objects.create(
                operacion=op,
                cliente_nombre=op.cliente.nombre_completo
                if hasattr(op.cliente, 'nombre_completo') else str(op.cliente),
                cliente_documento=getattr(op.cliente, 'documento', '') or '',
                tipo_operacion=op.tipo_operacion,
                moneda_origen_codigo=op.moneda_origen.codigo,
                moneda_destino_codigo=op.moneda_destino.codigo,
                monto_enviado=op.monto_enviado,
                monto_recibido=op.monto_recibido,
                tasa_origen=op.tasa_origen,
                tasa_destino=op.tasa_destino,
                monto_comision=op.monto_comision,
                metodo_pago=op.metodo_pago,
                fecha_operacion=op.fecha_confirmacion or op.fecha_creacion,
                cajero_sub=sub[:160],
                cajero_nombre=(
                    getattr(usuario, 'nombre', '')
                    or getattr(usuario, 'username', '') or str(usuario)
                )[:160],
            )
        except IntegrityError:
            return Response(
                {'detail': 'La operación ya tiene comprobante.'},
                status=status.HTTP_400_BAD_REQUEST)
        return Response(
            ComprobanteSerializer(comprobante).data,
            status=status.HTTP_201_CREATED)
