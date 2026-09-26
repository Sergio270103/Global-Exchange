"""Vistas del módulo de operaciones (Hito Operaciones).

- ``GET /api/operaciones/`` historial con filtros ``?cliente=`` ``?mine=1``
  ``?tipo=COMPRA|VENTA`` ``?estado=PENDIENTE|PAGADA|CANCELADA|ANULADA``
  (para Transactions.tsx).
- ``POST /api/operaciones/`` inicia una compra/venta (estado PENDIENTE)
  con validaciones: cliente activo + asociación Keycloak, monedas activas,
  última cotización vigente y comisión por categoría. Congela las tasas.
- ``POST /api/operaciones/{id}/confirmar/`` confirma el pago (RF27, PI-64)
  y pasa la operación a PAGADA:
    * dentro de la ventana de tolerancia -> confirma con la tasa congelada,
      aunque la cotización haya cambiado;
    * fuera de la ventana y con la misma tasa -> confirma;
    * fuera de la ventana y con otra tasa -> NO confirma: re-cotiza, abre
      una nueva ventana y responde ``resultado=COTIZACION_CAMBIADA`` con
      la cotización nueva para que el cliente la acepte o cancele.
- ``POST /api/operaciones/{id}/cancelar/`` (PI-64): cancela sin costo una
  operación PENDIENTE y registra quién y cuándo (auditoría).
"""

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
from monedas.models import Moneda

from .models import Operacion
from .serializers import (
    CancelarOperacionSerializer,
    CrearOperacionSerializer,
    OperacionSerializer,
    tolerancia_segundos,
)

ERROR_CLIENTE = (
    'La operación no puede ser realizada: el cliente está inactivo '
    'o el usuario no está asociado a este cliente.'
)

RESULTADO_CONFIRMADA = 'CONFIRMADA'
RESULTADO_COTIZACION_CAMBIADA = 'COTIZACION_CAMBIADA'


class ErrorCotizacion(Exception):
    """Error de negocio al cotizar; el mensaje va tal cual en ``detail``."""


def _redondear(valor: Decimal, codigo: str) -> Decimal:
    """Redondeo: 0 decimales para PYG, 2 para el resto."""
    if codigo.strip().upper() == 'PYG':
        return valor.quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return valor.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _ultima_tasa(moneda: Moneda, lado: str) -> Decimal | None:
    """Última cotización vigente: lado compra o venta."""
    cot = Cotizacion.objects.filter(moneda=moneda).order_by('-vigente_desde').first()
    if not cot:
        return None
    return Decimal(str(cot.compra if lado == 'compra' else cot.venta))


def _sub(request) -> str:
    return getattr(request.user, 'id', '') or ''


def _nombre_usuario(request) -> str:
    return (getattr(request.user, 'username', '') or str(request.user))[:160]


def _cliente_operable(cliente: Cliente, sub: str) -> bool:
    """Cliente activo y asociado al usuario Keycloak."""
    asociado = ClienteUsuario.objects.filter(cliente=cliente, keycloak_id=sub).exists()
    return bool(cliente.activo and asociado)


def _porcentaje_comision(cliente: Cliente) -> Decimal:
    try:
        return Decimal(str(Comision.objects.get(categoria=cliente.categoria).porcentaje))
    except Comision.DoesNotExist:
        return Decimal('0')


