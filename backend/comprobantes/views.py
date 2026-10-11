"""Vistas del módulo de comprobantes internos (PI-42, RF63).

- ``POST /api/comprobantes/ {operacion}`` emite el comprobante de una
  operación PAGADA visible por el solicitante (número único
  secuencial + foto inmutable). Una operación tiene un solo comprobante.
- ``GET /api/comprobantes/`` y ``GET /api/comprobantes/<id>/`` listan
  y reimprimen (el cajero ve los que emitió; cada usuario, los de sus
  clientes; el admin, todos).
- ``POST /api/comprobantes/<id>/anular/`` anula un comprobante emitido
  (emisor o admin): revierte el efectivo en la primera caja activa con
  el par inverso y marca el comprobante como anulado, todo en una
  transacción atómica. La operación sigue PAGADA (no hay nota de
  crédito): la anulación es solo del comprobante y su efecto en caja.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from cajas.models import Caja, MovimientoCaja
from cajas.servicios import registrar_movimiento
from clientes.permisos import es_cajero
from monedas.models import Moneda
from monedas.permisos import es_admin
from operaciones.models import Operacion

from .models import Comprobante
from .serializers import ComprobanteSerializer


def _sub(usuario) -> str:
    return getattr(usuario, 'id', '') or ''


def _clientes_del_sub(sub: str):
    from clientes.models import ClienteUsuario
    return ClienteUsuario.objects.filter(
        keycloak_id=sub).values_list('cliente_id', flat=True)


class ComprobanteViewSet(viewsets.ModelViewSet):
    serializer_class = ComprobanteSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = Comprobante.objects.select_related(
            'operacion', 'operacion__cliente').all()
        usuario = self.request.user
        sub = _sub(usuario)
        if getattr(usuario, 'is_superuser', False) or es_admin(usuario):
            return qs
        if es_cajero(usuario):
            return qs.filter(
                Q(cajero_sub=sub) | Q(operacion__cliente_id__in=_clientes_del_sub(sub)))
        return qs.filter(operacion__cliente_id__in=_clientes_del_sub(sub))

    def create(self, request, *args, **kwargs):
        try:
            operacion_id = int(request.data.get('operacion'))
        except (TypeError, ValueError):
            return Response(
                {'detail': 'Indicá la operación.'},
                status=status.HTTP_400_BAD_REQUEST)
        try:
            op = Operacion.objects.select_related(
                'cliente', 'moneda_origen', 'moneda_destino').get(pk=operacion_id)
        except Operacion.DoesNotExist:
            return Response(
                {'detail': 'La operación no existe.'},
                status=status.HTTP_404_NOT_FOUND)
        if op.estado != Operacion.ESTADO_PAGADA:
            return Response(
                {'detail': 'Solo se emite comprobante de una operación pagada.'},
                status=status.HTTP_400_BAD_REQUEST)
        usuario = request.user
        sub = _sub(usuario)
        permitida = (
            getattr(usuario, 'is_superuser', False) or es_admin(usuario)
            or op.usuario_keycloak_id == sub
            or op.cliente_id in _clientes_del_sub(sub)
        )
        if not permitida:
            return Response(
                {'detail': 'No podés emitir comprobante de esta operación.'},
                status=status.HTTP_403_FORBIDDEN)
        if hasattr(op, 'comprobante'):
            return Response(
                {'detail': 'La operación ya tiene comprobante.'},
                status=status.HTTP_400_BAD_REQUEST)
        try:
            comprobante = Comprobante.objects.create(
                operacion=op,
                cliente_nombre=op.cliente.nombre_completo
                if hasattr(op.cliente, 'nombre_completo') else str(op.cliente),
                cliente_documento=getattr(op.cliente, 'documento', '') or '',
                tipo_operacion=op.tipo_operacion,
                moneda_origen_codigo=op.moneda_origen.codigo,
                moneda_destino_codigo=op.moneda_destino.codigo,
                monto_enviado=op.monto_enviado,
                monto_recibido=op.monto_recibido,
                tasa_origen=op.tasa_origen,
                tasa_destino=op.tasa_destino,
                monto_comision=op.monto_comision,
                metodo_pago=op.metodo_pago,
                fecha_operacion=op.fecha_confirmacion or op.fecha_creacion,
                cajero_sub=sub[:160],
                cajero_nombre=(
                    getattr(usuario, 'nombre', '')
                    or getattr(usuario, 'username', '') or str(usuario)
                )[:160],
            )
        except IntegrityError:
            return Response(
                {'detail': 'La operación ya tiene comprobante.'},
                status=status.HTTP_400_BAD_REQUEST)
        return Response(
            ComprobanteSerializer(comprobante).data,
            status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='anular')
    def anular(self, request, pk=None):
        """Anula el comprobante revirtiendo caja y billeteras.

        Solo el cajero que lo emitió o un administrador, y solo para
        operaciones presenciales (efectivo, tarjeta o transferencia: las
        de pasarela o billetera no tocan la caja).
        En una transacción atómica: registra la reversa en la primera
        caja activa (siempre el ``INGRESO`` de lo entregado; el
        ``RETIRO`` de lo ingresado solo si pagó en efectivo, que es lo
        único que entró), devuelve los saldos de billetera movidos al
        confirmar y pasa la operación a ``CANCELADA`` con motivo
        ``ANULADA``. Todo o nada: caja cerrada, saldo insuficiente en
        caja o en billetera destino → 400 sin tocar nada.
        Cuerpo opcional: ``{"motivo": "..."}``.
        """
        from billeteras.models import Billetera, Movimiento

        #: Medios cuya reversa toca la caja (ver PI-75 en cajas).
        MEDIOS_ANULABLES = ('efectivo', 'tarjeta', 'transferencia')

        comp = self.get_object()
        if comp.estado != Comprobante.ESTADO_EMITIDO:
            return Response(
                {'detail': 'El comprobante ya está anulado.'},
                status=status.HTTP_400_BAD_REQUEST)
        usuario = request.user
        sub = _sub(usuario)
        es_emisor = bool(comp.cajero_sub and comp.cajero_sub == sub)
        if not (getattr(usuario, 'is_superuser', False)
                or es_admin(usuario) or es_emisor):
            return Response(
                {'detail': 'No podés anular este comprobante.'},
                status=status.HTTP_403_FORBIDDEN)
        if comp.metodo_pago not in MEDIOS_ANULABLES:
            return Response(
                {'detail': 'Solo se anulan comprobantes de operaciones presenciales.'},
                status=status.HTTP_400_BAD_REQUEST)
        motivo = ''
        if isinstance(request.data, dict):
            motivo = str(request.data.get('motivo') or '')[:255]

        caja = Caja.objects.filter(activa=True).first()
        if caja is None:
            return Response(
                {'detail': 'No hay cajas activas para revertir.'},
                status=status.HTTP_400_BAD_REQUEST)
        try:
            moneda_origen = Moneda.objects.get(codigo=comp.moneda_origen_codigo)
            moneda_destino = Moneda.objects.get(codigo=comp.moneda_destino_codigo)
        except Moneda.DoesNotExist:
            return Response(
                {'detail': 'La caja no maneja una de las monedas del comprobante.'},
                status=status.HTTP_400_BAD_REQUEST)
        nombre = (getattr(usuario, 'nombre', '')
                  or getattr(usuario, 'username', '') or str(usuario))[:160]
        obs = f'Reversa {comp.numero} OP-{comp.operacion_id}'
        if motivo:
            obs = f'{obs}: {motivo}'
        obs = obs[:255]
        try:
            with transaction.atomic():
                comp = Comprobante.objects.select_for_update().get(pk=comp.pk)
                if comp.estado != Comprobante.ESTADO_EMITIDO:
                    raise DjangoValidationError('El comprobante ya está anulado.')
                op = Operacion.objects.select_for_update().get(pk=comp.operacion_id)
                if op.estado != Operacion.ESTADO_PAGADA:
                    raise DjangoValidationError(
                        'Solo se anula el comprobante de una operación pagada.')
                # Reversa de lo que la operación presencial movió en caja:
                # siempre vuelve lo entregado; lo ingresado solo si pagó
                # en efectivo (con tarjeta o transferencia nada entró).
                registrar_movimiento(
                    caja=caja, tipo=MovimientoCaja.TIPO_INGRESO,
                    moneda=moneda_destino, monto=comp.monto_recibido,
                    usuario_id=sub, usuario_nombre=nombre, observacion=obs,
                )
                if comp.metodo_pago == 'efectivo':
                    registrar_movimiento(
                        caja=caja, tipo=MovimientoCaja.TIPO_RETIRO,
                        moneda=moneda_origen, monto=comp.monto_enviado,
                        usuario_id=sub, usuario_nombre=nombre, observacion=obs,
                    )
                # Revierte las billeteras movidas al confirmar.
                if op.billetera_origen_id:
                    origen = Billetera.objects.select_for_update().get(
                        pk=op.billetera_origen_id)
                    origen.saldo = origen.saldo + op.monto_enviado
                    origen.save(update_fields=['saldo', 'actualizado_en'])
                    Movimiento.objects.create(
                        billetera=origen, operacion=op,
                        tipo=Movimiento.TIPO_CREDITO,
                        monto=op.monto_enviado, saldo_resultante=origen.saldo,
                    )
                if op.billetera_destino_id:
                    destino = Billetera.objects.select_for_update().get(
                        pk=op.billetera_destino_id)
                    if destino.saldo < op.monto_recibido:
                        raise DjangoValidationError(
                            'La billetera destino ya no tiene el saldo para revertir.')
                    destino.saldo = destino.saldo - op.monto_recibido
                    destino.save(update_fields=['saldo', 'actualizado_en'])
                    Movimiento.objects.create(
                        billetera=destino, operacion=op,
                        tipo=Movimiento.TIPO_DEBITO,
                        monto=op.monto_recibido, saldo_resultante=destino.saldo,
                    )
                op.estado = Operacion.ESTADO_CANCELADA
                op.fecha_cancelacion = timezone.now()
                op.cancelada_por = sub[:64]
                op.cancelada_por_nombre = nombre
                op.motivo_cancelacion = Operacion.MOTIVO_ANULADA
                op.save(update_fields=[
                    'estado', 'fecha_cancelacion', 'cancelada_por',
                    'cancelada_por_nombre', 'motivo_cancelacion',
                ])
                comp.estado = Comprobante.ESTADO_ANULADO
                comp.motivo_anulacion = motivo
                comp.anulado_por_sub = sub[:160]
                comp.anulado_por_nombre = nombre
                comp.fecha_anulacion = timezone.now()
                comp.save(update_fields=[
                    'estado', 'motivo_anulacion', 'anulado_por_sub',
                    'anulado_por_nombre', 'fecha_anulacion',
                ])
        except DjangoValidationError as exc:
            return Response(
                {'detail': ' '.join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST)
        return Response(ComprobanteSerializer(comp).data)
