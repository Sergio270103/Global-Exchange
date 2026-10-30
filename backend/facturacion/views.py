"""Vistas de facturación electrónica (PI-30).

- ``POST /api/facturas/ {operacion, email}``: emite la factura de una
  operación PAGADA (acción explícita "Emitir factura"). 201 con la
  factura (``EMITIDA``, o ``VERIFICAR`` si no hubo respuesta); 400 si no
  se puede emitir o Factura Segura la rechazó (se guarda igual con
  estado ``ERROR`` y la respuesta del servicio).
- ``GET /api/facturas/`` y ``GET /api/facturas/<id>/``: listado y detalle.
- ``POST /api/facturas/<id>/estado/``: consulta ``get_estado_sifen`` y
  actualiza (aprobada → registra el envío al correo del cliente).
- ``GET /api/facturas/<id>/kude/`` y ``GET /api/facturas/<id>/xml/``: el
  PDF oficial (KuDE) y el XML firmado de una factura real aprobada,
  descargados de Factura Segura (PI-86). El token nunca llega al navegador.
- ``GET /api/facturas/uso/?operacion=<id>``: "emisiones usadas X de N",
  el correo del cliente para precargar y la última factura de la operación.
"""

from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.permisos import es_cajero
from monedas.permisos import es_admin
from operaciones.models import Operacion

from . import cliente_fs, servicios
from .models import EventoSIFEN, FacturaElectronica, NotaCreditoElectronica
from .serializers import (
    EventoSIFENSerializer,
    FacturaElectronicaSerializer,
    NotaCreditoElectronicaSerializer,
)


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


def _puede_gestionar(usuario, factura: FacturaElectronica) -> bool:
    """Anular/inutilizar/acreditar: admin o el cajero que emitió la factura."""
    if getattr(usuario, 'is_superuser', False) or es_admin(usuario):
        return True
    if not es_cajero(usuario):
        return False
    # Solo el cajero que emitió la factura. Las facturas históricas sin
    # emisor registrado quedan reservadas al administrador.
    return bool(factura.emitida_por_sub) and factura.emitida_por_sub == _sub(usuario)


