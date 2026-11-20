from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connections
from django.test import TransactionTestCase, override_settings, skipUnlessDBFeature
from billeteras.models import Billetera, Movimiento
from clientes.models import Cliente
from monedas.models import Moneda
from operaciones.models import Operacion
from . import numeracion, servicios
from .models import FacturaElectronica
from .test_gestion import config
from .tests import config as config_factura


@override_settings(FACTURASEGURA=config())
@skipUnlessDBFeature('has_select_for_update')
class ConcurrenciaTest(TransactionTestCase):
    @override_settings(FACTURASEGURA=config_factura(desde=100, hasta=100))
    def test_dos_confirmaciones_compiten_por_ultimo_cupo(self):
        from django.db import transaction
        from rest_framework.exceptions import ValidationError
        from operaciones.views import OperacionViewSet
        from .models import ReservaEmision
        cliente = Cliente.objects.create(nombre='Cupo', documento='98765',
            email='test@example.com', categoria=Cliente.CAT_MINORISTA)
        pyg, _ = Moneda.objects.get_or_create(codigo='PYG', defaults={'nombre':'Guaraní','decimales':0})
        usd, _ = Moneda.objects.get_or_create(codigo='USD', defaults={'nombre':'Dólar','decimales':2})
        destino = Billetera.objects.create(cliente=cliente, moneda=usd, saldo=0)
        def confirmar():
            try:
                with transaction.atomic():
                    op = Operacion.objects.create(cliente=cliente, usuario_keycloak_id='sub',
                        tipo_operacion='COMPRA', moneda_origen=pyg, moneda_destino=usd,
                        monto_enviado=100, monto_recibido=20, cotizacion_aplicada=1,
                        porcentaje_comision_aplicado=0, monto_comision=0,
                        billetera_destino=destino)
                    OperacionViewSet()._marcar_confirmada(op)
                return 'CONFIRMADA'
            except ValidationError:
                return 'BLOQUEADA'
        self.assertEqual(sorted(self.paralelo(confirmar)), ['BLOQUEADA', 'CONFIRMADA'])
        destino.refresh_from_db()
        self.assertEqual(destino.saldo, 20)
        self.assertEqual(Movimiento.objects.count(), 1)
        self.assertEqual(ReservaEmision.objects.count(), 1)

    def paralelo(self, tarea):
        barrera = Barrier(2)
        def ejecutar(_):
            try:
                barrera.wait(timeout=10)
                return tarea()
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(ejecutar, range(2)))

    def test_reserva_simultanea_no_repite_numero(self):
        numeros = self.paralelo(lambda: numeracion.reservar('1', True, config()['EMISOR']))
        self.assertEqual(sorted(numeros), ['0000100', '0000101'])

    def test_polling_simultaneo_rechazado_revierte_una_vez(self):
        cliente = Cliente.objects.create(nombre='Concurrente', documento='12345',
            email='test@example.com', categoria=Cliente.CAT_MINORISTA)
        pyg, _ = Moneda.objects.get_or_create(codigo='PYG', defaults={'nombre':'Guaraní','decimales':0})
        usd, _ = Moneda.objects.get_or_create(codigo='USD', defaults={'nombre':'Dólar','decimales':2})
        origen = Billetera.objects.create(cliente=cliente, moneda=pyg, saldo=50)
        destino = Billetera.objects.create(cliente=cliente, moneda=usd, saldo=20)
        op = Operacion.objects.create(cliente=cliente, usuario_keycloak_id='sub',
            tipo_operacion='COMPRA', moneda_origen=pyg, moneda_destino=usd,
            monto_enviado=100, monto_recibido=20, cotizacion_aplicada=1,
            porcentaje_comision_aplicado=0, monto_comision=0, estado='PAGADA',
            billetera_origen=origen, billetera_destino=destino)
        factura = FacturaElectronica.objects.create(operacion=op, estado='EMITIDA',
            simulada=True, email_destino='test@example.com', numero='0000100', cdc='01'+'0'*42)
        def consultar():
            f = FacturaElectronica.objects.get(pk=factura.pk)
            servicios._aplicar_resultado(f, {'estado_sifen': 'Rechazado'}, {})
        self.paralelo(consultar)
        origen.refresh_from_db(); destino.refresh_from_db(); op.refresh_from_db()
        self.assertEqual(origen.saldo, 150)
        self.assertEqual(destino.saldo, 0)
        self.assertEqual(Movimiento.objects.filter(operacion=op).count(), 2)
        self.assertTrue(op.reversion_emision_aplicada)
