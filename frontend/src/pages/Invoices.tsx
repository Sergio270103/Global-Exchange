/**
 * Vista de facturas (PI-28 / PI-86).
 *
 * Mantiene la pantalla de PI-28: una fila por operación, con el estado
 * visual (Emitida/Aprobada/Rechazada) derivado de la operación y su
 * comprobante, tarjetas de resumen, filtros por estado y rango de
 * fechas, y el botón Actualizar sin recargar.
 *
 * PI-86 agrega las descargas sobre las facturas electrónicas de PI-30
 * (`GET /api/facturas/`, Factura Segura):
 *
 * - **PDF por fila**: habilitado solo cuando SIFEN aprobó la factura
 *   electrónica de esa operación; el archivo se llama con el número real
 *   (`001-003-0000100.pdf`). Rechazadas, pendientes y sin emitir quedan
 *   deshabilitadas con el motivo.
 * - **Exportar CSV**: exporta exactamente las filas que pasan los
 *   filtros, con los datos de la factura electrónica.
 * - **KuDE y XML oficiales**: si la factura es real (no simulada), el PDF
 *   es el KuDE que genera Factura Segura y se ofrece también el XML
 *   firmado. Las simuladas siguen con el PDF propio.
 *
 * @module Invoices
 */
import { useCallback, useEffect, useState } from 'react'
import { listarComprobantes, type Comprobante } from '@/services/comprobantes'
import { listarOperaciones, type Operacion } from '@/services/operaciones'
import {
  descargarDocumentoOficial,
  descargarFacturaPdf,
  descargarFacturasCsv,
  elegirFactura,
  listarFacturasElectronicas,
  motivoPdf,
  type FacturaElectronicaCompleta,
} from '@/services/facturasDescarga'
import { ETIQUETA_MOTIVO } from '@/services/historial'

type EstadoFactura = 'Emitida' | 'Aprobada' | 'Rechazada'

/** Estados visibles en el filtro de facturas. */
type FiltroEstadoFactura = 'TODAS' | EstadoFactura

