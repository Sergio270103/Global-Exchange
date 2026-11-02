import { useState } from 'react'
import { cancelarFactura, emitirNotaCredito } from '@/services/facturas'
import type { FacturaElectronicaCompleta } from '@/services/facturasDescarga'

export default function OperacionesFactura({ factura, onActualizada }: { factura: FacturaElectronicaCompleta; onActualizada: () => Promise<void> }) {
  const [accion, setAccion] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const pendiente = factura.estado_cancelacion === 'PENDIENTE' || factura.notas_credito?.some(n => ['EMITIDA', 'VERIFICAR'].includes(n.estado))
  if (factura.pdf_pendiente) return <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200">PDF pendiente de actualización</span>
  if (pendiente) return <span role="status" className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Pendiente en SIFEN</span>
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
  return <div className="flex flex-col items-start gap-1.5">
    <div className="flex items-center gap-2">
      <select aria-label="Operación de factura" value={accion} disabled={ocupado} onChange={e => setAccion(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1 text-[12px] bg-white text-slate-700 focus:outline-none focus:border-emerald-400 disabled:opacity-60">
        <option value="">Gestionar…</option><option value="cancelar">Anular Comprobante</option><option value="nc">Emitir Nota de Crédito</option>
      </select>
      {accion && <button type="button" disabled={ocupado} onClick={() => void confirmar()}
        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold disabled:opacity-60">{ocupado ? 'Enviando…' : 'Confirmar'}</button>}
    </div>
    {error && <span role="alert" className="text-[11px] text-rose-600 max-w-[16rem]">{error}</span>}
  </div>
}
