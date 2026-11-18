import { useState } from 'react'
import { reintentarReversion, type FacturaElectronica } from '@/services/facturas'

export default function ReversionFactura({ factura, onActualizada }: {
  factura: FacturaElectronica; onActualizada: () => void | Promise<void>
}) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  if (!factura.reversion_pendiente && !factura.reversion_emision_pendiente) return null
  const reintentar = async () => {
    if (ocupado) return
    setOcupado(true)
    setError('')
    try {
      const actualizada = await reintentarReversion(factura.id)
      if (actualizada.reversion_pendiente || actualizada.reversion_emision_pendiente) {
        setError(actualizada.reversion_error || actualizada.reversion_emision_error || 'La reversión sigue pendiente.')
      }
      await onActualizada()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reintentar la reversión.')
    } finally { setOcupado(false) }
  }
  return <div className="text-xs text-amber-800 max-w-xs">
    <p role="alert">Reversión de saldos pendiente: {error || factura.reversion_error || factura.reversion_emision_error}</p>
    <button type="button" disabled={ocupado} onClick={() => void reintentar()}
      className="mt-1 underline font-semibold disabled:opacity-50">
      {ocupado ? 'Reintentando…' : 'Reintentar reversión'}
    </button>
  </div>
}
