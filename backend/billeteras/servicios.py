"""Asientos inversos de una operación, sin modificar caja ni medios externos."""
from django.core.exceptions import ValidationError
from django.db import transaction
from .models import Billetera, Movimiento


@transaction.atomic
def revertir_billeteras(op):
    ids = {pk for pk in (op.billetera_origen_id, op.billetera_destino_id) if pk}
    billeteras = {b.pk: b for b in Billetera.objects.select_for_update().filter(
        pk__in=ids).order_by('pk')}
    for pk, moneda, monto, tipo in (
        (op.billetera_destino_id, op.moneda_destino_id, op.monto_recibido, Movimiento.TIPO_DEBITO),
        (op.billetera_origen_id, op.moneda_origen_id, op.monto_enviado, Movimiento.TIPO_CREDITO),
    ):
        if not pk:
            continue
        b = billeteras[pk]
        if b.cliente_id != op.cliente_id or b.moneda_id != moneda:
            raise ValidationError('La billetera no corresponde al cliente o moneda de la operación.')
        if tipo == Movimiento.TIPO_DEBITO and b.saldo < monto:
            raise ValidationError(f'Saldo insuficiente en billetera {b.moneda.codigo}. Fondeá la billetera y reintentá la reversión.')
        b.saldo += monto if tipo == Movimiento.TIPO_CREDITO else -monto
        b.save(update_fields=['saldo', 'actualizado_en'])
        Movimiento.objects.create(billetera=b, operacion=op, tipo=tipo,
                                  monto=monto, saldo_resultante=b.saldo)


