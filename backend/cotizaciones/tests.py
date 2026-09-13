"""Pruebas de cotizaciones y simulador (Hito 4)."""

from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from clientes.models import Cliente, Comision
from monedas.models import Moneda

from .models import Cotizacion
from .permisos import es_editor_tasas
from .views import CotizacionViewSet


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

    def test_simulador_aplica_tasa_y_comision(self):
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_VIP, defaults={'porcentaje': '1.00'})
        factory = APIRequestFactory()
        req = factory.get('/api/simulador/?moneda=USD&monto=1000&operacion=compra&categoria=VIP')
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        from .views import simular
        resp = simular(req)
        self.assertEqual(resp.status_code, 200)
        # compra -> tasa venta vigente 7550; bruto 7.550.000; comisión 1% = 75.500
        self.assertEqual(resp.data['tasa_aplicada'], 7550.0)
        self.assertEqual(resp.data['monto_bruto_pyg'], 7550000.0)
        self.assertEqual(resp.data['comision_pyg'], 75500.0)
        self.assertEqual(resp.data['monto_neto_pyg'], 7474500.0)
