"""Datos iniciales: métodos de pago admitidos (RF42)."""

from django.db import migrations


METODOS = (
    ('transfer', 'Transferencia bancaria'),
    ('wallet', 'Billetera digital'),
    ('card', 'Tarjeta de crédito/débito'),
    ('qr', 'Pago por QR'),
)


def crear_metodos(apps, schema_editor):
    MetodoPago = apps.get_model('pagos', 'MetodoPago')
    for codigo, nombre in METODOS:
        MetodoPago.objects.get_or_create(codigo=codigo, defaults={'nombre': nombre})


def quitar_metodos(apps, schema_editor):
    MetodoPago = apps.get_model('pagos', 'MetodoPago')
    MetodoPago.objects.filter(codigo__in=[c for c, _ in METODOS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('pagos', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(crear_metodos, quitar_metodos),
    ]
