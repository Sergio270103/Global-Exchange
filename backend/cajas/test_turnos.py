"""Pruebas de PI-79: apertura y cierre de caja.

Criterios de aceptación cubiertos:

1. La caja se abre al confirmar la entrega inicial de billetes (PI-43).
2. Solo se puede operar con la caja abierta.
3. El cierre pide el recuento final del total de cada moneda.
4. Compara lo contado con el saldo del sistema y registra las diferencias
   (faltante o sobrante).
5. Guarda fecha y hora de apertura y de cierre y el cajero responsable;
   una vez cerrada no se opera hasta una nueva apertura.

Además (decisión de la Product Owner): al cerrar, el efectivo se devuelve
a tesorería y el saldo queda en 0.

Ejecutar desde ``backend/``::

    python manage.py test cajas.test_turnos
"""

import json
from decimal import Decimal

from rest_framework.test import APIClient

from .models import MovimientoCaja, SaldoCaja, TurnoCaja
from .servicios import CajaCerrada, cerrar_caja, crear_entrega
from .tests import ADMIN, ANALISTA, CAJERO, CLIENTE, BaseCajas, UsuarioFalso

OTRO_CAJERO = UsuarioFalso('sub-cajero-2', 'Cajero Luis', roles=['cashier'])


class BaseTurnos(BaseCajas):
    ABRIR_TURNO = False

    def como(self, usuario):
        self.api.force_authenticate(user=usuario)
        return self.api

    def datos_caja(self):
        return next(c for c in self.api.get('/api/cajas/').data if c['id'] == self.caja.pk)

    def entregar_y_confirmar(self, lineas, cajero=CAJERO):
        entrega = crear_entrega(self.caja, lineas, 'sub-admin', 'Admin Beto', 'Fondo de apertura')
        res = self.como(cajero).post(f'/api/entregas/{entrega.pk}/confirmar/', {}, format='json')
        return entrega, res

    def abrir(self):
        """Apertura con USD 1.100 (10 × 100 + 5 × 20) y PYG 300.000."""
        entrega, res = self.entregar_y_confirmar(
            [(self.usd100, 10), (self.usd20, 5), (self.pyg100k, 3)])
        self.assertEqual(res.status_code, 200, res.data)
        return entrega, res

    def cerrar(self, conteo=None, usuario=CAJERO, **extra):
        cuerpo = {'conteo': [{'moneda': m.pk, 'monto': str(v)} for m, v in (conteo or [])], **extra}
        return self.como(usuario).post(self.url('cerrar/'), cuerpo, format='json')


