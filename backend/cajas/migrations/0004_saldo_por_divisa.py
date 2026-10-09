"""PI-78: el saldo de caja pasa a llevarse por total de cada divisa.

Paso 1 de 3: crea las tablas nuevas (``SaldoCaja`` y ``ArqueoMoneda``) y
el saldo resultante de cada movimiento. Las tablas por denominación se
copian en ``0005`` y se borran en ``0006``.
"""

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cajas', '0003_entregas_billetes'),
        ('monedas', '0002_monedas_default'),
    ]

    operations = [
        # Libera el nombre "saldos" para el nuevo SaldoCaja (sin cambios en la base).
        migrations.AlterField(
            model_name='saldobillete',
            name='caja',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='saldos_billete', to='cajas.caja', verbose_name='caja'),
        ),
        migrations.CreateModel(
            name='SaldoCaja',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('monto', models.DecimalField(decimal_places=2, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)], verbose_name='saldo')),
                ('actualizado_en', models.DateTimeField(auto_now=True, verbose_name='actualizado en')),
                ('caja', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='saldos', to='cajas.caja', verbose_name='caja')),
                ('moneda', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='saldos_caja', to='monedas.moneda', verbose_name='moneda')),
            ],
            options={
                'verbose_name': 'saldo de caja',
                'verbose_name_plural': 'saldos de caja',
                'ordering': ['moneda__codigo'],
                'constraints': [models.UniqueConstraint(fields=('caja', 'moneda'), name='uniq_saldo_caja_moneda')],
            },
        ),
        migrations.AlterField(
            model_name='detallearqueo',
            name='arqueo',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='detalle_billetes', to='cajas.arqueocaja', verbose_name='arqueo'),
        ),
        migrations.CreateModel(
            name='ArqueoMoneda',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('monto_sistema', models.DecimalField(decimal_places=2, max_digits=18, verbose_name='según sistema')),
                ('monto_contado', models.DecimalField(decimal_places=2, max_digits=18, verbose_name='contado')),
                ('arqueo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='detalle', to='cajas.arqueocaja', verbose_name='arqueo')),
                ('moneda', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='arqueos_caja', to='monedas.moneda', verbose_name='moneda')),
            ],
            options={
                'verbose_name': 'detalle de arqueo',
                'verbose_name_plural': 'detalles de arqueo',
                'ordering': ['moneda__codigo'],
                'constraints': [models.UniqueConstraint(fields=('arqueo', 'moneda'), name='uniq_arqueo_moneda')],
            },
        ),
        migrations.AddField(
            model_name='movimientocaja',
            name='saldo_resultante',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=18, null=True, verbose_name='saldo de la divisa después del movimiento'),
        ),
        migrations.AlterField(
            model_name='movimientocaja',
            name='total',
            field=models.DecimalField(decimal_places=2, max_digits=18, verbose_name='monto'),
        ),
    ]