class FacturaElectronicaViewSet(viewsets.ModelViewSet):
    serializer_class = FacturaElectronicaSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = FacturaElectronica.objects.select_related(
            'operacion', 'operacion__cliente').prefetch_related(
            'eventos', 'notas_credito').all()
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

    def list(self, request, *args, **kwargs):
        for factura in self.filter_queryset(self.get_queryset()):
            servicios.sincronizar_gestion(factura)
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=['get'], url_path='gestion/estado')
    def gestion_estado(self, request, pk=None):
        factura = servicios.sincronizar_gestion(self.get_object())
        return Response(self.get_serializer(factura).data)

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

    # ------------------------------------------------ gestión SIFEN --

    def _datos_gestion(self, factura, evento) -> dict:
        return {
            'factura': FacturaElectronicaSerializer(factura).data,
            'evento': EventoSIFENSerializer(evento).data,
        }

    @action(detail=True, methods=['post'], url_path='cancelar')
    def cancelar(self, request, pk=None):
        """Solicita la cancelación de una factura aprobada."""
        factura = self.get_object()
        if not _puede_gestionar(request.user, factura):
            return Response(
                {'detail': 'Solo el administrador o el cajero que emitió la '
                           'factura pueden anularla.'},
                status=status.HTTP_403_FORBIDDEN)
        try:
            evento = servicios.anular_factura(
                factura, request.data.get('motivo', ''),
                usuario_sub=_sub(request.user),
                usuario_nombre=_nombre(request.user))
        except servicios.GestionRechazada as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        datos = self._datos_gestion(factura, evento)
        if evento.estado == EventoSIFEN.ESTADO_ERROR:
            datos['detail'] = evento.detalle or 'Factura Segura rechazó la cancelación.'
            return Response(datos, status=status.HTTP_400_BAD_REQUEST)
        return Response(datos, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'], url_path='cancelacion/estado')
    def cancelacion_estado(self, request, pk=None):
        """Consulta el estado de la última cancelación de la factura."""
        factura = self.get_object()
        if not _puede_gestionar(request.user, factura):
            return Response(
                {'detail': 'No podés consultar la cancelación de esta factura.'},
                status=status.HTTP_403_FORBIDDEN)
        try:
            evento = servicios.actualizar_evento(
                factura, EventoSIFEN.TIPO_CANCELACION)
        except servicios.GestionRechazada as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(self._datos_gestion(factura, evento))

    @action(detail=True, methods=['post'], url_path='inutilizar')
    def inutilizar(self, request, pk=None):
        """Solicita la inutilización de un número no aprobado."""
        factura = self.get_object()
        if not _puede_gestionar(request.user, factura):
            return Response(
                {'detail': 'Solo el administrador o el cajero que emitió la '
                           'factura pueden inutilizarla.'},
                status=status.HTTP_403_FORBIDDEN)
        try:
            evento = servicios.inutilizar_factura(
                factura, request.data.get('motivo', ''),
                usuario_sub=_sub(request.user),
                usuario_nombre=_nombre(request.user))
        except servicios.GestionRechazada as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        datos = self._datos_gestion(factura, evento)
        if evento.estado == EventoSIFEN.ESTADO_ERROR:
            datos['detail'] = evento.detalle or 'Factura Segura rechazó la inutilización.'
            return Response(datos, status=status.HTTP_400_BAD_REQUEST)
        return Response(datos, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'], url_path='inutilizacion/estado')
    def inutilizacion_estado(self, request, pk=None):
        """Consulta el estado de la última inutilización de la factura."""
        factura = self.get_object()
        if not _puede_gestionar(request.user, factura):
            return Response(
                {'detail': 'No podés consultar la inutilización de esta factura.'},
                status=status.HTTP_403_FORBIDDEN)
        try:
            evento = servicios.actualizar_evento(
                factura, EventoSIFEN.TIPO_INUTILIZACION)
        except servicios.GestionRechazada as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(self._datos_gestion(factura, evento))

    @action(detail=True, methods=['post'], url_path='nota-credito')
    def nota_credito(self, request, pk=None):
        """Emite una nota de crédito total de la factura."""
        factura = self.get_object()
        if not _puede_gestionar(request.user, factura):
            return Response(
                {'detail': 'Solo el administrador o el cajero que emitió la '
                           'factura pueden acreditarla.'},
                status=status.HTTP_403_FORBIDDEN)
        try:
            nota = servicios.emitir_nota_credito(
                factura, '5', factura.email_destino,
                usuario_sub=_sub(request.user),
                usuario_nombre=_nombre(request.user))
        except servicios.GestionRechazada as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        datos = NotaCreditoElectronicaSerializer(nota).data
        if nota.estado == NotaCreditoElectronica.ESTADO_ERROR:
            return Response(
                {'detail': nota.detalle or 'Factura Segura rechazó la nota de crédito.',
                 'nota': datos},
                status=status.HTTP_400_BAD_REQUEST)
        return Response(datos, status=status.HTTP_201_CREATED)

    def _descargar(self, operation: str, extension: str):
        factura = self.get_object()
        if operation == 'dwn_kude' and factura.estado in ('ANULADA', 'DEVUELTA'):
            if factura.pdf_pendiente or not servicios.ruta_pdf(factura).exists():
                return Response({'detail': 'PDF pendiente de actualización.'}, status=409)
            from django.http import FileResponse
            return FileResponse(servicios.ruta_pdf(factura).open('rb'), content_type='application/pdf', as_attachment=True, filename=f'{factura.numero_completo}.pdf')
        if factura.estado != FacturaElectronica.ESTADO_APROBADA:
            return Response(
                {'detail': 'Solo se descargan facturas aprobadas por SIFEN.'},
                status=status.HTTP_400_BAD_REQUEST)
        if factura.simulada or not factura.cdc:
            return Response(
                {'detail': 'Es una factura simulada: no tiene documento oficial.'},
                status=status.HTTP_400_BAD_REQUEST)
        ruc = cliente_fs.config()['EMISOR'].get('dRucEm', '')
        try:
            contenido = cliente_fs.descargar(operation, ruc, factura.cdc)
        except cliente_fs.ErrorFacturaSegura as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except cliente_fs.SinRespuesta as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        tipo, _ = cliente_fs.DESCARGAS[operation]
        nombre = (factura.numero_completo or factura.cdc) + extension
        resp = HttpResponse(contenido, content_type=tipo)
        resp['Content-Disposition'] = f'attachment; filename="{nombre}"'
        return resp

    @action(detail=True, methods=['get'], url_path='kude')
    def kude(self, request, pk=None):
        return self._descargar('dwn_kude', '.pdf')

    @action(detail=True, methods=['get'], url_path='xml')
    def xml(self, request, pk=None):
        return self._descargar('dwn_xml', '.xml')

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


class NotaCreditoElectronicaViewSet(viewsets.ReadOnlyModelViewSet):
    """Listado y consulta de notas de crédito electrónicas.

    La emisión se hace desde ``POST /api/facturas/{id}/nota-credito/`` para
    que quede atada a la factura; este ViewSet expone la consulta global,
    el estado en SIFEN y las descargas oficiales.
    """

    serializer_class = NotaCreditoElectronicaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = NotaCreditoElectronica.objects.select_related(
            'factura', 'factura__operacion',
            'factura__operacion__cliente').all()
        factura = self.request.query_params.get('factura')
        if factura and str(factura).isdigit():
            qs = qs.filter(factura_id=int(factura))
        usuario = self.request.user
        sub = _sub(usuario)
        if getattr(usuario, 'is_superuser', False) or es_admin(usuario):
            return qs
        if es_cajero(usuario):
            return qs.filter(
                Q(factura__emitida_por_sub=sub)
                | Q(emitida_por_sub=sub)
                | Q(factura__operacion__usuario_keycloak_id=sub)
                | Q(factura__operacion__cliente_id__in=_clientes_del_sub(sub)))
        return qs.filter(
            Q(factura__operacion__usuario_keycloak_id=sub)
            | Q(factura__operacion__cliente_id__in=_clientes_del_sub(sub)))

    @action(detail=True, methods=['post'], url_path='estado')
    def estado(self, request, pk=None):
        nota = self.get_object()
        if not _puede_gestionar(request.user, nota.factura):
            return Response(
                {'detail': 'No podés consultar esta nota de crédito.'},
                status=status.HTTP_403_FORBIDDEN)
        try:
            nota = servicios.actualizar_estado_nc(nota)
        except servicios.GestionRechazada as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(NotaCreditoElectronicaSerializer(nota).data)

    def _descargar(self, operation: str, extension: str):
        nota = self.get_object()
        if nota.estado != NotaCreditoElectronica.ESTADO_APROBADA:
            return Response(
                {'detail': 'Solo se descargan notas de crédito aprobadas por SIFEN.'},
                status=status.HTTP_400_BAD_REQUEST)
        if nota.simulada or not nota.cdc:
            return Response(
                {'detail': 'Es una nota de crédito simulada: no tiene documento oficial.'},
                status=status.HTTP_400_BAD_REQUEST)
        ruc = cliente_fs.config()['EMISOR'].get('dRucEm', '')
        try:
            contenido = cliente_fs.descargar(operation, ruc, nota.cdc)
        except cliente_fs.ErrorFacturaSegura as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        except cliente_fs.SinRespuesta as exc:
            return Response({'detail': str(exc)},
                            status=status.HTTP_502_BAD_GATEWAY)
        tipo, _ = cliente_fs.DESCARGAS[operation]
        nombre = (nota.numero_completo or nota.cdc) + extension
        resp = HttpResponse(contenido, content_type=tipo)
        resp['Content-Disposition'] = f'attachment; filename="{nombre}"'
        return resp

    @action(detail=True, methods=['get'], url_path='kude')
    def kude(self, request, pk=None):
        return self._descargar('dwn_kude', '.pdf')

    @action(detail=True, methods=['get'], url_path='xml')
    def xml(self, request, pk=None):
        return self._descargar('dwn_xml', '.xml')
