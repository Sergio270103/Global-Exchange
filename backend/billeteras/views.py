"""Vistas del módulo de billeteras (PI-66).

- ``GET /api/billeteras/?cliente=`` saldos por moneda (RF17). Al pedir
  un cliente, las billeteras de sus monedas activas se crean en cero
  de forma perezosa (RF15). Solo lectura.
- CRUD ``/api/medios-acreditacion/`` del medio de acreditación
  (guía Hito 5). Al marcar uno como defecto se desmarcan los demás
  del mismo cliente.
"""

from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.models import Cliente
from monedas.models import Moneda

from .models import Billetera, MedioAcreditacion
from .serializers import BilleteraSerializer, MedioAcreditacionSerializer


class BilleteraViewSet(viewsets.ModelViewSet):
    queryset = Billetera.objects.select_related('cliente', 'moneda').all()
    serializer_class = BilleteraSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        cliente_id = self.request.query_params.get('cliente')
        if cliente_id:
            try:
                cliente = Cliente.objects.get(pk=cliente_id)
            except (Cliente.DoesNotExist, ValueError):
                return qs.none()
            for moneda in Moneda.objects.filter(activo=True):
                Billetera.objects.get_or_create(cliente=cliente, moneda=moneda)
            qs = qs.filter(cliente_id=cliente.pk)
        return qs


class MedioAcreditacionViewSet(viewsets.ModelViewSet):
    queryset = MedioAcreditacion.objects.select_related(
        'cliente', 'billetera__moneda', 'cuenta').all()
    serializer_class = MedioAcreditacionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        cliente_id = self.request.query_params.get('cliente')
        if cliente_id:
            qs = qs.filter(cliente_id=cliente_id)
        return qs

    def perform_create(self, serializer):
        medio = serializer.save()
        if medio.es_default:
            MedioAcreditacion.objects.filter(
                cliente=medio.cliente).exclude(pk=medio.pk).update(es_default=False)

    def perform_update(self, serializer):
        medio = serializer.save()
        if medio.es_default:
            MedioAcreditacion.objects.filter(
                cliente=medio.cliente).exclude(pk=medio.pk).update(es_default=False)

    def destroy(self, request, *args, **kwargs):
        medio = self.get_object()
        if medio.es_default and MedioAcreditacion.objects.filter(
                cliente=medio.cliente).exclude(pk=medio.pk).exists():
            return Response(
                {'detail': 'Marcá otro medio como defecto antes de eliminar este.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
