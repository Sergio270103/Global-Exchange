"""Pruebas de los datos del emisor enviados por soporte (distrito y varias
actividades económicas). No usan la red ni gastan números del rango."""

from django.test import override_settings

from .armado import armar_de_resumido
from .tests import EMISOR, FacturacionTestBase, config, sin_red


@sin_red
class DatosEmisorTest(FacturacionTestBase):
    def test_emisor_con_distrito_y_dos_actividades(self, _red):
        de = armar_de_resumido(self.operacion(), '0000100', 'cliente@test.com')
        self.assertEqual((de['cDisEmi'], de['dDesDisEmi']), ('1', 'ASUNCION (DISTRITO)'))
        self.assertEqual(de['dNumCas'], '0')
        self.assertEqual(de['gActEco'], [
            {'cActEco': '62010', 'dDesActEco': 'Actividades de programación informática'},
            {'cActEco': '74909',
             'dDesActEco': 'Otras actividades profesionales, científicas y técnicas n.c.p.'},
        ])

    @override_settings(FACTURASEGURA=config(
        modo='real', emisor={**EMISOR, 'cDisEmi': '', 'cActEco': '62010'}))
    def test_sin_distrito_y_actividades_desparejas(self, _red):
        from .armado import DatosIncompletos, actividades_economicas
        with self.assertRaises(DatosIncompletos):
            actividades_economicas({'cActEco': '62010', 'dDesActEco': 'A|B'})
        emisor = {**EMISOR, 'cDisEmi': '', 'cActEco': '62010',
                  'dDesActEco': 'Actividades de programación informática'}
        with override_settings(FACTURASEGURA=config(emisor=emisor)):
            de = armar_de_resumido(self.operacion(), '0000100', 'cliente@test.com')
        self.assertNotIn('cDisEmi', de)
        self.assertEqual(len(de['gActEco']), 1)
