"""Documentos de cliente con puntos, espacios y guiones (ej. 80-012345-6).

No usan la red ni gastan números del rango."""

from .armado import armar_de_resumido
from .tests import FacturacionTestBase, sin_red


@sin_red
class DocumentoClienteTest(FacturacionTestBase):
    def test_documento_con_puntos_y_guiones(self, _red):
        op = self.operacion()
        casos = {
            '80-099999-1': ('1', '80099999', '1'),  # RUC con guion extra (como Atlas)
            '1.234.567-8': ('1', '1234567', '8'),  # RUC con puntos
            '4.567.890': ('2', '0', '0'),  # cédula con puntos
        }
        for documento, (nat, ruc, dv) in casos.items():
            self.cliente.documento = documento
            self.cliente.save()
            op.refresh_from_db()
            de = armar_de_resumido(op, '0000100', 'cliente@test.com')
            self.assertEqual((de['iNatRec'], de['dRucRec'], de['dDVRec']), (nat, ruc, dv), documento)
        self.assertEqual(de['dNumIDRec'], '4567890')
