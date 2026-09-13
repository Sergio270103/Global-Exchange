/**
 * Simulador de conversión de divisas conectado a la API Django.
 *
 * Calcula con la tasa vigente del día y la comisión de la categoría
 * del cliente (RF20–RF22) y muestra el desglose exigido por RF21,
 * sin concretar la operación.
 *
 * @module Simulator
 */
import { useEffect, useState } from 'react'
import { vigentes, type Cotizacion } from '@/services/cotizaciones'
import { simular, listarComisiones, type CategoriaCliente, type OperacionSimulada, type Simulacion } from '@/services/simulador'
import { type Page } from '@/types'

export interface SimulatorProps {
  navigate?: (p: Page) => void
}

const categorias: CategoriaCliente[] = ['MINORISTA', 'CORPORATIVO', 'VIP']

export default function Simulator({ navigate }: SimulatorProps) {
  const [tasas, setTasas] = useState<Cotizacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [comisiones, setComisiones] = useState<Record<string, number>>({})

  const [simFrom, setSimFrom] = useState('USD')
  const [simAmount, setSimAmount] = useState('1000')
  const [operacion, setOperacion] = useState<OperacionSimulada>('compra')
  const [categoria, setCategoria] = useState<CategoriaCliente>('MINORISTA')
  const [simResult, setSimResult] = useState<Simulacion | null>(null)
  const [simulando, setSimulando] = useState(false)
  const [simError, setSimError] = useState('')

  useEffect(() => {
    Promise.all([vigentes(), listarComisiones().catch(() => ({}))])
      .then(([t, c]) => {
        setTasas(t)
        setComisiones(c)
        if (t.length > 0 && !t.some(x => x.moneda === 'USD')) setSimFrom(t[0].moneda)
      })
      .catch(() => setError('No se pudieron cargar las tasas. Verificá que el backend esté corriendo.'))
      .finally(() => setCargando(false))
  }, [])

  const simulate = async () => {
    setSimError('')
    setSimulando(true)
    try {
      const r = await simular({ moneda: simFrom, monto: parseFloat(simAmount) || 0, operacion, categoria })
      setSimResult(r)
    } catch (err) {
      setSimResult(null)
      setSimError(err instanceof Error ? err.message : 'No se pudo simular.')
    } finally {
      setSimulando(false)
    }
  }

  const tickerRates = [...tasas, ...tasas, ...tasas]

  return (
    <div className="space-y-6 animate-fadein">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Simulador de conversión
        </h2>
        <p className="text-slate-500 text-[14px]">
          Calculá el tipo de cambio y las comisiones estimadas antes de realizar tu operación.
        </p>
      </div>

      {cargando ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 text-[14px]">
          Cargando tasas vigentes…
        </div>
      ) : error ? (
        <div role="alert" className="bg-white rounded-xl border border-red-100 shadow-sm p-10 text-center text-red-500 text-[14px]">
          {error}
        </div>
      ) : (
        <>
          <div className="relative border border-slate-100 bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="flex animate-ticker py-5">
              {tickerRates.map((r, i) => (
                <div key={i} className="flex items-center gap-4 mx-8 shrink-0">
                  <span className="text-2xl">{r.flag}</span>
                  <span className="text-slate-500 text-[15px] font-semibold">{r.moneda}</span>
                  <span className="text-slate-800 font-mono font-bold text-[16px]">₲ {r.venta.toLocaleString()}</span>
                  <span className="text-slate-200 mx-3 text-lg">|</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-8 h-fit">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="sim-from" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Tengo (origen)
                  </label>
                  <select
                    id="sim-from"
                    value={simFrom}
                    onChange={e => setSimFrom(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    {tasas.map(r => (
                      <option key={r.moneda} value={r.moneda}>
                        {r.flag} {r.moneda}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="sim-amount" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Monto
                  </label>
                  <input
                    id="sim-amount"
                    type="number"
                    min={0}
                    value={simAmount}
                    onChange={e => setSimAmount(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <span className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Operación
                  </span>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    {(['compra', 'venta'] as OperacionSimulada[]).map(op => (
                      <button
                        key={op}
                        onClick={() => setOperacion(op)}
                        className={`flex-1 py-2.5 text-sm font-semibold capitalize transition-colors ${operacion === op ? 'bg-[#0f3460] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        {op === 'compra' ? 'Comprar divisa' : 'Vender divisa'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="sim-cat" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Categoría del cliente
                  </label>
                  <select
                    id="sim-cat"
                    value={categoria}
                    onChange={e => setCategoria(e.target.value as CategoriaCliente)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    {categorias.map(c => (
                      <option key={c} value={c}>
                        {c.charAt(0) + c.slice(1).toLowerCase()}
                        {comisiones[c] !== undefined ? ` (${comisiones[c]}%)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[12px] text-slate-400 mb-4">
                {operacion === 'compra'
                  ? 'Comprás divisa: se aplica la tasa de venta.'
                  : 'Vendés divisa: se aplica la tasa de compra.'}{' '}
                El resultado se expresa en guaraníes.
              </p>

              <button
                onClick={simulate}
                disabled={simulando}
                className="w-full py-3 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
              >
                {simulando ? 'Simulando…' : 'Simular conversión'}
              </button>

              {simError && <p role="alert" className="mt-4 text-red-500 text-[13px]">{simError}</p>}

              {simResult && (
                <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-100 p-5 animate-fadein">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center mb-4">
                    <div>
                      <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Tasa</div>
                      <div className="font-mono font-bold text-slate-800">₲ {simResult.tasa_aplicada.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Bruto</div>
                      <div className="font-mono font-bold text-slate-800">₲ {simResult.monto_bruto_pyg.toLocaleString('es', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
                        Comisión ({simResult.comision_porcentaje}%)
                      </div>
                      <div className="font-mono font-bold text-slate-800">₲ {simResult.comision_pyg.toLocaleString('es', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">Total a recibir</div>
                      <div className="font-mono font-bold text-emerald-700 text-lg">₲ {simResult.monto_neto_pyg.toLocaleString('es', { maximumFractionDigits: 0 })}</div>
                    </div>
                  </div>

                  {navigate && (
                    <button
                      onClick={() => navigate('buy')}
                      className="w-full py-2.5 rounded-lg text-white font-semibold text-[14px] transition-colors hover:bg-emerald-600"
                      style={{ background: '#10b981' }}
                    >
                      Ir a Operar →
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="lg:col-span-1 rounded-2xl border border-slate-100 bg-white shadow-sm p-6 h-fit">
              <div className="flex items-center justify-between mb-5">
                <span className="text-slate-900 font-bold text-[16px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas del día</span>
                <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-slow inline-block" />
                  EN VIVO
                </span>
              </div>

              <div className="space-y-1">
                {tasas.slice(0, 5).map(r => (
                  <div key={r.moneda} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{r.flag}</span>
                      <div>
                        <div className="text-slate-900 text-[14px] font-bold">{r.moneda}</div>
                        <div className="text-slate-500 text-[12px]">{r.nombre}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-800 font-mono font-bold text-[14px]">₲ {r.venta.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
