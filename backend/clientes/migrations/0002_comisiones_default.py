"""Datos iniciales: comisiones por defecto por categoría (Hito 4)."""

from django.db import migrations


def crear_comisiones(apps, schema_editor):
    Comision = apps.get_model('clientes', 'Comision')
    for categoria, porcentaje in (
        ('MINORISTA', '1.00'),
        ('CORPORATIVO', '0.75'),
        ('VIP', '0.50'),
    ):
        Comision.objects.get_or_create(
            categoria=categoria, defaults={'porcentaje': porcentaje},
        )


def quitar_comisiones(apps, schema_editor):
    Comision = apps.get_model('clientes', 'Comision')
    Comision.objects.filter(categoria__in=('MINORISTA', 'CORPORATIVO', 'VIP')).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('clientes', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(crear_comisiones, quitar_comisiones),
    ]
