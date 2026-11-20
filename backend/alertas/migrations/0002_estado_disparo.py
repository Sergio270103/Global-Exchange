from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('alertas', '0001_initial')]

    operations = [
        migrations.AddField(
            model_name='disparoalerta', name='leido', field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='disparoalerta', name='eliminado', field=models.BooleanField(default=False),
        ),
    ]
