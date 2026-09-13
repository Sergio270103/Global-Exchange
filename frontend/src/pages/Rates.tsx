/**
 * Vista de tasas de cambio conectada a la API Django.
 *
 * - Todos los roles ven las tasas vigentes del día (RF31) y la
 *   evolución histórica con gráficos de líneas o barras (RF32),
 *   con consulta por rango de fechas (RF33).
 * - Solo el administrador y el analista cambiario pueden registrar
 *   tasas (RF41/RF47). Cada registro crea un punto nuevo en el
 *   historial (trazabilidad, RNF26): no se editan ni borran tasas.
 *
 * @module Rates
 */
import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Plus, X } from 'lucide-react'
import { type AuthUser } from '@/types'
import { vigentes, historial, crearCotizacion, type Cotizacion } from '@/services/cotizaciones'
import { listarMonedas } from '@/services/monedas'

const periods = ['Hoy', 'Semana', 'Mes', 'Año', 'Personalizado']
const chartTypes = ['Líneas', 'Barras']

/** Días hacia atrás que cubre cada período (excepto Personalizado). */
const diasPorPeriodo: Record<string, number> = { Hoy: 1, Semana: 7, Mes: 30, Año: 365 }

interface RatesProps {
  authUser?: AuthUser | null
}

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function Rates({ authUser }: RatesProps) {
  // 🔒 Solo admin o analista pueden registrar tasas.
  const userRole = authUser?.role?.toString().toLowerCase().trim() || ''
  const puedeEditar = userRole === 'admin' || userRole === 'administrador'
    || userRole === 'analyst' || userRole === 'analista'

  const [rates, setRates] = useState<Cotizacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const [period, setPeriod] = useState('Mes')
  const [chartType, setChartType] = useState('Líneas')
  const [filterCurrency, setFilterCurrency] = useState('Todos')
  const [puntos, setPuntos] = useState<Cotizacion[]>([])
  const [cargandoHist, setCargandoHist] = useState(false)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  // Modal de registro de tasa
  const [showModal, setShowModal] = useState(false)
  const [monedas, setMonedas] = useState<{ id: number; code: string; name: string }[]>([])
  const [formMoneda, setFormMoneda] = useState('')
  const [formCompra, setFormCompra] = useState('')
  const [formVenta, setFormVenta] = useState('')
  const [formError, setFormError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    vigentes()
      .then(data => {
        setRates(data)
        if (data.length > 0 && !data.some(r => r.moneda === selectedCurrency)) {
          setSelectedCurrency(data[0].moneda)
        }
      })
      .catch(() => setError('No se pudieron cargar las tasas. Verificá que el backend esté corriendo.'))
      .finally(() => setCargando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedCurrency) return
    setCargandoHist(true)
    let d: string | undefined
    let h: string | undefined
    if (period === 'Personalizado') {
      d = desde || undefined
      h = hasta || undefined
    } else {
      const dias = diasPorPeriodo[period] ?? 30
      const fin = new Date()
      const inicio = new Date()
      inicio.setDate(fin.getDate() - dias)
      d = fechaISO(inicio)
      h = fechaISO(fin)
    }
    historial(selectedCurrency, d, h)
      .then(setPuntos)
      .catch(() => setPuntos([]))
      .finally(() => setCargandoHist(false))
  }, [selectedCurrency, period, desde, hasta])

  const displayData = useMemo(
    () => puntos.map(p => ({
      date: new Date(p.vigente_desde).toLocaleDateString('es', { day: '2-digit', month: '2-digit' }),
      buy: p.compra,
      sell: p.venta,
    })),
    [puntos],
  )

  // Variación % entre el primer y el último punto del período.
  const variacion = (moneda: string): number => {
    if (moneda !== selectedCurrency || puntos.length < 2) return 0
    const primero = puntos[0].venta
    if (!primero) return 0
    return ((puntos[puntos.length - 1].venta - primero) / primero) * 100
  }

  const abrirModal = async (moneda?: string) => {
    setFormError('')
    setFormCompra('')
    setFormVenta('')
    try {
      const lista = await listarMonedas(true)
      setMonedas(lista.map(m => ({ id: m.id, code: m.code, name: m.name })))
      setFormMoneda(moneda ?? lista[0]?.code ?? '')
    } catch {
      setFormError('No se pudo cargar el catálogo de monedas.')
    }
    setShowModal(true)
  }

  const guardarTasa = async (e: React.FormEvent) => {
    e.preventDefault()
    const compra = Number(formCompra)
    const venta = Number(formVenta)
    if (!formMoneda || !compra || !venta) {
      setFormError('Completá moneda, compra y venta.')
      return
    }
    if (venta < compra) {
      setFormError('La venta no puede ser menor que la compra.')
      return
    }
    const monedaId = monedas.find(m => m.code === formMoneda)?.id
    if (!monedaId) {
      setFormError('Seleccioná una moneda válida.')
      return
    }
    setGuardando(true)
    try {
      const nueva = await crearCotizacion(monedaId, compra, venta)
      setRates(prev => {
        const resto = prev.filter(r => r.moneda !== nueva.moneda)
        return [...resto, nueva]
      })
      setSelectedCurrency(nueva.moneda)
      setShowModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo registrar la tasa.')
    } finally {
      setGuardando(false)
    }
  }

  const filteredRates = filterCurrency === 'Todos' ? rates : rates.filter(r => r.moneda === filterCurrency)
  const seleccionada = rates.find(r => r.moneda === selectedCurrency)

  return (
    <div className="space-y-6 animate-fadein">
      {/* Cards de Tasas */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas en tiempo real</h3>
            <p className="text-[12px] text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow inline-block" />
              Tasas vigentes del día (API)
            </p>
          </div>

          <div className="flex items-center gap-3">
            {puedeEditar && (
              <button
                onClick={() => abrirModal()}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg font-semibold text-[13px] transition-colors shadow-sm"
              >
                <Plus size={16} /> Nueva Tasa
              </button>
            )}

            <select value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none">
              <option value="Todos">Todas las monedas</option>
              {rates.map(r => <option key={r.moneda} value={r.moneda}>{r.moneda}</option>)}
            </select>
          </div>
        </div>

        {cargando ? (
          <div className="text-center text-slate-400 text-[14px] py-10">Cargando tasas…</div>
        ) : error ? (
          <div role="alert" className="text-center text-red-500 text-[14px] py-10">{error}</div>
        ) : filteredRates.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-5xl mb-4">💱</div>
            <p className="text-slate-500 text-[14px] mb-4">Todavía no hay cotizaciones registradas.</p>
            {puedeEditar && (
              <button onClick={() => abrirModal()} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700">
                Registrar la primera tasa
              </button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRates.map(r => {
              const change = variacion(r.moneda)
              return (
                <div
                  key={r.moneda}
                  onClick={() => setSelectedCurrency(r.moneda)}
                  className={`relative group rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedCurrency === r.moneda ? 'border-emerald-300 bg-emerald-50/30 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{r.flag}</span>
                      <div>
                        <div className="font-bold text-slate-900 text-[14px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{r.moneda}</div>
                        <div className="text-slate-400 text-[11px]">{r.nombre}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                        {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                      </span>

                      {puedeEditar && (
                        <button
                          onClick={(e) => { e.stopPropagation(); abrirModal(r.moneda) }}
                          className="px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-white rounded shadow-sm border border-emerald-200"
                          title="Registrar nueva tasa (crea un punto en el historial)"
                        >
                          Actualizar
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">COMPRA</div>
                      <div className="font-mono font-bold text-slate-800 text-[13px]">₲ {r.compra.toLocaleString()}</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-2.5">
                      <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">VENTA</div>
                      <div className="font-mono font-bold text-emerald-700 text-[13px]">₲ {r.venta.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-[10px] text-slate-300">Vigente desde {new Date(r.vigente_desde).toLocaleString('es')}</span>
                    {selectedCurrency === r.moneda && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Seleccionada ✓</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Gráfico histórico */}
      {seleccionada && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Evolución histórica — {selectedCurrency}
              </h3>
              <p className="text-[12px] text-slate-400 mt-0.5">Compra y venta en guaraníes</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {periods.map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${period === p ? 'bg-[#0f3460] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {chartTypes.map(ct => (
                  <button
                    key={ct}
                    onClick={() => setChartType(ct)}
                    className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${chartType === ct ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    {ct}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {period === 'Personalizado' && (
            <div className="flex gap-3 mb-4 flex-wrap">
              <label className="text-[12px] text-slate-500 font-semibold flex items-center gap-2">
                Desde
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-[12px]" />
              </label>
              <label className="text-[12px] text-slate-500 font-semibold flex items-center gap-2">
                Hasta
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-[12px]" />
              </label>
            </div>
          )}

          {cargandoHist ? (
            <div className="text-center text-slate-400 text-[13px] py-16">Cargando historial…</div>
          ) : displayData.length === 0 ? (
            <div className="text-center text-slate-400 text-[13px] py-16">Sin datos en este período.</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              {chartType === 'Líneas' ? (
                <LineChart data={displayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={Math.floor((displayData.length || 1) / 8)} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₲${v.toLocaleString()}`} width={80} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                    formatter={(v: unknown, name: unknown) => [`₲ ${(v as number).toLocaleString()}`, name === 'buy' ? 'Compra' : 'Venta']}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => v === 'buy' ? 'Compra' : 'Venta'} />
                  <Line type="monotone" dataKey="buy" stroke="#0f3460" strokeWidth={2} dot={false} name="buy" />
                  <Line type="monotone" dataKey="sell" stroke="#10b981" strokeWidth={2} dot={false} name="sell" />
                </LineChart>
              ) : (
                <BarChart data={displayData.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₲${v.toLocaleString()}`} width={80} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                    formatter={(v: unknown, name: unknown) => [`₲ ${(v as number).toLocaleString()}`, name === 'buy' ? 'Compra' : 'Venta']}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => v === 'buy' ? 'Compra' : 'Venta'} />
                  <Bar dataKey="buy" fill="#0f3460" radius={[4, 4, 0, 0]} name="buy" />
                  <Bar dataKey="sell" fill="#10b981" radius={[4, 4, 0, 0]} name="sell" />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}

          <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-100">
            {[
              { label: 'Compra actual', value: `₲ ${(seleccionada.compra || 0).toLocaleString()}` },
              { label: 'Venta actual', value: `₲ ${(seleccionada.venta || 0).toLocaleString()}` },
              { label: 'Mín. del período', value: `₲ ${displayData.length ? Math.min(...displayData.map(d => d.buy)).toLocaleString() : 0}` },
              { label: 'Máx. del período', value: `₲ ${displayData.length ? Math.max(...displayData.map(d => d.sell)).toLocaleString() : 0}` },
            ].map(stat => (
              <div key={stat.label}>
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{stat.label}</div>
                <div className="font-mono font-bold text-slate-800 text-[14px]">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de registro */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl border border-slate-100 p-6 space-y-4 animate-fadein max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-[16px]">Registrar tasa</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={guardarTasa} className="space-y-3.5">
              <div>
                <label htmlFor="rate-currency" className="text-[11px] font-semibold text-slate-500 uppercase">Moneda</label>
                <select
                  id="rate-currency"
                  required
                  value={formMoneda}
                  onChange={e => setFormMoneda(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500 bg-white"
                >
                  <option value="">Seleccionar…</option>
                  {monedas.map(m => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rate-buy" className="text-[11px] font-semibold text-slate-500 uppercase">Compra (₲)</label>
                  <input
                    id="rate-buy"
                    type="number"
                    required
                    min={0}
                    placeholder="7400"
                    value={formCompra}
                    onChange={e => setFormCompra(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="rate-sell" className="text-[11px] font-semibold text-slate-500 uppercase">Venta (₲)</label>
                  <input
                    id="rate-sell"
                    type="number"
                    required
                    min={0}
                    placeholder="7500"
                    value={formVenta}
                    onChange={e => setFormVenta(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <p className="text-[12px] text-slate-400">Cada registro crea un punto nuevo en el historial con tu usuario y la fecha (trazabilidad).</p>
              {formMoneda && rates.some(r => r.moneda === formMoneda) && (
                <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {formMoneda} ya tiene tasa vigente
                  (C ₲ {(rates.find(r => r.moneda === formMoneda)?.compra ?? 0).toLocaleString()} / V ₲ {(rates.find(r => r.moneda === formMoneda)?.venta ?? 0).toLocaleString()}):
                  al guardar se agrega un punto nuevo al historial, no se duplica la moneda.
                </p>
              )}
              {formError && <p role="alert" className="text-red-500 text-[12px]">{formError}</p>}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60"
                >
                  {guardando ? 'Guardando…' : 'Registrar tasa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