class AperturaTests(BaseTurnos):
    """Criterios 1, 2 y 5 (apertura)."""

    def test_caja_nueva_esta_cerrada(self):
        self.assertIsNone(self.como(CAJERO).get(self.url('turno/')).data['turno'])
        datos = self.datos_caja()
        self.assertFalse(datos['abierta'])
        self.assertIsNone(datos['turno_actual'])
        self.assertIsNone(self.api.get(self.url('saldo/')).data['turno'])

    def test_turno_de_caja_cerrada_responde_json_valido(self):
        # Regresión: con la caja cerrada el endpoint devolvía un cuerpo vacío
        # y el navegador fallaba con "Unexpected end of JSON input".
        res = self.como(CAJERO).get(self.url('turno/'))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(json.loads(res.content), {'turno': None})

    def test_confirmar_la_entrega_inicial_abre_la_caja(self):
        entrega, res = self.abrir()
        turno = res.data['turno']
        self.assertTrue(turno['abierto'])
        self.assertEqual(turno['cajero_nombre'], 'Cajera Ana')
        self.assertEqual(turno['entrega_apertura'], entrega.pk)
        self.assertIsNotNone(turno['abierto_en'])
        self.assertEqual(self.saldo(self.usd), Decimal('1100'))
        self.assertTrue(self.datos_caja()['abierta'])
        self.assertEqual(self.datos_caja()['turno_actual']['cajero_nombre'], 'Cajera Ana')
        movs = MovimientoCaja.objects.filter(entrega=entrega)
        self.assertTrue(all(m.turno_id == turno['id'] for m in movs))

    def test_con_la_caja_abierta_se_puede_operar(self):
        self.abrir()
        res = self.mover('RETIRO', self.usd, '100')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.saldo(self.usd), Decimal('1000'))

    def test_con_la_caja_cerrada_no_se_opera(self):
        res = self.mover('INGRESO', self.usd, '100')
        self.assertEqual(res.status_code, 400)
        self.assertIn('La caja está cerrada', res.data['detail'])

    def test_otra_entrega_con_la_caja_abierta_es_una_reposicion(self):
        self.abrir()
        _, res = self.entregar_y_confirmar([(self.usd20, 10)])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(TurnoCaja.objects.count(), 1)
        self.assertEqual(self.saldo(self.usd), Decimal('1300'))

    def test_otro_cajero_no_puede_recibir_entregas_en_una_caja_abierta(self):
        self.abrir()
        _, res = self.entregar_y_confirmar([(self.usd20, 1)], cajero=OTRO_CAJERO)
        self.assertEqual(res.status_code, 403)
        self.assertIn('abierta por Cajera Ana', res.data['detail'])
        self.assertEqual(self.saldo(self.usd), Decimal('1100'))

    def test_rechazar_una_entrega_no_abre_la_caja(self):
        entrega = crear_entrega(self.caja, [(self.usd100, 1)], 'sub-admin', 'Admin')
        res = self.como(CAJERO).post(f'/api/entregas/{entrega.pk}/rechazar/', {'motivo': 'Falta'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(self.api.get(self.url('turno/')).data['turno'])


class CierreTests(BaseTurnos):
    """Criterios 3, 4 y 5 (cierre)."""

    def test_cierre_cuadrado_devuelve_el_efectivo_y_cierra(self):
        self.abrir()
        self.mover('RETIRO', self.usd, '100')
        res = self.cerrar([(self.usd, '1000'), (self.pyg, '300000')], observacion='Fin del día')
        self.assertEqual(res.status_code, 200, res.data)
        turno = res.data['turno']
        self.assertFalse(turno['abierto'])
        self.assertIsNotNone(turno['cerrado_en'])
        self.assertEqual(turno['cerrado_por_nombre'], 'Cajera Ana')
        arqueo = turno['arqueo_cierre']
        self.assertFalse(arqueo['con_diferencias'])
        self.assertTrue(arqueo['es_cierre'])
        self.assertEqual(arqueo['observacion'], 'Fin del día')
        # El efectivo vuelve a tesorería: saldo en 0.
        self.assertEqual(self.saldo(self.usd), Decimal('0'))
        self.assertEqual(self.saldo(self.pyg), Decimal('0'))
        self.assertTrue(all(m['total'] == '0' for m in res.data['monedas']))
        devoluciones = MovimientoCaja.objects.filter(tipo='DEVOLUCION')
        self.assertEqual({m.moneda.codigo: m.total for m in devoluciones},
                         {'USD': Decimal('1000'), 'PYG': Decimal('300000')})

    def test_cierre_con_faltante_y_sobrante(self):
        self.abrir()
        res = self.cerrar([(self.usd, '1080'), (self.pyg, '350000')])
        self.assertEqual(res.status_code, 200, res.data)
        arqueo = res.data['turno']['arqueo_cierre']
        self.assertTrue(arqueo['con_diferencias'])
        dif = {d['moneda_codigo']: Decimal(d['diferencia']) for d in arqueo['detalle']}
        self.assertEqual(dif, {'USD': Decimal('-20'), 'PYG': Decimal('50000')})
        self.assertEqual(self.saldo(self.usd), Decimal('0'))

    def test_despues_del_cierre_no_se_opera_hasta_nueva_apertura(self):
        self.abrir()
        self.cerrar([(self.usd, '1100'), (self.pyg, '300000')])
        self.assertEqual(self.mover('INGRESO', self.usd, '10').status_code, 400)
        self.assertIsNone(self.api.get(self.url('turno/')).data['turno'])
        # Nueva apertura: arranca solo con la nueva entrega.
        _, res = self.entregar_y_confirmar([(self.usd100, 2)], cajero=OTRO_CAJERO)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['turno']['cajero_nombre'], 'Cajero Luis')
        self.assertEqual(self.saldo(self.usd), Decimal('200'))
        self.assertEqual(TurnoCaja.objects.count(), 2)

    def test_no_se_cierra_una_caja_cerrada(self):
        res = self.cerrar()
        self.assertEqual(res.status_code, 400)
        self.assertIn('ya está cerrada', res.data['detail'])
        with self.assertRaises(CajaCerrada):
            cerrar_caja(self.caja, None, 'tests')

    def test_conteo_invalido_no_cierra(self):
        self.abrir()
        res = self.cerrar([(self.pyg, '10.5')])
        self.assertEqual(res.status_code, 400)
        self.assertIsNotNone(self.api.get(self.url('turno/')).data['turno'])
        self.assertEqual(self.saldo(self.usd), Decimal('1100'))

    def test_historial_de_turnos(self):
        self.abrir()
        self.cerrar([(self.usd, '1100'), (self.pyg, '290000')])
        self.entregar_y_confirmar([(self.usd100, 1)])
        res = self.api.get(self.url('turnos/'))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)
        self.assertTrue(res.data[0]['abierto'])  # el más reciente primero
        self.assertTrue(res.data[1]['arqueo_cierre']['con_diferencias'])

    def test_permisos_del_cierre(self):
        self.abrir()
        for usuario in (ANALISTA, CLIENTE):
            self.assertEqual(self.cerrar(usuario=usuario).status_code, 403)
        self.assertEqual(self.como(ANALISTA).get(self.url('turnos/')).status_code, 403)
        # El administrador también puede cerrar (por ejemplo, si el cajero se olvidó).
        res = self.cerrar([(self.usd, '1100'), (self.pyg, '300000')], usuario=ADMIN)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['turno']['cerrado_por_nombre'], 'Admin Beto')
        self.assertEqual(res.data['turno']['cajero_nombre'], 'Cajera Ana')

    def test_arqueo_intermedio_no_cierra_la_caja(self):
        self.abrir()
        res = self.api.post(self.url('arqueos/'), {}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertFalse(res.data['es_cierre'])
        self.assertIsNotNone(self.api.get(self.url('turno/')).data['turno'])
        self.assertEqual(SaldoCaja.objects.get(caja=self.caja, moneda=self.usd).monto, Decimal('1100'))
