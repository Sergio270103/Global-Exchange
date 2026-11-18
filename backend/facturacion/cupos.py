"""Reserva transaccional de disponibilidad antes de cobrar o mover saldos."""
from django.db import transaction
from rest_framework.exceptions import ValidationError
from . import cliente_fs, numeracion
from .models import CorrelativoDocumento, FacturaElectronica, ReservaEmision

SIN_CUPO = 'No hay disponibilidad para emitir la factura. La compra/venta no fue confirmada y no se modificaron saldos.'


def bloquear():
    return CorrelativoDocumento.objects.select_for_update().get_or_create(
        tipo='1', simulada=cliente_fs.modo_simulado(), **numeracion.serie())[0]


def reservas(simulada):
    return ReservaEmision.objects.filter(simulada=simulada, **numeracion.serie(),
        consumida=False, operacion__estado__in=['PENDIENTE', 'PAGADA'])


def disponibles(simulada, operacion_id=None):
    desde, hasta = numeracion.limites('1')
    facturas = FacturaElectronica.objects.filter(simulada=simulada, **numeracion.serie())
    ocupadas = facturas.filter(consume_emision=True).count() + facturas.filter(
        consume_emision=False, estado='VERIFICAR', numero__isnull=False).count()
    retenidas = reservas(simulada).exclude(operacion_id=operacion_id).count()
    siguiente = numeracion.siguiente('1', simulada)
    numeros = max(0, min(hasta, 9999999) - int(siguiente) + 1) if siguiente else 0
    return max(0, min(min(hasta - desde + 1, 49) - ocupadas, numeros) - retenidas)


def numeros_para_reintento(simulada):
    siguiente = numeracion.siguiente('1', simulada)
    hasta = min(numeracion.limites('1')[1], 9999999)
    return max(0, hasta - int(siguiente) + 1 - reservas(simulada).count()) if siguiente else 0


def restaurar(operacion):
    ReservaEmision.objects.filter(operacion=operacion).update(consumida=False)


@transaction.atomic
def reservar(operacion):
    # El llamador bloquea primero la operación. Todas las emisiones y reservas
    # comparten el bloqueo de la serie, incluso si todavía no existe contador.
    bloquear()
    simulada = cliente_fs.modo_simulado()
    if reservas(simulada).filter(operacion=operacion).exists():
        return
    if disponibles(simulada) <= 0:
        raise ValidationError({'detail': SIN_CUPO})
    ReservaEmision.objects.update_or_create(operacion=operacion, defaults={
        'simulada': simulada, **numeracion.serie(), 'consumida': False})


def consumir(operacion):
    reservas(cliente_fs.modo_simulado()).filter(operacion=operacion).update(consumida=True)
