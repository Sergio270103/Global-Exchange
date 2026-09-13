"""Datos de demostración: clientes iniciales (Hito 3).

Permiten operar el frontend (cuentas, selector de cliente) sin carga
previa. Las asociaciones usuario-cliente no se generan porque
requieren el `sub` real de Keycloak: se crean desde Usuarios."""

from django.db import migrations


CLIENTES = (
    # nombre, documento, email, tipo, categoria
    ('Carlos Martínez', '12.345.678-9', 'carlos@email.com', 'FISICA', 'MINORISTA'),
    ('Corporación Atlas S.A.', '80-012345-6', 'contacto@atlas.com', 'JURIDICA', 'CORPORATIVO'),
    ('Ana López', '23.456.789-0', 'ana@email.com', 'FISICA', 'VIP'),
)


def crear_clientes(apps, schema_editor):
    Cliente = apps.get_model('clientes', 'Cliente')
    for nombre, documento, email, tipo, categoria in CLIENTES:
        Cliente.objects.get_or_create(
            documento=documento,
            defaults={'nombre': nombre, 'email': email,
                      'tipo': tipo, 'categoria': categoria},
        )


def quitar_clientes(apps, schema_editor):
    Cliente = apps.get_model('clientes', 'Cliente')
    Cliente.objects.filter(
        documento__in=[c[1] for c in CLIENTES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('clientes', '0002_comisiones_default'),
    ]

    operations = [
        migrations.RunPython(crear_clientes, quitar_clientes),
    ]
