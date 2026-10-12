/**
 * Vista de facturas con datos reales.
 *
 * No existe `/api/facturas/` en el backend: la vista se alimenta de
 * `GET /api/operaciones/` (`listarOperaciones()`) y muestra solo
 * operaciones cerradas — `PAGADA` → "Aprobada", `CANCELADA` →
 * "Rechazada". Además cruza con `GET /api/comprobantes/`: si el
 * comprobante de una operación pagada está `anulado`, la factura
 * figura como "Rechazada" aunque la operación siga `PAGADA`.
 * El backend ya restringe el resultado a los clientes del usuario
 * (el admin ve todo).
 *
 * @module Invoices
 */
import { useEffect, useState } from 'react'
import { listarComprobantes } from '@/services/comprobantes'
import { listarOperaciones, type Operacion } from '@/services/operaciones'

type EstadoFactura = 'Aprobada' | 'Rechazada'

/** Fila de la tabla, con el mismo formato que el mock original. */
interface Factura {
  id: string
  fecha: string
  cliente: string
  montoPyg: number
  trx: string
  estado: EstadoFactura
}

const statusStyle: Record<EstadoFactura, string> = {
  Aprobada: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Rechazada: 'bg-red-50 text-red-600 border-red-100',
}

/** Monto en PYG de la operación (una de las puntas es PYG en este flujo). */
function montoPyg(o: Operacion): number {
  if (o.moneda_destino_codigo === 'PYG') return o.monto_recibido
  if (o.moneda_origen_codigo === 'PYG') return o.monto_enviado
  return o.monto_recibido
}

function aFactura(o: Operacion, anuladas: Set<number>): Factura {
  const fecha = new Date(o.fecha_creacion)
  const anulada = anuladas.has(o.id)
  return {
    id: `F001-${String(o.id).padStart(4, '0')}`,
    fecha: Number.isNaN(fecha.getTime())
      ? ''
      : fecha.toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric' }),
    cliente: o.cliente_nombre,
    montoPyg: montoPyg(o),
    trx: `OP-${o.id}`,
    estado: o.estado === 'PAGADA' && !anulada ? 'Aprobada' : 'Rechazada',
  }
}

export default function Invoices() {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let viva = true
    Promise.all([
      listarOperaciones(),
      // Si falla, se degrada al mapeo por operación (sin anuladas).
      listarComprobantes().catch(() => []),
    ])
      .then(([ops, comps]) => {
        if (!viva) return
        const anuladas = new Set(
          comps.filter(c => c.estado === 'anulado').map(c => c.operacion),
        )
        setFacturas(
          ops
            .filter(o => o.estado === 'PAGADA' || o.estado === 'CANCELADA')
            .map(o => aFactura(o, anuladas)),
        )
      })
      .catch(err => {
        if (!viva) return
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las facturas.')
      })
      .finally(() => {
        if (viva) setCargando(false)
      })
    return () => { viva = false }
  }, [])

  const aprobadas = facturas.filter(f => f.estado === 'Aprobada').length
  const rechazadas = facturas.filter(f => f.estado === 'Rechazada').length

  return (
    <div className="space-y-5 animate-fadein">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total facturas', value: facturas.length, color: '#0f3460' },
          { label: 'Aprobadas', value: aprobadas, color: '#10b981' },
          { label: 'Rechazadas', value: rechazadas, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="font-mono font-bold text-2xl" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Facturas electrónicas</h3>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">📥 PDF</button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">📊 Excel</button>
          </div>
        </div>
        {cargando ? (
          <p className="px-5 py-12 text-center text-slate-400 text-[13px]">Cargando facturas…</p>
        ) : error ? (
          <p role="alert" className="px-5 py-12 text-center text-rose-600 text-[13px] font-medium">{error}</p>
        ) : facturas.length === 0 ? (
          <p className="px-5 py-12 text-center text-slate-400 text-[13px]">Todavía no hay facturas emitidas.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Número', 'Fecha', 'Cliente', 'Monto (PYG)', 'Transacción', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {facturas.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <span className="font-mono text-[13px] font-bold text-slate-800">{inv.id}</span>
                  </td>
                  <td className="px-5 py-4 text-[13px] text-slate-500">{inv.fecha}</td>
                  <td className="px-5 py-4 text-[13px] font-medium text-slate-800">{inv.cliente}</td>
                  <td className="px-5 py-4 font-mono font-semibold text-[13px] text-slate-800">₲ {inv.montoPyg.toLocaleString('es')}</td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-[12px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{inv.trx}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusStyle[inv.estado]}`}>{inv.estado}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button className="text-[12px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors">📄 PDF</button>
                      <button className="text-[12px] font-semibold text-slate-500 hover:text-emerald-600 px-2 py-1 rounded hover:bg-emerald-50 transition-colors">✉️ Enviar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
