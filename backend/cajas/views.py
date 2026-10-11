"""Vistas del módulo de control de cajas (PI-44, PI-43, PI-78).

- ``GET /api/cajas/`` cajas activas (``?todas=1`` incluye inactivas).
  Alta y edición solo admin.
- ``GET /api/cajas/{id}/saldo/`` saldo de la caja por divisa (RF56; PI-78:
  por total, sin detalle de billetes).
- ``GET|POST /api/cajas/{id}/movimientos/`` historial y registro de ingresos y
  retiros por monto; el saldo se actualiza en el mismo paso (RF58). Filtros
  ``?moneda=`` (código o id) y ``?tipo=``.
- ``GET|POST /api/cajas/{id}/arqueos/`` recuento de la caja: total según
  sistema vs. total contado de cada moneda.
- ``GET /api/cajas/{id}/turno/`` ``{"turno": ...}`` con el turno abierto
  (``null`` si la caja está cerrada) y ``GET /api/cajas/{id}/turnos/`` historial
  de aperturas y cierres (PI-79).
- ``POST /api/cajas/{id}/cerrar/`` cierre con el recuento final de cada moneda;
  el efectivo se devuelve a tesorería (PI-79).
- ``POST /api/cajas/{id}/cotizar/`` desglose de la operación presencial antes de
  confirmar, sin efectos (PI-75).
- ``POST /api/cajas/{id}/operacion/`` ejecuta la operación cambiaria presencial:
  crea la operación, mueve el efectivo de la caja y emite el comprobante
  interno, todo en una transacción (PI-75 + PI-42).
- ``GET /api/denominaciones/?moneda=&activas=1`` catálogo de billetes (lo usa
  el formulario de entregas); escritura solo admin.
- ``GET|POST /api/entregas/`` entregas de billetes a una caja (PI-43, RF57).
  El admin las registra y quedan pendientes; filtros ``?caja=`` y ``?estado=``.
- ``POST /api/entregas/{id}/confirmar/`` el cajero confirma que recibió los
  billetes: recién ahí se suman al saldo.
- ``POST /api/entregas/{id}/rechazar/`` el cajero rechaza, con motivo.
- ``POST /api/entregas/{id}/cancelar/`` el admin anula una pendiente.
"""

from decimal import Decimal

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from monedas.models import Moneda
from operaciones.serializers import OperacionPublicSerializer

from .models import ArqueoCaja, Caja, Denominacion, EntregaBilletes, MovimientoCaja, TurnoCaja
from .servicios import (
    CajaCerrada, SaldoInsuficiente, cancelar_entrega, cerrar_caja, confirmar_entrega,
    crear_entrega, rechazar_entrega, registrar_arqueo, registrar_movimiento,
    saldo_por_moneda, turno_abierto,
)
from .permisos import PermisoEntregas, PersonalCaja
from .serializers import (
    ArqueoSerializer, CajaSerializer, CotizacionVentanillaSerializer,
    DenominacionSerializer, EntregaSerializer, MotivoSerializer,
    MovimientoSerializer, NuevaEntregaSerializer, NuevoArqueoSerializer,
    NuevoMovimientoSerializer, OperacionPresencialSerializer, TurnoSerializer,
)
from comprobantes.serializers import ComprobanteSerializer
from .servicios_operacion import (
    MEDIO_EFECTIVO, MEDIOS_PAGO, cotizar_ventanilla, registrar_operacion_presencial,
    saldo_disponible,
)


def _turno_json(caja):
    turno = turno_abierto(caja)
    return TurnoSerializer(turno).data if turno else None

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


