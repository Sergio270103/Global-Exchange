"""Lógica del saldo de billetes de las cajas (PI-44).

Todo cambio de ``SaldoBillete`` pasa por :func:`registrar_movimiento`,
así el saldo y su movimiento de auditoría se guardan juntos o no se
guarda ninguno. Las historias que mueven efectivo reutilizan esta
función:

- PI-43 (registrar billetes entregados): ``tipo=ENTREGA``.
- PI-75 (operación cambiaria presencial): ``INGRESO`` por lo que trae
  el cliente y ``RETIRO`` por lo que se le entrega.
"""

from collections import OrderedDict
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from .models import (
    ArqueoCaja, Caja, DetalleArqueo, DetalleMovimiento, Denominacion,
    MovimientoCaja, SaldoBillete,
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
        observacion=observacion[:255],
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
