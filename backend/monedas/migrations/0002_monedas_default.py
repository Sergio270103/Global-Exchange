"""Datos iniciales: catálogo de monedas admitidas (RF40)."""

from django.db import migrations


MONEDAS = (
    # codigo, nombre, simbolo, decimales, pais_iso
    ('PYG', 'Guaraní Paraguayo', '₲', 0, 'PY'),
    ('USD', 'Dólar Americano', '$', 2, 'US'),
    ('EUR', 'Euro', '€', 2, 'EU'),
    ('BRL', 'Real Brasileño', 'R$', 2, 'BR'),
    ('ARS', 'Peso Argentino', '$', 2, 'AR'),
    ('GBP', 'Libra Esterlina', '£', 2, 'GB'),
)


def crear_monedas(apps, schema_editor):
    Moneda = apps.get_model('monedas', 'Moneda')
    for codigo, nombre, simbolo, decimales, pais in MONEDAS:
        Moneda.objects.get_or_create(
            codigo=codigo,
            defaults={
                'nombre': nombre, 'simbolo': simbolo,
                'decimales': decimales, 'pais_iso': pais,
            },
        )


def quitar_monedas(apps, schema_editor):
    Moneda = apps.get_model('monedas', 'Moneda')
    Moneda.objects.filter(codigo__in=[c for c, *_ in MONEDAS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('monedas', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(crear_monedas, quitar_monedas),
    ]
