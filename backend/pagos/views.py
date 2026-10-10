"""Vistas del módulo de pagos.

- ``/api/metodos-pago/`` catálogo global; escritura solo admin (RF42).
- ``/api/cuentas-bancarias/`` cuentas del cliente; cualquier usuario
  autenticado opera (filtros ``?cliente=`` ``?activa=`` ``?buscar=``);
  la baja es lógica. El Nº de cuenta nunca se expone en claro.
- ``/api/payments/webhook/`` eventos de Stripe (sin autenticación: la
  firma del webhook es la credencial). Marca PAGADA al acreditarse el
  pago y CANCELADA (motivo PAGO_FALLIDO) al expirar o rechazarse.
"""

import json
import logging

import stripe
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.permisos import SoloAdminEscribe

from .models import CuentaBancaria, MetodoPago
from .serializers import CuentaBancariaSerializer, MetodoPagoSerializer

logger = logging.getLogger(__name__)


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


@csrf_exempt
@require_POST
def webhook_stripe(request):
    """Recibe los eventos de Checkout y actualiza la operación.

    Sin CSRF (Stripe no envía el token): la protección es la firma
    criptográfica del webhook. Idempotente: solo transiciona desde
    PENDIENTE y solo si el evento trae la sesión vigente guardada en
    la operación (una sesión vieja reemplazada se ignora).
    """
    firma = request.headers.get('Stripe-Signature', '')
    try:
        # stripe-python v16 devuelve un objeto Event: se convierte a dict.
        evento = stripe.Webhook.construct_event(
            request.body, firma, settings.STRIPE_WEBHOOK_SECRET,
        ).to_dict()
    except (ValueError, json.JSONDecodeError):
        return HttpResponse('Payload inválido.', status=400)
    except stripe.SignatureVerificationError:
        return HttpResponse('Firma inválida.', status=400)

    tipo = evento.get('type', '')
    sesion = (evento.get('data') or {}).get('object') or {}
    if tipo == 'checkout.session.completed' and sesion.get('payment_status') == 'paid':
        _pago_acreditado(sesion)
    elif tipo == 'checkout.session.async_payment_succeeded':
        _pago_acreditado(sesion)
    elif tipo in ('checkout.session.expired', 'checkout.session.async_payment_failed'):
        _pago_fallido(sesion)
    return JsonResponse({'received': True})


def _operacion_de_sesion(sesion):
    """Operación PENDIENTE cuya sesión vigente coincide, o None."""
    from operaciones.models import Operacion

    sesion_id = sesion.get('id')
    if not sesion_id:
        return None
    try:
        op = Operacion.objects.select_related(
            'cliente', 'moneda_origen', 'moneda_destino',
        ).get(stripe_session_id=sesion_id)
    except Operacion.DoesNotExist:
        return None
    if op.estado != Operacion.ESTADO_PENDIENTE:
        return None
    return op


def _pago_acreditado(sesion):
    """Marca PAGADA con la cotización congelada (vale aunque haya pasado
    la ventana: el monto cobrado es el de la sesión)."""
    from operaciones.views import OperacionViewSet

    op = _operacion_de_sesion(sesion)
    if op is None:
        return
    with transaction.atomic():
        op = (
            type(op).objects.select_for_update()
            .select_related('cliente', 'moneda_origen', 'moneda_destino')
            .get(pk=op.pk)
        )
        if op.estado != type(op).ESTADO_PENDIENTE:
            return
        logger.info('Stripe acreditó la operación %s (sesión %s).', op.pk, sesion.get('id'))
        OperacionViewSet()._marcar_confirmada(op)


def _pago_fallido(sesion):
    """Marca CANCELADA por pago rechazado o expirado."""
    from operaciones.models import Operacion

    op = _operacion_de_sesion(sesion)
    if op is None:
        return
    with transaction.atomic():
        op = Operacion.objects.select_for_update().get(pk=op.pk)
        if op.estado != Operacion.ESTADO_PENDIENTE:
            return
        logger.info('Stripe rechazó/expiró la operación %s (sesión %s).', op.pk, sesion.get('id'))
        op.estado = Operacion.ESTADO_CANCELADA
        op.fecha_cancelacion = timezone.now()
        op.motivo_cancelacion = Operacion.MOTIVO_PAGO_FALLIDO
        op.cancelada_por_nombre = 'Stripe'
        op.save(update_fields=[
            'estado', 'fecha_cancelacion', 'motivo_cancelacion',
            'cancelada_por_nombre',
        ])
