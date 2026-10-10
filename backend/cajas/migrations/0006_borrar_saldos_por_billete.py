"""PI-78, paso 3 de 3: borra las tablas por denominación que ya se copiaron.

El detalle por denominación sigue existiendo solo en las entregas de
billetes (``DetalleEntrega``, PI-43).
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('cajas', '0005_copiar_saldos_por_divisa'),
    ]

    operations = [
        migrations.DeleteModel(name='DetalleArqueo'),
        migrations.DeleteModel(name='DetalleMovimiento'),
        migrations.DeleteModel(name='SaldoBillete'),
    ]
