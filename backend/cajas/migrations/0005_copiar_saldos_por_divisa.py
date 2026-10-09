"""PI-78, paso 2 de 3: convierte los datos por denominación a totales.

- ``SaldoBillete`` → ``SaldoCaja``: suma valor × cantidad por moneda.
- ``DetalleArqueo`` → ``ArqueoMoneda``: suma lo del sistema y lo contado
  por moneda en cada arqueo.
- ``MovimientoCaja.saldo_resultante``: se reconstruye recorriendo los
  movimientos de cada caja y moneda en orden cronológico.

La vuelta atrás deja los saldos por billete vacíos: el detalle por
denominación no se puede reconstruir a partir de un total.
"""

from collections import defaultdict
from decimal import Decimal

from django.db import migrations

SUMAN = ('INGRESO', 'ENTREGA')


def convertir(apps, schema_editor):
    SaldoBillete = apps.get_model('cajas', 'SaldoBillete')
    SaldoCaja = apps.get_model('cajas', 'SaldoCaja')
    DetalleArqueo = apps.get_model('cajas', 'DetalleArqueo')
    ArqueoMoneda = apps.get_model('cajas', 'ArqueoMoneda')
    MovimientoCaja = apps.get_model('cajas', 'MovimientoCaja')

    totales = defaultdict(Decimal)
    for s in SaldoBillete.objects.select_related('denominacion'):
        totales[(s.caja_id, s.denominacion.moneda_id)] += s.denominacion.valor * s.cantidad
    SaldoCaja.objects.bulk_create([
        SaldoCaja(caja_id=caja, moneda_id=moneda, monto=monto)
        for (caja, moneda), monto in totales.items()
    ])

    arqueos = defaultdict(lambda: [Decimal('0'), Decimal('0')])
    for d in DetalleArqueo.objects.select_related('denominacion'):
        clave = (d.arqueo_id, d.denominacion.moneda_id)
        arqueos[clave][0] += d.denominacion.valor * d.cantidad_sistema
        arqueos[clave][1] += d.denominacion.valor * d.cantidad_contada
    ArqueoMoneda.objects.bulk_create([
        ArqueoMoneda(arqueo_id=arqueo, moneda_id=moneda, monto_sistema=sis, monto_contado=con)
        for (arqueo, moneda), (sis, con) in arqueos.items()
    ])

    acumulado = defaultdict(Decimal)
    for m in MovimientoCaja.objects.order_by('creado_en', 'id'):
        clave = (m.caja_id, m.moneda_id)
        acumulado[clave] += m.total if m.tipo in SUMAN else -m.total
        m.saldo_resultante = acumulado[clave]
        m.save(update_fields=['saldo_resultante'])


def deshacer(apps, schema_editor):
    apps.get_model('cajas', 'SaldoCaja').objects.all().delete()
    apps.get_model('cajas', 'ArqueoMoneda').objects.all().delete()
    apps.get_model('cajas', 'MovimientoCaja').objects.update(saldo_resultante=None)


class Migration(migrations.Migration):

    dependencies = [
        ('cajas', '0004_saldo_por_divisa'),
    ]

    operations = [
        migrations.RunPython(convertir, deshacer),
    ]
