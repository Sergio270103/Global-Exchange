"""Lógica del saldo de billetes de las cajas (PI-44).

Todo cambio de ``SaldoBillete`` pasa por :func:`registrar_movimiento`,
así el saldo y su movimiento de auditoría se guardan juntos o no se
guarda ninguno. Las historias que mueven efectivo reutilizan esta
función:

- PI-43 (registrar billetes entregados): ``tipo=ENTREGA``, solo a
  través de :func:`confirmar_entrega`.
- PI-75 (operación cambiaria presencial): ``INGRESO`` por lo que trae
  el cliente y ``RETIRO`` por lo que se le entrega.
"""

from collections import OrderedDict
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from .models import (
    ArqueoCaja, Caja, DetalleArqueo, DetalleEntrega, DetalleMovimiento,
    Denominacion, EntregaBilletes, MovimientoCaja, SaldoBillete,
)


class SaldoInsuficiente(ValidationError):
    """La caja no tiene los billetes que se intentan retirar."""


def _formatear(valor: Decimal) -> str:
    return f'{valor.normalize():f}'


@transaction.atomic
def registrar_movimiento(
    caja: Caja,
    tipo: str,
    moneda,
    detalle: list[tuple[Denominacion, int]],
    usuario_id: str,
    usuario_nombre: str = '',
    observacion: str = '',
    entrega: EntregaBilletes | None = None,
) -> MovimientoCaja:
    """Registra un movimiento y actualiza el saldo de la caja.

    :param detalle: pares ``(denominacion, cantidad)`` de la moneda indicada.
    :raises SaldoInsuficiente: si un retiro deja una denominación en negativo.
    :raises ValidationError: si la caja está inactiva o el detalle no es válido.
    """
    if tipo not in dict(MovimientoCaja.TIPOS):
        raise ValidationError('Tipo de movimiento inválido.')
    # Bloquea la caja: dos movimientos simultáneos sobre la misma caja se
    # aplican uno después del otro (RNF13).
    caja = Caja.objects.select_for_update().get(pk=caja.pk)
    if not caja.activa:
        raise ValidationError('La caja está inactiva.')
    if not detalle:
        raise ValidationError('Indicá al menos una denominación.')

    vistos = set()
    for denominacion, cantidad in detalle:
        if denominacion.moneda_id != moneda.pk:
            raise ValidationError(
                f'La denominación {denominacion} no corresponde a {moneda.codigo}.')
        if denominacion.pk in vistos:
            raise ValidationError(f'La denominación {denominacion} está repetida.')
        if cantidad <= 0:
            raise ValidationError('Las cantidades deben ser mayores a cero.')
        vistos.add(denominacion.pk)

    suma = tipo in MovimientoCaja.TIPOS_SUMAN
    saldos = []
    faltantes = []
    for denominacion, cantidad in detalle:
        saldo, _ = SaldoBillete.objects.select_for_update().get_or_create(
            caja=caja, denominacion=denominacion)
        if not suma and saldo.cantidad < cantidad:
            faltantes.append(
                f'{denominacion}: hay {saldo.cantidad}, se piden {cantidad}')
        saldos.append((saldo, denominacion, cantidad))
    if faltantes:
        raise SaldoInsuficiente(
            'Billetes insuficientes en la caja. ' + '; '.join(faltantes) + '.')

    total = sum((d.valor * c for d, c in detalle), Decimal('0'))
    movimiento = MovimientoCaja.objects.create(
        caja=caja, tipo=tipo, moneda=moneda, total=total,
        usuario_keycloak_id=usuario_id or '', usuario_nombre=usuario_nombre[:160],
        observacion=observacion[:255], entrega=entrega,
    )
    for saldo, denominacion, cantidad in saldos:
        saldo.cantidad = saldo.cantidad + cantidad if suma else saldo.cantidad - cantidad
        saldo.save(update_fields=['cantidad', 'actualizado_en'])
        DetalleMovimiento.objects.create(
            movimiento=movimiento, denominacion=denominacion,
            cantidad=cantidad, saldo_resultante=saldo.cantidad,
        )
    return movimiento


