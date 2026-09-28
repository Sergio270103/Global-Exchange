"""Pruebas unitarias de PI-65: historial de transacciones (solo consulta).

- Seguridad: un usuario solo ve las operaciones de sus clientes, aunque
  consulte la API directamente (sin ``?mine=1`` o con ``?cliente=`` ajeno).
- RF35: filtros por fecha, tipo de operación, moneda y estado.
- Los cuatro estados del diagrama: PENDIENTE, PAGADA, CANCELADA, ANULADA.
- Solo consulta: la API no permite editar ni borrar operaciones.
- Solo el administrador ve todas (salvo que pida ``?mine=1``); el cajero
  y el analista ven únicamente lo propio.

Ejecutar desde ``backend/``::

    python manage.py test operaciones.test_historial
"""

from datetime import datetime, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from clientes.models import Cliente, ClienteUsuario

from .models import Operacion
from .test_cancelacion import UsuarioFalso, crear_moneda

SUB_ANA = 'sub-ana'
SUB_BETO = 'sub-beto'


def fecha(anio: int, mes: int, dia: int) -> datetime:
    return timezone.make_aware(datetime(anio, mes, dia, 12, 0))


class HistorialTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.pyg = crear_moneda('PYG', 'Guaraní')
        cls.usd = crear_moneda('USD', 'Dólar Americano')
        cls.eur = crear_moneda('EUR', 'Euro')

        # documento y email son únicos en Cliente: cada uno con el suyo.
        cls.cliente_ana = Cliente.objects.create(
            nombre='Cliente Ana', documento='HIST-001', email='ana@historial.test',
            activo=True, categoria=Cliente.CAT_MINORISTA,
        )
        cls.cliente_beto = Cliente.objects.create(
            nombre='Cliente Beto', documento='HIST-002', email='beto@historial.test',
            activo=True, categoria=Cliente.CAT_MINORISTA,
        )
        ClienteUsuario.objects.create(cliente=cls.cliente_ana, keycloak_id=SUB_ANA)
        ClienteUsuario.objects.create(cliente=cls.cliente_beto, keycloak_id=SUB_BETO)

        # Operaciones de Ana: una por estado, con distintas fechas/monedas/tipos.
        cls.pendiente = cls.crear_op(cls.cliente_ana, 'COMPRA', cls.usd, 'PENDIENTE', fecha(2026, 9, 1))
        cls.pagada = cls.crear_op(cls.cliente_ana, 'VENTA', cls.usd, 'PAGADA', fecha(2026, 9, 10))
        cls.cancelada = cls.crear_op(cls.cliente_ana, 'COMPRA', cls.eur, 'CANCELADA', fecha(2026, 9, 20))
        cls.anulada = cls.crear_op(cls.cliente_ana, 'VENTA', cls.eur, 'ANULADA', fecha(2026, 9, 25))

        # Operación de Beto: Ana nunca la tiene que ver.
        cls.ajena = cls.crear_op(cls.cliente_beto, 'COMPRA', cls.usd, 'PAGADA', fecha(2026, 9, 10))

    @classmethod
    def crear_op(cls, cliente, tipo, divisa, estado, cuando) -> Operacion:
        origen, destino = (cls.pyg, divisa) if tipo == 'COMPRA' else (divisa, cls.pyg)
        op = Operacion.objects.create(
            cliente=cliente,
            usuario_keycloak_id='tests',
            tipo_operacion=tipo,
            moneda_origen=origen,
            moneda_destino=destino,
            monto_enviado=Decimal('100'),
            monto_recibido=Decimal('100'),
            cotizacion_aplicada=Decimal('1'),
            porcentaje_comision_aplicado=Decimal('0'),
            monto_comision=Decimal('0'),
            estado=estado,
        )
        # fecha_creacion es auto_now_add: se ajusta después de crear.
        Operacion.objects.filter(pk=op.pk).update(fecha_creacion=cuando)
        return op

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=UsuarioFalso(SUB_ANA, 'ana'))

    def ids(self, url: str) -> set[int]:
        r = self.api.get(url)
        self.assertEqual(r.status_code, 200, r.data)
        return {o['id'] for o in r.data}

    @property
    def todas_de_ana(self) -> set[int]:
        return {self.pendiente.id, self.pagada.id, self.cancelada.id, self.anulada.id}

    # ------------------------------------------------------ seguridad
    def test_sin_mine_igual_solo_devuelve_lo_propio(self):
        self.assertEqual(self.ids('/api/operaciones/'), self.todas_de_ana)

    def test_con_mine_devuelve_lo_propio(self):
        self.assertEqual(self.ids('/api/operaciones/?mine=1'), self.todas_de_ana)

    def test_pedir_otro_cliente_no_filtra_datos_ajenos(self):
        self.assertEqual(self.ids(f'/api/operaciones/?cliente={self.cliente_beto.id}'), set())

    def test_detalle_de_operacion_ajena_da_404(self):
        r = self.api.get(f'/api/operaciones/{self.ajena.id}/')
        self.assertEqual(r.status_code, 404)

    def test_detalle_de_operacion_propia(self):
        r = self.api.get(f'/api/operaciones/{self.pagada.id}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['estado'], 'PAGADA')

    def test_usuario_con_varios_clientes_filtra_por_el_activo(self):
        otro_de_ana = Cliente.objects.create(
            nombre='Empresa de Ana', documento='HIST-003', email='empresa@historial.test',
            activo=True, categoria=Cliente.CAT_MINORISTA,
        )
        ClienteUsuario.objects.create(cliente=otro_de_ana, keycloak_id=SUB_ANA)
        de_empresa = self.crear_op(otro_de_ana, 'COMPRA', self.usd, 'PAGADA', fecha(2026, 9, 12))

        # Sin cliente: todos los clientes de Ana.
        self.assertEqual(self.ids('/api/operaciones/?mine=1'), self.todas_de_ana | {de_empresa.id})
        # Con el cliente activo: solo ese.
        self.assertEqual(
            self.ids(f'/api/operaciones/?mine=1&cliente={otro_de_ana.id}'), {de_empresa.id},
        )
        self.assertEqual(
            self.ids(f'/api/operaciones/?mine=1&cliente={self.cliente_ana.id}'), self.todas_de_ana,
        )

    def test_usuario_sin_clientes_no_ve_nada(self):
        self.api.force_authenticate(user=UsuarioFalso('sub-nadie', 'nadie'))
        self.assertEqual(self.ids('/api/operaciones/'), set())

    # ------------------------------------------------ personal
    def test_admin_ve_todas_las_operaciones(self):
        self.api.force_authenticate(user=UsuarioFalso('sub-adm', 'adm', is_superuser=True))
        self.assertEqual(
            self.ids('/api/operaciones/'), self.todas_de_ana | {self.ajena.id},
        )

    def test_admin_ve_todas_y_puede_filtrar_por_cliente(self):
        self.api.force_authenticate(user=UsuarioFalso('sub-adm', 'adm', is_superuser=True))
        self.assertEqual(
            self.ids(f'/api/operaciones/?cliente={self.cliente_beto.id}'), {self.ajena.id},
        )

    def test_admin_con_mine_ve_solo_lo_suyo(self):
        self.api.force_authenticate(user=UsuarioFalso('sub-adm', 'adm', is_superuser=True))
        self.assertEqual(self.ids('/api/operaciones/?mine=1'), set())

    def test_cajero_no_ve_lo_ajeno(self):
        self.api.force_authenticate(user=UsuarioFalso('sub-caja', 'caja', roles=['cashier']))
        self.assertEqual(self.ids('/api/operaciones/'), set())

    def test_rol_analista_no_ve_lo_ajeno(self):
        self.api.force_authenticate(user=UsuarioFalso('sub-an', 'an', roles=['analyst']))
        self.assertEqual(self.ids('/api/operaciones/'), set())

    # ------------------------------------------------ quién la realizó
    def test_informa_el_usuario_que_realizo_la_operacion(self):
        ClienteUsuario.objects.filter(keycloak_id=SUB_ANA).update(username='ana')
        op = self.crear_op(self.cliente_ana, 'COMPRA', self.usd, 'PAGADA', fecha(2026, 9, 26))
        Operacion.objects.filter(pk=op.pk).update(usuario_keycloak_id=SUB_ANA)

        r = self.api.get('/api/operaciones/')
        por_id = {o['id']: o for o in r.data}
        self.assertEqual(por_id[op.id]['usuario_nombre'], 'ana')
        # Operación sin usuario asociado conocido: vacío, no error.
        self.assertEqual(por_id[self.pagada.id]['usuario_nombre'], '')

        detalle = self.api.get(f'/api/operaciones/{op.id}/')
        self.assertEqual(detalle.data['usuario_nombre'], 'ana')

    def test_cancelada_muestra_el_mismo_nombre_que_pagada(self):
        ClienteUsuario.objects.filter(keycloak_id=SUB_ANA).update(username='Ana Pérez')
        Operacion.objects.filter(pk=self.cancelada.pk).update(
            cancelada_por=SUB_ANA, cancelada_por_nombre='ana.keycloak',
        )
        r = self.api.get('/api/operaciones/')
        fila = next(o for o in r.data if o['id'] == self.cancelada.id)
        self.assertEqual(fila['cancelada_por_nombre'], 'Ana Pérez')

        detalle = self.api.get(f'/api/operaciones/{self.cancelada.id}/')
        self.assertEqual(detalle.data['cancelada_por_nombre'], 'Ana Pérez')

    def test_cancelada_por_usuario_ya_no_asociado_usa_lo_guardado(self):
        Operacion.objects.filter(pk=self.cancelada.pk).update(
            cancelada_por='sub-que-ya-no-esta', cancelada_por_nombre='ex.funcionario',
        )
        r = self.api.get('/api/operaciones/')
        fila = next(o for o in r.data if o['id'] == self.cancelada.id)
        self.assertEqual(fila['cancelada_por_nombre'], 'ex.funcionario')

    def test_no_expone_la_comision(self):
        r = self.api.get('/api/operaciones/')
        self.assertNotIn('monto_comision', r.data[0])
        self.assertNotIn('porcentaje_comision_aplicado', r.data[0])

    # ------------------------------------------------ solo consulta
    def test_no_se_puede_editar_ni_borrar(self):
        url = f'/api/operaciones/{self.pagada.id}/'
        self.assertEqual(self.api.put(url, {}, format='json').status_code, 405)
        self.assertEqual(self.api.patch(url, {}, format='json').status_code, 405)
        self.assertEqual(self.api.delete(url).status_code, 405)

    # ------------------------------------------------ RF35: estado
    def test_filtro_por_cada_uno_de_los_cuatro_estados(self):
        esperado = {
            'PENDIENTE': self.pendiente.id,
            'PAGADA': self.pagada.id,
            'CANCELADA': self.cancelada.id,
            'ANULADA': self.anulada.id,
        }
        for estado, op_id in esperado.items():
            with self.subTest(estado=estado):
                self.assertEqual(self.ids(f'/api/operaciones/?estado={estado}'), {op_id})

    # ------------------------------------------------ RF35: tipo
    def test_filtro_por_tipo(self):
        self.assertEqual(
            self.ids('/api/operaciones/?tipo=COMPRA'), {self.pendiente.id, self.cancelada.id},
        )
        self.assertEqual(
            self.ids('/api/operaciones/?tipo=venta'), {self.pagada.id, self.anulada.id},
        )

    # ------------------------------------------------ RF35: moneda
    def test_filtro_por_moneda_en_origen_o_destino(self):
        self.assertEqual(
            self.ids('/api/operaciones/?moneda=EUR'), {self.cancelada.id, self.anulada.id},
        )
        self.assertEqual(
            self.ids('/api/operaciones/?moneda=usd'), {self.pendiente.id, self.pagada.id},
        )

    # ------------------------------------------------ RF35: fecha
    def test_filtro_por_rango_de_fechas(self):
        self.assertEqual(
            self.ids('/api/operaciones/?desde=2026-09-05&hasta=2026-09-20'),
            {self.pagada.id, self.cancelada.id},
        )

    def test_filtro_desde_incluye_el_dia(self):
        self.assertEqual(
            self.ids('/api/operaciones/?desde=2026-09-25'), {self.anulada.id},
        )

    def test_filtro_hasta_incluye_el_dia(self):
        self.assertEqual(
            self.ids('/api/operaciones/?hasta=2026-09-01'), {self.pendiente.id},
        )

    def test_fecha_invalida_se_ignora(self):
        self.assertEqual(self.ids('/api/operaciones/?desde=no-es-fecha'), self.todas_de_ana)

    # ------------------------------------------------ combinados
    def test_filtros_combinados(self):
        self.assertEqual(
            self.ids('/api/operaciones/?tipo=COMPRA&moneda=EUR&estado=CANCELADA'
                     '&desde=2026-09-01&hasta=2026-09-30'),
            {self.cancelada.id},
        )

    def test_orden_mas_reciente_primero(self):
        r = self.api.get('/api/operaciones/')
        self.assertEqual(
            [o['id'] for o in r.data],
            [self.anulada.id, self.cancelada.id, self.pagada.id, self.pendiente.id],
        )

    def test_hoy_se_ve_con_fecha_de_hoy(self):
        hoy = timezone.localdate()
        op = self.crear_op(self.cliente_ana, 'COMPRA', self.usd, 'PAGADA', timezone.now())
        self.assertIn(op.id, self.ids(f'/api/operaciones/?desde={hoy}&hasta={hoy}'))
        ayer = hoy - timedelta(days=1)
        self.assertNotIn(op.id, self.ids(f'/api/operaciones/?hasta={ayer}'))