"""Lógica del saldo de efectivo de las cajas (PI-44, PI-78).

El saldo se lleva por **total de cada divisa** (decisión de la Product
Owner, PI-78): la denominación solo se registra en las entregas de
billetes del administrador (PI-43).

Todo cambio de ``SaldoCaja`` pasa por :func:`registrar_movimiento`, así
el saldo y su movimiento de auditoría se guardan juntos o no se guarda
ninguno. Las historias que mueven efectivo reutilizan esta función:

- PI-43 (entregas de billetes): ``tipo=ENTREGA``, solo a través de
  :func:`confirmar_entrega`.
- PI-75 (operación cambiaria presencial): ``INGRESO`` por el efectivo que
  trae el cliente y ``RETIRO`` por la divisa que se le entrega.
"""

from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from monedas.models import Moneda

from .models import (
    ArqueoCaja, ArqueoMoneda, Caja, DetalleEntrega, Denominacion,
    EntregaBilletes, MovimientoCaja, SaldoCaja,
)


class SaldoInsuficiente(ValidationError):
    """La caja no tiene saldo suficiente en la divisa que se intenta retirar."""


def _formatear(valor: Decimal) -> str:
    """``Decimal`` como texto sin ceros de más (``1100.00`` → ``1100``)."""
    if not valor:
        return '0'
    return f'{valor.normalize():f}'


def validar_monto(moneda: Moneda, monto: Decimal) -> Decimal:
    """Verifica que el monto sea positivo y respete los decimales de la moneda."""
    if monto is None or monto <= 0:
        raise ValidationError('El monto debe ser mayor a cero.')
    if monto != round(monto, moneda.decimales):
        raise ValidationError(
            f'{moneda.codigo} admite {moneda.decimales} decimales.')
    return monto


@transaction.atomic
def registrar_movimiento(
    caja: Caja,
    tipo: str,
    moneda: Moneda,
    monto: Decimal,
    usuario_id: str,
    usuario_nombre: str = '',
    observacion: str = '',
    entrega: EntregaBilletes | None = None,
) -> MovimientoCaja:
    """Registra un movimiento y actualiza el saldo de la divisa en la caja.

    :raises SaldoInsuficiente: si un retiro supera el saldo de la divisa.
    :raises ValidationError: si la caja está inactiva o el monto no es válido.
    """
    if tipo not in dict(MovimientoCaja.TIPOS):
        raise ValidationError('Tipo de movimiento inválido.')
    monto = validar_monto(moneda, Decimal(monto))
    # Bloquea la caja: dos movimientos simultáneos sobre la misma caja se
    # aplican uno después del otro (RNF13).
    caja = Caja.objects.select_for_update().get(pk=caja.pk)
    if not caja.activa:
        raise ValidationError('La caja está inactiva.')

    saldo, _ = SaldoCaja.objects.select_for_update().get_or_create(caja=caja, moneda=moneda)
    if tipo in MovimientoCaja.TIPOS_SUMAN:
        saldo.monto += monto
    else:
        if saldo.monto < monto:
            raise SaldoInsuficiente(
                f'Saldo insuficiente de {moneda.codigo}: hay {_formatear(saldo.monto)}, '
                f'se piden {_formatear(monto)}.')
        saldo.monto -= monto
    saldo.save(update_fields=['monto', 'actualizado_en'])

    return MovimientoCaja.objects.create(
        caja=caja, tipo=tipo, moneda=moneda, total=monto,
        saldo_resultante=saldo.monto,
        usuario_keycloak_id=usuario_id or '', usuario_nombre=usuario_nombre[:160],
        observacion=observacion[:255], entrega=entrega,
    )


def saldo_por_moneda(caja: Caja) -> list[dict]:
    """Saldo de la caja por divisa (RF56).

    Incluye todas las monedas activas (con saldo 0 si no hay efectivo) y
    además cualquier moneda desactivada que todavía tenga saldo.
    """
    saldos = {s.moneda_id: s.monto for s in SaldoCaja.objects.filter(caja=caja)}
    monedas = Moneda.objects.filter(activo=True) | Moneda.objects.filter(
        pk__in=[pk for pk, monto in saldos.items() if monto > 0])
    return [
        {
            'moneda': m.pk,
            'moneda_codigo': m.codigo,
            'moneda_nombre': m.nombre,
            'simbolo': m.simbolo,
            'decimales': m.decimales,
            'total': _formatear(saldos.get(m.pk, Decimal('0'))),
        }
        for m in monedas.distinct().order_by('codigo')
    ]


