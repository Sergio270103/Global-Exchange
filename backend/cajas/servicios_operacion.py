"""Operación cambiaria presencial del cajero (PI-75, RF60).

El cajero atiende en ventanilla: toma la cotización vigente, crea la
operación a nombre del cliente presencial, mueve el efectivo de la caja
y emite el comprobante interno (PI-42). Todo en una sola transacción:
o se guarda la operación, el saldo y el comprobante, o no se guarda nada.

Flujo de efectivo (decisión de la Product Owner):

- La caja **siempre** entrega la divisa que el cliente recibe, así que
  registra un ``RETIRO`` por ``monto_recibido`` de ``moneda_destino``.
- Solo el pago en **efectivo** hace que la caja reciba algo: un ``INGRESO``
  por ``monto_enviado`` de ``moneda_origen``. Con tarjeta o transferencia
  el pago ocurre fuera del sistema, así que la caja solo registra la salida.

El saldo se lleva por total de cada divisa (PI-78), sin detalle de billetes.
"""

from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from clientes.models import Cliente, Comision
from monedas.models import Moneda
from operaciones.models import Operacion

from .models import Caja, MovimientoCaja, SaldoCaja
from .servicios import CajaCerrada, registrar_movimiento, turno_abierto

#: Medios de pago admitidos en ventanilla (PI-75). No se usa billetera.
MEDIO_EFECTIVO = 'efectivo'
MEDIO_TARJETA = 'tarjeta'
MEDIO_TRANSFERENCIA = 'transferencia'
MEDIOS_PAGO = (
    (MEDIO_EFECTIVO, 'Efectivo'),
    (MEDIO_TARJETA, 'Tarjeta de crédito/débito'),
    (MEDIO_TRANSFERENCIA, 'Transferencia bancaria'),
)

#: Solo el efectivo mueve dinero hacia la caja.
MEDIOS_QUE_INGRESAN = (MEDIO_EFECTIVO,)


class CajaSinTurno(CajaCerrada):
    """La caja no tiene turno abierto, así que no se puede operar (PI-75)."""


def _ajuste_de(cliente: Cliente) -> Decimal:
    """Ajuste interno de precio por categoría (ver PI-45/nota de la profesora)."""
    try:
        return Decimal(str(Comision.objects.get(categoria=cliente.categoria).porcentaje))
    except Comision.DoesNotExist:
        return Decimal('0')


def saldo_disponible(caja: Caja, moneda: Moneda) -> Decimal:
    """Efectivo que la caja tiene de esa moneda."""
    saldo = SaldoCaja.objects.filter(caja=caja, moneda=moneda).first()
    return saldo.monto if saldo else Decimal('0')


def _exigir_caja_abierta(caja: Caja) -> None:
    """Valida que la caja exista, esté activa y tenga turno abierto.

    :raises CajaSinTurno: si la caja está cerrada (PI-79).
    """
    if not caja.activa:
        raise ValidationError('La caja está inactiva.')
    if turno_abierto(caja) is None:
        raise CajaSinTurno(
            f'La caja {caja.nombre} está cerrada. Se abre cuando el cajero '
            'confirma la entrega de billetes del administrador.')


def _tasa_venta(codigo: str) -> Decimal:
    """Tasa de venta vigente de una moneda (1 para PYG)."""
    from operaciones.views import _ultima_tasa

    if codigo == 'PYG':
        return Decimal('1')
    try:
        moneda = Moneda.objects.get(codigo=codigo, activo=True)
    except Moneda.DoesNotExist as exc:
        raise ValidationError(f'La moneda {codigo} no está admitida.') from exc
    tasa = _ultima_tasa(moneda, 'venta')
    if tasa is None:
        raise ValidationError(f'Todavía no hay cotización para {codigo}.')
    return tasa