def emitir_comprobante_presencial(operacion, sub: str, nombre: str):
    """Emite el comprobante interno de una operación presencial (PI-42).

    Va dentro de la misma transacción de la operación: si el comprobante no
    se puede guardar, la operación tampoco.
    """
    from comprobantes.models import Comprobante

    if hasattr(operacion, 'comprobante'):
        return ComprobanteSerializer(operacion.comprobante).data
    cliente = operacion.cliente
    comprobante = Comprobante.objects.create(
        operacion=operacion,
        cliente_nombre=(cliente.nombre_completo or str(cliente))[:200],
        cliente_documento=cliente.documento or '',
        tipo_operacion=operacion.tipo_operacion,
        moneda_origen_codigo=operacion.moneda_origen.codigo,
        moneda_destino_codigo=operacion.moneda_destino.codigo,
        monto_enviado=operacion.monto_enviado,
        monto_recibido=operacion.monto_recibido,
        tasa_origen=operacion.tasa_origen,
        tasa_destino=operacion.tasa_destino,
        monto_comision=operacion.monto_comision,
        metodo_pago=operacion.metodo_pago,
        fecha_operacion=operacion.fecha_confirmacion or operacion.fecha_creacion,
        cajero_sub=sub[:160],
        cajero_nombre=nombre[:160],
    )
    return ComprobanteSerializer(comprobante).data