def _cotizar(
    tipo: str, codigo_div: str, codigo_contra: str, monto_div: Decimal, pct: Decimal,
) -> dict:
    """Calcula montos, tasas y comisión con la cotización vigente.

    Devuelve un dict con los campos de ``Operacion`` que dependen de la
    cotización. Lanza ``ErrorCotizacion`` si algo impide operar.
    """
    if monto_div <= 0:
        raise ErrorCotizacion('Indicá un monto mayor a cero.')
    if codigo_div == codigo_contra:
        raise ErrorCotizacion('La moneda origen y destino deben ser distintas.')

    # Monedas activas.
    try:
        divisa = Moneda.objects.get(codigo=codigo_div, activo=True)
    except Moneda.DoesNotExist as exc:
        raise ErrorCotizacion(f'La moneda {codigo_div} no está admitida.') from exc
    try:
        contra = Moneda.objects.get(codigo=codigo_contra, activo=True)
    except Moneda.DoesNotExist as exc:
        raise ErrorCotizacion(f'La moneda {codigo_contra} no está admitida.') from exc

    # Tasas vigentes (1 para PYG).
    tasa_compra_div = _ultima_tasa(divisa, 'compra') if codigo_div != 'PYG' else Decimal('1')
    tasa_venta_div = _ultima_tasa(divisa, 'venta') if codigo_div != 'PYG' else Decimal('1')
    tasa_compra_contra = (
        _ultima_tasa(contra, 'compra') if codigo_contra != 'PYG' else Decimal('1')
    )
    tasa_venta_contra = (
        _ultima_tasa(contra, 'venta') if codigo_contra != 'PYG' else Decimal('1')
    )
    if (
        tasa_compra_div is None or tasa_venta_div is None
        or tasa_compra_contra is None or tasa_venta_contra is None
    ):
        faltante = codigo_div if tasa_compra_div is None or tasa_venta_div is None else codigo_contra
        raise ErrorCotizacion(f'Todavía no hay cotización para {faltante}.')

    # Cálculo. Comisión siempre guardada en moneda destino.
    if tipo == Operacion.TIPO_COMPRA:
        # El cliente compra `monto_div` de divisa y paga en contraparte.
        moneda_origen, moneda_destino = contra, divisa
        if codigo_contra == 'PYG':
            bruto_origen = monto_div * tasa_venta_div
        else:
            pyg_necesarios = monto_div * tasa_venta_div
            bruto_origen = pyg_necesarios / tasa_compra_contra
        comision_origen = bruto_origen * pct / Decimal('100')
        monto_enviado = _redondear(bruto_origen + comision_origen, moneda_origen.codigo)
        monto_recibido = _redondear(monto_div, moneda_destino.codigo)
        # Comisión expresada en destino para el comprobante.
        if codigo_contra == 'PYG':
            comision_dest = comision_origen / tasa_venta_div if tasa_venta_div else Decimal('0')
        else:
            comision_pyg = comision_origen * tasa_compra_contra
            comision_dest = comision_pyg / tasa_venta_div if tasa_venta_div else Decimal('0')
        monto_comision = _redondear(comision_dest, moneda_destino.codigo)
        tasa_origen = tasa_compra_contra if codigo_contra != 'PYG' else None
        tasa_destino = tasa_venta_div if codigo_div != 'PYG' else None
        efectiva = (bruto_origen / monto_div) if monto_div else Decimal('0')
    else:
        # VENTA: el cliente entrega `monto_div` y recibe en contraparte.
        moneda_origen, moneda_destino = divisa, contra
        if codigo_contra == 'PYG':
            bruto_dest = monto_div * tasa_compra_div
        else:
            pyg = monto_div * tasa_compra_div
            bruto_dest = pyg / tasa_venta_contra
        comision_dest = bruto_dest * pct / Decimal('100')
        neto_dest = bruto_dest - comision_dest
        if neto_dest <= 0:
            raise ErrorCotizacion('El monto neto debe ser mayor a cero.')
        monto_enviado = _redondear(monto_div, moneda_origen.codigo)
        monto_recibido = _redondear(neto_dest, moneda_destino.codigo)
        monto_comision = _redondear(comision_dest, moneda_destino.codigo)
        tasa_origen = tasa_compra_div if codigo_div != 'PYG' else None
        tasa_destino = tasa_venta_contra if codigo_contra != 'PYG' else None
        efectiva = (bruto_dest / monto_div) if monto_div else Decimal('0')

    return {
        'moneda_origen': moneda_origen,
        'moneda_destino': moneda_destino,
        'monto_enviado': monto_enviado,
        'monto_recibido': monto_recibido,
        'cotizacion_aplicada': (
            efectiva.quantize(Decimal('0.000001')) if efectiva else Decimal('0')
        ),
        'tasa_origen': tasa_origen,
        'tasa_destino': tasa_destino,
        'porcentaje_comision_aplicado': pct,
        'monto_comision': monto_comision,
    }


