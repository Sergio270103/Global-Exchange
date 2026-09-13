"""Pruebas de métodos de pago y cuentas bancarias (Hito 4)."""

from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from clientes.models import Cliente
from monedas.models import Moneda

from .models import CuentaBancaria, MetodoPago
from .views import CuentaBancariaViewSet, MetodoPagoViewSet


class UsuarioFake:
    def __init__(self, roles=('admin',), authenticated=True):
        self.roles = list(roles)
        self.is_superuser = 'admin' in [r.lower() for r in roles]
        self._authenticated = authenticated
        self.username = 'tester'

    @property
    def is_authenticated(self):
        return self._authenticated

    def __str__(self):
        return self.username


class MetodoPagoTest(APITestCase):
    def test_usuario_solo_ve_activos_y_no_crea(self):
        MetodoPago.objects.get_or_create(
            codigo='transfer', defaults={'nombre': 'Transferencia'})
        MetodoPago.objects.get_or_create(
            codigo='cash-test', defaults={'nombre': 'Efectivo', 'activo': False})
        factory = APIRequestFactory()

        req = factory.get('/api/metodos-pago/')
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        resp = MetodoPagoViewSet.as_view({'get': 'list'})(req)
        self.assertEqual(resp.status_code, 200)
        codigos = [m['codigo'] for m in resp.data]
        self.assertIn('transfer', codigos)
        self.assertNotIn('cash-test', codigos)

        req2 = factory.post('/api/metodos-pago/', {'codigo': 'qr', 'nombre': 'QR'}, format='json')
        force_authenticate(req2, user=UsuarioFake(roles=['user']))
        resp2 = MetodoPagoViewSet.as_view({'post': 'create'})(req2)
        self.assertEqual(resp2.status_code, 403)


class CuentaBancariaTest(APITestCase):
    def setUp(self):
        self.cliente = Cliente.objects.create(nombre='Carlos', documento='1', email='c@x.com')
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0})

    def _crear(self, numero='12345678'):
        factory = APIRequestFactory()
        req = factory.post('/api/cuentas-bancarias/', {
            'cliente': self.cliente.pk, 'nombre': 'Carlos', 'apellido': 'Martínez',
            'cedula': '1234567', 'banco': 'Continental', 'numero_cuenta': numero,
            'codigo_bancario': 'BCON-PY', 'moneda': self.pyg.pk,
        }, format='json')
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        return CuentaBancariaViewSet.as_view({'post': 'create'})(req)

    def test_crea_enmascara_y_valida(self):
        resp = self._crear()
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['numero_enmascarado'], '•••• •••• 5678')
        self.assertNotIn('numero_cuenta', resp.data)

        resp_corta = self._crear(numero='123')
        self.assertEqual(resp_corta.status_code, 400)

    def test_baja_logica(self):
        cuenta = CuentaBancaria.objects.create(
            cliente=self.cliente, nombre='C', apellido='M', cedula='1',
            banco='Itaú', numero_cuenta='87654321', codigo_bancario='ITAU-PY',
            moneda=self.pyg,
        )
        factory = APIRequestFactory()
        req = factory.delete(f'/api/cuentas-bancarias/{cuenta.pk}/')
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        resp = CuentaBancariaViewSet.as_view({'delete': 'destroy'})(req, pk=cuenta.pk)
        self.assertEqual(resp.status_code, 200)
        cuenta.refresh_from_db()
        self.assertFalse(cuenta.activa)
