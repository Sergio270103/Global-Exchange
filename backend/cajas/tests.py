"""Pruebas de PI-44: consultar y actualizar saldo de billetes por caja.

Criterios de aceptación cubiertos:

1. Vista detallada de billetes agrupados por divisa y denominación (RF56).
2. Total acumulado por moneda según el inventario de billetes.
3. El saldo se actualiza en el mismo paso que se confirma un ingreso,
   una entrega o un retiro (RF58), y un retiro no puede dejarlo negativo.
4. Registro de auditoría del estado de caja (arqueos / cierres de turno),
   sin endpoints para editar ni borrar movimientos.

Ejecutar desde ``backend/``::

    python manage.py test cajas
"""

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from monedas.models import Moneda

from .models import ArqueoCaja, Caja, Denominacion, MovimientoCaja, SaldoBillete
from .servicios import SaldoInsuficiente, registrar_movimiento


class UsuarioFalso:
    """Imita al usuario que arma la autenticación de Keycloak."""

    is_authenticated = True
    is_anonymous = False

    def __init__(self, sub: str, nombre: str, roles=()):
        self.id = sub
        self.pk = sub
        self.username = nombre
        self.nombre = nombre
        self.roles = list(roles)

    def __str__(self) -> str:
        return self.username


CAJERO = UsuarioFalso('sub-cajero', 'Cajera Ana', roles=['cashier'])
ADMIN = UsuarioFalso('sub-admin', 'Admin Beto', roles=['admin'])
ANALISTA = UsuarioFalso('sub-analista', 'Analista', roles=['analyst'])
CLIENTE = UsuarioFalso('sub-cliente', 'Cliente', roles=['user'])


class BaseCajas(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.usd, _ = Moneda.objects.update_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'simbolo': '$', 'activo': True})
        cls.pyg, _ = Moneda.objects.update_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'simbolo': '₲', 'decimales': 0, 'activo': True})
        cls.caja = Caja.objects.create(nombre='Caja Test', sucursal='Sucursal Test')
        cls.usd100, _ = Denominacion.objects.get_or_create(moneda=cls.usd, valor=Decimal('100'))
        cls.usd20, _ = Denominacion.objects.get_or_create(moneda=cls.usd, valor=Decimal('20'))
        cls.pyg100k, _ = Denominacion.objects.get_or_create(moneda=cls.pyg, valor=Decimal('100000'))

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=CAJERO)

    def url(self, sufijo=''):
        return f'/api/cajas/{self.caja.pk}/{sufijo}'

    def mover(self, tipo, moneda, lineas, usuario=None, **extra):
        if usuario:
            self.api.force_authenticate(user=usuario)
        return self.api.post(self.url('movimientos/'), {
            'tipo': tipo, 'moneda': moneda.pk,
            'detalle': [{'denominacion': d.pk, 'cantidad': c} for d, c in lineas],
            **extra,
        }, format='json')

    def cantidad(self, denominacion) -> int:
        saldo = SaldoBillete.objects.filter(caja=self.caja, denominacion=denominacion).first()
        return saldo.cantidad if saldo else 0


class SaldoTests(BaseCajas):
    """Criterios 1 y 2: vista por divisa y denominación con totales."""

    def test_caja_nueva_muestra_denominaciones_en_cero(self):
        res = self.api.get(self.url('saldo/'))
        self.assertEqual(res.status_code, 200)
        usd = next(m for m in res.data['monedas'] if m['moneda_codigo'] == 'USD')
        valores = [d['valor'] for d in usd['denominaciones']]
        self.assertIn('100', valores)
        self.assertIn('20', valores)
        self.assertEqual(usd['total'], '0')
        self.assertTrue(all(d['cantidad'] == 0 for d in usd['denominaciones']))

    def test_agrupa_por_moneda_y_calcula_totales(self):
        self.mover('INGRESO', self.usd, [(self.usd100, 3), (self.usd20, 5)])
        self.mover('INGRESO', self.pyg, [(self.pyg100k, 4)])
        res = self.api.get(self.url('saldo/'))
        monedas = {m['moneda_codigo']: m for m in res.data['monedas']}
        self.assertEqual(monedas['USD']['total'], '400')
        self.assertEqual(monedas['USD']['cantidad_billetes'], 8)
        fila100 = next(d for d in monedas['USD']['denominaciones'] if d['valor'] == '100')
        self.assertEqual(fila100['cantidad'], 3)
        self.assertEqual(fila100['subtotal'], '300')
        self.assertEqual(monedas['PYG']['total'], '400000')

    def test_moneda_inactiva_no_aparece_si_no_tiene_billetes(self):
        gbp = Moneda.objects.create(codigo='GBX', nombre='Prueba', activo=False)
        Denominacion.objects.create(moneda=gbp, valor=Decimal('10'))
        res = self.api.get(self.url('saldo/'))
        self.assertNotIn('GBX', [m['moneda_codigo'] for m in res.data['monedas']])


