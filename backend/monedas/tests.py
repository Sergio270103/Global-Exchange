"""Pruebas unitarias del módulo de monedas (Hito 4: CRUD de Monedas).

Cubre modelo, serializer, permisos y viewset. La autenticación Keycloak
se evita con force_authenticate para no requerir red.
"""

from django.test import TestCase
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from .models import Moneda
from .permisos import SoloAdminEscribe, es_admin
from .serializers import MonedaSerializer
from .views import MonedaViewSet


class UsuarioFake:
    """Doble de prueba mínimo compatible con es_admin y DRF."""

    def __init__(self, roles=(), is_superuser=False, authenticated=True):
        self.roles = list(roles)
        self.is_superuser = is_superuser
        self._authenticated = authenticated

    @property
    def is_authenticated(self):
        return self._authenticated

    def tiene_rol(self, *roles):
        return any(r.lower() in {x.lower() for x in self.roles} for r in roles)


class MonedaModelTest(TestCase):
    def test_normaliza_codigos_a_mayusculas(self):
        m = Moneda.objects.create(codigo='jpy', nombre='Yen', pais_iso='jp')
        self.assertEqual(m.codigo, 'JPY')
        self.assertEqual(m.pais_iso, 'JP')

    def test_orden_por_codigo(self):
        Moneda.objects.get_or_create(codigo='EUR', defaults={'nombre': 'Euro'})
        Moneda.objects.get_or_create(codigo='ARS', defaults={'nombre': 'Peso'})
        cods = [m.codigo for m in Moneda.objects.filter(codigo__in=['ARS', 'EUR'])]
        self.assertEqual(cods, ['ARS', 'EUR'])


class MonedaSerializerTest(TestCase):
    def test_rechaza_codigo_duplicado(self):
        # El seed ya trae USD: intentar repetirlo debe fallar.
        Moneda.objects.get_or_create(codigo='USD', defaults={'nombre': 'Dólar'})
        s = MonedaSerializer(data={'codigo': 'usd', 'nombre': 'Otro'})
        self.assertFalse(s.is_valid())
        self.assertIn('codigo', s.errors)

    def test_rechaza_pais_iso_invalido(self):
        s = MonedaSerializer(data={'codigo': 'BRL', 'nombre': 'Real', 'pais_iso': 'BRA'})
        self.assertFalse(s.is_valid())
        self.assertIn('pais_iso', s.errors)


class PermisosTest(TestCase):
    def test_es_admin(self):
        self.assertTrue(es_admin(UsuarioFake(roles=['admin'])))
        self.assertTrue(es_admin(UsuarioFake(roles=['ADMINISTRADOR'])))
        self.assertTrue(es_admin(UsuarioFake(is_superuser=True)))
        self.assertFalse(es_admin(UsuarioFake(roles=['user'])))
        self.assertFalse(es_admin(UsuarioFake(authenticated=False)))
        self.assertFalse(es_admin(None))

    def test_solo_admin_escribe(self):
        perm = SoloAdminEscribe()
        factory = APIRequestFactory()
        get = factory.get('/api/monedas/')
        get.user = UsuarioFake(roles=['user'])
        self.assertTrue(perm.has_permission(get, None))
        post = factory.post('/api/monedas/', {})
        post.user = UsuarioFake(roles=['user'])
        self.assertFalse(perm.has_permission(post, None))
        post_admin = factory.post('/api/monedas/', {})
        post_admin.user = UsuarioFake(roles=['admin'])
        self.assertTrue(perm.has_permission(post_admin, None))


class MonedaViewSetTest(APITestCase):
    def setUp(self):
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'simbolo': '$'})
        self.ars, _ = Moneda.objects.get_or_create(
            codigo='ARS', defaults={'nombre': 'Peso'})
        self.ars.activo = False
        self.ars.save(update_fields=['activo', 'actualizado_en'])

    def _view(self, method, path='/api/monedas/', **kw):
        factory = APIRequestFactory()
        req = getattr(factory, method)(path, **kw)
        view = MonedaViewSet.as_view({'get': 'list', 'post': 'create'})
        return req, view

    def test_no_autenticado_no_lista(self):
        req, view = self._view('get')
        req.user = UsuarioFake(authenticated=False)
        resp = view(req)
        self.assertIn(resp.status_code, (401, 403))

    def test_usuario_comun_solo_ve_activas(self):
        req, view = self._view('get')
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        resp = view(req)
        self.assertEqual(resp.status_code, 200)
        codigos = [m['codigo'] for m in resp.data]
        self.assertIn('USD', codigos)
        # La dada de baja (ARS) no se ofrece a los clientes.
        self.assertNotIn('ARS', codigos)

    def test_usuario_comun_no_puede_crear(self):
        req, view = self._view('post', data={'codigo': 'EUR', 'nombre': 'Euro'}, format='json')
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        resp = view(req)
        self.assertEqual(resp.status_code, 403)

    def test_admin_crea_moneda(self):
        req, view = self._view('post', data={'codigo': 'CLP', 'nombre': 'Peso Chileno'}, format='json')
        force_authenticate(req, user=UsuarioFake(roles=['admin']))
        resp = view(req)
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(Moneda.objects.filter(codigo='CLP').exists())

    def test_destroy_es_baja_logica(self):
        factory = APIRequestFactory()
        req = factory.delete(f'/api/monedas/{self.usd.pk}/')
        force_authenticate(req, user=UsuarioFake(roles=['admin']))
        resp = MonedaViewSet.as_view({'delete': 'destroy'})(req, pk=self.usd.pk)
        self.assertEqual(resp.status_code, 200)
        self.usd.refresh_from_db()
        self.assertFalse(self.usd.activo)
        # El registro sigue existiendo para el histórico.
        self.assertTrue(Moneda.objects.filter(pk=self.usd.pk).exists())

    def test_estado_activa_y_desactiva(self):
        factory = APIRequestFactory()
        req = factory.patch(f'/api/monedas/{self.ars.pk}/estado/', {'activo': True}, format='json')
        force_authenticate(req, user=UsuarioFake(roles=['admin']))
        resp = MonedaViewSet.as_view({'patch': 'estado'})(req, pk=self.ars.pk)
        self.assertEqual(resp.status_code, 200)
        self.ars.refresh_from_db()
        self.assertTrue(self.ars.activo)
