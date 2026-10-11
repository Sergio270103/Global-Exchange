"""Vistas del módulo de clientes.

- ``GET /api/clientes/`` lista con filtros ``?activo=`` ``?categoria=``
  ``?tipo=`` ``?buscar=`` ``?documento=``. Alta/edición/baja lógica solo admin.
- PI-45 (cajero presencial): ``GET /api/clientes/buscar-documento/``
  busca por documento y ``POST /api/clientes/presencial/`` registra al
  cliente. Ambos exclusivos de cajero o administrador.
- ``GET /api/asociaciones/?mine=1`` devuelve los clientes del usuario
  en sesión (según su ``sub`` de Keycloak) para el selector de cliente
  activo (RF10/RF11). Sin ``mine`` lista todo (admin).
- ``GET/PUT /api/ajustes-precios/`` para la configuración interna de
  porcentajes por tipo de cliente (Hito 4). Solo administradores.
"""

from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Cliente, ClienteUsuario, Comision
from .permisos import CajeroOAdmin, SoloAdmin, SoloAdminEscribe
from .serializers import (
    AjustePrecioSerializer,
    ClientePresencialSerializer,
    ClienteSerializer,
    ClienteUsuarioSerializer,
)


class ClienteViewSet(viewsets.ModelViewSet):
    """CRUD completo sobre clientes.

    Solo administrador puede crear, editar y dar de baja.
    El cajero tiene acceso restringido a ``buscar-documento`` y ``presencial``.

    Rutas generadas por el router:

    * ``GET    /api/clientes/``        lista con filtros opcionales
    * ``POST   /api/clientes/``        alta (admin solo)
    * ``GET    /api/clientes/{id}/``   detalle
    * ``PUT    /api/clientes/{id}/``   reemplazo completo
    * ``PATCH  /api/clientes/{id}/``   edición parcial
    * ``DELETE /api/clientes/{id}/``   baja lógica (admin solo)
    * ``GET    /api/clientes/buscar-documento/`` busca por documento (cajero/admin)
    * ``POST   /api/clientes/presencial/`` registra cliente presencial (cajero/admin)
    """

    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    permission_classes = [SoloAdminEscribe]

    #: El cajero solo puede usar la búsqueda y el alta presencial (PI-45).
    ACCIONES_CAJERO = ('buscar_documento', 'presencial')

    def get_permissions(self):
        if self.action in self.ACCIONES_CAJERO:
            return [CajeroOAdmin()]
        return super().get_permissions()

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
        documento = self.request.query_params.get('documento')
        if documento:
            qs = qs.filter(documento__iexact=documento.strip())
        return qs

    @action(detail=False, methods=['get'], url_path='buscar-documento')
    def buscar_documento(self, request):
        """Busca un cliente por documento de identidad (PI-45).

        Devuelve ``{"encontrado": bool, "cliente": {...} | null}`` para que
        el cajero distinguishas de forma explícita entre "no existe" y "hay
        uno inactivo", sin romper la forma de la respuesta.
        """
        documento = (request.query_params.get('documento') or '').strip()
        if not documento:
            return Response(
                {'detail': 'Indicá el número de documento.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cliente = self.get_queryset().filter(documento__iexact=documento).first()
        return Response({
            'encontrado': cliente is not None,
            'cliente': ClienteSerializer(cliente).data if cliente else None,
        })

    @action(detail=False, methods=['post'], url_path='presencial')
    def presencial(self, request):
        """Registra un cliente presencial y lo devuelve ya creado (PI-45).

        Lo usa el cajero, que no tiene el permiso de alta del catálogo
        administrativo. La unicidad del documento se valida en el
        serializer; ``IntegrityError`` queda como red de seguridad ante
        dos cajeros registrando a la vez.
        """
        entrada = ClientePresencialSerializer(data=request.data)
        if not entrada.is_valid():
            return Response(entrada.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                cliente = entrada.save(activo=True)
        except IntegrityError:
            return Response(
                {'detail': 'Ya existe un cliente registrado con este documento.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            ClientePresencialSerializer(cliente).data,
            status=status.HTTP_201_CREATED,
        )

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
    """Gestión de asociaciones Keycloak con clientes.

    Cada usuario de Keycloak puede estar asociado a uno o más clientes.
    El queryset se puede filtrar por ``?cliente=`` o por ``?mine=1`` para
    ver solo las asociaciones del usuario actual.
    """

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


class AjustePrecioViewSet(viewsets.ModelViewSet):
    """CRUD interno de ajustes de precio por categoría.

    El endpoint es solo para administradores: el cliente recibe el precio
    final ya calculado y nunca consulta estos porcentajes.
    """

    queryset = Comision.objects.all()
    serializer_class = AjustePrecioSerializer
    permission_classes = [SoloAdmin]
    lookup_field = 'categoria'

    @action(detail=False, methods=['get'], url_path='simulador')
    def para_simulador(self, request):
        """Devuelve ``{categoria: porcentaje}`` al panel de administración."""
        datos = {c.categoria: float(c.porcentaje) for c in self.get_queryset()}
        return Response(datos)


# Alias para imports históricos durante la transición.
ComisionViewSet = AjustePrecioViewSet