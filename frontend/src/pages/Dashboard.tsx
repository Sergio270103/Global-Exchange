/**
 * Dashboard principal del usuario autenticado.
 *
 * Rama `user` con datos reales: saldo total desde las billeteras del
 * cliente activo (convertido a PYG con las ventas vigentes), conteo
 * histórico de operaciones PAGADA, últimas 2 operaciones como tarjetas,
 * gráfico de sumas mensuales en PYG por tipo (compra/venta) y tasas
 * destacadas desde la API. Los accesos rápidos y las operaciones
 * recientes no se modifican.
 *
 * Para el rol `cashier` se delega en el {@link CashierDashboard} y para
 * el rol `admin` en el dashboard agregado de {@link AdminDashboard}.
 *
 * @module Dashboard
 */
import { useEffect, useState } from 'react'
import { type AuthUser, type Page, type ClienteActivo } from '@/types'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import CashierDashboard from './cashier/CashierDashboard'
import AdminDashboard from './admin/AdminDashboard'
import OperacionesRecientes from '@/components/OperacionesRecientes'
import { listarBilleteras, type Billetera } from '@/services/billeteras'
import { ETIQUETA_ESTADO, ETIQUETA_TIPO, listarHistorial } from '@/services/historial'
import { listarMonedas } from '@/services/monedas'
import { vigentes } from '@/services/cotizaciones'
import { type Operacion } from '@/services/operaciones'
import { obtenerEvolucion, type PuntoEvolucion } from '@/services/evolucion'
import { useTasasDestacadas } from '@/hooks/useTasasDestacadas'
import ModalAlerta from '@/components/ModalAlerta'

export interface DashboardProps {
  auth: AuthUser
  currentClient: ClienteActivo | null
  navigate: (p: Page) => void
}