class CajaViewSet(viewsets.ModelViewSet):
    """Control de cajas y saldos por divisa.

    Rutas generadas por el router:

    * ``GET    /api/cajas/``           cajas activas (``?todas=1`` incluye inactivas);
      alta y edición solo admin
    * ``GET    /api/cajas/{id}/saldo/`` saldo de la caja por divisa (RF56; PI-78)
    * ``GET|POST /api/cajas/{id}/movimientos/`` historial y registro de movimientos (RF58)
    * ``GET|POST /api/cajas/{id}/arqueos/`` recuento de la caja (RF56)
    * ``GET    /api/cajas/{id}/turno/`` estado del turno actual
    * ``GET    /api/cajas/{id}/turnos/`` historial de aperturas y cierres (PI-79)
    * ``POST   /api/cajas/{id}/cerrar/`` cierre con recuento final (PI-79)
    * ``POST   /api/cajas/{id}/cotizar/`` desglose previo de la operación
      presencial (PI-75), sin efectos sobre caja ni operación
    * ``POST   /api/cajas/{id}/operacion/`` ejecuta la operación cambiaria
      presencial: crea la operación, mueve el efectivo y emite el
      comprobante (PI-75 + PI-42)
    """

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
        """Saldo de la caja por divisa (RF56; PI-78)."""
        caja = self.get_object()
        return Response({
            'caja': caja.pk,
            'caja_nombre': str(caja),
            'monedas': saldo_por_moneda(caja),
            'turno': _turno_json(caja),
        })

    @action(detail=True, methods=['get'])
    def turno(self, request, pk=None):
        """Estado del turno actual de la caja.

        Devuelve un objeto JSON con el turno abierto o ``null`` si la caja
        está cerrada. El frontend no puede leer ``Response(None)`` como JSON.
        """
        return Response({'turno': _turno_json(self.get_object())})

    @action(detail=True, methods=['get'])
    def turnos(self, request, pk=None):
        """Historial de aperturas y cierres de turnos (PI-79)."""
        qs = (TurnoCaja.objects.filter(caja=self.get_object())
              .select_related('caja', 'arqueo_cierre')
              .prefetch_related('arqueo_cierre__detalle__moneda'))
        return Response(TurnoSerializer(qs[:_limite(request)], many=True).data)

    # ------------------------------------------------------------------
    # Operación cambiaria presencial (PI-75)
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'], url_path='cotizar')
    def cotizar(self, request, pk=None):
        """Desglose de la operación antes de confirmar (PI-75).

        No crea nada: solo devuelve la cotización vigente y los montos, para
        que el cajero le muestre el precio al cliente. También informa
        ``caja_abierta`` y ``saldisponible`` en la divisa a entregar, para
        avisar antes de intentar ejecutar.
        """
        caja = self.get_object()
        entrada = CotizacionVentanillaSerializer(data=request.data)
        if not entrada.is_valid():
            return Response(entrada.errors, status=status.HTTP_400_BAD_REQUEST)
        datos = entrada.validated_data
        try:
            desglose = cotizar_ventanilla(
                cliente=datos['cliente'],
                tipo_operacion=datos['tipo_operacion'],
                moneda=datos['moneda'],
                monto_divisa=datos['monto_divisa'],
                moneda_contraparte=datos.get('moneda_contraparte') or 'PYG',
            )
        except DjangoValidationError as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_400_BAD_REQUEST)

        destino = Moneda.objects.get(pk=desglose['moneda_destino'])
        abierto = turno_abierto(caja) is not None
        disponible = saldo_disponible(caja, destino)
        return Response({
            **desglose,
            'caja_abierta': abierto,
            'saldo_disponible': f'{disponible.normalize():f}',
            'saldo_suficiente': disponible >= Decimal(desglose['monto_recibido']),
        })

    @action(detail=True, methods=['post'], url_path='operacion')
    def operacion_presencial(self, request, pk=None):
        """Ejecuta la operación cambiaria presencial (PI-75).

        Todo en una sola transacción: crea la operación como PAGADA (en
        ventanilla el pago y la entrega son inmediatos), registra el retiro
        de la divisa que el cliente recibe y, si paga en efectivo, el
        ingreso de la que trae. Con tarjeta o transferencia la caja solo
        registra la salida. Si el saldo no alcanza no queda nada registrado.
        """
        caja = self.get_object()
        entrada = OperacionPresencialSerializer(data=request.data)
        if not entrada.is_valid():
            return Response(entrada.errors, status=status.HTTP_400_BAD_REQUEST)
        datos = entrada.validated_data
        sub, nombre = _usuario(request)
        try:
            operacion, movimientos = registrar_operacion_presencial(
                caja=caja,
                cliente=datos['cliente'],
                tipo_operacion=datos['tipo_operacion'],
                moneda=datos['moneda'],
                monto_divisa=datos['monto_divisa'],
                moneda_contraparte=datos.get('moneda_contraparte') or 'PYG',
                medio_pago=datos['medio_pago'],
                usuario_id=sub,
                usuario_nombre=nombre,
                observacion=datos.get('observacion') or '',
            )
        except CajaCerrada as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_409_CONFLICT)
        except SaldoInsuficiente as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_400_BAD_REQUEST)

        comprobante = emitir_comprobante_presencial(operacion, sub, nombre)
        return Response({
            'operacion': OperacionPublicSerializer(operacion).data,
            'movimientos': MovimientoSerializer(movimientos, many=True).data,
            'comprobante': comprobante,
            'saldo': saldo_por_moneda(caja),
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cerrar(self, request, pk=None):
        """Cierre de caja con recuento final de cada moneda (PI-79).

        Informa el conteo de cada moneda y devuelve el efectivo a tesorería.
        """
        caja = self.get_object()
        entrada = NuevoArqueoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        sub, nombre = _usuario(request)
        try:
            turno = cerrar_caja(
                caja=caja,
                conteo={l['moneda'].pk: l['monto'] for l in datos['conteo']},
                usuario_id=sub, usuario_nombre=nombre,
                observacion=datos['observacion'],
            )
        except DjangoValidationError as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'turno': TurnoSerializer(turno).data,
            'monedas': saldo_por_moneda(caja),
        })

    @action(detail=True, methods=['get', 'post'])
    def movimientos(self, request, pk=None):
        """Historial y registro de movimientos de caja (RF58).

        GET: lista los movimientos con filtros opcionales ``?moneda`` y ``?tipo``.
        POST: registra un nuevo movimiento (ingreso, retiro, entrega, devolución).
        """
        caja = self.get_object()
        if request.method == 'GET':
            qs = MovimientoCaja.objects.filter(caja=caja).select_related('moneda', 'caja')
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
        sub, nombre = _usuario(request)
        try:
            movimiento = registrar_movimiento(
                caja=caja, tipo=datos['tipo'], moneda=datos['moneda'],
                monto=datos['monto'],
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
        """Arqueos de la caja: recuento vs. sistema (RF56)."""
        caja = self.get_object()
        if request.method == 'GET':
            qs = (ArqueoCaja.objects.filter(caja=caja)
                  .select_related('caja')
                  .prefetch_related('detalle__moneda'))
            return Response(ArqueoSerializer(qs[:_limite(request)], many=True).data)

        entrada = NuevoArqueoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        sub, nombre = _usuario(request)
        try:
            arqueo = registrar_arqueo(
                caja=caja,
                conteo={l['moneda'].pk: l['monto'] for l in datos['conteo']},
                usuario_id=sub, usuario_nombre=nombre,
                observacion=datos['observacion'],
            )
        except DjangoValidationError as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ArqueoSerializer(arqueo).data, status=status.HTTP_201_CREATED)


