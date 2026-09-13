"""Pruebas de clientes, asociaciones y comisiones."""

from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from .models import Cliente, ClienteUsuario, Comision
from .views import ClienteUsuarioViewSet, ClienteViewSet, ComisionViewSet


class UsuarioFake:
    def __init__(self, sub='sub-1', roles=('admin',), authenticated=True):
        self.id = sub
        self.roles = list(roles)
        self.is_superuser = 'admin' in [r.lower() for r in roles]
        self._authenticated = authenticated
        self.username = 'tester'

    @property
    def is_authenticated(self):
        return self._authenticated

    def __str__(self):
        return self.username


class ClienteModelTest(TestCase):
    def test_documento_unico(self):
        Cliente.objects.create(nombre='A', documento='1', email='a@x.com')
        with self.assertRaises(Exception):
            Cliente.objects.create(nombre='B', documento='1', email='b@x.com')


class ClienteViewSetTest(APITestCase):
    def setUp(self):
        self.c = Cliente.objects.create(
            nombre='Carlos', documento='123', email='c@x.com',
            tipo='FISICA', categoria='MINORISTA',
        )

    def test_admin_crea_y_desactiva(self):
        factory = APIRequestFactory()
        req = factory.post('/api/clientes/', {
            'nombre': 'Atlas', 'documento': '80-1', 'email': 'a@atlas.com',
            'tipo': 'JURIDICA', 'categoria': 'CORPORATIVO',
        }, format='json')
        force_authenticate(req, user=UsuarioFake())
        resp = ClienteViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(resp.status_code, 201)

        req2 = factory.delete(f'/api/clientes/{self.c.pk}/')
        force_authenticate(req2, user=UsuarioFake())
        resp2 = ClienteViewSet.as_view({'delete': 'destroy'})(req2, pk=self.c.pk)
        self.assertEqual(resp2.status_code, 200)
        self.c.refresh_from_db()
        self.assertFalse(self.c.activo)

    def test_filtra_por_categoria(self):
        factory = APIRequestFactory()
        req = factory.get('/api/clientes/?categoria=MINORISTA')
        force_authenticate(req, user=UsuarioFake())
        resp = ClienteViewSet.as_view({'get': 'list'})(req)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(all(c['categoria'] == 'MINORISTA' for c in resp.data))
        self.assertIn(self.c.pk, [c['id'] for c in resp.data])

    def test_mine_devuelve_solo_mis_clientes(self):
        otro = Cliente.objects.create(nombre='Otro', documento='999', email='o@x.com')
        ClienteUsuario.objects.create(cliente=self.c, keycloak_id='sub-1', username='tester')
        ClienteUsuario.objects.create(cliente=otro, keycloak_id='sub-9', username='otro')
        factory = APIRequestFactory()
        req = factory.get('/api/asociaciones/?mine=1')
        force_authenticate(req, user=UsuarioFake(sub='sub-1'))
        resp = ClienteUsuarioViewSet.as_view({'get': 'list'})(req)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['cliente'], self.c.pk)


class ComisionTest(APITestCase):
    def test_categoria_unica_y_simulador(self):
        Comision.objects.update_or_create(
            categoria='VIP', defaults={'porcentaje': '0.50'})
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Comision.objects.create(categoria='VIP', porcentaje='1.00')
        factory = APIRequestFactory()
        req = factory.get('/api/comisiones/simulador/')
        force_authenticate(req, user=UsuarioFake())
        resp = ComisionViewSet.as_view({'get': 'para_simulador'})(req)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['VIP'], 0.5)
