"""Tests del módulo de operaciones (Hito Operaciones)."""

from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
from billeteras.models import Billetera
from pagos.models import CuentaBancaria
from monedas.models import Moneda

from .models import Operacion
from .views import ERROR_CLIENTE, OperacionViewSet


class UsuarioFake:
    id = 'sub-123'
    username = 'tester'
    is_authenticated = True
    roles = []


def _auth(view, request, **kwargs):
    force_authenticate(request, user=UsuarioFake())
    return view(request, **kwargs)


class OperacionTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0},
        )
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'decimales': 2},
        )
        Cotizacion.objects.create(moneda=self.usd, compra=Decimal('7400'), venta=Decimal('7500'))
        self.cliente = Cliente.objects.create(
            nombre='Cliente Test', documento='123', email='c@test.com',
            categoria=Cliente.CAT_MINORISTA,
        )
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA,
            defaults={'porcentaje': Decimal('1.00')},
        )
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-123', username='tester',
        )

    def test_compra_suma_comision(self):
        vista = OperacionViewSet.as_view({'post': 'create'})
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'COMPRA',
            'moneda': 'USD', 'monto_divisa': '100',
        }, format='json')
        res = _auth(vista, req)
        self.assertEqual(res.status_code, 201, res.data)
        op = Operacion.objects.get()
        # Bruto 750.000 + 1% = 757.500 PYG enviados; recibe 100 USD.
        self.assertEqual(op.monto_enviado, Decimal('757500'))
        self.assertEqual(op.monto_recibido, Decimal('100'))
        self.assertEqual(op.moneda_origen.codigo, 'PYG')
        self.assertEqual(op.moneda_destino.codigo, 'USD')
        # Comisión en destino: 7500 PYG / 7500 = 1 USD.
        self.assertEqual(op.monto_comision, Decimal('1'))

    def test_venta_resta_comision(self):
        vista = OperacionViewSet.as_view({'post': 'create'})
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'VENTA',
            'moneda': 'USD', 'monto_divisa': '100',
        }, format='json')
        res = _auth(vista, req)
        self.assertEqual(res.status_code, 201, res.data)
        op = Operacion.objects.get()
        # Bruto 740.000 - 1% = 732.600 PYG.
        self.assertEqual(op.monto_enviado, Decimal('100'))
        self.assertEqual(op.monto_recibido, Decimal('732600'))
        self.assertEqual(op.monto_comision, Decimal('7400'))

    def test_cliente_inactivo_o_sin_asociacion_400(self):
        vista = OperacionViewSet.as_view({'post': 'create'})
        self.cliente.activo = False
        self.cliente.save(update_fields=['activo'])
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'VENTA',
            'moneda': 'USD', 'monto_divisa': '10',
        }, format='json')
        res = _auth(vista, req)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], ERROR_CLIENTE)

    def test_sin_cotizacion_400(self):
        Cotizacion.objects.all().delete()
        vista = OperacionViewSet.as_view({'post': 'create'})
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'VENTA',
            'moneda': 'USD', 'monto_divisa': '10',
        }, format='json')
        res = _auth(vista, req)
        self.assertEqual(res.status_code, 400)


