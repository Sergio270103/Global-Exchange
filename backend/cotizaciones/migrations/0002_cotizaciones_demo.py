"""Datos de demostración: cotización inicial por moneda (Hito 4).

Así las tasas del día y el simulador muestran datos desde el primer
arranque. Cada registro manual posterior crea un punto nuevo.
"""

from django.db import migrations


TASAS = (
    # codigo, compra, venta
    ('USD', '7400', '7500'),
    ('EUR', '8200', '8300'),
    ('BRL', '1350', '1400'),
)


def crear_cotizaciones(apps, schema_editor):
    Moneda = apps.get_model('monedas', 'Moneda')
    Cotizacion = apps.get_model('cotizaciones', 'Cotizacion')
    for codigo, compra, venta in TASAS:
        try:
            moneda = Moneda.objects.get(codigo=codigo)
        except Moneda.DoesNotExist:
            continue
        if not Cotizacion.objects.filter(moneda=moneda).exists():
            Cotizacion.objects.create(
                moneda=moneda, compra=compra, venta=venta,
                creado_por='seed',
            )


def quitar_cotizaciones(apps, schema_editor):
    Cotizacion = apps.get_model('cotizaciones', 'Cotizacion')
    Cotizacion.objects.filter(creado_por='seed').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('cotizaciones', '0001_initial'),
        ('monedas', '0002_monedas_default'),
    ]

    operations = [
        migrations.RunPython(crear_cotizaciones, quitar_cotizaciones),
    ]
