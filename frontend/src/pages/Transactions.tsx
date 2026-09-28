/**
 * Historial de transacciones (PI-65, RF34/RF35). Solo consulta.
 *
 * - Usuario: ve el historial del cliente activo de la sesión (el mismo con
 *   el que se opera en Comprar/Vender).
 * - Administrador: vista de auditoría con todas las operaciones de todos
 *   los clientes, quién canceló y por qué. El backend valida el rol.
 * - En la columna Estado no se repite la fecha (ya está en la columna Fecha);
 *   el momento exacto de la cancelación queda en el tooltip y en el CSV.
 * - Lee `GET /api/operaciones/` con los cuatro filtros de RF35: fecha
 *   (desde/hasta), tipo de operación, moneda y estado. Los filtros se
 *   aplican en el backend, que además devuelve solo las operaciones de los
 *   clientes del usuario.
 * - Estados del diagrama: Pendiente, Pagada, Cancelada y Anulada. En las
 *   canceladas se muestra quién y cuándo la canceló (PI-64).
 * - RF34: botón para descargar el historial filtrado en CSV (abre en Excel).
 *
 * @module Transactions
 */
import { useEffect, useMemo, useState } from 'react'
import { vigentes } from '@/services/cotizaciones'
import {
  descargarHistorial,
  ESTADOS,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO,
  estiloEstado,
  listarHistorial,
  validarRangoFechas,
  type FiltrosHistorial,
} from '@/services/historial'
import { type EstadoOperacion, type Operacion, type TipoOperacion } from '@/services/operaciones'
import { type AuthUser, type ClienteActivo } from '@/types'

/** Propiedades del historial de transacciones. */
export interface TransactionsProps {
  auth: AuthUser
  currentClient: ClienteActivo | null
}

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })
}

function monto(valor: number, codigo: string): string {
  const dec = codigo === 'PYG' ? 0 : 2
  return `${valor.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${codigo}`
}

const MOTIVO_CORTO: Record<string, string> = {
  COTIZACION_CAMBIADA: 'No aceptó la nueva cotización',
  DESISTIO: 'Desistió',
}

/**
 * Texto bajo el estado (sin fecha, que ya está en la columna Fecha).
 * - Pagada: qué usuario del cliente la realizó.
 * - Cancelada: quién la canceló; el admin (auditoría) ve además el motivo.
 * - Pendiente y Anulada: nada (la anulación la hace el administrador).
 */
function detalleEstado(o: Operacion, esAdmin: boolean): string {
  if (o.estado === 'PAGADA') {
    return o.usuario_nombre ? `por ${o.usuario_nombre}` : ''
  }
  if (o.estado !== 'CANCELADA') return ''
  const quien = `por ${o.cancelada_por_nombre || 'el usuario'}`
  if (!esAdmin) return quien
  const motivo = o.motivo_cancelacion ? MOTIVO_CORTO[o.motivo_cancelacion] : ''
  return motivo ? `${quien} · ${motivo}` : quien
}

/** Tooltip con el momento exacto de la cancelación (auditoría). */
function tooltipEstado(o: Operacion): string | undefined {
  if (o.estado === 'CANCELADA' && o.fecha_cancelacion) return `Cancelada el ${fechaCorta(o.fecha_cancelacion)}`
  if (o.estado === 'PAGADA' && o.fecha_confirmacion) return `Pagada el ${fechaCorta(o.fecha_confirmacion)}`
  return undefined
}

const TODOS = ''

