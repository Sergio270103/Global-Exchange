"""Pruebas de la solicitud de reposición de billetes (PI-80).

Criterios cubiertos:

1. El cajero ve el aviso cuando el saldo de una divisa baja del mínimo
   configurado en ``Moneda.saldo_minimo``.
2. Puede pedir una divisa y un monto, y opcionalmente qué denominaciones
   necesita y cuántos billetes de cada una.
3. La solicitud queda pendiente y el administrador la ve en su pantalla
   de entregas.
4. El administrador la atiende registrando una entrega de billetes (PI-43),
   que el cajero luego confirma como cualquier entrega; o la rechaza
   indicando el motivo.
5. Se registra la fecha y hora de la solicitud y de la respuesta.

Ejecutar desde ``backend/``::

    python manage.py test cajas.test_reposicion
"""

from decimal import Decimal

from rest_framework.test import APIClient

from monedas.models import Moneda

from .models import (
    Caja, Denominacion, EntregaBilletes, SaldoCaja, SolicitudReposicion,
)
from .tests import ADMIN, ANALISTA, CAJERO, BaseCajas
from .servicios import divisias_bajo_minimo


class ReposicionTests(BaseCajas):
    """PI-80: pedir reposición de efectivo al administrador."""

    def setUp(self):
        super().setUp()
        self.usd.saldo_minimo = Decimal('500')
        self.usd.save(update_fields=['saldo_minimo'])

    # --- helpers -------------------------------------------------------

    def pedir(self, moneda=None, monto='200', detalle=None, usuario=None):
        if usuario:
            self.api.force_authenticate(user=usuario)
        cuerpo = {
            'caja': self.caja.pk,
            'moneda': (moneda or self.usd).pk,
            'monto': str(monto),
        }
        if detalle is not None:
            cuerpo['detalle'] = detalle
        return self.api.post('/api/solicitudes/', cuerpo, format='json')

    def admin(self):
        self.api.force_authenticate(user=ADMIN)

    def saldo_bajo(self):
        return self.api.get(self.url('saldo/')).data['bajo_minimo']

    # --- Criterio 1: aviso por saldo bajo ------------------------------

    def test_avisa_las_divisas_que_bajaron_del_minimo(self):
        self.mover('INGRESO', self.usd, '300')
        avisos = self.saldo_bajo()
        self.assertEqual(len(avisos), 1)
        self.assertEqual(avisos[0]['moneda_codigo'], 'USD')
        self.assertEqual(avisos[0]['total'], '300')
        self.assertEqual(avisos[0]['saldo_minimo'], '500')
        self.assertEqual(avisos[0]['faltante'], '200')

    def test_no_avisa_si_el_saldo_alcanza_el_minimo(self):
        self.mover('INGRESO', self.usd, '500')
        self.assertEqual(self.saldo_bajo(), [])

    def test_no_avisa_si_la_moneda_no_tiene_minimo_configurado(self):
        # PYG quedó en 0 (sin mínimo): nunca se avisa.
        self.mover('INGRESO', self.usd, '10')
        self.assertEqual([a['moneda_codigo'] for a in self.saldo_bajo()], ['USD'])

    def test_una_divisa_en_cero_no_se_avisa(self):
        # La caja nunca manejó ARS: no es una reposición, es que no la tiene.
        ars, _ = Moneda.objects.update_or_create(
            codigo='ARS', defaults={'nombre': 'Peso', 'decimales': 2, 'activo': True,
                                     'saldo_minimo': Decimal('100')})
        self.mover('INGRESO', self.usd, '10')
        self.assertNotIn('ARS', [a['moneda_codigo'] for a in self.saldo_bajo()])

    # --- Criterio 2: pedir divisa y monto, con denominaciones opcional --

    def test_pide_reposicion_de_un_monto(self):
        res = self.pedir(monto='200')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['moneda_codigo'], 'USD')
        self.assertEqual(res.data['monto'], '200')
        self.assertEqual(res.data['estado'], 'PENDIENTE')
        self.assertEqual(res.data['estado_display'], 'Pendiente')
        self.assertEqual(res.data['cajero_nombre'], CAJERO.nombre)
        self.assertEqual(res.data['detalle'], [])
        # El saldo no se toca al pedir: el efectivo entra con la entrega.
        self.assertEqual(self.saldo(self.usd), Decimal('0'))

    def test_pide_con_denominaciones_concretas(self):
        res = self.pedir(monto='400', detalle=[
            {'denominacion': self.usd100.pk, 'cantidad': 3},
            {'denominacion': self.usd20.pk, 'cantidad': 5},
        ])
        self.assertEqual(res.status_code, 201, res.data)
        detalle = {d['denominacion']: d['cantidad'] for d in res.data['detalle']}
        self.assertEqual(detalle, {self.usd100.pk: 3, self.usd20.pk: 5})
        # 3 x 100 + 5 x 20 = 400, el monto pedido.
        self.assertEqual(res.data['detalle'][0]['subtotal'], '300')

    def test_no_acepta_denominaciones_de_otra_divisa(self):
        res = self.pedir(detalle=[{'denominacion': self.pyg100k.pk, 'cantidad': 1}])
        self.assertEqual(res.status_code, 400)
        self.assertIn('no es de USD', str(res.data))

    def test_rechaza_monto_cero_o_negativo(self):
        self.assertEqual(self.pedir(monto='0').status_code, 400)
        self.assertEqual(self.pedir(monto='-5').status_code, 400)

    def test_no_hay_dos_solicitudes_pendientes_de_la_misma_divisa(self):
        self.assertEqual(self.pedir(monto='100').status_code, 201)
        res = self.pedir(monto='300')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Ya hay una solicitud pendiente', str(res.data))

    def test_se_pide_de_nuevo_si_la_anterior_ya_se_respondio(self):
        self.pedir(monto='100')
        solicitud = SolicitudReposicion.objects.get()
        solicitud.estado = SolicitudReposicion.ESTADO_RECHAZADA
        solicitud.save(update_fields=['estado'])
        self.assertEqual(self.pedir(monto='300').status_code, 201)

    # --- Criterio 3: el admin la ve ------------------------------------

    def test_el_admin_ve_las_solicitudes_pendientes(self):
        self.pedir(monto='250')
        self.admin()
        res = self.api.get('/api/solicitudes/?estado=PENDIENTE')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['monto'], '250')

    def test_filtra_por_caja_y_por_divisa(self):
        self.pedir(monto='250')
        self.admin()
        self.assertEqual(len(self.api.get('/api/solicitudes/?caja=999').data), 0)
        self.assertEqual(len(self.api.get('/api/solicitudes/?moneda=PYG').data), 0)
        self.assertEqual(len(self.api.get('/api/solicitudes/?moneda=usd').data), 1)

    # --- Criterio 4: el admin la atiende o la rechaza ------------------

    def test_admin_atiende_registrando_una_entrega(self):
        self.pedir(monto='400', detalle=[
            {'denominacion': self.usd100.pk, 'cantidad': 4},
        ])
        solicitud = SolicitudReposicion.objects.get()
        self.admin()
        res = self.api.post('/api/entregas/', {
            'caja': self.caja.pk,
            'solicitud': solicitud.pk,
            'detalle': [{'denominacion': self.usd100.pk, 'cantidad': 4}],
            'observacion': 'Reposición por solicitud',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)

        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, 'ATENDIDA')
        self.assertEqual(solicitud.entrega_id, res.data['id'])
        self.assertIsNotNone(solicitud.fecha_respuesta)
        self.assertEqual(solicitud.respondido_por_nombre, ADMIN.nombre)

        # Y el cajero la confirma como cualquier entrega de PI-43.
        self.api.force_authenticate(user=CAJERO)
        conf = self.api.post(f'/api/entregas/{res.data["id"]}/confirmar/', {}, format='json')
        self.assertEqual(conf.status_code, 200, conf.data)
        self.assertEqual(self.saldo(self.usd), Decimal('400'))

    def test_una_entrega_para_atender_no_puede_traer_otra_divisa(self):
        self.pedir(monto='400000')
        solicitud = SolicitudReposicion.objects.get()
        self.admin()
        res = self.api.post('/api/entregas/', {
            'caja': self.caja.pk,
            'solicitud': solicitud.pk,
            'detalle': [{'denominacion': self.pyg100k.pk, 'cantidad': 1}],
        }, format='json')
        self.assertEqual(res.status_code, 400)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, 'PENDIENTE')
        self.assertEqual(EntregaBilletes.objects.count(), 0)

    def test_admin_rechaza_con_motivo(self):
        self.pedir(monto='400')
        solicitud = SolicitudReposicion.objects.get()
        self.admin()
        res = self.api.post(f'/api/solicitudes/{solicitud.pk}/rechazar/', {
            'motivo': 'Tesorería sin efectivo de esa divisa.',
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['estado'], 'RECHAZADA')
        self.assertEqual(res.data['motivo'], 'Tesorería sin efectivo de esa divisa.')
        self.assertIsNotNone(res.data['fecha_respuesta'])
        self.assertEqual(res.data['respondido_por_nombre'], ADMIN.nombre)

    def test_rechazar_sin_motivo_no_va(self):
        self.pedir(monto='400')
        solicitud = SolicitudReposicion.objects.get()
        self.admin()
        res = self.api.post(f'/api/solicitudes/{solicitud.pk}/rechazar/', {}, format='json')
        self.assertEqual(res.status_code, 400)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, 'PENDIENTE')

    def test_no_se_responde_dos_veces(self):
        self.pedir(monto='400')
        solicitud = SolicitudReposicion.objects.get()
        self.admin()
        self.api.post(f'/api/solicitudes/{solicitud.pk}/rechazar/',
                      {'motivo': 'Sin efectivo'}, format='json')
        res = self.api.post(f'/api/solicitudes/{solicitud.pk}/rechazar/',
                            {'motivo': 'Otra vez'}, format='json')
        self.assertEqual(res.status_code, 400)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.motivo, 'Sin efectivo')

    # --- Criterio 5: fechas --------------------------------------------

    def test_guarda_la_fecha_de_la_solicitud_y_de_la_respuesta(self):
        res = self.pedir(monto='400')
        self.assertIsNotNone(res.data['creado_en'])
        self.assertIsNone(res.data['fecha_respuesta'])

        solicitud = SolicitudReposicion.objects.get()
        self.assertIsNotNone(solicitud.creado_en)

        self.admin()
        self.api.post(f'/api/solicitudes/{solicitud.pk}/rechazar/',
                      {'motivo': 'Sin efectivo'}, format='json')
        solicitud.refresh_from_db()
        self.assertIsNotNone(solicitud.fecha_respuesta)
        self.assertGreaterEqual(solicitud.fecha_respuesta, solicitud.creado_en)

    # --- permisos e inmutabilidad --------------------------------------

    def test_el_cajero_no_rechaza_su_propia_solicitud(self):
        self.pedir(monto='400')
        solicitud = SolicitudReposicion.objects.get()
        res = self.api.post(f'/api/solicitudes/{solicitud.pk}/rechazar/',
                            {'motivo': 'No'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_una_solicitud_no_se_puede_editar_ni_borrar(self):
        self.pedir(monto='400')
        pk = SolicitudReposicion.objects.get().pk
        self.admin()
        self.assertEqual(self.api.patch(f'/api/solicitudes/{pk}/',
                                        {'monto': '9999'}, format='json').status_code, 405)
        self.assertEqual(self.api.delete(f'/api/solicitudes/{pk}/').status_code, 405)

    def test_un_analista_no_accede_a_las_solicitudes(self):
        self.api.force_authenticate(user=ANALISTA)
        self.assertEqual(self.api.get('/api/solicitudes/').status_code, 403)