class DenominacionViewSet(viewsets.ModelViewSet):
    """Catálogo de denominaciones de billetes por moneda.

    Escritura solo para personal de caja. Se puede filtrar por moneda
    y por si están activas.
    """

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
        if self.request.query_params.get('activas') == '1':
            qs = qs.filter(activa=True, moneda__activo=True)
        return qs.order_by('moneda__codigo', '-valor')


class EntregaViewSet(viewsets.ReadOnlyModelViewSet):
    """Entregas de billetes del administrador a las cajas (PI-43).

    Solo lectura para el cajero (ver entregas pendientes y su estado).
    El admin puede crear nuevas entregas.

    Endpoints:
    * ``GET /api/entregas/`` lista con filtros ``?caja=`` y ``?estado=``
    * ``GET /api/entregas/{id}/`` detalle
    """

    queryset = (EntregaBilletes.objects.select_related('caja')
                .prefetch_related('detalle__denominacion__moneda'))
    serializer_class = EntregaSerializer
    permission_classes = [PermisoEntregas]

    def get_queryset(self):
        qs = super().get_queryset()
        caja = self.request.query_params.get('caja')
        if caja:
            qs = qs.filter(caja_id=caja) if caja.isdigit() else qs.none()
        estado = self.request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado=estado.upper())
        if self.action == 'list':
            qs = qs[:_limite(self.request)]
        return qs

    def create(self, request, *args, **kwargs):
        entrada = NuevaEntregaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        sub, nombre = _usuario(request)
        try:
            entrega = crear_entrega(
                caja=datos['caja'],
                detalle=[(l['denominacion'], l['cantidad']) for l in datos['detalle']],
                usuario_id=sub, usuario_nombre=nombre, observacion=datos['observacion'],
            )
        except DjangoValidationError as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(EntregaSerializer(entrega).data, status=status.HTTP_201_CREATED)

    def _responder(self, request, funcion, con_motivo: bool):
        entrega = self.get_object()
        argumentos = {}
        if con_motivo:
            entrada = MotivoSerializer(data=request.data)
            entrada.is_valid(raise_exception=True)
            argumentos['motivo'] = entrada.validated_data['motivo']
        sub, nombre = _usuario(request)
        try:
            entrega = funcion(entrega, usuario_id=sub, usuario_nombre=nombre, **argumentos)
        except DjangoPermissionDenied as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return Response({'detail': _mensaje(exc)}, status=status.HTTP_400_BAD_REQUEST)
        entrega = self.get_queryset().get(pk=entrega.pk)
        return entrega

    @action(detail=True, methods=['post'])
    def confirmar(self, request, pk=None):
        """Cajero confirma la entrega de billetes: los fondos se suman al saldo."""
        resultado = self._responder(request, confirmar_entrega, con_motivo=False)
        if isinstance(resultado, Response):
            return resultado
        return Response({
            'entrega': EntregaSerializer(resultado).data,
            'monedas': saldo_por_moneda(resultado.caja),
            'turno': _turno_json(resultado.caja),
        })

    @action(detail=True, methods=['post'])
    def rechazar(self, request, pk=None):
        """Cajero rechaza la entrega con un motivo registrado."""
        resultado = self._responder(request, rechazar_entrega, con_motivo=True)
        if isinstance(resultado, Response):
            return resultado
        return Response(EntregaSerializer(resultado).data)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        """Admin cancela una entrega pendiente."""
        resultado = self._responder(request, cancelar_entrega, con_motivo=True)
        if isinstance(resultado, Response):
            return resultado
        return Response(EntregaSerializer(resultado).data)