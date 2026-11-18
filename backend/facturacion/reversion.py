"""Reversión contable posterior a la aprobación fiscal, una sola vez."""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from billeteras.servicios import revertir_billeteras
from cajas.models import Caja, MovimientoCaja, TurnoCaja
from cajas.servicios import registrar_movimiento
from operaciones.models import Operacion
from .models import FacturaElectronica


def registrar_solicitud(factura, rol, sub, nombre, tipo):
    # Ninguna solicitud nueva puede quedar sin contexto de reversión.
    if rol not in ('cajero', 'administrador') or not sub:
        raise ValidationError('Se requiere el rol y el usuario solicitante.')
    factura.gestion_rol = rol
    factura.gestion_usuario_sub = sub
    factura.gestion_usuario_nombre = nombre[:160]
    factura.gestion_tipo = tipo
    factura.reversion_aplicada = False
    factura.reversion_pendiente = False
    factura.reversion_error = ''
    factura.reversion_turno = (TurnoCaja.objects.filter(
        cajero_id=sub, cerrado_en__isnull=True, caja__activa=True).first()
        if rol == 'cajero' else None)
    factura.estado = FacturaElectronica.ESTADO_PROCESANDO
    factura.save()


def _caja(factura, op, reintento):
    turno = factura.reversion_turno
    if reintento and (turno is None or not turno.abierto):
        turno = TurnoCaja.objects.filter(cajero_id=factura.gestion_usuario_sub,
            cerrado_en__isnull=True, caja__activa=True).first()
    if turno is None:
        raise ValidationError('El cajero solicitante no tiene turno abierto. Abrí un turno y reintentá la reversión.')
    # El cierre también bloquea Caja antes de TurnoCaja: mismo orden de locks.
    caja = Caja.objects.select_for_update().get(pk=turno.caja_id)
    turno = TurnoCaja.objects.select_for_update().get(pk=turno.pk)
    if not turno.abierto or turno.cajero_id != factura.gestion_usuario_sub:
        raise ValidationError('El turno del cajero solicitante está cerrado. Abrí un turno y reintentá la reversión.')
    if op.metodo_pago not in ('efectivo', 'tarjeta', 'transferencia'):
        raise ValidationError('La operación no es presencial; no se puede revertir en caja.')
    comunes = dict(caja=caja, usuario_id=factura.gestion_usuario_sub,
        usuario_nombre=factura.gestion_usuario_nombre, turno=turno,
        observacion=f'Reversión fiscal factura {factura.pk}, OP-{op.pk}')
    if op.metodo_pago == 'efectivo':
        registrar_movimiento(tipo=MovimientoCaja.TIPO_RETIRO, moneda=op.moneda_origen,
                             monto=op.monto_enviado, **comunes)
    registrar_movimiento(tipo=MovimientoCaja.TIPO_INGRESO, moneda=op.moneda_destino,
                         monto=op.monto_recibido, **comunes)
    factura.reversion_turno = turno


@transaction.atomic
def aplicar_reversion(factura, *, reintento=False):
    f = FacturaElectronica.objects.select_for_update().get(pk=factura.pk)
    if not f.gestion_rol or f.reversion_aplicada:
        factura.refresh_from_db()
        return factura
    if f.estado not in ('ANULADA', 'DEVUELTA'):
        raise ValidationError('SIFEN todavía no aprobó la gestión. No se pueden revertir saldos.')
    op = Operacion.objects.select_for_update().get(pk=f.operacion_id)
    # El estado fiscal/operativo se conserva aun si falla el asiento contable.
    op.estado = Operacion.ESTADO_CANCELADA
    op.fecha_cancelacion = op.fecha_cancelacion or timezone.now()
    op.cancelada_por = f.gestion_usuario_sub[:64]
    op.cancelada_por_nombre = f.gestion_usuario_nombre
    op.motivo_cancelacion = Operacion.MOTIVO_ANULADA
    op.save(update_fields=['estado', 'fecha_cancelacion', 'cancelada_por',
                           'cancelada_por_nombre', 'motivo_cancelacion'])
    try:
        # Savepoint: ambos lados y sus movimientos se revierten si uno falla.
        with transaction.atomic():
            if f.gestion_rol == 'administrador':
                revertir_billeteras(op)
            elif f.gestion_rol == 'cajero':
                _caja(f, op, reintento)
            else:
                raise ValidationError('Rol solicitante inválido.')
    except ValidationError as exc:
        f.reversion_pendiente = True
        f.reversion_error = ' '.join(exc.messages)[:500]
    else:
        f.reversion_aplicada = True
        f.reversion_pendiente = False
        f.reversion_error = ''
    f.save(update_fields=['reversion_aplicada', 'reversion_pendiente',
                         'reversion_error', 'reversion_turno'])
    factura.refresh_from_db()
    return factura


@transaction.atomic
def revertir_emision_rechazada(factura):
    """La idempotencia pertenece a la operación, aun con varios intentos de factura."""
    op = Operacion.objects.select_for_update().get(pk=factura.operacion_id)
    if op.reversion_emision_aplicada:
        return
    # No volver a revertir una cancelación previa por otro flujo.
    if op.estado != Operacion.ESTADO_PAGADA and op.motivo_cancelacion != Operacion.MOTIVO_SIFEN:
        return
    op.estado = Operacion.ESTADO_CANCELADA
    op.motivo_cancelacion = Operacion.MOTIVO_SIFEN
    op.fecha_cancelacion = op.fecha_cancelacion or timezone.now()
    try:
        with transaction.atomic():
            revertir_billeteras(op)
    except ValidationError as exc:
        op.reversion_emision_pendiente = True
        op.reversion_emision_error = ' '.join(exc.messages)[:500]
    else:
        op.reversion_emision_aplicada = True
        op.reversion_emision_pendiente = False
        op.reversion_emision_error = ''
    op.save(update_fields=['estado', 'motivo_cancelacion', 'fecha_cancelacion',
        'reversion_emision_aplicada', 'reversion_emision_pendiente', 'reversion_emision_error'])
    factura.operacion = op
