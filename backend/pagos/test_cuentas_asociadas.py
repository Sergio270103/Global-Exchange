"""PI-19: autorización de cuentas bancarias a través de la API real."""

from rest_framework.test import APITestCase

from clientes.models import Cliente, ClienteUsuario
from monedas.autenticacion import UsuarioKeycloak
from monedas.models import Moneda
from .models import CuentaBancaria


class CuentasAsociadasTests(APITestCase):
    url = '/api/cuentas-bancarias/'

    def setUp(self):
        self.usuario = UsuarioKeycloak({'sub': 'usuario-pi19'})
        self.client.force_authenticate(user=self.usuario)
        self.propios = [Cliente.objects.create(nombre=f'Propio {i}', documento=f'pi19-{i}')
                       for i in range(2)]
        self.ajeno = Cliente.objects.create(nombre='Ajeno', documento='pi19-ajeno')
        for cliente in self.propios:
            ClienteUsuario.objects.create(cliente=cliente, keycloak_id=self.usuario.id)
        ClienteUsuario.objects.create(cliente=self.ajeno, keycloak_id='otro-usuario')
        self.moneda, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0})
        self.cuentas = [CuentaBancaria.objects.create(**self.datos(cliente))
                        for cliente in [*self.propios, self.ajeno]]

    def datos(self, cliente):
        return {'cliente_id': cliente.pk, 'nombre': 'Ana', 'apellido': 'Pérez',
                'cedula': '123456', 'banco': 'Banco PI19', 'numero_cuenta': '12345678',
                'codigo_bancario': 'PI19', 'moneda_id': self.moneda.pk}

    def payload(self, cliente):
        datos = self.datos(cliente)
        datos['cliente'] = datos.pop('cliente_id')
        datos['moneda'] = datos.pop('moneda_id')
        return datos

    def test_listado_sin_filtro_solo_incluye_asociados(self):
        respuesta = self.client.get(self.url)
        self.assertEqual(respuesta.status_code, 200)
        self.assertCountEqual([c['id'] for c in respuesta.data], [c.pk for c in self.cuentas[:2]])

    def test_filtros_no_amplian_acceso(self):
        for cliente, cuenta in zip(self.propios, self.cuentas):
            respuesta = self.client.get(self.url, {'cliente': cliente.pk, 'buscar': 'Banco', 'activa': 'true'})
            self.assertEqual(respuesta.status_code, 200)
            self.assertEqual([c['id'] for c in respuesta.data], [cuenta.pk])
        for cliente_id in [self.ajeno.pk, 999999, 'invalido', '']:
            with self.subTest(cliente=cliente_id):
                self.assertEqual(self.client.get(self.url, {'cliente': cliente_id}).status_code, 404)

    def test_crud_cliente_asociado(self):
        respuesta = self.client.post(self.url, self.payload(self.propios[0]), format='json')
        self.assertEqual(respuesta.status_code, 201)
        detalle = f"{self.url}{respuesta.data['id']}/"
        self.assertEqual(self.client.get(detalle).status_code, 200)
        self.assertEqual(self.client.put(detalle, self.payload(self.propios[0]), format='json').status_code, 200)
        self.assertEqual(self.client.patch(detalle, {'banco': 'Actualizado'}, format='json').status_code, 200)
        self.assertEqual(self.client.delete(detalle).status_code, 200)
        self.assertFalse(CuentaBancaria.objects.get(pk=respuesta.data['id']).activa)

    def test_no_crea_para_cliente_ajeno(self):
        cantidad = CuentaBancaria.objects.count()
        respuesta = self.client.post(self.url, self.payload(self.ajeno), format='json')
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(CuentaBancaria.objects.count(), cantidad)

    def test_no_accede_ni_modifica_cuenta_ajena_por_id(self):
        cuenta = self.cuentas[2]
        for sufijo in ['', f'?cliente={self.propios[0].pk}']:
            detalle = f'{self.url}{cuenta.pk}/{sufijo}'
            for metodo in ['get', 'put', 'patch', 'delete']:
                with self.subTest(metodo=metodo, sufijo=sufijo):
                    datos = self.payload(self.propios[0]) if metodo == 'put' else {'activa': False}
                    respuesta = getattr(self.client, metodo)(detalle, datos, format='json')
                    self.assertEqual(respuesta.status_code, 404)
        cuenta.refresh_from_db()
        self.assertTrue(cuenta.activa)
        self.assertEqual(cuenta.cliente_id, self.ajeno.pk)

    def test_no_reasigna_cuenta_propia_a_cliente_ajeno(self):
        cuenta = self.cuentas[0]
        for metodo in ['put', 'patch']:
            respuesta = getattr(self.client, metodo)(
                f'{self.url}{cuenta.pk}/', self.payload(self.ajeno), format='json')
            self.assertEqual(respuesta.status_code, 403)
        cuenta.refresh_from_db()
        self.assertEqual(cuenta.cliente_id, self.propios[0].pk)

    def test_sin_asociaciones_o_sin_sub_no_accede(self):
        for claims in [{'sub': 'sin-asociaciones'}, {}]:
            self.client.force_authenticate(user=UsuarioKeycloak(claims))
            self.assertEqual(self.client.get(self.url).data, [])
            self.assertEqual(self.client.get(f'{self.url}{self.cuentas[0].pk}/').status_code, 404)
            self.assertEqual(self.client.post(self.url, self.payload(self.propios[0]), format='json').status_code, 403)

    def test_admin_sin_asociacion_tampoco_accede(self):
        self.client.force_authenticate(user=UsuarioKeycloak({
            'sub': 'admin-no-asociado', 'realm_access': {'roles': ['admin']}}))
        self.assertEqual(self.client.get(self.url).data, [])
        self.assertEqual(self.client.post(self.url, self.payload(self.ajeno), format='json').status_code, 403)

    def test_revocar_asociacion_quita_acceso(self):
        ClienteUsuario.objects.filter(keycloak_id=self.usuario.id).delete()
        self.assertEqual(self.client.get(self.url).data, [])
        self.assertEqual(self.client.patch(f'{self.url}{self.cuentas[0].pk}/', {'activa': False}, format='json').status_code, 404)

    def test_anonimo_no_accede(self):
        self.client.force_authenticate(user=None)
        for metodo in ['get', 'post']:
            respuesta = getattr(self.client, metodo)(self.url, self.payload(self.propios[0]), format='json')
            self.assertIn(respuesta.status_code, [401, 403])
