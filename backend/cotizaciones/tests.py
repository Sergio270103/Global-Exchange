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
    def test_fecha_empatada_usa_ultimo_registro_en_vigentes_y_simulador(self):
        from django.utils import timezone
        Cotizacion.objects.filter(moneda=self.usd).update(vigente_desde=timezone.now())
        self.test_vigentes_devuelve_ultima_por_moneda()
        self.test_simulador_devuelve_solo_precio_final()

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

    def test_cotizaciones_publicas_sin_sesion_coinciden_con_vigentes(self):
        from rest_framework.test import APIClient

        cliente = APIClient()
        publica = cliente.get('/api/cotizaciones/publicas/')
        self.assertEqual(publica.status_code, 200)
        cliente.force_authenticate(user=UsuarioFake(roles=['user']))
        privada = cliente.get('/api/cotizaciones/vigentes/')
        por_moneda = {c['moneda_codigo']: c for c in privada.data}
        for cotizacion in publica.data:
            self.assertNotIn('creado_por', cotizacion)
            self.assertEqual(cotizacion['venta'], por_moneda[cotizacion['moneda_codigo']]['venta'])
            self.assertEqual(cotizacion['compra'], por_moneda[cotizacion['moneda_codigo']]['compra'])
        cliente.force_authenticate(user=None)
        self.assertIn(cliente.post('/api/cotizaciones/', {}).status_code, (401, 403))
        self.assertIn(cliente.get('/api/cotizaciones/').status_code, (401, 403))

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


class EvolucionTest(APITestCase):
    def setUp(self):
        from datetime import datetime, timezone
        self.ahora = datetime(2026, 11, 19, 15, 0, tzinfo=timezone.utc)
        self.usd, _ = Moneda.objects.get_or_create(codigo='USD', defaults={'nombre': 'Dólar'})
        Cotizacion.objects.filter(moneda=self.usd).delete()
        self.client.force_authenticate(user=UsuarioFake(roles=['user']))

    def crear(self, fecha, compra=7400):
        from datetime import datetime
        punto = Cotizacion.objects.create(moneda=self.usd, compra=compra, venta=compra + 100)
        Cotizacion.objects.filter(pk=punto.pk).update(vigente_desde=datetime.fromisoformat(fecha))
        return punto.pk

    def consultar(self, **params):
        from unittest.mock import patch
        with patch('cotizaciones.views.timezone.now', return_value=self.ahora):
            return self.client.get('/api/cotizaciones/evolucion/', {'moneda': 'USD', **params})

    def test_hoy_desde_medianoche_paraguaya_con_cada_cambio_y_desempate(self):
        anterior = self.crear('2026-11-19T02:59:59+00:00')
        primero = self.crear('2026-11-19T03:00:00+00:00', 7410)
        segundo = self.crear('2026-11-19T12:00:00+00:00', 7420)
        tercero = self.crear('2026-11-19T12:00:00+00:00', 7430)
        self.crear('2026-11-19T16:00:00+00:00')
        resp = self.consultar(periodo='Hoy')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['inicio'], '2026-11-19T00:00:00-03:00')
        self.assertEqual(resp.data['anterior']['id'], anterior)
        self.assertEqual([p['id'] for p in resp.data['cambios']], [primero, segundo, tercero])

    def test_periodos_moviles_y_continuidad_sin_cambios(self):
        from datetime import datetime, timedelta
        anterior = self.crear('2024-01-01T00:00:00+00:00')
        for periodo, dias in [('Semana', 7), ('Mes', 30), ('Año', 365)]:
            with self.subTest(periodo=periodo):
                resp = self.consultar(periodo=periodo)
                self.assertEqual(datetime.fromisoformat(resp.data['inicio']), self.ahora - timedelta(days=dias))
                self.assertEqual(resp.data['anterior']['id'], anterior)
                self.assertEqual(resp.data['cambios'], [])

    def test_personalizado_incluye_dia_final_y_valida_fechas(self):
        punto = self.crear('2026-11-19T02:59:59+00:00')
        self.crear('2026-11-19T03:00:00+00:00')
        resp = self.consultar(periodo='Personalizado', desde='2026-11-18', hasta='2026-11-18')
        self.assertEqual([p['id'] for p in resp.data['cambios']], [punto])
        for filtros in [dict(desde='2026-02-30'), dict(desde='mal'), dict(desde='2026-11-19', hasta='2026-11-18')]:
            self.assertEqual(self.consultar(periodo='Personalizado', **filtros).status_code, 400)

    def test_sin_registros_y_acceso_sin_sesion(self):
        resp = self.consultar(periodo='Hoy')
        self.assertIsNone(resp.data['anterior'])
        self.assertEqual(resp.data['cambios'], [])
        self.client.force_authenticate(user=None)
        self.assertIn(self.consultar(periodo='Hoy').status_code, [401, 403])