export default function Transactions({ auth, currentClient }: TransactionsProps) {
  const esAdmin = auth.role === 'admin'
  // Filtros RF35 (se envían al backend).
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tipo, setTipo] = useState<TipoOperacion | ''>(TODOS)
  const [moneda, setMoneda] = useState(TODOS)
  const [estado, setEstado] = useState<EstadoOperacion | ''>(TODOS)
  // Búsqueda rápida sobre lo ya cargado (ID o cliente).
  const [search, setSearch] = useState('')

  const [ops, setOps] = useState<Operacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [monedas, setMonedas] = useState<string[]>(['PYG'])

  const errorFechas = validarRangoFechas(desde, hasta)

  // El admin ve todo; el usuario, solo su cliente activo.
  const clienteId = esAdmin ? undefined : currentClient?.id

  const filtros: FiltrosHistorial = useMemo(() => ({
    todos: esAdmin || undefined,
    clienteId,
    desde: desde || undefined,
    hasta: hasta || undefined,
    tipo: tipo || undefined,
    moneda: moneda || undefined,
    estado: estado || undefined,
  }), [esAdmin, clienteId, desde, hasta, tipo, moneda, estado])

  // Catálogo de monedas para el filtro.
  useEffect(() => {
    vigentes()
      .then(cots => setMonedas(prev => Array.from(new Set([...prev, ...cots.map(c => c.moneda)])).sort()))
      .catch(() => { /* si falla, se completan con las monedas de las operaciones */ })
  }, [])

  // Carga del historial cada vez que cambia un filtro.
  useEffect(() => {
    if (errorFechas) return
    let vivo = true
    setCargando(true)
    setError('')
    listarHistorial(filtros)
      .then(datos => {
        if (!vivo) return
        setOps(datos)
        setMonedas(prev => {
          const set = new Set(prev)
          datos.forEach(o => { set.add(o.moneda_origen_codigo); set.add(o.moneda_destino_codigo) })
          return Array.from(set).sort()
        })
      })
      .catch(err => {
        if (!vivo) return
        setOps([])
        setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.')
      })
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [filtros, errorFechas])

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ops
    return ops.filter(o => String(o.id).includes(q) || o.cliente_nombre.toLowerCase().includes(q))
  }, [ops, search])

  const hayFiltros = Boolean(desde || hasta || tipo || moneda || estado || search)
  const limpiar = () => {
    setDesde(''); setHasta(''); setTipo(TODOS); setMoneda(TODOS); setEstado(TODOS); setSearch('')
  }

  const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300'
  const labelCls = 'block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1'

  return (
    <div className="space-y-5 animate-fadein">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <p className="text-[13px] text-slate-500">
          {esAdmin
            ? <><span className="font-semibold text-slate-800">Auditoría</span> · todas las operaciones de todos los clientes</>
            : currentClient
              ? <>Historial de <span className="font-semibold text-slate-800">{currentClient.nombre}</span></>
              : 'Historial de todos tus clientes'}
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="f-desde" className={labelCls}>Desde</label>
            <input id="f-desde" type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="f-hasta" className={labelCls}>Hasta</label>
            <input id="f-hasta" type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="f-tipo" className={labelCls}>Tipo</label>
            <select id="f-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoOperacion | '')} className={inputCls}>
              <option value={TODOS}>Todos</option>
              <option value="COMPRA">{ETIQUETA_TIPO.COMPRA}</option>
              <option value="VENTA">{ETIQUETA_TIPO.VENTA}</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-moneda" className={labelCls}>Moneda</label>
            <select id="f-moneda" value={moneda} onChange={e => setMoneda(e.target.value)} className={inputCls}>
              <option value={TODOS}>Todas</option>
              {monedas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-estado" className={labelCls}>Estado</label>
            <select id="f-estado" value={estado} onChange={e => setEstado(e.target.value as EstadoOperacion | '')} className={inputCls}>
              <option value={TODOS}>Todos</option>
              {ESTADOS.map(s => <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>)}
            </select>
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <label htmlFor="f-buscar" className={labelCls}>Buscar</label>
            <input
              id="f-buscar"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ID o cliente..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-300 bg-slate-50"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px]">
            {errorFechas && <p role="alert" className="text-red-600 font-medium">{errorFechas}</p>}
            {!errorFechas && error && <p role="alert" className="text-red-600 font-medium">{error}</p>}
          </div>
          <div className="flex gap-2">
            {hayFiltros && (
              <button onClick={limpiar} className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Limpiar filtros
              </button>
            )}
            <button
              onClick={() => descargarHistorial(visibles, filtros)}
              disabled={cargando || visibles.length === 0 || Boolean(errorFechas)}
              title={visibles.length === 0 ? 'No hay operaciones para descargar' : 'Descargar lo que se ve en la tabla (CSV, abre en Excel)'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
              Descargar historial
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total operaciones', value: visibles.length, sub: hayFiltros ? 'filtradas' : 'todas' },
          { label: 'Compras', value: visibles.filter(o => o.tipo_operacion === 'COMPRA').length, sub: `de ${visibles.length}` },
          { label: 'Ventas', value: visibles.filter(o => o.tipo_operacion === 'VENTA').length, sub: `de ${visibles.length}` },
          { label: 'Pagadas', value: visibles.filter(o => o.estado === 'PAGADA').length, sub: `de ${visibles.length}` },
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
                {['ID', 'Fecha', 'Cliente', 'Tipo', 'Par', 'Monto', 'Estado'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap ${h === 'Estado' ? 'min-w-[210px]' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cargando ? (
                <tr><td colSpan={7} className="px-6 py-16 text-center text-slate-400 text-[13px]">Cargando operaciones…</td></tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="text-3xl mb-3">🔍</div>
                    <p className="text-slate-500 font-medium">
                      {hayFiltros ? 'Sin resultados' : esAdmin ? 'Todavía no hay operaciones' : 'Todavía no tenés operaciones'}
                    </p>
                    <p className="text-slate-400 text-[13px] mt-1">
                      {hayFiltros ? 'Probá con otros filtros' : esAdmin ? 'Cuando los clientes operen van a aparecer acá' : 'Cuando compres o vendas divisas van a aparecer acá'}
                    </p>
                  </td>
                </tr>
              ) : visibles.map(o => {
                const esCompra = o.tipo_operacion === 'COMPRA'
                const detalle = detalleEstado(o, esAdmin)
                return (
                  <tr key={o.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[12px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">#{o.id}</span>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-slate-500 whitespace-nowrap">{fechaCorta(o.fecha_creacion)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {o.cliente_nombre.charAt(0)}
                        </div>
                        <span className="text-[13px] font-medium text-slate-800 whitespace-nowrap">{o.cliente_nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${esCompra ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                        {esCompra ? '↑' : '↓'} {ETIQUETA_TIPO[o.tipo_operacion]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-slate-700 text-[13px]">{o.moneda_origen_codigo}/{o.moneda_destino_codigo}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[13px] text-slate-800 font-semibold whitespace-nowrap">
                      {monto(o.monto_enviado, o.moneda_origen_codigo)} → {monto(o.monto_recibido, o.moneda_destino_codigo)}
                    </td>
                    <td className="px-4 py-3.5 min-w-[210px]" title={tooltipEstado(o)}>
                      <span className={`inline-block text-[11px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap ${estiloEstado(o.estado)}`}>
                        {ETIQUETA_ESTADO[o.estado]}
                      </span>
                      {detalle && <div className="mt-1 text-[11px] leading-snug text-slate-400">{detalle}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}