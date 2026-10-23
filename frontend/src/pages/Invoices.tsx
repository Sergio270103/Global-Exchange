/**
 * Vista de facturas con datos reales.
 *
 * No existe `/api/facturas/` en el backend: la vista se alimenta de
 * `GET /api/operaciones/` (`listarOperaciones()`) y cruza con
 * `GET /api/comprobantes/` para detectar anulaciones. Los tres estados de
 * la factura se derivan del estado de la operación:
 *
 * - `PENDIENTE` → **Emitida**: la factura se emitió y espera el pago.
 * - `PAGADA` → **Aprobada**: la venta quedó registrada.
 * - `CANCELADA` / `ANULADA`, o comprobante anulado → **Rechazada**.
 *
 * El backend ya restringe el resultado a los clientes del usuario
 * (el administrador ve todo).
 *
 * PI-28: cada estado se distingue por color, las rechazadas muestran el
 * motivo, el estado se refresca con un botón sin recargar la página y se
 * filtra por estado y por rango de fechas.
 *
 * @module Invoices
 */
import { useCallback, useEffect, useState } from 'react'
import { listarComprobantes, type Comprobante } from '@/services/comprobantes'
import { listarOperaciones, type Operacion } from '@/services/operaciones'
import { ETIQUETA_MOTIVO } from '@/services/historial'

type EstadoFactura = 'Emitida' | 'Aprobada' | 'Rechazada'

/** Estados visibles en el filtro de facturas. */
type FiltroEstadoFactura = 'TODAS' | EstadoFactura

/** Fila de la tabla, con el mismo formato que el mock original. */
interface Factura {
  id: string
  fecha: string
  cliente: string
  montoPyg: number
  trx: string
  estado: EstadoFactura
  /** Motivo por el que la operación/comprobante fue rechazado. */
  motivo: string
  /** Fecha ISO cruda (`YYYY-MM-DD...`) de la operación, para filtrar. */
  fechaIso: string
}

const statusStyle: Record<EstadoFactura, string> = {
  Emitida: 'bg-amber-50 text-amber-700 border-amber-100',
  Aprobada: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Rechazada: 'bg-red-50 text-red-600 border-red-100',
}

const ESTADOS_FILTRO: FiltroEstadoFactura[] = ['TODAS', 'Emitida', 'Aprobada', 'Rechazada']

const LABEL_ESTADO: Record<FiltroEstadoFactura, string> = {
  TODAS: 'Todas',
  Emitida: 'Emitida',
  Aprobada: 'Aprobada',
  Rechazada: 'Rechazada',
}

/**
 * Motivos legibles para la vista de facturas.
 *
 * `ANULADA` no está en {@link ETIQUETA_MOTIVO} porque la UI de cancelación
 * no lo ofrece: lo asigna el sistema al anular un comprobante.
 */
const MOTIVO_FACTURA: Record<string, string> = {
  ...ETIQUETA_MOTIVO,
  ANULADA: 'Comprobante anulado en ventanilla',
}

/** Monto en PYG de la operación (una de las puntas es PYG en este flujo). */
function montoPyg(o: Operacion): number {
  if (o.moneda_destino_codigo === 'PYG') return o.monto_recibido
  if (o.moneda_origen_codigo === 'PYG') return o.monto_enviado
  return o.monto_recibido
}

/** Estado de la factura derivado de la operación y su comprobante. */
function estadoFactura(o: Operacion, comp: Comprobante | null | undefined): EstadoFactura {
  if (comp?.estado === 'anulado') return 'Rechazada'
  if (o.estado === 'PENDIENTE') return 'Emitida'
  if (o.estado === 'PAGADA') return 'Aprobada'
  return 'Rechazada'
}

/**
 * Motivo legible de una factura rechazada (PI-28).
 *
 * Si el comprobante se anuló prima el motivo cargado por el cajero; si no,
 * se traduce el código interno de cancelación de la operación.
 */
function motivoDe(o: Operacion, comp: Comprobante | null | undefined): string {
  if (comp?.estado === 'anulado') {
    const texto = String(comp.motivo_anulacion ?? '').trim()
    return texto || MOTIVO_FACTURA.ANULADA
  }
  const motivo = String(o.motivo_cancelacion ?? '').trim()
  return motivo ? (MOTIVO_FACTURA[motivo] ?? motivo) : ''
}

