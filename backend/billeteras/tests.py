"""Pruebas de billeteras y medios de acreditación (PI-66)."""

from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from clientes.models import Cliente
from monedas.models import Moneda
from pagos.models import CuentaBancaria

from .models import Billetera, MedioAcreditacion
from .views import BilleteraViewSet, MedioAcreditacionViewSet


class UsuarioFake:
    def __init__(self, authenticated=True):
        self._authenticated = authenticated
        self.username = 'tester'

    @property
    def is_authenticated(self):
        return self._authenticated

    def __str__(self):
        return self.username


class BilleteraTest(APITestCase):
    def setUp(self):
        self.cliente = Cliente.objects.create(
            nombre='Carlos', documento='1', email='c@x.com')
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar'})
        self.usd.activo = True
        self.usd.save(update_fields=['activo', 'actualizado_en'])

    def test_nacen_en_cero_lazy(self):
        self.assertEqual(Billetera.objects.filter(cliente=self.cliente).count(), 0)
        factory = APIRequestFactory()
        req = factory.get(f'/api/billeteras/?cliente={self.cliente.pk}')
        force_authenticate(req, user=UsuarioFake())
        resp = BilleteraViewSet.as_view({'get': 'list'})(req)
        self.assertEqual(resp.status_code, 200)
        por_moneda = {b['moneda_codigo']: b for b in resp.data}
        self.assertIn('USD', por_moneda)
        self.assertEqual(float(por_moneda['USD']['saldo']), 0.0)

    def test_unicidad_por_cliente_y_moneda(self):
        Billetera.objects.create(cliente=self.cliente, moneda=self.usd)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Billetera.objects.create(cliente=self.cliente, moneda=self.usd)

    def test_sin_auth_no_lista(self):
        factory = APIRequestFactory()
        req = factory.get('/api/billeteras/')
        req.user = UsuarioFake(authenticated=False)
        resp = BilleteraViewSet.as_view({'get': 'list'})(req)
        self.assertIn(resp.status_code, (401, 403))


class MedioAcreditacionTest(APITestCase):
    def setUp(self):
        self.cliente = Cliente.objects.create(
            nombre='Carlos', documento='2', email='c2@x.com')
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0})
        self.billetera = Billetera.objects.create(
            cliente=self.cliente, moneda=self.pyg)
        self.cuenta = CuentaBancaria.objects.create(
            cliente=self.cliente, nombre='C', apellido='M', cedula='1',
            banco='Continental', numero_cuenta='12345678',
            codigo_bancario='BCON-PY', moneda=self.pyg)

    def _post(self, body):
        from rest_framework.test import APIRequestFactory, force_authenticate
        req = APIRequestFactory().post(
            '/api/medios-acreditacion/', body, format='json')
        force_authenticate(req, user=UsuarioFake())
        return MedioAcreditacionViewSet.as_view({'post': 'create'})(req)

    def test_crud_y_default_unico(self):
        r1 = self._post({'cliente': self.cliente.pk, 'tipo': 'BILLETERA',
                         'billetera': self.billetera.pk, 'es_default': True})
        self.assertEqual(r1.status_code, 201)
        r2 = self._post({'cliente': self.cliente.pk, 'tipo': 'CUENTA',
                         'cuenta': self.cuenta.pk, 'es_default': True})
        self.assertEqual(r2.status_code, 201)
        activos = MedioAcreditacion.objects.filter(
            cliente=self.cliente, es_default=True)
        self.assertEqual(activos.count(), 1)
        self.assertEqual(activos.first().pk, r2.data['id'])

    def test_rechaza_billetera_de_otro_cliente(self):
        otro = Cliente.objects.create(
            nombre='Otro', documento='9', email='o@x.com')
        ajena = Billetera.objects.create(cliente=otro, moneda=self.pyg)
        resp = self._post({'cliente': self.cliente.pk, 'tipo': 'BILLETERA',
                           'billetera': ajena.pk})
        self.assertEqual(resp.status_code, 400)

    def test_rechaza_tipo_sin_destino(self):
        resp = self._post({'cliente': self.cliente.pk, 'tipo': 'CUENTA'})
        self.assertEqual(resp.status_code, 400)

    def test_no_borra_default_con_alternativas(self):
        m1 = MedioAcreditacion.objects.create(
            cliente=self.cliente, tipo='BILLETERA',
            billetera=self.billetera, es_default=True)
        MedioAcreditacion.objects.create(
            cliente=self.cliente, tipo='CUENTA', cuenta=self.cuenta)
        factory = APIRequestFactory()
        req = factory.delete(f'/api/medios-acreditacion/{m1.pk}/')
        force_authenticate(req, user=UsuarioFake())
        resp = MedioAcreditacionViewSet.as_view({'delete': 'destroy'})(req, pk=m1.pk)
        self.assertEqual(resp.status_code, 400)


class MedioModelTest(TestCase):
    def test_str(self):
        c = Cliente.objects.create(nombre='C', documento='7', email='c@x.com')
        pyg, _ = Moneda.objects.get_or_create(codigo='PYG', defaults={'nombre': 'G'})
        b = Billetera.objects.create(cliente=c, moneda=pyg)
        m = MedioAcreditacion(cliente=c, tipo='BILLETERA', billetera=b, es_default=True)
        self.assertIn('(defecto)', str(m))