def resolver_monto_divisa(
    codigo_div: str,
    codigo_contra: str,
    monto: Decimal,
    moneda_del_monto: str,
    pct: Decimal,
) -> Decimal:
    """Convierte el monto que escribió el cajero al de la divisa operada.

    El campo del panel dice ``Monto (PYG)``: el cajero escribe en la moneda
    de origen, pero el backend opera sobre la divisa que se compra o vende.
    Sin esta conversión, escribir 2.000.000 se interpretaría como
    2.000.000 de dólares.

    - Si el monto está en la misma divisa que se opera, ya está listo.
    - Si está en la contraparte (por ejemplo PYG al comprar dólares), ese
      monto es lo que el cliente **entrega**. Como el ajuste por categoría
      se suma a lo que paga, hay que descontarlo del total para saber
      cuántos recibe: ``monto / (tasa * (1 + pct))``.

    :raises ValidationError: si la moneda del monto no participa en la
        operación, o si no hay tasa vigente.
    """
    if moneda_del_monto == codigo_div:
        return monto
    if moneda_del_monto != codigo_contra:
        raise ValidationError(
            f'El monto está en {moneda_del_monto}, que no es ni la divisa '
            f'operada ({codigo_div}) ni su contraparte ({codigo_contra}).'
        )
    factor = _tasa_venta(codigo_div) * (Decimal('1') + pct / Decimal('100'))
    if factor <= 0:
        raise ValidationError('No se puede cotizar con la tasa vigente.')
    return monto / factor


def cotizar_ventanilla(
    cliente: Cliente,
    tipo_operacion: str,
    moneda: str,
    monto: Decimal,
    moneda_contraparte: str = 'PYG',
    moneda_del_monto: str | None = None,
) -> dict:
    """Cotiza una operación presencial sin crearla (PI-75).

    Devuelve el desglose que el cajero muestra antes de confirmar: la
    moneda que entra, la que sale, los montos y la tasa aplicada. Reutiliza
    la misma rutina de :func:`operaciones.views._cotizar` que usa el alta
    normal, así que el precio que se muestra es el que se guarda.

    :param monto: lo que escribió el cajero, en ``moneda_del_monto``.
    :param moneda_del_monto: moneda del campo de monto (la de origen en la
        pantalla). Si se omite, se asume que ya viene en la divisa operada.
    """
    from operaciones.views import ErrorCotizacion, _cotizar

    if not cliente.activo:
        raise ValidationError('El cliente está inactivo.')

    codigo_div = moneda.strip().upper()
    codigo_contra = (moneda_contraparte or 'PYG').strip().upper()
    if codigo_div == 'PYG':
        raise ValidationError('La divisa operada no puede ser el guaraní.')

    pct = _ajuste_de(cliente)
    monto_divisa = resolver_monto_divisa(
        codigo_div, codigo_contra, monto,
        (moneda_del_monto or codigo_div).strip().upper(), pct,
    )
    try:
        calculo = _cotizar(tipo_operacion, codigo_div, codigo_contra, monto_divisa, pct)
    except ErrorCotizacion as exc:
        raise ValidationError(str(exc)) from exc

    origen = calculo['moneda_origen']
    destino = calculo['moneda_destino']

    # El desglose va siempre en moneda destino (lo que el cliente recibe)
    # y la resta cierra: bruto - ajuste = neto.
    es_venta = tipo_operacion == Operacion.TIPO_VENTA
    monto_neto = calculo['monto_recibido']
    if es_venta:
        # En venta el ajuste se descuenta del neto.
        monto_comision = calculo['monto_comision']
        monto_bruto = monto_neto + monto_comision
    else:
        # En compra el ajuste se suma a lo que paga. Expresado en la moneda
        # que recibe, el bruto es lo que habría recibido sin ajuste:
        # lo que entrega, convertido a la tasa de venta.
        tasa_venta = _tasa_venta(destino.codigo)
        monto_bruto = (
            _texto_a_monto(calculo['monto_enviado'] / tasa_venta, destino)
            if tasa_venta > 0 else monto_neto
        )
        monto_comision = _texto_a_monto(monto_bruto - monto_neto, destino)

    return {
        'tipo_operacion': tipo_operacion,
        'moneda_origen': origen.pk,
        'moneda_origen_codigo': origen.codigo,
        'moneda_origen_nombre': origen.nombre,
        'moneda_origen_simbolo': origen.simbolo,
        'moneda_origen_decimales': origen.decimales,
        'moneda_destino': destino.pk,
        'moneda_destino_codigo': destino.codigo,
        'moneda_destino_nombre': destino.nombre,
        'moneda_destino_simbolo': destino.simbolo,
        'moneda_destino_decimales': destino.decimales,
        'monto_enviado': str(calculo['monto_enviado']),
        'monto_recibido': str(calculo['monto_recibido']),
        'tasa_aplicada': str(calculo['cotizacion_aplicada']),
        # Desglose del ajuste, para que la vista previa muestre lo mismo
        # que el comprobante impreso.
        'monto_bruto': _texto_moneda(monto_bruto, destino),
        'monto_comision': _texto_moneda(monto_comision, destino),
        'porcentaje_ajuste': _texto(calculo['porcentaje_comision_aplicado']),
        'comision_descuenta_destino': es_venta,
        # Tasa directa, igual a la que imprime el comprobante. El factor
        # `cotizacion_aplicada` va invertido (0,256 = 1/3,9) y solo sirve
        # para el cálculo interno, por eso no se muestra al cajero.
        'tasa_origen': (
            None if calculo['tasa_origen'] is None else str(calculo['tasa_origen'])
        ),
        'tasa_destino': (
            None if calculo['tasa_destino'] is None else str(calculo['tasa_destino'])
        ),
        # Qué paga el cliente y qué recibe, ya con el precio final.
        'cliente_paga': f'{_texto(calculo["monto_enviado"])} {origen.codigo}',
        'cliente_recibe': f'{_texto(calculo["monto_recibido"])} {destino.codigo}',
    }


