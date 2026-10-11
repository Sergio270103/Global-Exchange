"""Pruebas de clientes, asociaciones y ajustes de precio."""

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


class ClientePresencialTest(APITestCase):
    """PI-45: el cajero busca por documento y registra al cliente en ventanilla."""

    def setUp(self):
        self.existente = Cliente.objects.create(
            nombre='Ana', apellido='Barrios', documento='4589201',
            email='ana@x.com', telefono='0981000000',
        )
        self.factory = APIRequestFactory()

    def _buscar(self, documento, roles=('cashier',)):
        req = self.factory.get(f'/api/clientes/buscar-documento/?documento={documento}')
        force_authenticate(req, user=UsuarioFake(roles=roles))
        return ClienteViewSet.as_view({'get': 'buscar_documento'})(req)

    def _registrar(self, datos, roles=('cashier',)):
        req = self.factory.post('/api/clientes/presencial/', datos, format='json')
        force_authenticate(req, user=UsuarioFake(roles=roles))
        return ClienteViewSet.as_view({'post': 'presencial'})(req)

    def test_cajero_busca_por_documento_y_ve_sus_datos(self):
        res = self._buscar('4589201')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['encontrado'])
        self.assertEqual(res.data['cliente']['nombre'], 'Ana')
        self.assertEqual(res.data['cliente']['apellido'], 'Barrios')
        self.assertEqual(res.data['cliente']['tipo_display'], 'Persona física')

    def test_busqueda_ignora_espacios(self):
        res = self._buscar(' 4589201 ')
        self.assertTrue(res.data['encontrado'])
        self.assertEqual(res.data['cliente']['documento'], '4589201')

    def test_documento_inexistente_informa_que_no_existe(self):
        res = self._buscar('0000000')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['encontrado'])
        self.assertIsNone(res.data['cliente'])

    def test_documento_vacio_es_400(self):
        self.assertEqual(self._buscar('').status_code, 400)

    def test_registra_cliente_presencial_y_lo_devuelve(self):
        res = self._registrar({
            'nombre': 'Pedro', 'apellido': 'Test', 'documento': '9999999',
            'email': 'pedro@x.com', 'telefono': '0981000000', 'tipo': 'FISICA',
        })
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['nombre_completo'], 'Pedro Test')
        self.assertTrue(Cliente.objects.filter(documento='9999999').exists())

    def test_documento_duplicado_se_rechaza(self):
        res = self._registrar({
            'nombre': 'Otro', 'apellido': 'Nombre', 'documento': '4589201',
            'email': 'otro@x.com', 'telefono': '0981000000', 'tipo': 'FISICA',
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('documento', res.data)
        self.assertEqual(Cliente.objects.filter(documento='4589201').count(), 1)

    def test_avisa_datos_obligatorios_faltantes(self):
        res = self._registrar({'nombre': 'Solo', 'tipo': 'FISICA'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('documento', res.data)
        self.assertIn('email', res.data)

    def test_persona_fisica_exige_apellido(self):
        res = self._registrar({
            'nombre': 'Sin', 'documento': '6666666', 'email': 's@x.com',
            'telefono': '0981000000', 'tipo': 'FISICA',
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('apellido', res.data)

    def test_persona_fisica_exige_telefono(self):
        res = self._registrar({
            'nombre': 'Sin', 'apellido': 'Tel', 'documento': '7777777',
            'email': 'sin@x.com', 'tipo': 'FISICA',
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('telefono', res.data)

    def test_admin_tambien_puede_operar_ventanilla(self):
        res = self._registrar({
            'nombre': 'Corp', 'apellido': '', 'documento': '80-1',
            'email': 'corp@x.com', 'telefono': '', 'tipo': 'JURIDICA',
            'categoria': 'CORPORATIVO',
        }, roles=('admin',))
        self.assertEqual(res.status_code, 201, res.data)

    def test_usuario_comun_no_puede_registrar_presencial(self):
        res = self._registrar({
            'nombre': 'Ana', 'apellido': 'Barrios', 'documento': '1111111',
            'email': 'a@x.com', 'telefono': '0981000000', 'tipo': 'FISICA',
        }, roles=('user',))
        self.assertEqual(res.status_code, 403)

    def test_alta_normal_sigue_siendo_solo_admin(self):
        req = self.factory.post('/api/clientes/', {
            'nombre': 'PorCatalogo', 'documento': '1231234', 'email': 'cat@x.com',
        }, format='json')
        force_authenticate(req, user=UsuarioFake(roles=('cashier',)))
        res = ClienteViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(res.status_code, 403)


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

    def test_usuario_no_consulta_ajustes_internos(self):
        factory = APIRequestFactory()
        req = factory.get('/api/ajustes-precios/simulador/')
        force_authenticate(req, user=UsuarioFake(roles=['user']))
        resp = ComisionViewSet.as_view({'get': 'para_simulador'})(req)
        self.assertEqual(resp.status_code, 403)
