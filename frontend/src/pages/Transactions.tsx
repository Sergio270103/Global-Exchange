/**
 * Historial de transacciones (Hito Operaciones).
 *
 * Lee el historial real desde `GET /api/operaciones/?mine=1` con filtros
 * por tipo, moneda y estado. Si el backend no responde, muestra el respaldo
 * local.
 *
 * Estados (RF27, PI-64): Pendiente, Pagada, Cancelada, Anulada. En las
 * canceladas se muestra quién y cuándo la canceló (auditoría).
 *
 * @module Transactions
 */
import { useEffect, useMemo, useState } from 'react'
import { transactions as mockTransactions } from '@/data/mockData'
import { listarOperaciones, type EstadoOperacion, type Operacion } from '@/services/operaciones'
import { type AuthUser, type ClienteActivo } from '@/types'

/** Propiedades del historial de transacciones. */
export interface TransactionsProps {
  auth: AuthUser
  currentClient: ClienteActivo | null
}

const ETIQUETA_ESTADO: Record<EstadoOperacion, string> = {
  PENDIENTE: 'Pendiente',
  PAGADA: 'Pagada',
  CANCELADA: 'Cancelada',
  ANULADA: 'Anulada',
}

/** Colores del badge según la etiqueta (sirve también para los datos locales). */
function estiloEstado(etiqueta: string): string {
  switch (etiqueta) {
    case 'Pendiente':
      return 'bg-amber-50 text-amber-700 border-amber-100'
    case 'Cancelada':
      return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'Anulada':
      return 'bg-red-50 text-red-700 border-red-100'
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  }
}

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Transactions({ auth: _auth, currentClient }: TransactionsProps) {
  const [filterCurrency, setFilterCurrency] = useState('Todos')
  const [filterType, setFilterType] = useState('Todos')
  const [filterStatus, setFilterStatus] = useState('Todos')
  const [search, setSearch] = useState('')
  const [ops, setOps] = useState<Operacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [usandoMock, setUsandoMock] = useState(false)

  useEffect(() => {
    let vivo = true
    listarOperaciones({ mine: true })
      .then(datos => vivo && (setOps(datos), setUsandoMock(false)))
      .catch(() => vivo && setUsandoMock(true))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [currentClient?.id])

  const filas = useMemo(() => {
    if (usandoMock || ops.length === 0) {
      return mockTransactions
        .filter(t => {
          if (filterType !== 'Todos' && t.type !== filterType) return false
          if (filterCurrency !== 'Todos' && t.currency !== filterCurrency) return false
          if (filterStatus !== 'Todos' && t.status !== filterStatus) return false
          if (search && !t.id.toLowerCase().includes(search.toLowerCase()) && !t.client.toLowerCase().includes(search.toLowerCase())) return false
          return true
        })
        .map(t => ({
          id: t.id,
          fecha: t.date,
          cliente: t.client,
          tipo: t.type,
          par: `${t.currency}/PYG`,
          monto: `${t.amount.toLocaleString()} ${t.currency}`,
          total: `₲ ${t.total.toLocaleString('es')}`,
          estado: t.status,
          detalleEstado: '',
        }))
    }
    return ops
      .filter(o => {
        if (filterType !== 'Todos') {
          const esperado = filterType === 'Compra' ? 'COMPRA' : 'VENTA'
          if (o.tipo_operacion !== esperado) return false
        }
        if (filterCurrency !== 'Todos' && o.moneda_origen_codigo !== filterCurrency && o.moneda_destino_codigo !== filterCurrency) return false
        if (filterStatus !== 'Todos' && ETIQUETA_ESTADO[o.estado] !== filterStatus) return false
        if (search && !String(o.id).includes(search) && !o.cliente_nombre.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
      .map(o => ({
        id: `#${o.id}`,
        fecha: new Date(o.fecha_creacion).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }),
        cliente: o.cliente_nombre,
        tipo: o.tipo_operacion === 'COMPRA' ? 'Compra' : 'Venta',
        par: `${o.moneda_origen_codigo}/${o.moneda_destino_codigo}`,
        monto: `${o.monto_enviado.toLocaleString()} ${o.moneda_origen_codigo} → ${o.monto_recibido.toLocaleString()} ${o.moneda_destino_codigo}`,
        total: `${o.monto_recibido.toLocaleString()} ${o.moneda_destino_codigo}`,
        estado: ETIQUETA_ESTADO[o.estado] ?? o.estado,
        detalleEstado: o.estado === 'CANCELADA'
          ? `Cancelada por ${o.cancelada_por_nombre || 'el usuario'} el ${fechaCorta(o.fecha_cancelacion)}${
              o.motivo_cancelacion === 'COTIZACION_CAMBIADA' ? ' (no aceptó la nueva cotización)' : ''
            }`
          : o.estado === 'PAGADA' && o.fecha_confirmacion
            ? `Pagada el ${fechaCorta(o.fecha_confirmacion)}`
            : '',
      }))
  }, [ops, usandoMock, filterType, filterCurrency, filterStatus, search])

  const currencies = useMemo(() => {
    const set = new Set<string>()
    ops.forEach(o => { set.add(o.moneda_origen_codigo); set.add(o.moneda_destino_codigo) })
    mockTransactions.forEach(t => set.add(t.currency))
    return ['Todos', ...Array.from(set)]
  }, [ops])

  return (
    <div className="space-y-5 animate-fadein">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por ID o cliente..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-300 bg-slate-50"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Tipo', value: filterType, set: setFilterType, options: ['Todos', 'Compra', 'Venta'] },
              { label: 'Moneda', value: filterCurrency, set: setFilterCurrency, options: currencies },
              { label: 'Estado', value: filterStatus, set: setFilterStatus, options: ['Todos', 'Pendiente', 'Pagada', 'Cancelada', 'Anulada'] },
            ].map(f => (
              <select
                key={f.label}
                value={f.value}
                onChange={e => f.set(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                {f.options.map(o => <option key={o}>{o}</option>)}
              </select>
            ))}
          </div>
        </div>
        {usandoMock && !cargando && (
          <p className="mt-3 text-[12px] text-amber-600">Backend no disponible: mostrando datos locales.</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total operaciones', value: String(filas.length), sub: 'filtradas' },
          { label: 'Compras', value: String(filas.filter(t => t.tipo === 'Compra').length), sub: `de ${filas.length}` },
          { label: 'Ventas', value: String(filas.filter(t => t.tipo === 'Venta').length), sub: `de ${filas.length}` },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{card.label}</div>
            <div className="font-mono font-bold text-slate-900 text-[18px]">{card.value}</div>
            <div className="text-[11px] text-slate-300 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['ID', 'Fecha', 'Cliente', 'Tipo', 'Par', 'Monto', 'Total', 'Estado'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cargando ? (
                <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-400 text-[13px]">Cargando operaciones…</td></tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="text-3xl mb-3">🔍</div>
                    <p className="text-slate-500 font-medium">Sin resultados</p>
                    <p className="text-slate-400 text-[13px] mt-1">Probá con otros filtros</p>
                  </td>
                </tr>
              ) : filas.map(trx => (
                <tr key={trx.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-[12px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{trx.id}</span>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-500 whitespace-nowrap">{trx.fecha}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        {trx.cliente.charAt(0)}
                      </div>
                      <span className="text-[13px] font-medium text-slate-800 whitespace-nowrap">{trx.cliente}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${trx.tipo === 'Compra' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                      {trx.tipo === 'Compra' ? '↑' : '↓'} {trx.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-slate-700 text-[13px]">{trx.par}</span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[13px] text-slate-800 font-semibold">
                    {trx.monto}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[13px] text-slate-600">
                    {trx.total}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap ${estiloEstado(trx.estado)}`}>
                      {trx.estado}
                    </span>
                    {trx.detalleEstado && (
                      <div className="mt-1 text-[11px] text-slate-400 max-w-[220px]">{trx.detalleEstado}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}