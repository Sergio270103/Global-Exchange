import { useState } from 'react'
import type { FacturaElectronica } from '@/services/facturas'
import { descargarDocumentoOficial } from '@/services/facturasDescarga'

export default function DescargarKude({ factura }: { factura: FacturaElectronica | null }) {
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState('')
  const aprobada = factura?.estado === 'APROBADA'
  const descargar = async () => {
    if (!factura || !aprobada || descargando) return
    setDescargando(true)
    setError('')
    try { await descargarDocumentoOficial(factura, 'kude') }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar el PDF.') }
    finally { setDescargando(false) }
  }
  return <div className="flex-1">
    <button type="button" onClick={() => void descargar()} disabled={!aprobada || descargando}
      className="w-full py-2 rounded-lg bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50">
      {!aprobada ? 'Procesando SIFEN...' : descargando ? 'Descargando...' : 'Descargar PDF'}
    </button>
    {error && <p role="alert" className="text-xs text-rose-600 mt-1">{error}</p>}
  </div>
}
