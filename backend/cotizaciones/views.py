"""Vistas del módulo de cotizaciones.

- ``GET /api/cotizaciones/`` historial con filtros ``?moneda=USD``
  ``?desde=2026-01-01`` ``?hasta=2026-12-31`` (RF33).
- ``GET /api/cotizaciones/vigentes/`` última tasa por moneda para la
  visualización del día y el simulador (RF31).
- ``POST`` solo admin/analista; guarda el usuario creador (RNF26).
"""

from django.db.models import OuterRef, Subquery
from django.utils.dateparse import parse_date
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.models import Cliente, Comision
from monedas.models import Moneda

from .models import Cotizacion
from .permisos import SoloEditorTasasEscribe
from .serializers import CotizacionSerializer


class CotizacionViewSet(viewsets.ModelViewSet):
    queryset = Cotizacion.objects.select_related('moneda').all()
    serializer_class = CotizacionSerializer
    permission_classes = [SoloEditorTasasEscribe]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        moneda = self.request.query_params.get('moneda')
        if moneda:
            qs = qs.filter(moneda__codigo=moneda.strip().upper())
        desde = self.request.query_params.get('desde')
        if desde and parse_date(desde):
            qs = qs.filter(vigente_desde__date__gte=parse_date(desde))
        hasta = self.request.query_params.get('hasta')
        if hasta and parse_date(hasta):
            qs = qs.filter(vigente_desde__date__lte=parse_date(hasta))
        return qs

    def perform_create(self, serializer):
        usuario = getattr(self.request.user, 'username', '') or str(self.request.user)
        serializer.save(creado_por=usuario[:160])

    @action(detail=False, methods=['get'], url_path='vigentes')
    def vigentes(self, request):
        """Última cotización de cada moneda activa."""
        ultima = Cotizacion.objects.filter(moneda=OuterRef('pk')).order_by('-vigente_desde')
        monedas = Moneda.objects.filter(activo=True).annotate(
            ultima_id=Subquery(ultima.values('id')[:1]),
        )
        ids = [m.ultima_id for m in monedas if m.ultima_id]
        qs = self.get_queryset().filter(id__in=ids)
        return Response(self.get_serializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def simular(request):
    """Simula una conversión sin concretar la operación (RF22).

    Parámetros: ``?moneda=USD&monto=1000&operacion=compra&categoria=VIP``.
    - ``operacion=compra``: el cliente compra divisa (se aplica tasa venta).
    - ``operacion=venta``: el cliente vende divisa (se aplica tasa compra).
    Devuelve el desglose del cálculo exigido por RF21.
    """
    codigo = (request.query_params.get('moneda') or '').strip().upper()
    try:
        monto = float(request.query_params.get('monto') or 0)
    except ValueError:
        monto = 0
    operacion = (request.query_params.get('operacion') or 'compra').strip().lower()
    categoria = (request.query_params.get('categoria') or Cliente.CAT_MINORISTA).strip().upper()

    if not codigo or monto <= 0:
        return Response(
            {'detail': 'Indicá moneda y un monto mayor a cero.'}, status=400,
        )
    if operacion not in ('compra', 'venta'):
        return Response({'detail': 'operacion debe ser compra o venta.'}, status=400)

    try:
        moneda = Moneda.objects.get(codigo=codigo, activo=True)
    except Moneda.DoesNotExist:
        return Response({'detail': f'La moneda {codigo} no está admitida.'}, status=404)

    cot = Cotizacion.objects.filter(moneda=moneda).order_by('-vigente_desde').first()
    if not cot:
        return Response(
            {'detail': f'Todavía no hay cotización para {codigo}.'}, status=404,
        )

    tasa = float(cot.venta if operacion == 'compra' else cot.compra)
    bruto = monto * tasa
    try:
        pct = float(Comision.objects.get(categoria=categoria).porcentaje)
    except Comision.DoesNotExist:
        pct = 0.0
    comision = bruto * pct / 100
    return Response({
        'moneda': moneda.codigo,
        'operacion': operacion,
        'monto_origen': monto,
        'tasa_aplicada': tasa,
        'monto_bruto_pyg': round(bruto, 2),
        'categoria': categoria,
        'comision_porcentaje': pct,
        'comision_pyg': round(comision, 2),
        'monto_neto_pyg': round(bruto - comision, 2),
        'vigente_desde': cot.vigente_desde,
    })
