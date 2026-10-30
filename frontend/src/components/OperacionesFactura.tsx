import { useState } from 'react'
import { cancelarFactura, emitirNotaCredito } from '@/services/facturas'
import type { FacturaElectronicaCompleta } from '@/services/facturasDescarga'

export default function OperacionesFactura({ factura, onActualizada }: { factura: FacturaElectronicaCompleta; onActualizada: () => Promise<void> }) {
  const [accion, setAccion] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const pendiente = factura.estado_cancelacion === 'PENDIENTE' || factura.notas_credito?.some(n => ['EMITIDA', 'VERIFICAR'].includes(n.estado))
  if (factura.pdf_pendiente) return <span>PDF pendiente de actualización</span>
  if (pendiente) return <span role="status">Pendiente</span>
  if (!factura.puede_gestionar || factura.estado !== 'APROBADA') return null
  const confirmar = async () => {
    setOcupado(true); setError('')
    try {
      if (accion === 'cancelar') await cancelarFactura(factura.id, '')
      else await emitirNotaCredito(factura.id, '5', factura.email_destino)
      setAccion('')
      await onActualizada()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo procesar la solicitud') }
    finally { setOcupado(false) }
  }
  return <div className="flex items-center gap-2">
    <select aria-label="Operación de factura" value={accion} disabled={ocupado} onChange={e => setAccion(e.target.value)}>
      <option value=""></option><option value="cancelar">Anular Comprobante</option><option value="nc">Emitir Nota de Crédito</option>
    </select>
    {accion && <button disabled={ocupado} onClick={() => void confirmar()}>{ocupado ? 'Pendiente' : 'Confirmar'}</button>}
    {error && <span role="alert">{error}</span>}
  </div>
}
