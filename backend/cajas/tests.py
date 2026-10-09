"""Pruebas del saldo de caja (PI-44, ajustado en PI-78).

Desde PI-78 el saldo se lleva por **total de cada divisa** (decisión de
la Product Owner); la denominación solo se registra en las entregas de
billetes (ver ``test_entregas.py``).

Criterios cubiertos:

1. Saldo de la caja por divisa, con todas las monedas activas.
2. Ingresos y retiros por monto que actualizan el saldo en el mismo paso
   (RF58); un retiro no puede superar el saldo de la divisa.
3. Montos que respetan los decimales de cada moneda.
4. Recuento (arqueo) por total de cada moneda, con diferencias.
5. Permisos por rol y movimientos sin edición ni borrado.

Ejecutar desde ``backend/``::

    python manage.py test cajas
"""

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from monedas.models import Moneda

from .models import ArqueoCaja, Caja, Denominacion, MovimientoCaja, SaldoCaja
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
            codigo='USD', defaults={'nombre': 'Dólar', 'simbolo': '$', 'decimales': 2, 'activo': True})
        cls.pyg, _ = Moneda.objects.update_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'simbolo': '₲', 'decimales': 0, 'activo': True})
        cls.caja = Caja.objects.create(nombre='Caja Test', sucursal='Sucursal Test')
        # Denominaciones: solo las usan las entregas (PI-43).
        cls.usd100, _ = Denominacion.objects.get_or_create(moneda=cls.usd, valor=Decimal('100'))
        cls.usd20, _ = Denominacion.objects.get_or_create(moneda=cls.usd, valor=Decimal('20'))
        cls.pyg100k, _ = Denominacion.objects.get_or_create(moneda=cls.pyg, valor=Decimal('100000'))

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=CAJERO)

    def url(self, sufijo=''):
        return f'/api/cajas/{self.caja.pk}/{sufijo}'

    def mover(self, tipo, moneda, monto, usuario=None, **extra):
        if usuario:
            self.api.force_authenticate(user=usuario)
        return self.api.post(self.url('movimientos/'), {
            'tipo': tipo, 'moneda': moneda.pk, 'monto': str(monto), **extra,
        }, format='json')

    def saldo(self, moneda, caja=None) -> Decimal:
        fila = SaldoCaja.objects.filter(caja=caja or self.caja, moneda=moneda).first()
        return fila.monto if fila else Decimal('0')


class SaldoTests(BaseCajas):
    """Criterio 1: saldo por divisa."""

    def test_caja_nueva_muestra_todas_las_monedas_en_cero(self):
        res = self.api.get(self.url('saldo/'))
        self.assertEqual(res.status_code, 200)
        monedas = {m['moneda_codigo']: m for m in res.data['monedas']}
        self.assertEqual(monedas['USD']['total'], '0')
        self.assertEqual(monedas['PYG']['total'], '0')
        self.assertEqual(monedas['PYG']['decimales'], 0)
        self.assertNotIn('denominaciones', monedas['USD'])

    def test_muestra_el_total_de_cada_divisa(self):
        self.mover('INGRESO', self.usd, '1250.50')
        self.mover('INGRESO', self.pyg, '3500000')
        monedas = {m['moneda_codigo']: m for m in self.api.get(self.url('saldo/')).data['monedas']}
        self.assertEqual(monedas['USD']['total'], '1250.5')
        self.assertEqual(monedas['PYG']['total'], '3500000')

    def test_moneda_inactiva_solo_aparece_si_tiene_saldo(self):
        gbx = Moneda.objects.create(codigo='GBX', nombre='Prueba', activo=True)
        self.mover('INGRESO', gbx, '10')
        gbx.activo = False
        gbx.save()
        codigos = lambda: [m['moneda_codigo'] for m in self.api.get(self.url('saldo/')).data['monedas']]
        self.assertIn('GBX', codigos())
        self.mover('RETIRO', gbx, '10')
        self.assertNotIn('GBX', codigos())


