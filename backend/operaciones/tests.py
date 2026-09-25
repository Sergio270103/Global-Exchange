"""Tests del módulo de operaciones (Hito Operaciones)."""

from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
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
