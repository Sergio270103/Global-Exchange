"""Pruebas de PI-43: registrar billetes entregados (ERS RF57).

Criterios de aceptación cubiertos:

1. Registro por caja y divisa, con el detalle por denominación y cantidad.
2. Fecha y hora de la entrega guardadas automáticamente.
3. Total entregado por divisa.
4. Recién al confirmar el cajero se suma al saldo de la caja el total
   entregado de cada divisa (PI-78), y queda registrado qué cajero la
   recibió y cuándo.

Además: rechazo con motivo, cancelación por el admin, permisos por rol,
y que una entrega no se pueda responder dos veces.

Ejecutar desde ``backend/``::

    python manage.py test cajas.test_entregas
"""

from decimal import Decimal

from rest_framework.test import APIClient

from .models import EntregaBilletes, MovimientoCaja
from .servicios import confirmar_entrega, crear_entrega
from .tests import ADMIN, ANALISTA, CAJERO, CLIENTE, BaseCajas, UsuarioFalso

ADMIN_CAJERO = UsuarioFalso('sub-admin', 'Admin Beto', roles=['admin', 'cashier'])
OTRO_CAJERO = UsuarioFalso('sub-cajero-2', 'Cajero Luis', roles=['cashier'])


class BaseEntregas(BaseCajas):

    def setUp(self):
        super().setUp()
        self.api = APIClient()

    def como(self, usuario):
        self.api.force_authenticate(user=usuario)
        return self.api

    def entregar(self, lineas, usuario=ADMIN, caja=None, **extra):
        return self.como(usuario).post('/api/entregas/', {
            'caja': (caja or self.caja).pk,
            'detalle': [{'denominacion': d.pk, 'cantidad': c} for d, c in lineas],
            **extra,
        }, format='json')

    def accion(self, entrega_id, accion, usuario, **datos):
        return self.como(usuario).post(f'/api/entregas/{entrega_id}/{accion}/', datos, format='json')

    def entrega_usd_pyg(self):
        res = self.entregar([(self.usd100, 10), (self.usd20, 5), (self.pyg100k, 3)],
                            observacion='Fondo de apertura')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data


class RegistrarEntregaTests(BaseEntregas):
    """Criterios 1, 2 y 3."""

    def test_admin_registra_entrega_pendiente_con_totales_por_divisa(self):
        data = self.entrega_usd_pyg()
        self.assertEqual(data['estado'], 'PENDIENTE')
        self.assertEqual(data['entregado_por_nombre'], 'Admin Beto')
        self.assertEqual(data['caja_nombre'], 'Sucursal Test · Caja Test')
        self.assertEqual(data['observacion'], 'Fondo de apertura')
        self.assertIsNotNone(data['creado_en'])
        totales = {t['moneda_codigo']: t for t in data['totales']}
        self.assertEqual(totales['USD']['total'], '1100')
        self.assertEqual(totales['USD']['cantidad_billetes'], 15)
        self.assertEqual(totales['PYG']['total'], '300000')
        self.assertEqual(len(data['detalle']), 3)

    def test_pendiente_no_modifica_el_saldo(self):
        self.entrega_usd_pyg()
        self.assertEqual(self.saldo(self.usd), Decimal('0'))
        self.assertEqual(MovimientoCaja.objects.count(), 0)

    def test_validaciones_del_detalle(self):
        self.assertEqual(self.entregar([]).status_code, 400)
        self.assertEqual(self.entregar([(self.usd100, 0)]).status_code, 400)
        self.assertEqual(self.entregar([(self.usd100, 1), (self.usd100, 2)]).status_code, 400)
        self.assertEqual(EntregaBilletes.objects.count(), 0)

    def test_caja_inactiva(self):
        self.caja.activa = False
        self.caja.save()
        res = self.entregar([(self.usd100, 1)])
        self.assertEqual(res.status_code, 400)
        self.assertIn('inactiva', res.data['detail'])

    def test_denominacion_deshabilitada(self):
        self.usd20.activa = False
        self.usd20.save()
        res = self.entregar([(self.usd20, 1)])
        self.assertEqual(res.status_code, 400)

    def test_solo_admin_registra(self):
        for usuario in (CAJERO, ANALISTA, CLIENTE):
            self.assertEqual(self.entregar([(self.usd100, 1)], usuario=usuario).status_code, 403)


