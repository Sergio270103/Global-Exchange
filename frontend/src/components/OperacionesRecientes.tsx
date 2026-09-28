/**
 * Operaciones recientes (datos reales) para el Dashboard (PI-65).
 *
 * - Usuario: las últimas operaciones del cliente activo.
 * - Administrador: las últimas operaciones de todos los clientes.
 * "Ver todo →" lleva al historial completo (para el admin, vista de
 * auditoría). El backend valida qué puede ver cada uno.
 *
 * @module components/OperacionesRecientes
 */
import { useEffect, useState } from 'react'
import { ETIQUETA_ESTADO, ETIQUETA_TIPO, estiloEstado, listarHistorial } from '@/services/historial'
import { type Operacion } from '@/services/operaciones'
import { type AuthUser, type ClienteActivo, type Page } from '@/types'

/** Cantidad de operaciones que se muestran. */
export const CANTIDAD_RECIENTES = 5

export interface OperacionesRecientesProps {
  auth: AuthUser
  currentClient: ClienteActivo | null
  navigate: (p: Page) => void
}

function fecha(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Monto y moneda de la divisa operada (lo que compró o vendió). */
function montoDivisa(o: Operacion): string {
  const esCompra = o.tipo_operacion === 'COMPRA'
  const valor = esCompra ? o.monto_recibido : o.monto_enviado
  const codigo = esCompra ? o.moneda_destino_codigo : o.moneda_origen_codigo
  const dec = codigo === 'PYG' ? 0 : 2
  return `${valor.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${codigo}`
}

function divisa(o: Operacion): string {
  return o.tipo_operacion === 'COMPRA' ? o.moneda_destino_codigo : o.moneda_origen_codigo
}

export default function OperacionesRecientes({ auth, currentClient, navigate }: OperacionesRecientesProps) {
  const esAdmin = auth.role === 'admin'
  const clienteId = esAdmin ? undefined : currentClient?.id

  const [ops, setOps] = useState<Operacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError('')
    listarHistorial({ todos: esAdmin || undefined, clienteId })
      .then(datos => { if (vivo) setOps(datos.slice(0, CANTIDAD_RECIENTES)) })
      .catch(() => { if (vivo) { setOps([]); setError('No se pudieron cargar las operaciones.') } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [esAdmin, clienteId])

  return (
    <div className="lg:col-span-3 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Operaciones recientes</h3>
        <button onClick={() => navigate('transactions')} className="text-[12px] text-emerald-600 font-semibold hover:text-emerald-700">Ver todo →</button>
      </div>
      {cargando ? (
        <p className="py-6 text-center text-[13px] text-slate-400">Cargando operaciones…</p>
      ) : error ? (
        <p role="alert" className="py-6 text-center text-[13px] text-red-600">{error}</p>
      ) : ops.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-400">Todavía no hay operaciones.</p>
      ) : (
        <div className="space-y-3">
          {ops.map(o => {
            const esCompra = o.tipo_operacion === 'COMPRA'
            return (
              <div key={o.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${esCompra ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  {esCompra ? '↑' : '↓'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-slate-800">{ETIQUETA_TIPO[o.tipo_operacion]} {divisa(o)}</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    #{o.id} · {fecha(o.fecha_creacion)}{esAdmin ? ` · ${o.cliente_nombre}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-semibold text-slate-800 text-[13px]">{montoDivisa(o)}</div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${estiloEstado(o.estado)}`}>
                    {ETIQUETA_ESTADO[o.estado]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}