class VinculacionTests(TestCase):
    """PI-66: billetera destino y cuenta origen quedan vinculadas."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0},
        )
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'decimales': 2},
        )
        Cotizacion.objects.create(moneda=self.usd, compra=Decimal('7400'), venta=Decimal('7500'))
        self.cliente = Cliente.objects.create(
            nombre='Cliente Vinc', documento='777', email='v@test.com',
            categoria=Cliente.CAT_MINORISTA,
        )
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA,
            defaults={'porcentaje': Decimal('1.00')},
        )
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-123', username='tester',
        )
        self.billetera = Billetera.objects.create(cliente=self.cliente, moneda=self.usd)
        self.cuenta = CuentaBancaria.objects.create(
            cliente=self.cliente, nombre='C', apellido='V', cedula='1',
            banco='Continental', numero_cuenta='12345678',
            codigo_bancario='BCON-PY', moneda=self.pyg)

    def _crear(self, extra):
        vista = OperacionViewSet.as_view({'post': 'create'})
        base = {'cliente': self.cliente.id, 'tipo_operacion': 'COMPRA',
                'moneda': 'USD', 'monto_divisa': '10'}
        req = self.factory.post('/api/operaciones/', {**base, **extra}, format='json')
        return _auth(vista, req)

    def test_guarda_vinculacion(self):
        res = self._crear({'billetera_destino': self.billetera.id,
                           'cuenta_origen': self.cuenta.id})
        self.assertEqual(res.status_code, 201, res.data)
        op = Operacion.objects.get()
        self.assertEqual(op.billetera_destino_id, self.billetera.id)
        self.assertEqual(op.cuenta_origen_id, self.cuenta.id)
        self.billetera.refresh_from_db()
        self.assertEqual(res.data['billetera_destino_detalle'], str(self.billetera))
        # Solo registro: los saldos no se mueven en PI-66.
        self.assertEqual(self.billetera.saldo, Decimal('0'))

    def test_billetera_moneda_destino_obligatoria(self):
        otra = Billetera.objects.create(cliente=self.cliente, moneda=self.pyg)
        res = self._crear({'billetera_destino': otra.id})
        self.assertEqual(res.status_code, 400)

    def test_cuenta_de_otro_cliente_400(self):
        otro = Cliente.objects.create(
            nombre='Otro', documento='778', email='o@test.com')
        ajena = CuentaBancaria.objects.create(
            cliente=otro, nombre='O', apellido='T', cedula='2',
            banco='Itaú', numero_cuenta='87654321',
            codigo_bancario='ITAU-PY', moneda=self.pyg)
        res = self._crear({'cuenta_origen': ajena.id})
        self.assertEqual(res.status_code, 400)

    def test_sin_vinculacion_tambien_vale(self):
        res = self._crear({})
        self.assertEqual(res.status_code, 201, res.data)
        op = Operacion.objects.get()
        self.assertIsNone(op.billetera_destino_id)
        self.assertIsNone(op.cuenta_origen_id)


class AcreditacionTests(TestCase):
    """PI-66b: al confirmar PAGADA se acredita la billetera vinculada."""

    def setUp(self):
        from django.utils import timezone

        self.factory = APIRequestFactory()
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0},
        )
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'decimales': 2},
        )
        Cotizacion.objects.create(moneda=self.usd, compra=Decimal('7400'), venta=Decimal('7500'))
        self.cliente = Cliente.objects.create(
            nombre='Cliente Acre', documento='779', email='a@test.com',
            categoria=Cliente.CAT_MINORISTA,
        )
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA,
            defaults={'porcentaje': Decimal('1.00')},
        )
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-123', username='tester',
        )
        self.billetera = Billetera.objects.create(cliente=self.cliente, moneda=self.usd)

    def _crear(self):
        vista = OperacionViewSet.as_view({'post': 'create'})
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'COMPRA',
            'moneda': 'USD', 'monto_divisa': '100',
            'billetera_destino': self.billetera.id,
        }, format='json')
        res = _auth(vista, req)
        self.assertEqual(res.status_code, 201, res.data)
        return Operacion.objects.get(pk=res.data['id'])

    def _confirmar(self, op):
        vista = OperacionViewSet.as_view({'post': 'confirmar'})
        req = self.factory.post(f'/api/operaciones/{op.pk}/confirmar/', {}, format='json')
        return _auth(vista, req, pk=op.pk)

    def test_confirmar_acredita_y_audita(self):
        from billeteras.models import Movimiento

        op = self._crear()
        res = self._confirmar(op)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['resultado'], 'CONFIRMADA')
        self.billetera.refresh_from_db()
        # Compra 100 USD: recibe 100 netos en destino.
        self.assertEqual(self.billetera.saldo, Decimal('100'))
        mov = Movimiento.objects.get(operacion=op)
        self.assertEqual(mov.monto, Decimal('100'))
        self.assertEqual(mov.saldo_resultante, Decimal('100'))

    def test_reconfirmar_no_duplica(self):
        op = self._crear()
        self.assertEqual(self._confirmar(op).status_code, 200)
        res2 = self._confirmar(op)
        self.assertEqual(res2.status_code, 400)
        self.billetera.refresh_from_db()
        self.assertEqual(self.billetera.saldo, Decimal('100'))

    def test_sin_vinculo_no_mueve(self):
        from billeteras.models import Movimiento

        vista = OperacionViewSet.as_view({'post': 'create'})
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'COMPRA',
            'moneda': 'USD', 'monto_divisa': '10',
        }, format='json')
        res = _auth(vista, req)
        self.assertEqual(res.status_code, 201, res.data)
        op = Operacion.objects.get(pk=res.data['id'])
        self._confirmar(op)
        self.billetera.refresh_from_db()
        self.assertEqual(self.billetera.saldo, Decimal('0'))
        self.assertEqual(Movimiento.objects.count(), 0)

    def test_recotizacion_no_mueve(self):
        from datetime import timedelta

        from django.utils import timezone

        op = self._crear()
        # Vence la ventana y cambia la tasa.
        op.fecha_cotizacion = timezone.now() - timedelta(seconds=120)
        op.save(update_fields=['fecha_cotizacion'])
        Cotizacion.objects.create(moneda=self.usd, compra=Decimal('7300'), venta=Decimal('7600'))
        res = self._confirmar(op)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['resultado'], 'COTIZACION_CAMBIADA')
        self.billetera.refresh_from_db()
        self.assertEqual(self.billetera.saldo, Decimal('0'))


class DebitoTests(TestCase):
    """PI-66c (opción B): débito de billetera origen con validación."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0},
        )
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'decimales': 2},
        )
        Cotizacion.objects.create(moneda=self.usd, compra=Decimal('7400'), venta=Decimal('7500'))
        self.cliente = Cliente.objects.create(
            nombre='Cliente Deb', documento='780', email='d@test.com',
            categoria=Cliente.CAT_MINORISTA,
        )
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA,
            defaults={'porcentaje': Decimal('1.00')},
        )
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-123', username='tester',
        )
        self.billetera_usd = Billetera.objects.create(
            cliente=self.cliente, moneda=self.usd, saldo=Decimal('500'))
        self.billetera_pyg = Billetera.objects.create(
            cliente=self.cliente, moneda=self.pyg)

    def _crear_venta(self, extra):
        vista = OperacionViewSet.as_view({'post': 'create'})
        base = {'cliente': self.cliente.id, 'tipo_operacion': 'VENTA',
                'moneda': 'USD', 'monto_divisa': '100'}
        req = self.factory.post('/api/operaciones/', {**base, **extra}, format='json')
        return _auth(vista, req)

    def _confirmar(self, op):
        vista = OperacionViewSet.as_view({'post': 'confirmar'})
        req = self.factory.post(f'/api/operaciones/{op.pk}/confirmar/', {}, format='json')
        return _auth(vista, req, pk=op.pk)

    def test_confirmar_debita_y_acredita(self):
        from billeteras.models import Movimiento

        res = self._crear_venta({'billetera_origen': self.billetera_usd.id,
                                 'billetera_destino': self.billetera_pyg.id})
        self.assertEqual(res.status_code, 201, res.data)
        op = Operacion.objects.get(pk=res.data['id'])
        res = self._confirmar(op)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['resultado'], 'CONFIRMADA')
        self.billetera_usd.refresh_from_db()
        self.billetera_pyg.refresh_from_db()
        # Debita 100 USD enviados; acredita 732.600 PYG netos.
        self.assertEqual(self.billetera_usd.saldo, Decimal('400'))
        self.assertEqual(self.billetera_pyg.saldo, Decimal('732600'))
        tipos = sorted(Movimiento.objects.filter(operacion=op).values_list('tipo', flat=True))
        self.assertEqual(tipos, ['CREDITO', 'DEBITO'])
        self.assertEqual(
            res.data['operacion']['billetera_origen_detalle'], str(self.billetera_usd))

    def test_sin_saldo_en_alta_400_con_mensaje(self):
        self.billetera_usd.saldo = Decimal('10')
        self.billetera_usd.save(update_fields=['saldo'])
        res = self._crear_venta({'billetera_origen': self.billetera_usd.id})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], 'No hay saldo suficiente en la billetera origen.')
        self.assertEqual(Operacion.objects.count(), 0)

    def test_sin_saldo_en_confirm_sigue_pendiente(self):
        from billeteras.models import Movimiento

        res = self._crear_venta({'billetera_origen': self.billetera_usd.id,
                                 'billetera_destino': self.billetera_pyg.id})
        op = Operacion.objects.get(pk=res.data['id'])
        # Fondeo retirado entre el alta y la confirmación.
        self.billetera_usd.saldo = Decimal('0')
        self.billetera_usd.save(update_fields=['saldo'])
        res = self._confirmar(op)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], 'No hay saldo suficiente en la billetera origen.')
        op.refresh_from_db()
        self.assertEqual(op.estado, Operacion.ESTADO_PENDIENTE)
        self.billetera_pyg.refresh_from_db()
        self.assertEqual(self.billetera_pyg.saldo, Decimal('0'))
        self.assertEqual(Movimiento.objects.count(), 0)