def _texto(monto: Decimal) -> str:
    """``Decimal`` sin ceros de más, como en el saldo de caja (``750000``, ``100``)."""
    return f'{monto.normalize():f}'


def _texto_a_monto(monto: Decimal, moneda: Moneda) -> Decimal:
    """Ajusta un monto a los decimales de su moneda."""
    return monto.quantize(Decimal(1).scaleb(-moneda.decimales))


def _texto_moneda(monto: Decimal, moneda: Moneda) -> str:
    """Monto con los decimales de su moneda (``5128.20`` en ARS, ``750000`` en PYG)."""
    if moneda.decimales > 0:
        return f'{monto.quantize(Decimal(1).scaleb(-moneda.decimales)):f}'
    return f'{monto.quantize(Decimal("1")):f}'


@transaction.atomic
def registrar_operacion_presencial(
    *,
    caja: Caja,
    cliente: Cliente,
    tipo_operacion: str,
    moneda: str,
    monto: Decimal,
    moneda_contraparte: str = 'PYG',
    medio_pago: str = MEDIO_EFECTIVO,
    usuario_id: str = '',
    usuario_nombre: str = '',
    observacion: str = '',
    moneda_del_monto: str | None = None,
) -> tuple[Operacion, list[MovimientoCaja]]:
    """Ejecuta la operación presencial completa (PI-75).

    En una sola transacción:

    1. Exige la caja abierta (PI-79) y una operación ya cotizada válida.
    2. Crea la ``Operacion`` en estado ``PAGADA`` de una vez: en ventanilla
       el pago y la entrega son inmediatos, no hay estado pendiente ni
       ventana de tolerancia.
    3. Registra el ``RETIRO`` de la divisa que el cliente recibe.
    4. Si el pago es en efectivo, registra además el ``INGRESO`` de la
       divisa que el cliente trae; con tarjeta o transferencia la caja solo
       registra la salida.

    La operación no se puede editar ni borrar: es la foto inmutable de lo
    que pasó en ventanilla.

    :param monto: lo que escribió el cajero, en ``moneda_del_monto``.
    :param moneda_del_monto: moneda del campo de monto. Si el cajero
        escribió en la contraparte (PYG al comprar dólares), se convierte
        con :func:`resolver_monto_divisa` antes de cotizar.

    :returns ``(operacion, movimientos)`` para que la vista emita el
        comprobante (PI-42) con los mismos datos.
    :raises CajaSinTurno: si la caja está cerrada.
    :raises SaldoInsuficiente: si la caja no tiene efectivo para entregar.
    """
    from operaciones.views import ErrorCotizacion, _cotizar

    if medio_pago not in dict(MEDIOS_PAGO):
        raise ValidationError('Medio de pago inválido.')
    if tipo_operacion not in (Operacion.TIPO_COMPRA, Operacion.TIPO_VENTA):
        raise ValidationError('Tipo de operación inválido.')

    caja = Caja.objects.select_for_update().get(pk=caja.pk)
    _exigir_caja_abierta(caja)
    if not cliente.activo:
        raise ValidationError('El cliente está inactivo.')

    codigo_div = moneda.strip().upper()
    codigo_contra = (moneda_contraparte or 'PYG').strip().upper()
    if codigo_div == 'PYG':
        raise ValidationError('La divisa operada no puede ser el guaraní.')

    pct = _ajuste_de(cliente)
    monto_divisa = resolver_monto_divisa(
        codigo_div, codigo_contra, monto,
        (moneda_del_monto or codigo_div).strip().upper(), pct,
    )
    try:
        calculo = _cotizar(tipo_operacion, codigo_div, codigo_contra, monto_divisa, pct)
    except ErrorCotizacion as exc:
        raise ValidationError(str(exc)) from exc

    origen = calculo['moneda_origen']
    destino = calculo['moneda_destino']

    operacion = Operacion.objects.create(
        cliente=cliente,
        usuario_keycloak_id=(usuario_id or '')[:64],
        tipo_operacion=tipo_operacion,
        moneda_origen=origen,
        moneda_destino=destino,
        monto_enviado=calculo['monto_enviado'],
        monto_recibido=calculo['monto_recibido'],
        cotizacion_aplicada=calculo['cotizacion_aplicada'],
        tasa_origen=calculo['tasa_origen'],
        tasa_destino=calculo['tasa_destino'],
        porcentaje_comision_aplicado=calculo['porcentaje_comision_aplicado'],
        monto_comision=calculo['monto_comision'],
        metodo_pago=medio_pago[:24],
        estado=Operacion.ESTADO_PAGADA,
        fecha_cotizacion=timezone.now(),
        fecha_confirmacion=timezone.now(),
    )

    referencia = f'Operación presencial #{operacion.pk}'
    if cliente.nombre:
        referencia += f' · {cliente.nombre_completo}'

    movimientos: list[MovimientoCaja] = []
    # Siempre sale la divisa que el cliente recibe. Si no alcanza, falla acá
    # y la transacción entera se revierte: no queda operación sin caja.
    movimientos.append(registrar_movimiento(
        caja=caja, tipo=MovimientoCaja.TIPO_RETIRO, moneda=destino,
        monto=calculo['monto_recibido'],
        usuario_id=usuario_id, usuario_nombre=usuario_nombre,
        observacion=referencia,
    ))
    # Solo el efectivo entra a la caja.
    if medio_pago in MEDIOS_QUE_INGRESAN:
        movimientos.append(registrar_movimiento(
            caja=caja, tipo=MovimientoCaja.TIPO_INGRESO, moneda=origen,
            monto=calculo['monto_enviado'],
            usuario_id=usuario_id, usuario_nombre=usuario_nombre,
            observacion=observacion or referencia,
        ))

    return operacion, movimientos