function aFactura(o: Operacion, comp: Comprobante | null | undefined): Factura {
  const fecha = new Date(o.fecha_creacion)
  const estado = estadoFactura(o, comp)
  return {
    id: `F001-${String(o.id).padStart(4, '0')}`,
    fecha: Number.isNaN(fecha.getTime())
      ? ''
      : fecha.toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric' }),
    cliente: o.cliente_nombre,
    montoPyg: montoPyg(o),
    trx: `OP-${o.id}`,
    estado,
    motivo: estado === 'Rechazada' ? motivoDe(o, comp) : '',
    fechaIso: o.fecha_creacion,
  }
}

export default function Invoices() {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [refrescando, setRefrescando] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoFactura>('TODAS')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [ops, comps] = await Promise.all([
        listarOperaciones(),
        // Si falla, se degrada al mapeo por operación (sin anuladas).
        listarComprobantes().catch(() => [] as Comprobante[]),
      ])
      const porOperacion = new Map<number, Comprobante>()
      for (const c of comps) porOperacion.set(c.operacion, c)
      setFacturas(ops.map(o => aFactura(o, porOperacion.get(o.id) ?? null)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las facturas.')
    }
  }, [])

  useEffect(() => {
    void (async () => {
      setCargando(true)
      await cargar()
      setCargando(false)
    })()
  }, [cargar])

  /** Refresca sin recargar la página ni vaciar la tabla (PI-28). */
  const refrescar = async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }

  const facturasFiltradas = facturas.filter(f => {
    if (filtroEstado !== 'TODAS' && f.estado !== filtroEstado) return false
    const dia = f.fechaIso.slice(0, 10)
    if (desde && dia < desde) return false
    if (hasta && dia > hasta) return false
    return true
  })

  const emitidas = facturasFiltradas.filter(f => f.estado === 'Emitida').length
  const aprobadas = facturasFiltradas.filter(f => f.estado === 'Aprobada').length
  const rechazadas = facturasFiltradas.filter(f => f.estado === 'Rechazada').length

  return (
    <div className="space-y-5 animate-fadein">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total facturas', value: facturasFiltradas.length, color: '#0f3460' },
          { label: 'Emitidas', value: emitidas, color: '#d97706' },
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
            <button
              type="button"
              onClick={() => void refrescar()}
              disabled={refrescando || cargando}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              🔄 {refrescando ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">📥 PDF</button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">📊 Excel</button>
          </div>
        </div>
        {/* Filtros PI-28: estado y rango de fechas. */}
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/40 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="filtro-estado" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Estado</label>
            <select
              id="filtro-estado"
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value as FiltroEstadoFactura)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:outline-none focus:border-emerald-400"
            >
              {ESTADOS_FILTRO.map(e => (
                <option key={e} value={e}>{LABEL_ESTADO[e]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filtro-desde" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Desde</label>
            <input
              id="filtro-desde"
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label htmlFor="filtro-hasta" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Hasta</label>
            <input
              id="filtro-hasta"
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <button
            type="button"
            onClick={() => { setFiltroEstado('TODAS'); setDesde(''); setHasta('') }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-500 hover:bg-white transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
        {cargando ? (
          <p className="px-5 py-12 text-center text-slate-400 text-[13px]">Cargando facturas…</p>
        ) : error ? (
          <p role="alert" className="px-5 py-12 text-center text-rose-600 text-[13px] font-medium">{error}</p>
        ) : facturasFiltradas.length === 0 ? (
          <p className="px-5 py-12 text-center text-slate-400 text-[13px]">
            {facturas.length === 0
              ? 'Todavía no hay facturas emitidas.'
              : 'No hay facturas para los filtros seleccionados.'}
          </p>
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
              {facturasFiltradas.map(inv => (
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
                    {inv.estado === 'Rechazada' && inv.motivo && (
                      <div className="mt-1.5 text-[11px] text-slate-400 font-medium">{inv.motivo}</div>
                    )}
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