@transaction.atomic
def registrar_arqueo(
    caja: Caja,
    conteo: dict[int, Decimal] | None,
    usuario_id: str,
    usuario_nombre: str = '',
    observacion: str = '',
) -> ArqueoCaja:
    """Guarda el recuento de la caja comparando el sistema con lo contado.

    :param conteo: ``{moneda_id: monto_contado}``. Las monedas que no se
        informen se toman como contadas igual al sistema. Con ``None`` el
        arqueo solo respalda el saldo actual.

    El arqueo no modifica el saldo: deja constancia de las diferencias
    (faltante o sobrante) para que se revisen.
    """
    caja = Caja.objects.select_for_update().get(pk=caja.pk)
    conteo = conteo or {}
    if any(monto is None or monto < 0 for monto in conteo.values()):
        raise ValidationError('Los montos contados no pueden ser negativos.')
    monedas = {m.pk: m for m in Moneda.objects.filter(pk__in=conteo.keys())}
    if set(conteo) - set(monedas):
        raise ValidationError('Hay monedas inexistentes en el conteo.')
    for moneda_id, monto in conteo.items():
        moneda = monedas[moneda_id]
        if monto != round(monto, moneda.decimales):
            raise ValidationError(f'{moneda.codigo} admite {moneda.decimales} decimales.')

    saldos = {
        s.moneda_id: s.monto
        for s in SaldoCaja.objects.select_for_update().filter(caja=caja)
    }
    arqueo = ArqueoCaja.objects.create(
        caja=caja, usuario_keycloak_id=usuario_id or '',
        usuario_nombre=usuario_nombre[:160], observacion=observacion[:255],
    )
    con_diferencias = False
    for moneda_id in sorted(set(saldos) | set(conteo)):
        sistema = saldos.get(moneda_id, Decimal('0'))
        contado = Decimal(conteo.get(moneda_id, sistema))
        if not sistema and not contado:
            continue
        if contado != sistema:
            con_diferencias = True
        ArqueoMoneda.objects.create(
            arqueo=arqueo, moneda_id=moneda_id,
            monto_sistema=sistema, monto_contado=contado,
        )
    if con_diferencias:
        arqueo.con_diferencias = True
        arqueo.save(update_fields=['con_diferencias'])
    return arqueo


# --- Entregas de billetes (PI-43, RF57) --------------------------------

def _validar_detalle_entrega(detalle: list[tuple[Denominacion, int]]) -> None:
    if not detalle:
        raise ValidationError('Indicá al menos una denominación.')
    vistos = set()
    for denominacion, cantidad in detalle:
        if denominacion.pk in vistos:
            raise ValidationError(f'La denominación {denominacion} está repetida.')
        if cantidad <= 0:
            raise ValidationError('Las cantidades deben ser mayores a cero.')
        if not denominacion.activa or not denominacion.moneda.activo:
            raise ValidationError(f'La denominación {denominacion} no está habilitada.')
        vistos.add(denominacion.pk)


def totales_entrega(entrega: EntregaBilletes) -> list[dict]:
    """Total entregado por divisa."""
    grupos: dict[int, dict] = {}
    for linea in entrega.detalle.all():
        moneda = linea.denominacion.moneda
        grupo = grupos.setdefault(moneda.pk, {
            'moneda': moneda.pk,
            'moneda_codigo': moneda.codigo,
            'simbolo': moneda.simbolo,
            'decimales': moneda.decimales,
            'total': Decimal('0'),
            'cantidad_billetes': 0,
        })
        grupo['total'] += linea.subtotal
        grupo['cantidad_billetes'] += linea.cantidad
    resultado = sorted(grupos.values(), key=lambda g: g['moneda_codigo'])
    for grupo in resultado:
        grupo['total'] = _formatear(grupo['total'])
    return resultado


