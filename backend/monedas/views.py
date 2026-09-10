"""
Vistas del módulo de monedas.

Expone el CRUD completo sobre :class:`~monedas.models.Moneda`. Las
operaciones de escritura requieren rol de administrador; el resto de los
usuarios autenticados solo puede listar las monedas activas.
"""

from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Moneda
from .permisos import SoloAdminEscribe, es_admin
from .serializers import EstadoMonedaSerializer, MonedaSerializer


class MonedaViewSet(viewsets.ModelViewSet):
    """CRUD de monedas.

    Rutas generadas por el router:

    * ``GET    /api/monedas/``            lista (filtros ``?activo=`` y ``?buscar=``)
    * ``POST   /api/monedas/``            alta
    * ``GET    /api/monedas/{id}/``       detalle
    * ``PUT    /api/monedas/{id}/``       reemplazo completo
    * ``PATCH  /api/monedas/{id}/``       edición parcial
    * ``DELETE /api/monedas/{id}/``       baja lógica
    * ``PATCH  /api/monedas/{id}/estado/`` activar o desactivar
    """

    queryset = Moneda.objects.all()
    serializer_class = MonedaSerializer
    permission_classes = [SoloAdminEscribe]

    def get_queryset(self):
        qs = super().get_queryset()

        # Quien no es administrador solo ve el catálogo vigente.
        if not es_admin(self.request.user):
            return qs.filter(activo=True)

        activo = self.request.query_params.get('activo')
        if activo is not None:
            qs = qs.filter(activo=activo.lower() in ('1', 'true', 'si', 'sí'))

        buscar = self.request.query_params.get('buscar')
        if buscar:
            qs = qs.filter(Q(codigo__icontains=buscar) | Q(nombre__icontains=buscar))

        return qs

    def destroy(self, request, *args, **kwargs):
        """Da de baja la moneda de forma lógica.

        No se borra el registro para no romper el histórico de tasas y
        transacciones que la referencian.
        """
        moneda = self.get_object()
        if not moneda.activo:
            return Response(
                {'detail': 'La moneda ya estaba desactivada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        moneda.activo = False
        moneda.save(update_fields=['activo', 'actualizado_en'])
        return Response(self.get_serializer(moneda).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['patch'], url_path='estado')
    def estado(self, request, pk=None):
        """Activa o desactiva la moneda. Cuerpo: ``{"activo": true|false}``."""
        moneda = self.get_object()
        entrada = EstadoMonedaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        moneda.activo = entrada.validated_data['activo']
        moneda.save(update_fields=['activo', 'actualizado_en'])
        return Response(self.get_serializer(moneda).data)