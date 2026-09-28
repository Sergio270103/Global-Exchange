"""Vistas del módulo de cotizaciones.

- ``GET /api/cotizaciones/`` historial con filtros ``?moneda=USD``
  ``?desde=2026-01-01`` ``?hasta=2026-12-31`` (RF33).
- ``GET /api/cotizaciones/vigentes/`` última tasa por moneda para la
  visualización del día y el simulador (RF31).
- ``POST`` solo admin/analista; guarda el usuario creador (RNF26).
"""

from decimal import Decimal

from django.db.models import OuterRef, Subquery
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.models import Cliente, ClienteUsuario, Comision
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
    """Simula una conversión y devuelve únicamente el precio final.

    El ajuste interno por categoría se aplica para calcular el total, pero no
    se devuelve su porcentaje ni su monto: el cliente ve la tasa y el total
    final de la operación.

    Parámetros:
    ``?moneda=USD&moneda_contraparte=PYG&monto=1000&operacion=compra&cliente=1``.
    """
    codigo_div = (request.query_params.get('moneda') or '').strip().upper()
    codigo_contra = (
        request.query_params.get('moneda_contraparte') or 'PYG'
    ).strip().upper()
    try:
        monto = Decimal(str(request.query_params.get('monto') or 0))
    except (TypeError, ValueError):
        monto = Decimal('0')
    operacion = (request.query_params.get('operacion') or 'compra').strip().lower()
    cliente_id = request.query_params.get('cliente')

    if not codigo_div or monto <= 0:
        return Response(
            {'detail': 'Indicá moneda y un monto mayor a cero.'}, status=400,
        )
    if codigo_div == codigo_contra:
        return Response(
            {'detail': 'La moneda origen y destino deben ser distintas.'}, status=400,
        )
    if operacion not in ('compra', 'venta'):
        return Response({'detail': 'operacion debe ser compra o venta.'}, status=400)
    if not cliente_id:
        return Response(
            {'detail': 'Seleccioná un cliente para simular la operación.'}, status=400,
        )

    try:
        cliente = Cliente.objects.get(pk=cliente_id, activo=True)
    except (Cliente.DoesNotExist, ValueError, TypeError):
        return Response({'detail': 'El cliente no está disponible.'}, status=400)

    sub = getattr(request.user, 'id', '') or ''
    if not ClienteUsuario.objects.filter(cliente=cliente, keycloak_id=sub).exists():
        return Response(
            {'detail': 'El usuario no está asociado a este cliente.'}, status=403,
        )
    categoria = cliente.categoria
    try:
        pct = Decimal(str(Comision.objects.get(categoria=categoria).porcentaje))
    except Comision.DoesNotExist:
        pct = Decimal('0')

    # La misma rutina que usa POST /operaciones/ evita que el precio que ve
    # el cliente difiera del precio que finalmente se congela.
    from operaciones.views import ErrorCotizacion, _cotizar

    try:
        calculo = _cotizar(
            operacion.upper(), codigo_div, codigo_contra, monto, pct,
        )
    except ErrorCotizacion as err:
        return Response({'detail': str(err)}, status=400)

    if operacion == 'compra':
        monto_final = calculo['monto_enviado']
        tipo_total = 'pagar'
    else:
        monto_final = calculo['monto_recibido']
        tipo_total = 'recibir'

    tasa_final = (monto_final / monto).quantize(Decimal('0.000001'))
    ultima = Cotizacion.objects.filter(
        moneda__in=[calculo['moneda_origen'], calculo['moneda_destino']],
    ).order_by('-vigente_desde').first()

    return Response({
        'moneda': codigo_div,
        'moneda_contraparte': codigo_contra,
        'operacion': operacion,
        'monto_origen': float(monto),
        'tasa_aplicada': float(tasa_final),
        'monto_total': float(monto_final),
        'total_tipo': tipo_total,
        'vigente_desde': (
            ultima.vigente_desde if ultima is not None else timezone.now()
        ),
    })