@transaction.atomic
def crear_entrega(
    caja: Caja,
    detalle: list[tuple[Denominacion, int]],
    usuario_id: str,
    usuario_nombre: str = '',
    observacion: str = '',
) -> EntregaBilletes:
    """Registra una entrega PENDIENTE. Todavía no modifica el saldo."""
    if not caja.activa:
        raise ValidationError('La caja está inactiva.')
    _validar_detalle_entrega(detalle)
    entrega = EntregaBilletes.objects.create(
        caja=caja, entregado_por_id=usuario_id or '',
        entregado_por_nombre=usuario_nombre[:160], observacion=observacion[:255],
    )
    DetalleEntrega.objects.bulk_create([
        DetalleEntrega(entrega=entrega, denominacion=d, cantidad=c) for d, c in detalle
    ])
    return entrega


def _tomar_pendiente(entrega: EntregaBilletes) -> EntregaBilletes:
    """Bloquea la entrega y verifica que siga pendiente (evita responder dos veces)."""
    entrega = EntregaBilletes.objects.select_for_update().get(pk=entrega.pk)
    if entrega.estado != EntregaBilletes.ESTADO_PENDIENTE:
        raise ValidationError(
            f'La entrega ya está {entrega.get_estado_display().lower()}.')
    return entrega


def _no_es_quien_entrego(entrega: EntregaBilletes, usuario_id: str) -> None:
    if usuario_id and usuario_id == entrega.entregado_por_id:
        raise PermissionDenied('Quien entregó los billetes no puede responder su propia entrega.')


@transaction.atomic
def confirmar_entrega(
    entrega: EntregaBilletes, usuario_id: str, usuario_nombre: str = '',
) -> EntregaBilletes:
    """El cajero confirma que recibió y contó los billetes: se suman al saldo.

    Genera un movimiento ``ENTREGA`` por cada divisa con el total entregado
    (el detalle por denominación queda en la entrega), todos en la misma
    transacción: o se suma todo o no se suma nada.
    """
    entrega = _tomar_pendiente(entrega)
    _no_es_quien_entrego(entrega, usuario_id)

    por_moneda: dict[int, list[DetalleEntrega]] = {}
    for linea in entrega.detalle.select_related('denominacion__moneda'):
        por_moneda.setdefault(linea.denominacion.moneda_id, []).append(linea)

    referencia = f'Entrega #{entrega.pk}'
    if entrega.entregado_por_nombre:
        referencia += f' de {entrega.entregado_por_nombre}'
    for lineas in por_moneda.values():
        registrar_movimiento(
            caja=entrega.caja, tipo=MovimientoCaja.TIPO_ENTREGA,
            moneda=lineas[0].denominacion.moneda,
            monto=sum((l.subtotal for l in lineas), Decimal('0')),
            usuario_id=usuario_id, usuario_nombre=usuario_nombre,
            observacion=referencia, entrega=entrega,
        )
    return _responder(entrega, EntregaBilletes.ESTADO_CONFIRMADA, '', usuario_id, usuario_nombre)


@transaction.atomic
def rechazar_entrega(
    entrega: EntregaBilletes, motivo: str, usuario_id: str, usuario_nombre: str = '',
) -> EntregaBilletes:
    """El cajero rechaza la entrega (por ejemplo, lo contado no coincide)."""
    entrega = _tomar_pendiente(entrega)
    _no_es_quien_entrego(entrega, usuario_id)
    return _responder(entrega, EntregaBilletes.ESTADO_RECHAZADA, motivo, usuario_id, usuario_nombre)


@transaction.atomic
def cancelar_entrega(
    entrega: EntregaBilletes, motivo: str, usuario_id: str, usuario_nombre: str = '',
) -> EntregaBilletes:
    """El administrador anula una entrega que todavía no se confirmó."""
    entrega = _tomar_pendiente(entrega)
    return _responder(entrega, EntregaBilletes.ESTADO_CANCELADA, motivo, usuario_id, usuario_nombre)


def _responder(entrega, estado, motivo, usuario_id, usuario_nombre) -> EntregaBilletes:
    motivo = (motivo or '').strip()
    if estado != EntregaBilletes.ESTADO_CONFIRMADA and not motivo:
        raise ValidationError('Indicá el motivo.')
    entrega.estado = estado
    entrega.motivo = motivo[:255]
    entrega.respondido_por_id = usuario_id or ''
    entrega.respondido_por_nombre = usuario_nombre[:160]
    entrega.fecha_respuesta = timezone.now()
    entrega.save(update_fields=[
        'estado', 'motivo', 'respondido_por_id', 'respondido_por_nombre', 'fecha_respuesta'])
    return entrega