class MovimientoTests(BaseCajas):
    """Criterio 3: el saldo se actualiza tras cada movimiento."""

    def test_ingreso_suma_y_devuelve_saldo_actualizado(self):
        res = self.mover('INGRESO', self.usd, [(self.usd100, 10)], observacion='Apertura')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.cantidad(self.usd100), 10)
        mov = res.data['movimiento']
        self.assertEqual(Decimal(mov['total']), Decimal('1000'))
        self.assertEqual(mov['usuario_nombre'], 'Cajera Ana')
        self.assertEqual(mov['detalle'][0]['saldo_resultante'], 10)
        usd = next(m for m in res.data['monedas'] if m['moneda_codigo'] == 'USD')
        self.assertEqual(usd['total'], '1000')

    def test_retiro_resta(self):
        self.mover('INGRESO', self.usd, [(self.usd100, 10)])
        res = self.mover('RETIRO', self.usd, [(self.usd100, 4)])
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.cantidad(self.usd100), 6)
        self.assertEqual(res.data['movimiento']['detalle'][0]['saldo_resultante'], 6)

    def test_retiro_sin_billetes_suficientes_no_cambia_nada(self):
        self.mover('INGRESO', self.usd, [(self.usd100, 2), (self.usd20, 1)])
        res = self.mover('RETIRO', self.usd, [(self.usd100, 1), (self.usd20, 3)])
        self.assertEqual(res.status_code, 400)
        self.assertIn('insuficientes', res.data['detail'])
        self.assertEqual(self.cantidad(self.usd100), 2)
        self.assertEqual(self.cantidad(self.usd20), 1)
        self.assertEqual(MovimientoCaja.objects.filter(tipo='RETIRO').count(), 0)

    def test_entrega_solo_admin(self):
        res = self.mover('ENTREGA', self.usd, [(self.usd100, 5)])
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.cantidad(self.usd100), 0)
        res = self.mover('ENTREGA', self.usd, [(self.usd100, 5)], usuario=ADMIN)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.cantidad(self.usd100), 5)

    def test_denominacion_de_otra_moneda_se_rechaza(self):
        res = self.mover('INGRESO', self.usd, [(self.pyg100k, 1)])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.cantidad(self.pyg100k), 0)

    def test_denominacion_repetida_y_cantidad_cero_se_rechazan(self):
        res = self.mover('INGRESO', self.usd, [(self.usd100, 1), (self.usd100, 2)])
        self.assertEqual(res.status_code, 400)
        res = self.mover('INGRESO', self.usd, [(self.usd100, 0)])
        self.assertEqual(res.status_code, 400)
        res = self.api.post(self.url('movimientos/'), {
            'tipo': 'INGRESO', 'moneda': self.usd.pk, 'detalle': []}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_caja_inactiva_no_admite_movimientos(self):
        self.caja.activa = False
        self.caja.save()
        res = self.mover('INGRESO', self.usd, [(self.usd100, 1)])
        self.assertEqual(res.status_code, 400)

    def test_historial_filtra_por_moneda_y_tipo(self):
        self.mover('INGRESO', self.usd, [(self.usd100, 3)])
        self.mover('RETIRO', self.usd, [(self.usd100, 1)])
        self.mover('INGRESO', self.pyg, [(self.pyg100k, 2)])
        res = self.api.get(self.url('movimientos/'))
        self.assertEqual(len(res.data), 3)
        self.assertEqual(res.data[0]['moneda_codigo'], 'PYG')  # más reciente primero
        res = self.api.get(self.url('movimientos/?moneda=USD'))
        self.assertEqual(len(res.data), 2)
        res = self.api.get(self.url('movimientos/?moneda=USD&tipo=retiro'))
        self.assertEqual([m['tipo'] for m in res.data], ['RETIRO'])

    def test_servicio_reutilizable_lanza_saldo_insuficiente(self):
        with self.assertRaises(SaldoInsuficiente):
            registrar_movimiento(self.caja, 'RETIRO', self.usd, [(self.usd100, 1)], 'tests')


class ArqueoTests(BaseCajas):
    """Criterio 4: registro de auditoría del estado de caja."""

    def test_arqueo_sin_conteo_respalda_el_saldo_actual(self):
        self.mover('INGRESO', self.usd, [(self.usd100, 3)])
        res = self.api.post(self.url('arqueos/'), {'observacion': 'Cierre turno mañana'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertFalse(res.data['con_diferencias'])
        self.assertEqual(res.data['usuario_nombre'], 'Cajera Ana')
        [linea] = res.data['detalle']
        self.assertEqual((linea['cantidad_sistema'], linea['cantidad_contada']), (3, 3))

    def test_arqueo_con_diferencia_queda_marcado_y_no_toca_el_saldo(self):
        self.mover('INGRESO', self.usd, [(self.usd100, 3)])
        res = self.api.post(self.url('arqueos/'), {
            'conteo': [{'denominacion': self.usd100.pk, 'cantidad': 2},
                       {'denominacion': self.usd20.pk, 'cantidad': 1}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data['con_diferencias'])
        por_valor = {d['valor']: d for d in res.data['detalle']}
        self.assertEqual(por_valor['100']['diferencia'], -1)
        self.assertEqual(por_valor['20']['diferencia'], 1)
        self.assertEqual(self.cantidad(self.usd100), 3)
        self.assertEqual(len(self.api.get(self.url('arqueos/')).data), 1)

    def test_conteo_negativo_o_repetido_se_rechaza(self):
        res = self.api.post(self.url('arqueos/'), {
            'conteo': [{'denominacion': self.usd100.pk, 'cantidad': -1}]}, format='json')
        self.assertEqual(res.status_code, 400)
        res = self.api.post(self.url('arqueos/'), {
            'conteo': [{'denominacion': self.usd100.pk, 'cantidad': 1},
                       {'denominacion': self.usd100.pk, 'cantidad': 2}]}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(ArqueoCaja.objects.count(), 0)


class PermisosTests(BaseCajas):

    def test_solo_cajero_y_admin_ven_las_cajas(self):
        for usuario, esperado in ((CAJERO, 200), (ADMIN, 200), (ANALISTA, 403), (CLIENTE, 403)):
            self.api.force_authenticate(user=usuario)
            self.assertEqual(self.api.get(self.url('saldo/')).status_code, esperado, usuario)

    def test_sin_autenticar(self):
        self.api.force_authenticate(user=None)
        self.assertIn(self.api.get(self.url('saldo/')).status_code, (401, 403))

    def test_alta_de_cajas_solo_admin(self):
        datos = {'nombre': 'Caja 2', 'sucursal': 'Sucursal Test'}
        self.assertEqual(self.api.post('/api/cajas/', datos, format='json').status_code, 403)
        self.api.force_authenticate(user=ADMIN)
        self.assertEqual(self.api.post('/api/cajas/', datos, format='json').status_code, 201)

    def test_cajas_inactivas_no_se_listan(self):
        Caja.objects.create(nombre='Vieja', sucursal='Sucursal Test', activa=False)
        nombres = [c['nombre'] for c in self.api.get('/api/cajas/').data]
        self.assertIn('Caja Test', nombres)
        self.assertNotIn('Vieja', nombres)

    def test_movimientos_no_se_editan_ni_borran(self):
        self.mover('INGRESO', self.usd, [(self.usd100, 1)])
        self.assertEqual(self.api.delete(self.url()).status_code, 403)
        self.api.force_authenticate(user=ADMIN)
        self.assertEqual(self.api.delete(self.url()).status_code, 405)
        self.assertEqual(self.api.put(self.url('movimientos/'), {}, format='json').status_code, 405)
        self.assertEqual(self.api.delete(self.url('movimientos/')).status_code, 405)

    def test_catalogo_de_denominaciones(self):
        res = self.api.get('/api/denominaciones/?moneda=USD')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(all(d['moneda_codigo'] == 'USD' for d in res.data))
        nueva = {'moneda': self.usd.pk, 'valor': '50'}
        self.assertEqual(self.api.post('/api/denominaciones/', nueva, format='json').status_code, 403)
