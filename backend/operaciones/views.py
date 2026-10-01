"""Vistas del módulo de operaciones (Hito Operaciones).

- ``GET /api/operaciones/`` historial (PI-65, RF34/RF35), solo consulta.
  Un usuario ve **únicamente** las operaciones de los clientes a los que
  está asociado; la restricción se aplica acá, no en el frontend. El
  administrador ve todas, salvo que pida ``?mine=1``.
  Filtros: ``?desde=AAAA-MM-DD`` ``?hasta=AAAA-MM-DD`` ``?tipo=COMPRA|VENTA``
  ``?moneda=USD`` ``?estado=PENDIENTE|PAGADA|CANCELADA|ANULADA``
  ``?cliente=<id>`` ``?buscar=``.
- ``POST /api/operaciones/`` inicia una compra/venta (estado PENDIENTE)
  con validaciones: cliente activo + asociación Keycloak, monedas activas,
  última cotización vigente y ajuste interno por categoría. Congela las tasas.
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
from django.db.models import CharField, F, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.utils.dateparse import parse_date
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from billeteras.models import Billetera, Movimiento
from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
from monedas.models import Moneda
from monedas.permisos import es_admin
from pagos.models import CuentaBancaria

from .models import Operacion
from .serializers import (
    CancelarOperacionSerializer,
    CrearOperacionSerializer,
    OperacionPublicSerializer,
    tolerancia_segundos,
)

ERROR_CLIENTE = (
    'La operación no puede ser realizada: el cliente está inactivo '
    'o el usuario no está asociado a este cliente.'
)

RESULTADO_CONFIRMADA = 'CONFIRMADA'
RESULTADO_COTIZACION_CAMBIADA = 'COTIZACION_CAMBIADA'
RESULTADO_FONDOS_INSUFICIENTES = 'FONDOS_INSUFICIENTES'
ERROR_FONDOS = 'Fondos insuficientes en la billetera origen. La operación fue cancelada.'
METODO_BILLETERA = 'wallet'


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


def _es_personal_autorizado(usuario) -> bool:
    """¿Puede ver el historial de TODOS los clientes? Solo el administrador.

    El cajero y el analista no: sus tareas (arqueo de caja, tasas) no
    requieren ver las operaciones de todos los clientes.
    """
    if usuario is None or not getattr(usuario, 'is_authenticated', False):
        return False
    return bool(getattr(usuario, 'is_superuser', False) or es_admin(usuario))


def _clientes_del_usuario(request):
    return ClienteUsuario.objects.filter(
        keycloak_id=_sub(request),
    ).values_list('cliente_id', flat=True)


def _cliente_operable(cliente: Cliente, sub: str) -> bool:
    """Cliente activo y asociado al usuario Keycloak."""
    asociado = ClienteUsuario.objects.filter(cliente=cliente, keycloak_id=sub).exists()
    return bool(cliente.activo and asociado)


def _porcentaje_ajuste(cliente: Cliente) -> Decimal:
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
    serializer_class = OperacionPublicSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        # Nombres de quien realizó y de quien canceló cada operación, con el
        # mismo origen (ClienteUsuario) y sin una consulta por fila.
        def nombre_asociado(campo_sub):
            return Subquery(
                ClienteUsuario.objects.filter(
                    cliente_id=OuterRef('cliente_id'),
                    keycloak_id=OuterRef(campo_sub),
                ).values('username')[:1],
            )

        qs = qs.annotate(
            usuario_nombre_anotado=Coalesce(
                nombre_asociado('usuario_keycloak_id'), Value(''),
                output_field=CharField(),
            ),
            cancelada_por_nombre_anotado=Coalesce(
                nombre_asociado('cancelada_por'), F('cancelada_por_nombre'),
                output_field=CharField(),
            ),
        )

        # Seguridad (PI-65): un usuario ve solo lo de sus clientes asociados,
        # aunque llame a la API sin ?mine=1. Aplica también al detalle
        # GET /operaciones/{id}/ (una operación ajena da 404).
        solo_propias = params.get('mine') in ('1', 'true', 'si', 'sí')
        if solo_propias or not _es_personal_autorizado(self.request.user):
            qs = qs.filter(cliente_id__in=_clientes_del_usuario(self.request))

        cliente = params.get('cliente')
        if cliente:
            qs = qs.filter(cliente_id=cliente)

        # RF35: fecha, tipo de operación, moneda y estado.
        desde = parse_date(params.get('desde') or '')
        if desde:
            qs = qs.filter(fecha_creacion__date__gte=desde)
        hasta = parse_date(params.get('hasta') or '')
        if hasta:
            qs = qs.filter(fecha_creacion__date__lte=hasta)
        tipo = params.get('tipo')
        if tipo:
            qs = qs.filter(tipo_operacion=tipo.strip().upper())
        moneda = params.get('moneda')
        if moneda:
            codigo = moneda.strip().upper()
            qs = qs.filter(Q(moneda_origen__codigo=codigo) | Q(moneda_destino__codigo=codigo))
        estado = params.get('estado')
        if estado:
            qs = qs.filter(estado=estado.strip().upper())
        buscar = params.get('buscar')
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
                tipo, codigo_div, codigo_contra, monto_div, _porcentaje_ajuste(cliente),
            )
        except ErrorCotizacion as err:
            return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

        # PI-66: vinculación de billetera destino y cuenta origen.
        # Solo registro: los fondos se mueven al confirmar (fuera de PI-66).
        billetera_destino = None
        if datos.get('billetera_destino') is not None:
            try:
                billetera_destino = Billetera.objects.select_related('moneda').get(
                    pk=datos['billetera_destino'])
            except (Billetera.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'La billetera indicada no existe.'},
                    status=status.HTTP_400_BAD_REQUEST)
            if billetera_destino.cliente_id != cliente.id:
                return Response(
                    {'detail': 'La billetera no pertenece al cliente.'},
                    status=status.HTTP_400_BAD_REQUEST)
            if billetera_destino.moneda_id != cotizacion['moneda_destino'].id:
                return Response(
                    {'detail': 'La billetera debe ser de la moneda destino.'},
                    status=status.HTTP_400_BAD_REQUEST)
        else:
            # PI-73: si no se eligió, se acredita siempre en la billetera
            # del cliente en la moneda destino (se crea en cero si no existe).
            billetera_destino, _ = Billetera.objects.get_or_create(
                cliente=cliente, moneda=cotizacion['moneda_destino'])
        cuenta_origen = None
        if datos.get('cuenta_origen') is not None:
            # La cuenta bancaria es el origen de la transferencia en la compra.
            # No tiene saldo en el sistema (cuenta externa), así que no puede
            # ser origen de una venta: esa se debita de la billetera.
            if tipo != 'COMPRA':
                return Response(
                    {'detail': 'La cuenta bancaria solo puede usarse en una compra.'},
                    status=status.HTTP_400_BAD_REQUEST)
            try:
                cuenta_origen = CuentaBancaria.objects.get(pk=datos['cuenta_origen'])
            except (CuentaBancaria.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'La cuenta indicada no existe.'},
                    status=status.HTTP_400_BAD_REQUEST)
            if cuenta_origen.cliente_id != cliente.id:
                return Response(
                    {'detail': 'La cuenta no pertenece al cliente.'},
                    status=status.HTTP_400_BAD_REQUEST)
            if cuenta_origen.moneda_id != cotizacion['moneda_origen'].id:
                return Response(
                    {'detail': 'La cuenta debe ser de la moneda origen.'},
                    status=status.HTTP_400_BAD_REQUEST)

        # PI-66c: billetera origen con validación de fondos desde el alta.
        billetera_origen = None
        if datos.get('billetera_origen') is not None:
            try:
                billetera_origen = Billetera.objects.get(
                    pk=datos['billetera_origen'])
            except (Billetera.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'La billetera origen indicada no existe.'},
                    status=status.HTTP_400_BAD_REQUEST)
            if billetera_origen.cliente_id != cliente.id:
                return Response(
                    {'detail': 'La billetera origen no pertenece al cliente.'},
                    status=status.HTTP_400_BAD_REQUEST)
            if billetera_origen.moneda_id != cotizacion['moneda_origen'].id:
                return Response(
                    {'detail': 'La billetera origen debe ser de la moneda origen.'},
                    status=status.HTTP_400_BAD_REQUEST)
        elif tipo == 'VENTA' or metodo_pago == METODO_BILLETERA:
            # PI-73: se debita de la billetera del cliente en la moneda origen
            # cuando vende divisas (siempre) o cuando compra pagando con su
            # billetera (método "wallet").
            billetera_origen, _ = Billetera.objects.get_or_create(
                cliente=cliente, moneda=cotizacion['moneda_origen'])

        # PI-73: sin saldo suficiente la operación queda registrada como
        # CANCELADA por fondos insuficientes (visible en el historial).
        sin_fondos = (
            billetera_origen is not None
            and billetera_origen.saldo < cotizacion['monto_enviado']
        )
        ahora = timezone.now()
        op = Operacion.objects.create(
            cliente=cliente,
            usuario_keycloak_id=sub[:64],
            tipo_operacion=tipo,
            metodo_pago=metodo_pago,
            billetera_destino=billetera_destino,
            cuenta_origen=cuenta_origen,
            billetera_origen=billetera_origen,
            estado=Operacion.ESTADO_CANCELADA if sin_fondos else Operacion.ESTADO_PENDIENTE,
            fecha_cotizacion=ahora,
            fecha_cancelacion=ahora if sin_fondos else None,
            motivo_cancelacion=Operacion.MOTIVO_FONDOS if sin_fondos else '',
            cancelada_por_nombre='Sistema' if sin_fondos else '',
            **cotizacion,
        )
        return Response(OperacionPublicSerializer(op).data, status=status.HTTP_201_CREATED)

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
                    _porcentaje_ajuste(op.cliente),
                )
            except ErrorCotizacion as err:
                return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

            if not _tasas_cambiaron(op, nueva):
                return self._marcar_confirmada(op)

            # 3) La tasa cambió: se re-cotiza y se abre una nueva ventana.
            anterior = OperacionPublicSerializer(op).data
            for campo, valor in nueva.items():
                setattr(op, campo, valor)
            op.fecha_cotizacion = timezone.now()
            op.save()
            return Response({
                'resultado': RESULTADO_COTIZACION_CAMBIADA,
                'detail': 'La cotización cambió. Revisá la nueva antes de continuar.',
                'anterior': anterior,
                'operacion': OperacionPublicSerializer(op).data,
            })

    def _marcar_confirmada(self, op: Operacion) -> Response:
        """Marca PAGADA y mueve los saldos, o cancela si no hay fondos (PI-73).

        El débito se valida ANTES de tocar cualquier saldo: si la billetera
        origen no alcanza (otra operación gastó el saldo entre el alta y la
        confirmación), la operación pasa a CANCELADA con motivo
        FONDOS_INSUFICIENTES y no se registra ningún movimiento. Corre dentro
        del ``transaction.atomic()`` de ``confirmar``.
        """
        origen = None
        if op.billetera_origen_id:
            origen = Billetera.objects.select_for_update().get(
                pk=op.billetera_origen_id)
            if origen.saldo < op.monto_enviado:
                op.estado = Operacion.ESTADO_CANCELADA
                op.fecha_cancelacion = timezone.now()
                op.motivo_cancelacion = Operacion.MOTIVO_FONDOS
                op.cancelada_por_nombre = 'Sistema'
                op.save(update_fields=[
                    'estado', 'fecha_cancelacion', 'motivo_cancelacion',
                    'cancelada_por_nombre',
                ])
                return Response({
                    'resultado': RESULTADO_FONDOS_INSUFICIENTES,
                    'detail': ERROR_FONDOS,
                    'operacion': OperacionPublicSerializer(op).data,
                })

        op.estado = Operacion.ESTADO_PAGADA
        op.fecha_confirmacion = timezone.now()
        op.save(update_fields=['estado', 'fecha_confirmacion'])

        if origen:
            origen.saldo = origen.saldo - op.monto_enviado
            origen.save(update_fields=['saldo', 'actualizado_en'])
            Movimiento.objects.create(
                billetera=origen, operacion=op,
                tipo=Movimiento.TIPO_DEBITO,
                monto=op.monto_enviado, saldo_resultante=origen.saldo,
            )

        if op.billetera_destino_id:
            destino = Billetera.objects.select_for_update().get(
                pk=op.billetera_destino_id)
            destino.saldo = destino.saldo + op.monto_recibido
            destino.save(update_fields=['saldo', 'actualizado_en'])
            Movimiento.objects.create(
                billetera=destino, operacion=op,
                tipo=Movimiento.TIPO_CREDITO,
                monto=op.monto_recibido, saldo_resultante=destino.saldo,
            )

        return Response({
            'resultado': RESULTADO_CONFIRMADA,
            'operacion': OperacionPublicSerializer(op).data,
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
                return Response(OperacionPublicSerializer(op).data)
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
        return Response(OperacionPublicSerializer(op).data)