/** Fila de la tabla: la operación de PI-28 + su factura electrónica de PI-30. */
interface Fila {
  /** Número visual PI-28 (`F001-00XX`). */
  numero: string
  fecha: string
  cliente: string
  montoPyg: number
  trx: string
  estado: EstadoFactura
  motivo: string
  /** Fecha ISO cruda (`YYYY-MM-DD...`) de la operación, para filtrar. */
  fechaIso: string
  operacion: Operacion
  factura: FacturaElectronicaCompleta | null
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

/** Estado de la factura derivado de la operación y su comprobante (PI-28). */
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

function aFila(
  o: Operacion,
  comp: Comprobante | null | undefined,
  factura: FacturaElectronicaCompleta | null,
): Fila {
  const fecha = new Date(o.fecha_creacion)
  const estado = estadoFactura(o, comp)
  return {
    numero: `F001-${String(o.id).padStart(4, '0')}`,
    fecha: Number.isNaN(fecha.getTime())
      ? ''
      : fecha.toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric' }),
    cliente: o.cliente_nombre,
    montoPyg: montoPyg(o),
    trx: `OP-${o.id}`,
    estado,
    motivo: estado === 'Rechazada' ? motivoDe(o, comp) : '',
    fechaIso: o.fecha_creacion,
    operacion: o,
    factura,
  }
}

export default function Invoices() {
  const [filas, setFilas] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [refrescando, setRefrescando] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoFactura>('TODAS')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [ops, comps, facturasElectronicas] = await Promise.all([
        listarOperaciones(),
        // Si falla, se degrada al mapeo por operación (sin anuladas).
        listarComprobantes().catch(() => [] as Comprobante[]),
        // Lo mismo con las facturas de PI-30: si fallan, los PDF quedan
        // deshabilitados pero la pantalla sigue funcionando.
        listarFacturasElectronicas().catch(() => [] as FacturaElectronicaCompleta[]),
      ])
      const comprobantePorOperacion = new Map<number, Comprobante>()
      for (const c of comps) comprobantePorOperacion.set(c.operacion, c)
      setFilas(ops.map(o => aFila(
        o,
        comprobantePorOperacion.get(o.id) ?? null,
        elegirFactura(facturasElectronicas, o.id),
      )))
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

  const filasFiltradas = filas.filter(f => {
    if (filtroEstado !== 'TODAS' && f.estado !== filtroEstado) return false
    const dia = f.fechaIso.slice(0, 10)
    if (desde && dia < desde) return false
    if (hasta && dia > hasta) return false
    return true
  })

  const emitidas = filasFiltradas.filter(f => f.estado === 'Emitida').length
  const aprobadas = filasFiltradas.filter(f => f.estado === 'Aprobada').length
  const rechazadas = filasFiltradas.filter(f => f.estado === 'Rechazada').length

  const exportarCsv = () => {
    descargarFacturasCsv(filasFiltradas, { estado: filtroEstado, desde, hasta })
  }

  const [descargando, setDescargando] = useState<string | null>(null)

  /** Real: KuDE oficial de Factura Segura. Simulada: PDF propio (PI-86). */
  const descargarPdf = async (fila: Fila) => {
    if (!fila.factura) return
    setError('')
    try {
      if (fila.factura.simulada) {
        descargarFacturaPdf(fila.factura, fila.operacion)
        return
      }
      setDescargando(`kude-${fila.factura.id}`)
      await descargarDocumentoOficial(fila.factura, 'kude')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el PDF.')
    } finally {
      setDescargando(null)
    }
  }

  /** XML firmado de una factura real aprobada. */
  const descargarXml = async (fila: Fila) => {
    if (!fila.factura) return
    setError('')
    setDescargando(`xml-${fila.factura.id}`)
    try {
      await descargarDocumentoOficial(fila.factura, 'xml')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el XML.')
    } finally {
      setDescargando(null)
    }
  }

  return (
    <div className="space-y-5 animate-fadein">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total facturas', value: filasFiltradas.length, color: '#0f3460' },
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
            <button
              type="button"
              onClick={exportarCsv}
              disabled={cargando || filasFiltradas.length === 0}
              title="Exporta el listado con los filtros aplicados"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              📊 Exportar CSV
            </button>
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
        ) : filasFiltradas.length === 0 ? (
          <p className="px-5 py-12 text-center text-slate-400 text-[13px]">
            {filas.length === 0
              ? 'Todavía no hay facturas emitidas.'
              : 'No hay facturas para los filtros seleccionados.'}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Número', 'Fecha', 'Cliente', 'Monto (PYG)', 'Transacción', 'Estado', 'Nº Factura FE', 'Acciones'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filasFiltradas.map(inv => (
                <tr key={inv.numero} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <span className="font-mono text-[13px] font-bold text-slate-800">{inv.numero}</span>
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
                    {inv.factura ? (
                      <span className="font-mono text-[12px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{inv.factura.numero_completo}</span>
                    ) : (
                      <span className="text-[12px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => void descargarPdf(inv)}
                      disabled={!inv.factura || inv.factura.estado !== 'APROBADA'
                        || descargando === `kude-${inv.factura.id}`}
                      title={motivoPdf(inv.factura)}
                      aria-label={inv.factura && inv.factura.estado === 'APROBADA'
                        ? `Descargar factura ${inv.factura.numero_completo}`
                        : `PDF no disponible: ${motivoPdf(inv.factura)}`}
                      className={
                        inv.factura && inv.factura.estado === 'APROBADA'
                          ? 'text-[12px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors'
                          : 'text-[12px] font-semibold text-slate-400 px-2 py-1 rounded opacity-50 cursor-not-allowed'
                      }
                    >
                      {inv.factura && descargando === `kude-${inv.factura.id}` ? '⏳ PDF' : '📄 PDF'}
                    </button>
                    {inv.factura && inv.factura.estado === 'APROBADA' && !inv.factura.simulada && (
                      <button
                        type="button"
                        onClick={() => void descargarXml(inv)}
                        disabled={descargando === `xml-${inv.factura.id}`}
                        aria-label={`Descargar XML ${inv.factura.numero_completo}`}
                        className="text-[12px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        {descargando === `xml-${inv.factura.id}` ? '⏳ XML' : '🧾 XML'}
                      </button>
                    )}
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