/** Monto en la divisa operada (lo comprado o lo vendido). */
function montoDivisa(o: Operacion): { texto: string; codigo: string } {
  const esCompra = o.tipo_operacion === 'COMPRA'
  const valor = esCompra ? o.monto_recibido : o.monto_enviado
  const codigo = esCompra ? o.moneda_destino_codigo : o.moneda_origen_codigo
  const dec = codigo === 'PYG' ? 0 : 2
  return {
    texto: valor.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec }),
    codigo,
  }
}

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function UserDashboard({ auth, currentClient, navigate }: DashboardProps) {
  const clienteId = currentClient?.id ?? null
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [ops, setOps] = useState<Operacion[]>([])
  const [ventas, setVentas] = useState<Map<string, number>>(new Map())
  const [simbolos, setSimbolos] = useState<Record<string, { simbolo: string; decimales: number }>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [puntos, setPuntos] = useState<PuntoEvolucion[]>([])
  const tasas = useTasasDestacadas()

  useEffect(() => {
    let vivo = true
    setError('')
    if (!clienteId) {
      setBilleteras([])
      setOps([])
      setCargando(false)
      return () => { vivo = false }
    }
    setCargando(true)
    Promise.all([
      listarBilleteras(clienteId).catch(() => [] as Billetera[]),
      listarHistorial({ clienteId }).catch(() => [] as Operacion[]),
      obtenerEvolucion(clienteId).catch(() => [] as PuntoEvolucion[]),
      vigentes().catch(() => []),
      listarMonedas().catch(() => []),
    ]).then(([bs, historialOps, evolucion, cotizaciones, monedas]) => {
      if (!vivo) return
      setBilleteras(bs)
      setOps(historialOps)
      setPuntos(evolucion)
      setVentas(new Map(cotizaciones.map(c => [c.moneda, c.venta])))
      const mapa: Record<string, { simbolo: string; decimales: number }> = {}
      for (const m of monedas) mapa[m.code] = { simbolo: m.symbol, decimales: m.decimals }
      setSimbolos(mapa)
      setCargando(false)
    }).catch(() => {
      if (vivo) {
        setError('No se pudo cargar el resumen de tu cuenta.')
        setCargando(false)
      }
    })
    return () => { vivo = false }
  }, [clienteId])

  const pagadas = ops.filter(o => o.estado === 'PAGADA')
  const compras = pagadas.filter(o => o.tipo_operacion === 'COMPRA').length
  const ventasCount = pagadas.length - compras

  const totalPYG = billeteras.reduce((acc, b) => {
    if (b.moneda_codigo === 'PYG') return acc + b.saldo
    const tasa = ventas.get(b.moneda_codigo)
    return tasa ? acc + b.saldo * tasa : acc
  }, 0)

  const ultimas = ops.slice(0, 2)
  const comprasPts = puntos.filter(p => p.compra !== null)
  const ventasPts = puntos.filter(p => p.venta !== null)

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  })()

  function saldoFormato(b: Billetera): string {
    const info = simbolos[b.moneda_codigo]
    const dec = info?.decimales ?? (b.moneda_codigo === 'PYG' ? 0 : 2)
    const sim = info ? `${info.simbolo} ` : ''
    return `${sim}${b.saldo.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
  }

  const tarjetasUltimas = [0, 1].map(i => {
    const o = ultimas[i]
    if (!o) {
      return { key: `vacia-${i}`, icon: '○', color: '#cbd5e1', value: '—', label: 'Sin operaciones', sub: 'Todavía no operaste' }
    }
    const esCompra = o.tipo_operacion === 'COMPRA'
    const { texto } = montoDivisa(o)
    return {
      key: `op-${o.id}`,
      icon: esCompra ? '↑' : '↓',
      color: esCompra ? '#10b981' : '#3b82f6',
      value: texto,
      label: `${ETIQUETA_TIPO[o.tipo_operacion]} ${esCompra ? o.moneda_destino_codigo : o.moneda_origen_codigo}`,
      sub: `${fechaCorta(o.fecha_creacion)} · ${ETIQUETA_ESTADO[o.estado]}`,
    }
  })

  return (
    <div className="space-y-6 animate-fadein">
      {/* PI-38: aviso grande al entrar si hay alertas disparadas sin ver. */}
      {auth.role === 'user' && <ModalAlerta navigate={navigate} />}
      {/* Welcome */}
      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] text-slate-500 font-medium">{greeting},</h2>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{auth.name.split(' ')[0]} 👋</h1>
          {auth.role === 'user' && <p className="text-sm text-slate-400 mt-0.5">Cliente: <span className="text-slate-600 font-medium">{currentClient?.nombre ?? '—'}</span></p>}
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('buy')} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
            + Nueva operación
          </button>
        </div>
      </div>

      {!clienteId && (
        <p role="alert" className="bg-amber-50 border border-amber-100 text-amber-700 text-[13px] rounded-xl px-4 py-3">
          Seleccioná un cliente para ver el saldo y las operaciones de tu cuenta.
        </p>
      )}
      {error && (
        <p role="alert" className="bg-red-50 border border-red-100 text-red-600 text-[13px] rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Chart + Quick actions */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Operations chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Evolución de operaciones</h3>
              <p className="text-slate-400 text-[12px] mt-0.5">Monto en PYG por operación</p>
            </div>

          </div>
          <div className="flex items-center gap-4 mb-4 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#10b981' }} />Compra</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#3b82f6' }} />Venta</span>
          </div>
          {cargando ? (
            <p className="py-6 text-center text-[13px] text-slate-400">Cargando operaciones…</p>
          ) : puntos.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400">Todavía no hay operaciones registradas.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="secuencia"
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  domain={[1, (max: number) => max + 1]}
                  label={{ value: 'Nº operación', position: 'insideBottomRight', offset: -2, fontSize: 11, fill: '#94a3b8' }}
                />
                <YAxis
                  dataKey="compra"
                  type="number"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `₲${(v/1000000).toFixed(1)}M`}
                  label={{ value: 'Monto (PYG)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                  formatter={(v: unknown) => `₲ ${(v as number).toLocaleString('es-PY')}`}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as PuntoEvolucion | undefined
                    return p ? `Operación #${p.secuencia} · ${fechaCorta(p.fecha)}` : ''
                  }}
                />
                <Line name="Compras" dataKey="compra" data={puntos} stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} />
                <Line name="Ventas" dataKey="venta" data={puntos} stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 text-[15px] mb-5" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Accesos rápidos</h3>
          <div className="space-y-2">
            {[
              { icon: '↑', label: 'Comprar divisas', sub: 'USD, EUR, BRL...', page: 'buy' as Page, color: '#10b981' },
              { icon: '↓', label: 'Vender divisas', sub: 'Transferí tus fondos', page: 'buy' as Page, color: '#3b82f6' },
              { icon: '◈', label: 'Ver billeteras', sub: 'Saldos y movimientos', page: 'wallets' as Page, color: '#8b5cf6' },
              { icon: '≡', label: 'Historial', sub: 'Todas tus operaciones', page: 'transactions' as Page, color: '#f59e0b' },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => navigate(item.page)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm shrink-0" style={{ background: item.color }}>
                  {item.icon}
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-slate-800">{item.label}</div>
                  <div className="text-[11px] text-slate-400">{item.sub}</div>
                </div>
                <span className="ml-auto text-slate-300">›</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Wallets + Recent transactions */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Wallets summary */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Billeteras</h3>
            <button onClick={() => navigate('wallets')} className="text-[12px] text-emerald-600 font-semibold hover:text-emerald-700">Ver todo →</button>
          </div>
          {cargando ? (
            <p className="py-6 text-center text-[13px] text-slate-400">Cargando billeteras…</p>
          ) : !clienteId ? (
            <p className="py-6 text-center text-[13px] text-slate-400">Seleccioná un cliente para ver tus saldos.</p>
          ) : billeteras.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400">Este cliente aún no tiene billeteras.</p>
          ) : (
            <div className="space-y-3">
              {billeteras.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{b.flag}</span>
                    <div>
                      <div className="text-[13px] font-semibold text-slate-800">{b.moneda_codigo}</div>
                      <div className="text-[11px] text-slate-400">{b.moneda_nombre}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-slate-800 text-[13px]">{saldoFormato(b)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent transactions: datos reales */}
        <OperacionesRecientes auth={auth} currentClient={currentClient} navigate={navigate} />
      </div>

      {/* Featured rates */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas destacadas</h3>
          <button onClick={() => navigate('rates')} className="text-[12px] text-emerald-600 font-semibold hover:text-emerald-700">Ver histórico →</button>
        </div>
        {tasas.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-400">Cargando tasas…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tasas.map(r => (
              <div key={r.moneda} className="rounded-lg border border-slate-100 p-3 text-center hover:border-emerald-200 hover:bg-emerald-50/30 transition-all cursor-pointer">
                <span className="text-xl">{r.flag}</span>
                <div className="font-bold text-slate-800 text-[13px] mt-1.5">{r.moneda}</div>
                <div className="font-mono text-[12px] text-slate-600 mt-0.5">₲ {r.venta.toLocaleString('es-PY')}</div>
                <div className={`text-[10px] font-semibold mt-1 ${r.cambio >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {r.cambio >= 0 ? '▲' : '▼'} {Math.abs(r.cambio).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Dashboard({ auth, currentClient, navigate }: DashboardProps) {
  if (auth.role === 'cashier') {
    return <CashierDashboard auth={auth} currentClient={currentClient} navigate={navigate} />
  }
  if (auth.role === 'admin') {
    return <AdminDashboard auth={auth} currentClient={currentClient} navigate={navigate} />
  }
  return <UserDashboard auth={auth} currentClient={currentClient} navigate={navigate} />
}