def _datos_para_recotizar(op: Operacion) -> tuple[str, str, Decimal]:
    """Reconstruye (divisa, contraparte, monto_divisa) desde la operación."""
    if op.tipo_operacion == Operacion.TIPO_COMPRA:
        return op.moneda_destino.codigo, op.moneda_origen.codigo, op.monto_recibido
    return op.moneda_origen.codigo, op.moneda_destino.codigo, op.monto_enviado


def _norm(tasa: Decimal | None) -> Decimal | None:
    return None if tasa is None else Decimal(tasa).quantize(Decimal('0.01'))


def _tasas_cambiaron(op: Operacion, nueva: dict) -> bool:
    return (
        _norm(op.tasa_origen) != _norm(nueva['tasa_origen'])
        or _norm(op.tasa_destino) != _norm(nueva['tasa_destino'])
    )


def _dentro_de_tolerancia(op: Operacion) -> bool:
    transcurrido = (timezone.now() - op.fecha_cotizacion).total_seconds()
    return transcurrido <= tolerancia_segundos()


class OperacionViewSet(viewsets.ModelViewSet):
    queryset = Operacion.objects.select_related(
        'cliente', 'moneda_origen', 'moneda_destino',
    ).all()
    serializer_class = OperacionSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('mine') in ('1', 'true', 'si', 'sí'):
            sub = _sub(self.request)
            clientes_ids = ClienteUsuario.objects.filter(
                keycloak_id=sub,
            ).values_list('cliente_id', flat=True)
            qs = qs.filter(cliente_id__in=clientes_ids)
        else:
            cliente = self.request.query_params.get('cliente')
            if cliente:
                qs = qs.filter(cliente_id=cliente)
        tipo = self.request.query_params.get('tipo')
        if tipo:
            qs = qs.filter(tipo_operacion=tipo.strip().upper())
        estado = self.request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado=estado.strip().upper())
        buscar = self.request.query_params.get('buscar')
        if buscar:
            qs = qs.filter(
                Q(moneda_origen__codigo__icontains=buscar)
                | Q(moneda_destino__codigo__icontains=buscar)
                | Q(cliente__nombre__icontains=buscar)
            )
        return qs

    # ------------------------------------------------------------------
    # Iniciar (queda PENDIENTE con la tasa congelada)
    # ------------------------------------------------------------------
    def create(self, request, *args, **kwargs):
        entrada = CrearOperacionSerializer(data=request.data)
        if not entrada.is_valid():
            return Response(entrada.errors, status=status.HTTP_400_BAD_REQUEST)

        datos = entrada.validated_data
        tipo = str(datos['tipo_operacion']).upper()
        codigo_div = str(datos['moneda']).strip().upper()
        codigo_contra = str(datos.get('moneda_contraparte') or 'PYG').strip().upper()
        monto_div = Decimal(str(datos['monto_divisa']))
        metodo_pago = str(datos.get('metodo_pago') or '').strip().lower()[:24]

        # Cliente + asociación Keycloak.
        sub = _sub(request)
        try:
            cliente = Cliente.objects.get(id=datos['cliente'])
        except Cliente.DoesNotExist:
            return Response({'detail': ERROR_CLIENTE}, status=status.HTTP_400_BAD_REQUEST)
        if not _cliente_operable(cliente, sub):
            return Response({'detail': ERROR_CLIENTE}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cotizacion = _cotizar(
                tipo, codigo_div, codigo_contra, monto_div, _porcentaje_comision(cliente),
            )
        except ErrorCotizacion as err:
            return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

        op = Operacion.objects.create(
            cliente=cliente,
            usuario_keycloak_id=sub[:64],
            tipo_operacion=tipo,
            metodo_pago=metodo_pago,
            estado=Operacion.ESTADO_PENDIENTE,
            fecha_cotizacion=timezone.now(),
            **cotizacion,
        )
        return Response(OperacionSerializer(op).data, status=status.HTTP_201_CREATED)

    # ------------------------------------------------------------------
    # Confirmar (PI-64)
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def confirmar(self, request, pk=None):
        sub = _sub(request)
        with transaction.atomic():
            try:
                op = (
                    Operacion.objects.select_for_update()
                    .select_related('cliente', 'moneda_origen', 'moneda_destino')
                    .get(pk=pk)
                )
            except Operacion.DoesNotExist:
                return Response({'detail': 'La operación no existe.'}, status=status.HTTP_404_NOT_FOUND)

            if not _cliente_operable(op.cliente, sub):
                return Response({'detail': ERROR_CLIENTE}, status=status.HTTP_400_BAD_REQUEST)
            if op.estado != Operacion.ESTADO_PENDIENTE:
                return Response(
                    {'detail': f'La operación ya está {op.get_estado_display().lower()}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # 1) Dentro de la ventana: se respeta la tasa congelada.
            if _dentro_de_tolerancia(op):
                return self._marcar_confirmada(op)

            # 2) Fuera de la ventana: se compara con la cotización actual.
            codigo_div, codigo_contra, monto_div = _datos_para_recotizar(op)
            try:
                nueva = _cotizar(
                    op.tipo_operacion, codigo_div, codigo_contra, monto_div,
                    _porcentaje_comision(op.cliente),
                )
            except ErrorCotizacion as err:
                return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

            if not _tasas_cambiaron(op, nueva):
                return self._marcar_confirmada(op)

            # 3) La tasa cambió: se re-cotiza y se abre una nueva ventana.
            anterior = OperacionSerializer(op).data
            for campo, valor in nueva.items():
                setattr(op, campo, valor)
            op.fecha_cotizacion = timezone.now()
            op.save()
            return Response({
                'resultado': RESULTADO_COTIZACION_CAMBIADA,
                'detail': 'La cotización cambió. Revisá la nueva antes de continuar.',
                'anterior': anterior,
                'operacion': OperacionSerializer(op).data,
            })

    def _marcar_confirmada(self, op: Operacion) -> Response:
        op.estado = Operacion.ESTADO_PAGADA
        op.fecha_confirmacion = timezone.now()
        op.save(update_fields=['estado', 'fecha_confirmacion'])
        return Response({
            'resultado': RESULTADO_CONFIRMADA,
            'operacion': OperacionSerializer(op).data,
        })

    # ------------------------------------------------------------------
    # Cancelar (PI-64)
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        entrada = CancelarOperacionSerializer(data=request.data)
        if not entrada.is_valid():
            return Response(entrada.errors, status=status.HTTP_400_BAD_REQUEST)

        sub = _sub(request)
        with transaction.atomic():
            try:
                op = (
                    Operacion.objects.select_for_update()
                    .select_related('cliente', 'moneda_origen', 'moneda_destino')
                    .get(pk=pk)
                )
            except Operacion.DoesNotExist:
                return Response({'detail': 'La operación no existe.'}, status=status.HTTP_404_NOT_FOUND)

            if not _cliente_operable(op.cliente, sub):
                return Response({'detail': ERROR_CLIENTE}, status=status.HTTP_400_BAD_REQUEST)
            if op.estado == Operacion.ESTADO_CANCELADA:
                # Idempotente: un doble clic no debe dar error.
                return Response(OperacionSerializer(op).data)
            if op.estado != Operacion.ESTADO_PENDIENTE:
                return Response(
                    {'detail': 'Solo se pueden cancelar operaciones pendientes.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            op.estado = Operacion.ESTADO_CANCELADA
            op.fecha_cancelacion = timezone.now()
            op.cancelada_por = sub[:64]
            op.cancelada_por_nombre = _nombre_usuario(request)
            op.motivo_cancelacion = entrada.validated_data['motivo']
            op.save(update_fields=[
                'estado', 'fecha_cancelacion', 'cancelada_por',
                'cancelada_por_nombre', 'motivo_cancelacion',
            ])
        return Response(OperacionSerializer(op).data)