"""Vistas del módulo de control de cajas (PI-44).

- ``GET /api/cajas/`` cajas activas (``?todas=1`` incluye inactivas).
  Alta y edición solo admin.
- ``GET /api/cajas/{id}/saldo/`` billetes por divisa y denominación,
  con el total por moneda (RF56).
- ``GET|POST /api/cajas/{id}/movimientos/`` historial y registro de
  ingresos, entregas y retiros; el saldo se actualiza en el mismo paso
  (RF58). Filtros ``?moneda=`` (código o id) y ``?tipo=``.
- ``GET|POST /api/cajas/{id}/arqueos/`` registro de auditoría del
  estado de caja para cierres de turno y arqueos.
- ``GET /api/denominaciones/?moneda=`` catálogo de billetes; escritura
  solo admin.

Movimientos y arqueos no tienen endpoints de edición ni borrado.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from monedas.permisos import es_admin

from .models import ArqueoCaja, Caja, Denominacion, MovimientoCaja
from .permisos import PersonalCaja
from .serializers import (
    ArqueoSerializer, CajaSerializer, DenominacionSerializer,
    MovimientoSerializer, NuevoArqueoSerializer, NuevoMovimientoSerializer,
)
from .servicios import registrar_arqueo, registrar_movimiento, saldo_por_moneda

#: Cuántos movimientos o arqueos devuelve el historial por defecto.
LIMITE_HISTORIAL = 50


def _usuario(request) -> tuple[str, str]:
    usuario = request.user
    sub = str(getattr(usuario, 'id', '') or '')
    nombre = (getattr(usuario, 'nombre', '') or getattr(usuario, 'username', '')
              or str(usuario))
    return sub, nombre


def _mensaje(exc: DjangoValidationError) -> str:
    return ' '.join(exc.messages)


def _limite(request) -> int:
    try:
        return max(1, min(int(request.query_params.get('limite', LIMITE_HISTORIAL)), 500))
    except ValueError:
        return LIMITE_HISTORIAL


class CajaViewSet(viewsets.ModelViewSet):
    queryset = Caja.objects.all()
    serializer_class = CajaSerializer
    permission_classes = [PersonalCaja]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'list' and self.request.query_params.get('todas') != '1':
            qs = qs.filter(activa=True)
        return qs

    @action(detail=True, methods=['get'])
    def saldo(self, request, pk=None):
        caja = self.get_object()
        return Response({
            'caja': caja.pk,
            'caja_nombre': str(caja),
            'monedas': saldo_por_moneda(caja),
        })

    @action(detail=True, methods=['get', 'post'])
    def movimientos(self, request, pk=None):
        caja = self.get_object()
        if request.method == 'GET':
            qs = (MovimientoCaja.objects.filter(caja=caja)
                  .select_related('moneda', 'caja')
                  .prefetch_related('detalle__denominacion'))
            moneda = request.query_params.get('moneda')
            if moneda:
                qs = qs.filter(moneda__pk=moneda) if moneda.isdigit() else qs.filter(
                    moneda__codigo__iexact=moneda)
            tipo = request.query_params.get('tipo')
            if tipo:
                qs = qs.filter(tipo=tipo.upper())
            return Response(MovimientoSerializer(qs[:_limite(request)], many=True).data)

        entrada = NuevoMovimientoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        if datos['tipo'] == MovimientoCaja.TIPO_ENTREGA and not es_admin(request.user):
            raise PermissionDenied('Solo un administrador registra entregas de billetes.')
        sub, nombre = _usuario(request)
        try:
            movimiento = registrar_movimiento(
                caja=caja, tipo=datos['tipo'], moneda=datos['moneda'],
                detalle=[(l['denominacion'], l['cantidad']) for l in datos['detalle']],
                usuario_id=sub, usuario_nombre=nombre,
                observacion=datos['observacion'],
            )
        except DjangoValidationError as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'movimiento': MovimientoSerializer(movimiento).data,
            'monedas': saldo_por_moneda(caja),
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'])
    def arqueos(self, request, pk=None):
        caja = self.get_object()
        if request.method == 'GET':
            qs = (ArqueoCaja.objects.filter(caja=caja)
                  .select_related('caja')
                  .prefetch_related('detalle__denominacion__moneda'))
            return Response(ArqueoSerializer(qs[:_limite(request)], many=True).data)

        entrada = NuevoArqueoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        sub, nombre = _usuario(request)
        try:
            arqueo = registrar_arqueo(
                caja=caja,
                conteo={l['denominacion'].pk: l['cantidad'] for l in datos['conteo']},
                usuario_id=sub, usuario_nombre=nombre,
                observacion=datos['observacion'],
            )
        except DjangoValidationError as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ArqueoSerializer(arqueo).data, status=status.HTTP_201_CREATED)


class DenominacionViewSet(viewsets.ModelViewSet):
    queryset = Denominacion.objects.select_related('moneda').all()
    serializer_class = DenominacionSerializer
    permission_classes = [PersonalCaja]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        moneda = self.request.query_params.get('moneda')
        if moneda:
            qs = qs.filter(moneda__pk=moneda) if moneda.isdigit() else qs.filter(
                moneda__codigo__iexact=moneda)
        return qs
