"""Vistas del módulo de pagos.

- ``/api/metodos-pago/`` catálogo global; escritura solo admin (RF42).
- ``/api/cuentas-bancarias/`` cuentas del cliente; cualquier usuario
  autenticado opera (filtros ``?cliente=`` ``?activa=`` ``?buscar=``);
  la baja es lógica. El Nº de cuenta nunca se expone en claro.
"""

from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.permisos import SoloAdminEscribe

from .models import CuentaBancaria, MetodoPago
from .serializers import CuentaBancariaSerializer, MetodoPagoSerializer


class MetodoPagoViewSet(viewsets.ModelViewSet):
    queryset = MetodoPago.objects.all()
    serializer_class = MetodoPagoSerializer
    permission_classes = [SoloAdminEscribe]

    def get_queryset(self):
        from monedas.permisos import es_admin

        qs = super().get_queryset()
        if not es_admin(self.request.user):
            return qs.filter(activo=True)
        activo = self.request.query_params.get('activo')
        if activo is not None:
            qs = qs.filter(activo=activo.lower() in ('1', 'true', 'si', 'sí'))
        return qs

    def destroy(self, request, *args, **kwargs):
        metodo = self.get_object()
        metodo.activo = False
        metodo.save(update_fields=['activo', 'actualizado_en'])
        return Response(self.get_serializer(metodo).data, status=status.HTTP_200_OK)


class CuentaBancariaViewSet(viewsets.ModelViewSet):
    queryset = CuentaBancaria.objects.select_related('cliente', 'moneda').all()
    serializer_class = CuentaBancariaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        cliente = self.request.query_params.get('cliente')
        if cliente:
            qs = qs.filter(cliente_id=cliente)
        activa = self.request.query_params.get('activa')
        if activa is not None:
            qs = qs.filter(activa=activa.lower() in ('1', 'true', 'si', 'sí'))
        buscar = self.request.query_params.get('buscar')
        if buscar:
            qs = qs.filter(Q(banco__icontains=buscar) | Q(cliente__nombre__icontains=buscar))
        return qs

    def destroy(self, request, *args, **kwargs):
        cuenta = self.get_object()
        if not cuenta.activa:
            return Response(
                {'detail': 'La cuenta ya estaba desactivada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cuenta.activa = False
        cuenta.save(update_fields=['activa', 'actualizado_en'])
        return Response(self.get_serializer(cuenta).data, status=status.HTTP_200_OK)