def saldo_por_moneda(caja: Caja) -> list[dict]:
    """Inventario de la caja agrupado por moneda y denominación (RF56).

    Incluye todas las denominaciones activas de las monedas activas (con
    cantidad 0 si no hay billetes), y además cualquier denominación que
    todavía tenga billetes aunque se haya desactivado.
    """
    saldos = {
        s.denominacion_id: s.cantidad
        for s in SaldoBillete.objects.filter(caja=caja)
    }
    denominaciones = (
        Denominacion.objects.select_related('moneda')
        .filter(moneda__activo=True, activa=True)
        | Denominacion.objects.select_related('moneda').filter(
            pk__in=[pk for pk, cant in saldos.items() if cant > 0])
    ).distinct().order_by('moneda__codigo', '-valor')

    grupos: OrderedDict[int, dict] = OrderedDict()
    for den in denominaciones:
        moneda = den.moneda
        grupo = grupos.setdefault(moneda.pk, {
            'moneda': moneda.pk,
            'moneda_codigo': moneda.codigo,
            'moneda_nombre': moneda.nombre,
            'simbolo': moneda.simbolo,
            'decimales': moneda.decimales,
            'total': Decimal('0'),
            'cantidad_billetes': 0,
            'denominaciones': [],
        })
        cantidad = saldos.get(den.pk, 0)
        subtotal = den.valor * cantidad
        grupo['denominaciones'].append({
            'denominacion': den.pk,
            'valor': _formatear(den.valor),
            'cantidad': cantidad,
            'subtotal': _formatear(subtotal) if subtotal else '0',
        })
        grupo['total'] += subtotal
        grupo['cantidad_billetes'] += cantidad

    resultado = []
    for grupo in grupos.values():
        grupo['total'] = _formatear(grupo['total']) if grupo['total'] else '0'
        resultado.append(grupo)
    return resultado


@transaction.atomic
def registrar_arqueo(
    caja: Caja,
    conteo: dict[int, int] | None,
    usuario_id: str,
    usuario_nombre: str = '',
    observacion: str = '',
) -> ArqueoCaja:
    """Guarda una foto del estado de la caja para auditoría.

    :param conteo: ``{denominacion_id: cantidad_contada}``. Las
        denominaciones que no se informen se toman como contadas igual
        al sistema. Con ``None`` el arqueo solo respalda el saldo actual.

    El arqueo no modifica el saldo: si hay diferencias, se corrigen con
    un movimiento de ingreso o retiro, que queda trazado aparte.
    """
    caja = Caja.objects.select_for_update().get(pk=caja.pk)
    conteo = conteo or {}
    saldos = {
        s.denominacion_id: s.cantidad
        for s in SaldoBillete.objects.select_for_update().filter(caja=caja)
    }
    validas = set(Denominacion.objects.filter(pk__in=conteo.keys()).values_list('pk', flat=True))
    desconocidas = set(conteo) - validas
    if desconocidas:
        raise ValidationError('Hay denominaciones inexistentes en el conteo.')

    arqueo = ArqueoCaja.objects.create(
        caja=caja, usuario_keycloak_id=usuario_id or '',
        usuario_nombre=usuario_nombre[:160], observacion=observacion[:255],
    )
    con_diferencias = False
    for den_id in sorted(set(saldos) | set(conteo)):
        sistema = saldos.get(den_id, 0)
        contada = conteo.get(den_id, sistema)
        if sistema == 0 and contada == 0:
            continue
        if contada != sistema:
            con_diferencias = True
        DetalleArqueo.objects.create(
            arqueo=arqueo, denominacion_id=den_id,
            cantidad_sistema=sistema, cantidad_contada=contada,
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

    Genera un movimiento ``ENTREGA`` por cada divisa, todos en la misma
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
            detalle=[(l.denominacion, l.cantidad) for l in lineas],
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
