"""Vistas del módulo de clientes.

- ``GET /api/clientes/`` lista con filtros ``?activo=`` ``?categoria=``
  ``?tipo=`` ``?buscar=``. Alta/edición/baja lógica solo admin.
- ``GET /api/asociaciones/?mine=1`` devuelve los clientes del usuario
  en sesión (según su ``sub`` de Keycloak) para el selector de cliente
  activo (RF10/RF11). Sin ``mine`` lista todo (admin).
- ``GET/PUT /api/comisiones/`` y ``/api/comisiones/{categoria}/`` para
  la configuración de porcentajes por tipo de cliente (Hito 4).
"""

from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Cliente, ClienteUsuario, Comision
from .permisos import SoloAdminEscribe
from .serializers import ClienteSerializer, ClienteUsuarioSerializer, ComisionSerializer


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    permission_classes = [SoloAdminEscribe]

    def get_queryset(self):
        qs = super().get_queryset()
        activo = self.request.query_params.get('activo')
        if activo is not None:
            qs = qs.filter(activo=activo.lower() in ('1', 'true', 'si', 'sí'))
        categoria = self.request.query_params.get('categoria')
        if categoria:
            qs = qs.filter(categoria=categoria.strip().upper())
        tipo = self.request.query_params.get('tipo')
        if tipo:
            qs = qs.filter(tipo=tipo.strip().upper())
        buscar = self.request.query_params.get('buscar')
        if buscar:
            qs = qs.filter(
                Q(nombre__icontains=buscar) | Q(documento__icontains=buscar)
                | Q(email__icontains=buscar)
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        cliente = self.get_object()
        if not cliente.activo:
            return Response(
                {'detail': 'El cliente ya estaba desactivado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cliente.activo = False
        cliente.save(update_fields=['activo', 'actualizado_en'])
        return Response(self.get_serializer(cliente).data, status=status.HTTP_200_OK)


class ClienteUsuarioViewSet(viewsets.ModelViewSet):
    queryset = ClienteUsuario.objects.select_related('cliente').all()
    serializer_class = ClienteUsuarioSerializer
    permission_classes = [SoloAdminEscribe]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('mine') in ('1', 'true', 'si', 'sí'):
            sub = getattr(self.request.user, 'id', '') or ''
            qs = qs.filter(keycloak_id=sub)
        else:
            cliente = self.request.query_params.get('cliente')
            if cliente:
                qs = qs.filter(cliente_id=cliente)
        return qs


class ComisionViewSet(viewsets.ModelViewSet):
    queryset = Comision.objects.all()
    serializer_class = ComisionSerializer
    permission_classes = [SoloAdminEscribe]
    lookup_field = 'categoria'

    @action(detail=False, methods=['get'], url_path='simulador')
    def para_simulador(self, request):
        """Devuelve ``{categoria: porcentaje}`` para el simulador."""
        datos = {c.categoria: float(c.porcentaje) for c in self.get_queryset()}
        return Response(datos)