class MovimientoTests(BaseCajas):
    """Criterios 2 y 3: ingresos y retiros por monto."""

    def test_ingreso_suma_y_devuelve_saldo_actualizado(self):
        res = self.mover('INGRESO', self.usd, '1000', observacion='Ajuste')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.saldo(self.usd), Decimal('1000'))
        mov = res.data['movimiento']
        self.assertEqual(Decimal(mov['total']), Decimal('1000'))
        self.assertEqual(Decimal(mov['saldo_resultante']), Decimal('1000'))
        self.assertEqual(mov['usuario_nombre'], 'Cajera Ana')
        self.assertNotIn('detalle', mov)
        usd = next(m for m in res.data['monedas'] if m['moneda_codigo'] == 'USD')
        self.assertEqual(usd['total'], '1000')

    def test_retiro_resta(self):
        self.mover('INGRESO', self.usd, '1000')
        res = self.mover('RETIRO', self.usd, '350.25')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.saldo(self.usd), Decimal('649.75'))
        self.assertEqual(Decimal(res.data['movimiento']['saldo_resultante']), Decimal('649.75'))

    def test_retiro_mayor_al_saldo_no_cambia_nada(self):
        self.mover('INGRESO', self.usd, '100')
        res = self.mover('RETIRO', self.usd, '100.01')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Saldo insuficiente de USD', res.data['detail'])
        self.assertEqual(self.saldo(self.usd), Decimal('100'))
        self.assertEqual(MovimientoCaja.objects.filter(tipo='RETIRO').count(), 0)

    def test_retiro_exacto_deja_la_divisa_en_cero(self):
        self.mover('INGRESO', self.usd, '100')
        self.assertEqual(self.mover('RETIRO', self.usd, '100').status_code, 201)
        self.assertEqual(self.saldo(self.usd), Decimal('0'))

    def test_entrega_no_se_registra_como_movimiento_directo(self):
        # PI-43: las entregas pasan por /api/entregas/ y requieren confirmación.
        for usuario in (CAJERO, ADMIN):
            res = self.mover('ENTREGA', self.usd, '500', usuario=usuario)
            self.assertEqual(res.status_code, 400)
            self.assertIn('/api/entregas/', str(res.data['tipo']))
        self.assertEqual(self.saldo(self.usd), Decimal('0'))

    def test_monto_cero_negativo_o_vacio_se_rechaza(self):
        for monto in ('0', '-5', ''):
            self.assertEqual(self.mover('INGRESO', self.usd, monto).status_code, 400, monto)
        self.assertEqual(MovimientoCaja.objects.count(), 0)

    def test_respeta_los_decimales_de_la_moneda(self):
        res = self.mover('INGRESO', self.pyg, '1000.5')
        self.assertEqual(res.status_code, 400)
        self.assertIn('PYG admite 0 decimales', res.data['detail'])
        self.assertEqual(self.mover('INGRESO', self.usd, '10.25').status_code, 201)

    def test_caja_inactiva_no_admite_movimientos(self):
        self.caja.activa = False
        self.caja.save()
        self.assertEqual(self.mover('INGRESO', self.usd, '10').status_code, 400)

    def test_historial_filtra_por_moneda_y_tipo(self):
        self.mover('INGRESO', self.usd, '300')
        self.mover('RETIRO', self.usd, '100')
        self.mover('INGRESO', self.pyg, '200000')
        res = self.api.get(self.url('movimientos/'))
        self.assertEqual(len(res.data), 3)
        self.assertEqual(res.data[0]['moneda_codigo'], 'PYG')  # más reciente primero
        self.assertEqual(len(self.api.get(self.url('movimientos/?moneda=USD')).data), 2)
        res = self.api.get(self.url('movimientos/?moneda=USD&tipo=retiro'))
        self.assertEqual([m['tipo'] for m in res.data], ['RETIRO'])

    def test_servicio_reutilizable_lanza_saldo_insuficiente(self):
        with self.assertRaises(SaldoInsuficiente):
            registrar_movimiento(self.caja, 'RETIRO', self.usd, Decimal('1'), 'tests')


class ArqueoTests(BaseCajas):
    """Criterio 4: recuento por total de cada moneda."""

    def test_arqueo_sin_conteo_respalda_el_saldo_actual(self):
        self.mover('INGRESO', self.usd, '300')
        res = self.api.post(self.url('arqueos/'), {'observacion': 'Cierre turno mañana'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertFalse(res.data['con_diferencias'])
        self.assertEqual(res.data['usuario_nombre'], 'Cajera Ana')
        [linea] = res.data['detalle']
        self.assertEqual(linea['moneda_codigo'], 'USD')
        self.assertEqual((Decimal(linea['monto_sistema']), Decimal(linea['monto_contado'])),
                         (Decimal('300'), Decimal('300')))

    def test_arqueo_con_faltante_y_sobrante_no_toca_el_saldo(self):
        self.mover('INGRESO', self.usd, '300')
        self.mover('INGRESO', self.pyg, '100000')
        res = self.api.post(self.url('arqueos/'), {
            'conteo': [{'moneda': self.usd.pk, 'monto': '280'},
                       {'moneda': self.pyg.pk, 'monto': '150000'}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data['con_diferencias'])
        por_moneda = {d['moneda_codigo']: d for d in res.data['detalle']}
        self.assertEqual(Decimal(por_moneda['USD']['diferencia']), Decimal('-20'))
        self.assertEqual(Decimal(por_moneda['PYG']['diferencia']), Decimal('50000'))
        self.assertEqual(self.saldo(self.usd), Decimal('300'))
        self.assertEqual(len(self.api.get(self.url('arqueos/')).data), 1)

    def test_conteo_invalido_se_rechaza(self):
        casos = (
            [{'moneda': self.usd.pk, 'monto': '-1'}],
            [{'moneda': self.usd.pk, 'monto': '1'}, {'moneda': self.usd.pk, 'monto': '2'}],
            [{'moneda': self.pyg.pk, 'monto': '10.5'}],
        )
        for conteo in casos:
            res = self.api.post(self.url('arqueos/'), {'conteo': conteo}, format='json')
            self.assertEqual(res.status_code, 400, conteo)
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
        self.mover('INGRESO', self.usd, '1')
        self.assertEqual(self.api.delete(self.url()).status_code, 403)
        self.api.force_authenticate(user=ADMIN)
        self.assertEqual(self.api.delete(self.url()).status_code, 405)
        self.assertEqual(self.api.put(self.url('movimientos/'), {}, format='json').status_code, 405)
        self.assertEqual(self.api.delete(self.url('movimientos/')).status_code, 405)

    def test_catalogo_de_denominaciones(self):
        res = self.api.get('/api/denominaciones/?moneda=USD&activas=1')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(all(d['moneda_codigo'] == 'USD' for d in res.data))
        valores = [Decimal(d['valor']) for d in res.data]
        self.assertEqual(valores, sorted(valores, reverse=True))  # mayor primero
        self.assertEqual(res.data[0]['simbolo'], '$')
        self.usd20.activa = False
        self.usd20.save()
        valores = [Decimal(d['valor']) for d in self.api.get('/api/denominaciones/?moneda=USD&activas=1').data]
        self.assertNotIn(Decimal('20'), valores)
        nueva = {'moneda': self.usd.pk, 'valor': '50'}
        self.assertEqual(self.api.post('/api/denominaciones/', nueva, format='json').status_code, 403)
