"""Vistas de facturación electrónica (PI-30).

- ``POST /api/facturas/ {operacion, email}``: emite la factura de una
  operación PAGADA (acción explícita "Emitir factura"). 201 con la
  factura (``EMITIDA``, o ``VERIFICAR`` si no hubo respuesta); 400 si no
  se puede emitir o Factura Segura la rechazó (se guarda igual con
  estado ``ERROR`` y la respuesta del servicio).
- ``GET /api/facturas/`` y ``GET /api/facturas/<id>/``: listado y detalle.
- ``POST /api/facturas/<id>/estado/``: consulta ``get_estado_sifen`` y
  actualiza (aprobada → registra el envío al correo del cliente).
- ``GET /api/facturas/uso/?operacion=<id>``: "emisiones usadas X de N",
  el correo del cliente para precargar y la última factura de la operación.
"""

from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.permisos import es_cajero
from monedas.permisos import es_admin
from operaciones.models import Operacion

from . import cliente_fs, servicios
from .models import FacturaElectronica
from .serializers import FacturaElectronicaSerializer


def _sub(usuario) -> str:
    return getattr(usuario, 'id', '') or ''


def _nombre(usuario) -> str:
    return (getattr(usuario, 'nombre', '') or getattr(usuario, 'username', '')
            or str(usuario))


def _clientes_del_sub(sub: str):
    from clientes.models import ClienteUsuario
    return ClienteUsuario.objects.filter(
        keycloak_id=sub).values_list('cliente_id', flat=True)


def _puede_facturar(usuario, op: Operacion) -> bool:
    sub = _sub(usuario)
    return bool(
        getattr(usuario, 'is_superuser', False) or es_admin(usuario)
        or es_cajero(usuario)
        or op.usuario_keycloak_id == sub
        or op.cliente_id in _clientes_del_sub(sub)
    )


class FacturaElectronicaViewSet(viewsets.ModelViewSet):
    serializer_class = FacturaElectronicaSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = FacturaElectronica.objects.select_related(
            'operacion', 'operacion__cliente').all()
        usuario = self.request.user
        sub = _sub(usuario)
        operacion = self.request.query_params.get('operacion')
        if operacion and str(operacion).isdigit():
            qs = qs.filter(operacion_id=int(operacion))
        if getattr(usuario, 'is_superuser', False) or es_admin(usuario):
            return qs
        if es_cajero(usuario):
            return qs.filter(
                Q(emitida_por_sub=sub)
                | Q(operacion__usuario_keycloak_id=sub)
                | Q(operacion__cliente_id__in=_clientes_del_sub(sub)))
        return qs.filter(
            Q(operacion__usuario_keycloak_id=sub)
            | Q(operacion__cliente_id__in=_clientes_del_sub(sub)))

    def create(self, request, *args, **kwargs):
        try:
            operacion_id = int(request.data.get('operacion'))
        except (TypeError, ValueError):
            return Response({'detail': 'Indicá la operación.'},
                            status=status.HTTP_400_BAD_REQUEST)
        op = Operacion.objects.filter(pk=operacion_id).first()
        if op is None:
            return Response({'detail': 'La operación no existe.'},
                            status=status.HTTP_404_NOT_FOUND)
        if not _puede_facturar(request.user, op):
            return Response({'detail': 'No podés facturar esta operación.'},
                            status=status.HTTP_403_FORBIDDEN)
        try:
            factura = servicios.emitir_factura(
                operacion_id, request.data.get('email', ''),
                usuario_sub=_sub(request.user),
                usuario_nombre=_nombre(request.user))
        except servicios.EmisionRechazada as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        datos = FacturaElectronicaSerializer(factura).data
        if factura.estado == FacturaElectronica.ESTADO_ERROR:
            return Response(
                {'detail': factura.detalle or 'Factura Segura rechazó la factura.',
                 'factura': datos},
                status=status.HTTP_400_BAD_REQUEST)
        return Response(datos, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='estado')
    def estado(self, request, pk=None):
        factura = self.get_object()
        try:
            factura = servicios.actualizar_estado(factura)
        except servicios.EmisionRechazada as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(FacturaElectronicaSerializer(factura).data)

    @action(detail=False, methods=['get'], url_path='uso')
    def uso(self, request):
        datos = servicios.uso()
        operacion = request.query_params.get('operacion')
        if operacion and str(operacion).isdigit():
            op = Operacion.objects.select_related('cliente').filter(
                pk=int(operacion)).first()
            if op is not None and _puede_facturar(request.user, op):
                ultima = FacturaElectronica.objects.filter(
                    operacion=op, simulada=cliente_fs.modo_simulado()).first()
                datos.update({
                    'operacion': op.pk,
                    'operacion_estado': op.estado,
                    'email_cliente': op.cliente.email,
                    'factura': (FacturaElectronicaSerializer(ultima).data
                                if ultima else None),
                })
        return Response(datos)
