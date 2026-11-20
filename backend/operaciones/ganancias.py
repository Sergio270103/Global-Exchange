"""Agregados de comisiones sobre operaciones pagadas."""

from decimal import Decimal
from collections import defaultdict

from django.db.models import Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

from cotizaciones.models import Cotizacion

from .models import Operacion


def _fecha(params, nombre):
    valor = params.get(nombre)
    if not valor:
        return None
    try:
        fecha = parse_date(valor)
    except ValueError:
        fecha = None
    if fecha is None:
        raise ValidationError({nombre: 'Usá una fecha válida en formato AAAA-MM-DD.'})
    return fecha


def _fila():
    return dict(operaciones=0, volumen=Decimal(0), comision=Decimal(0),
                equivalente_pyg=Decimal(0), volumen_pyg=Decimal(0),
                comisiones_cobradas=Decimal(0), comisiones_revertidas=Decimal(0))


def _acumular(fila, volumen, comision, tasa, es_cobro):
    fila['operaciones'] += int(es_cobro)
    fila['volumen'] += volumen
    fila['comision'] += comision
    fila['comisiones_cobradas' if comision >= 0 else 'comisiones_revertidas'] += abs(comision)
    fila['equivalente_pyg'] += comision * tasa
    fila['volumen_pyg'] += volumen * tasa


def calcular_ganancias(params):
    desde, hasta = (_fecha(params, nombre) for nombre in ('desde', 'hasta'))
    if desde and hasta and desde > hasta:
        raise ValidationError('La fecha inicial debe ser anterior o igual a la fecha final.')
    agrupacion = params.get('agrupar', 'dia')
    if agrupacion not in ('dia', 'mes', 'moneda'):
        raise ValidationError('La agrupación debe ser día, mes o moneda.')

    ops = Operacion.objects.filter(
        Q(estado=Operacion.ESTADO_PAGADA) |
        Q(estado__in=[Operacion.ESTADO_CANCELADA, Operacion.ESTADO_ANULADA],
          fecha_confirmacion__isnull=False, fecha_cancelacion__isnull=False),
    ).annotate(
        fecha_ingreso=Coalesce('fecha_confirmacion', 'fecha_creacion'),
    ).select_related('moneda_destino').order_by()
    moneda = params.get('moneda')
    if moneda:
        ops = ops.filter(moneda_destino__codigo__iexact=moneda.strip())

    monedas = defaultdict(_fila)
    meses = defaultdict(Decimal)
    grupos = defaultdict(_fila)
    total = Decimal(0)
    sin_tasa = 0
    operaciones = 0
    for op in ops.iterator():
        codigo = op.moneda_destino.codigo.strip().upper()
        comision = op.monto_comision
        volumen = op.monto_recibido + comision
        # En compra, el monto recibido ya es el bruto en destino.
        if op.tipo_operacion == Operacion.TIPO_COMPRA:
            volumen = op.monto_recibido
        movimientos = [(op.fecha_ingreso, comision, volumen, True)]
        if op.estado in (Operacion.ESTADO_CANCELADA, Operacion.ESTADO_ANULADA):
            movimientos.append((op.fecha_cancelacion, -comision, Decimal(0), False))
        movimientos = [(timezone.localdate(instante), importe, bruto, es_cobro)
                       for instante, importe, bruto, es_cobro in movimientos
                       if (not desde or timezone.localdate(instante) >= desde)
                       and (not hasta or timezone.localdate(instante) <= hasta)]
        if not movimientos:
            continue
        tasa = Decimal(1) if codigo == 'PYG' else op.tasa_destino
        if not tasa:
            tasa = Cotizacion.objects.filter(
                moneda_id=op.moneda_destino_id,
                vigente_desde__lte=op.fecha_cotizacion,
            ).order_by('-vigente_desde', '-pk').values_list('venta', flat=True).first()
        if not tasa:
            sin_tasa += 1
            tasa = Decimal(0)

        for fecha, importe, bruto, es_cobro in movimientos:
            mes = fecha.strftime('%Y-%m')
            periodo = {'dia': fecha.isoformat(), 'mes': mes, 'moneda': codigo}[agrupacion]
            _acumular(monedas[codigo], bruto, importe, tasa, es_cobro)
            _acumular(grupos[periodo, codigo], bruto, importe, tasa, es_cobro)
            meses[mes] += importe * tasa
            total += importe * tasa
            operaciones += int(es_cobro)

    def filas():
        return [
            {'periodo': periodo, 'moneda': codigo, **valores}
            for (periodo, codigo), valores in sorted(grupos.items())
        ]

    return {
        'total_pyg': total,
        'operaciones': operaciones,
        'operaciones_sin_tasa': sin_tasa,
        'por_moneda': [{'moneda': codigo, **valores} for codigo, valores in sorted(monedas.items())],
        'por_mes': [{'mes': mes, 'total_pyg': valor} for mes, valor in sorted(meses.items())],
        'filas': filas(),
    }
