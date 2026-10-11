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


def cotizar_ventanilla(
    cliente: Cliente,
    tipo_operacion: str,
    moneda: str,
    monto_divisa: Decimal,
    moneda_contraparte: str = 'PYG',
) -> dict:
    """Cotiza una operación presencial sin crearla (PI-75).

    Devuelve el desglose que el cajero muestra antes de confirmar: la
    moneda que entra, la que sale, los montos y la tasa aplicada. Reutiliza
    la misma rutina de :func:`operaciones.views._cotizar` que usa el alta
    normal, así que el precio que se muestra es el que se guarda.
    """
    from operaciones.views import ErrorCotizacion, _cotizar

    if not cliente.activo:
        raise ValidationError('El cliente está inactivo.')
    try:
        calculo = _cotizar(
            tipo_operacion, moneda.strip().upper(),
            (moneda_contraparte or 'PYG').strip().upper(),
            monto_divisa, _ajuste_de(cliente),
        )
    except ErrorCotizacion as exc:
        raise ValidationError(str(exc)) from exc

    origen = calculo['moneda_origen']
    destino = calculo['moneda_destino']
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
        # Qué paga el cliente y qué recibe, ya con el precio final.
        'cliente_paga': f'{_texto(calculo["monto_enviado"])} {origen.codigo}',
        'cliente_recibe': f'{_texto(calculo["monto_recibido"])} {destino.codigo}',
    }


def _texto(monto: Decimal) -> str:
    """``Decimal`` sin ceros de más, como en el saldo de caja (``750000``, ``100``)."""
    return f'{monto.normalize():f}'


@transaction.atomic
def registrar_operacion_presencial(
    *,
    caja: Caja,
    cliente: Cliente,
    tipo_operacion: str,
    moneda: str,
    monto_divisa: Decimal,
    moneda_contraparte: str = 'PYG',
    medio_pago: str = MEDIO_EFECTIVO,
    usuario_id: str = '',
    usuario_nombre: str = '',
    observacion: str = '',
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

    try:
        calculo = _cotizar(
            tipo_operacion, moneda.strip().upper(),
            (moneda_contraparte or 'PYG').strip().upper(),
            monto_divisa, _ajuste_de(cliente),
        )
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