class ConfirmarEntregaTests(BaseEntregas):
    """Criterio 4: al confirmar se suma al saldo y queda quién la recibió."""

    def test_cajero_confirma_y_se_suma_al_saldo(self):
        entrega = self.entrega_usd_pyg()
        res = self.accion(entrega['id'], 'confirmar', CAJERO)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['entrega']['estado'], 'CONFIRMADA')
        self.assertEqual(res.data['entrega']['respondido_por_nombre'], 'Cajera Ana')
        self.assertIsNotNone(res.data['entrega']['fecha_respuesta'])
        # PI-78: al confirmar se suma el total de cada divisa.
        self.assertEqual(self.saldo(self.usd), Decimal('1100'))
        self.assertEqual(self.saldo(self.pyg), Decimal('300000'))
        monedas = {m['moneda_codigo']: m for m in res.data['monedas']}
        self.assertEqual(monedas['USD']['total'], '1100')

    def test_genera_un_movimiento_entrega_por_divisa(self):
        entrega = self.entrega_usd_pyg()
        self.accion(entrega['id'], 'confirmar', CAJERO)
        movs = MovimientoCaja.objects.filter(entrega_id=entrega['id'])
        self.assertEqual(movs.count(), 2)
        self.assertEqual({m.moneda.codigo for m in movs}, {'USD', 'PYG'})
        self.assertTrue(all(m.tipo == 'ENTREGA' for m in movs))
        self.assertTrue(all(m.usuario_nombre == 'Cajera Ana' for m in movs))
        self.assertEqual({m.moneda.codigo: m.total for m in movs},
                         {'USD': Decimal('1100'), 'PYG': Decimal('300000')})
        self.assertIn(f"Entrega #{entrega['id']}", movs.first().observacion)
        # Se ve en el historial de la caja (PI-44).
        historial = self.como(CAJERO).get(f'/api/cajas/{self.caja.pk}/movimientos/?tipo=ENTREGA').data
        self.assertEqual(len(historial), 2)

    def test_no_se_puede_confirmar_dos_veces(self):
        entrega = self.entrega_usd_pyg()
        self.accion(entrega['id'], 'confirmar', CAJERO)
        res = self.accion(entrega['id'], 'confirmar', OTRO_CAJERO)
        self.assertEqual(res.status_code, 400)
        self.assertIn('confirmada', res.data['detail'])
        self.assertEqual(self.saldo(self.usd), Decimal('1100'))

    def test_solo_el_cajero_confirma(self):
        entrega = self.entrega_usd_pyg()
        for usuario in (ADMIN, ANALISTA, CLIENTE):
            self.assertEqual(self.accion(entrega['id'], 'confirmar', usuario).status_code, 403)
        self.assertEqual(self.saldo(self.usd), Decimal('0'))

    def test_quien_entrega_no_puede_confirmar_su_propia_entrega(self):
        res = self.entregar([(self.usd100, 1)], usuario=ADMIN_CAJERO)
        res = self.accion(res.data['id'], 'confirmar', ADMIN_CAJERO)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.saldo(self.usd), Decimal('0'))

    def test_si_la_confirmacion_falla_no_se_suma_nada(self):
        entrega = crear_entrega(self.caja, [(self.usd100, 2), (self.pyg100k, 1)], 'sub-admin', 'Admin')
        self.caja.activa = False
        self.caja.save()
        res = self.accion(entrega.pk, 'confirmar', CAJERO)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.saldo(self.usd), Decimal('0'))
        self.assertEqual(self.saldo(self.pyg), Decimal('0'))
        entrega.refresh_from_db()
        self.assertEqual(entrega.estado, 'PENDIENTE')

    def test_servicio_confirmar(self):
        entrega = crear_entrega(self.caja, [(self.usd20, 4)], 'sub-admin', 'Admin')
        confirmar_entrega(entrega, 'sub-cajero', 'Cajera Ana')
        entrega.refresh_from_db()
        self.assertEqual(entrega.estado, EntregaBilletes.ESTADO_CONFIRMADA)
        self.assertEqual(self.saldo(self.usd), Decimal('80'))


class RechazarYCancelarTests(BaseEntregas):

    def test_cajero_rechaza_con_motivo_y_no_se_suma(self):
        entrega = self.entrega_usd_pyg()
        self.assertEqual(self.accion(entrega['id'], 'rechazar', CAJERO).status_code, 400)
        self.assertEqual(self.accion(entrega['id'], 'rechazar', CAJERO, motivo='  ').status_code, 400)
        res = self.accion(entrega['id'], 'rechazar', CAJERO, motivo='Faltan 2 billetes de USD 100')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['estado'], 'RECHAZADA')
        self.assertEqual(res.data['motivo'], 'Faltan 2 billetes de USD 100')
        self.assertEqual(res.data['respondido_por_nombre'], 'Cajera Ana')
        self.assertEqual(self.saldo(self.usd), Decimal('0'))
        self.assertEqual(self.accion(entrega['id'], 'confirmar', CAJERO).status_code, 400)

    def test_admin_cancela_pendiente(self):
        entrega = self.entrega_usd_pyg()
        self.assertEqual(self.accion(entrega['id'], 'cancelar', CAJERO, motivo='x').status_code, 403)
        res = self.accion(entrega['id'], 'cancelar', ADMIN, motivo='Caja equivocada')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['estado'], 'CANCELADA')
        self.assertEqual(self.accion(entrega['id'], 'confirmar', CAJERO).status_code, 400)

    def test_no_se_cancela_una_confirmada(self):
        entrega = self.entrega_usd_pyg()
        self.accion(entrega['id'], 'confirmar', CAJERO)
        res = self.accion(entrega['id'], 'cancelar', ADMIN, motivo='Tarde')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.saldo(self.usd), Decimal('1100'))


class ListarEntregasTests(BaseEntregas):

    def test_filtros_y_permisos_de_lectura(self):
        a = self.entrega_usd_pyg()
        b = self.entregar([(self.usd20, 1)]).data
        self.accion(b['id'], 'confirmar', CAJERO)
        otra_caja = self.caja.__class__.objects.create(nombre='Caja 2', sucursal='Sucursal Test')
        self.entregar([(self.usd20, 1)], caja=otra_caja)

        res = self.como(CAJERO).get(f'/api/entregas/?caja={self.caja.pk}&estado=pendiente')
        self.assertEqual(res.status_code, 200)
        self.assertEqual([e['id'] for e in res.data], [a['id']])
        todas = self.como(ADMIN).get('/api/entregas/').data
        self.assertEqual(len(todas), 3)
        self.assertEqual(todas[0]['caja_nombre'], 'Sucursal Test · Caja 2')  # más reciente primero
        for usuario in (ANALISTA, CLIENTE):
            self.assertEqual(self.como(usuario).get('/api/entregas/').status_code, 403)

    def test_no_se_editan_ni_borran(self):
        e = self.entrega_usd_pyg()
        self.assertEqual(self.como(ADMIN).delete(f"/api/entregas/{e['id']}/").status_code, 405)
        self.assertEqual(self.como(ADMIN).patch(f"/api/entregas/{e['id']}/", {}, format='json').status_code, 405)
