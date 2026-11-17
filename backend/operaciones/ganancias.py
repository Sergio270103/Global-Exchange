"""Agregados de comisiones sobre operaciones pagadas."""

from decimal import Decimal
from collections import defaultdict

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
                equivalente_pyg=Decimal(0), volumen_pyg=Decimal(0))


def _acumular(fila, volumen, comision, tasa):
    fila['operaciones'] += 1
    fila['volumen'] += volumen
    fila['comision'] += comision
    fila['equivalente_pyg'] += comision * tasa
    fila['volumen_pyg'] += volumen * tasa


def calcular_ganancias(params):
    desde, hasta = (_fecha(params, nombre) for nombre in ('desde', 'hasta'))
    if desde and hasta and desde > hasta:
        raise ValidationError('La fecha inicial debe ser anterior o igual a la fecha final.')
    agrupacion = params.get('agrupar', 'dia')
    if agrupacion not in ('dia', 'mes', 'moneda'):
        raise ValidationError('La agrupación debe ser día, mes o moneda.')

    ops = Operacion.objects.filter(estado=Operacion.ESTADO_PAGADA).annotate(
        fecha_ingreso=Coalesce('fecha_confirmacion', 'fecha_creacion'),
    ).select_related('moneda_destino').order_by()
    if desde:
        ops = ops.filter(fecha_ingreso__date__gte=desde)
    if hasta:
        ops = ops.filter(fecha_ingreso__date__lte=hasta)
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
        fecha = timezone.localdate(op.fecha_ingreso)
        mes = fecha.strftime('%Y-%m')
        periodo = {'dia': fecha.isoformat(), 'mes': mes, 'moneda': codigo}[agrupacion]
        tasa = Decimal(1) if codigo == 'PYG' else op.tasa_destino
        if not tasa:
            tasa = Cotizacion.objects.filter(
                moneda_id=op.moneda_destino_id,
                vigente_desde__lte=op.fecha_cotizacion,
            ).order_by('-vigente_desde', '-pk').values_list('venta', flat=True).first()
        if not tasa:
            sin_tasa += 1
            tasa = Decimal(0)

        comision = op.monto_comision
        volumen = op.monto_recibido + comision
        # En compra, el monto recibido ya es el bruto en destino.
        if op.tipo_operacion == Operacion.TIPO_COMPRA:
            volumen = op.monto_recibido
        _acumular(monedas[codigo], volumen, comision, tasa)
        _acumular(grupos[periodo, codigo], volumen, comision, tasa)
        meses[mes] += comision * tasa
        total += comision * tasa
        operaciones += 1

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
