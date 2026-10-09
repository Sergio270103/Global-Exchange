"""Datos iniciales del control de cajas (PI-44).

- Billetes en circulación de las monedas sembradas en ``monedas.0002``.
  Solo se crean para las monedas que existan en la base.
- Una caja de ejemplo para poder probar el módulo apenas se migra.
"""

from decimal import Decimal

from django.db import migrations

BILLETES = {
    'PYG': (100000, 50000, 20000, 10000, 5000, 2000),
    'USD': (100, 50, 20, 10, 5, 2, 1),
    'EUR': (500, 200, 100, 50, 20, 10, 5),
    'BRL': (200, 100, 50, 20, 10, 5, 2),
    'ARS': (20000, 10000, 2000, 1000, 500, 200, 100),
    'GBP': (50, 20, 10, 5),
}

CAJA_INICIAL = {'nombre': 'Caja 1', 'sucursal': 'Casa Central'}


def crear_datos(apps, schema_editor):
    Moneda = apps.get_model('monedas', 'Moneda')
    Denominacion = apps.get_model('cajas', 'Denominacion')
    Caja = apps.get_model('cajas', 'Caja')
    for codigo, valores in BILLETES.items():
        moneda = Moneda.objects.filter(codigo=codigo).first()
        if moneda is None:
            continue
        for valor in valores:
            Denominacion.objects.get_or_create(moneda=moneda, valor=Decimal(valor))
    Caja.objects.get_or_create(**CAJA_INICIAL)


def quitar_datos(apps, schema_editor):
    Denominacion = apps.get_model('cajas', 'Denominacion')
    Caja = apps.get_model('cajas', 'Caja')
    Caja.objects.filter(**CAJA_INICIAL, movimientos__isnull=True).delete()
    for codigo, valores in BILLETES.items():
        Denominacion.objects.filter(
            moneda__codigo=codigo, valor__in=[Decimal(v) for v in valores],
            saldos__isnull=True,
        ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('cajas', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(crear_datos, quitar_datos),
    ]
