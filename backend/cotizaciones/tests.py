"""Pruebas de cotizaciones y simulador (Hito 4)."""

from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from clientes.models import Cliente, ClienteUsuario, Comision
from monedas.models import Moneda

from .models import Cotizacion
from .permisos import es_editor_tasas
from .views import CotizacionViewSet


class UsuarioFake:
    def __init__(self, roles=('admin',), authenticated=True):
        self.id = 'sub-simulador'
        self.roles = list(roles)
        self.is_superuser = 'admin' in [r.lower() for r in roles]
        self._authenticated = authenticated
        self.username = 'tester'

    @property
    def is_authenticated(self):
        return self._authenticated

    def __str__(self):
        return self.username


class CotizacionTest(APITestCase):
    def setUp(self):
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar'})
        self.eur, _ = Moneda.objects.get_or_create(
            codigo='EUR', defaults={'nombre': 'Euro'})
        # Historial determinista: quita los puntos del seed.
        Cotizacion.objects.filter(moneda__in=[self.usd, self.eur]).delete()
        Cotizacion.objects.create(moneda=self.usd, compra=7400, venta=7500)
        Cotizacion.objects.create(moneda=self.usd, compra=7450, venta=7550)
        Cotizacion.objects.create(moneda=self.eur, compra=8000, venta=8100)

    def test_rechaza_venta_menor_que_compra(self):
        factory = APIRequestFactory()
        req = factory.post('/api/cotizaciones/', {
            'moneda': self.usd.pk, 'compra': 7600, 'venta': 7500,
        }, format='json')
        force_authenticate(req, user=UsuarioFake(roles=['admin']))
        resp = CotizacionViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(resp.status_code, 400)

    def test_usuario_no_puede_crear_pero_si_leer(self):
        factory = APIRequestFactory()
        req = factory.post('/api/cotizaciones/', {
            'moneda': self.usd.pk, 'compra': 7400, 'venta': 7500,
        }, format='json')
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        resp = CotizacionViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(resp.status_code, 403)

        req2 = factory.get('/api/cotizaciones/?moneda=USD')
        force_authenticate(req2, user=UsuarioFake(roles=['user']))
        resp2 = CotizacionViewSet.as_view({'get': 'list'})(req2)
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(len(resp2.data), 2)

    def test_analista_puede_crear(self):
        self.assertTrue(es_editor_tasas(UsuarioFake(roles=['analyst'])))
        factory = APIRequestFactory()
        req = factory.post('/api/cotizaciones/', {
            'moneda': self.eur.pk, 'compra': 8010, 'venta': 8110,
        }, format='json')
        force_authenticate(req, user=UsuarioFake(roles=['analyst']))
        resp = CotizacionViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['creado_por'], 'tester')

    def test_vigentes_devuelve_ultima_por_moneda(self):
        factory = APIRequestFactory()
        req = factory.get('/api/cotizaciones/vigentes/')
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        resp = CotizacionViewSet.as_view({'get': 'vigentes'})(req)
        self.assertEqual(resp.status_code, 200)
        por_moneda = {c['moneda_codigo']: c for c in resp.data}
        self.assertEqual(float(por_moneda['USD']['venta']), 7550.0)
        self.assertIn('EUR', por_moneda)

    def test_simulador_devuelve_solo_precio_final(self):
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_VIP, defaults={'porcentaje': '1.00'})
        cliente = Cliente.objects.create(
            nombre='Cliente VIP', documento='vip-1', email='vip@test.com',
            categoria=Cliente.CAT_VIP,
        )
        ClienteUsuario.objects.create(
            cliente=cliente, keycloak_id='sub-simulador', username='tester',
        )
        factory = APIRequestFactory()
        req = factory.get(
            f'/api/simulador/?moneda=USD&monto=1000&operacion=compra&cliente={cliente.pk}'
        )
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        from .views import simular
        resp = simular(req)
        self.assertEqual(resp.status_code, 200)
        # El ajuste del 1% ya está incluido en el total que recibe el cliente.
        self.assertEqual(resp.data['tasa_aplicada'], 7625.5)
        self.assertEqual(resp.data['monto_total'], 7625500.0)
        self.assertEqual(resp.data['total_tipo'], 'pagar')
        self.assertNotIn('comision_porcentaje', resp.data)
        self.assertNotIn('comision_pyg', resp.data)
        self.assertNotIn('monto_neto_pyg', resp.data)
