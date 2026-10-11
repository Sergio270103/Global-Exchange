/**
 * Simulador de conversión de divisas conectado a la API Django.
 *
 * Calcula con la tasa vigente del día y el precio final de la categoría
 * del cliente (RF20–RF22), sin mostrar el ajuste interno por separado.
 *
 * @module Simulator
 */
import { useEffect, useState } from 'react'
import { vigentes, type Cotizacion } from '@/services/cotizaciones'
import { listarMonedas } from '@/services/monedas'
import { simular, type OperacionSimulada, type Simulacion } from '@/services/simulador'
import { type ClienteActivo, type Currency, type Page } from '@/types'

export interface SimulatorProps {
  navigate?: (p: Page) => void
  currentClient?: ClienteActivo | null
}


export default function Simulator({ navigate, currentClient }: SimulatorProps) {
  const [tasas, setTasas] = useState<Cotizacion[]>([])
  const [monedas, setMonedas] = useState<Currency[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [simFrom, setSimFrom] = useState('USD')
  const [simTo, setSimTo] = useState('PYG')
  const [simAmount, setSimAmount] = useState('1000')
  const [operacion, setOperacion] = useState<OperacionSimulada>('compra')
  const [simResult, setSimResult] = useState<Simulacion | null>(null)
  const [simulando, setSimulando] = useState(false)
  const [simError, setSimError] = useState('')

  // Mismo universo operable que comprar/vender: vigentes ∩ catálogo de
  // activas (respaldo a vigentes si el catálogo falla). PYG siempre
  // disponible como destino.
  useEffect(() => {
    Promise.all([
      vigentes().catch(() => [] as Cotizacion[]),
      listarMonedas(true).catch(() => [] as Currency[]),
    ])
      .then(([t, cm]) => {
        setTasas(t)
        setMonedas(cm)
        const activas = new Set(cm.length > 0 ? cm.map(m => m.code) : t.map(x => x.moneda))
        const utiles = t.filter(x => activas.has(x.moneda)).map(x => x.moneda)
        setSimFrom(prev => (utiles.includes(prev) ? prev : utiles.includes('USD') ? 'USD' : utiles[0] ?? prev))
        setSimTo(prev => {
          const ops = [
            ...((cm.length === 0 || activas.has('PYG')) ? ['PYG'] : []),
            ...utiles,
          ].filter((x, i, a) => a.indexOf(x) === i)
          return ops.includes(prev) ? prev : ops[0] ?? prev
        })
        if (t.length === 0 && cm.length === 0) {
          setError('No se pudieron cargar las tasas. Verificá que el backend esté corriendo.')
        }
      })
      .catch(() => setError('No se pudieron cargar las tasas. Verificá que el backend esté corriendo.'))
      .finally(() => setCargando(false))
  }, [])

  const activas = new Set(monedas.length > 0 ? monedas.map(m => m.code) : tasas.map(t => t.moneda))
  const tasasUtiles = monedas.length > 0 ? tasas.filter(t => activas.has(t.moneda)) : tasas
  const sinTasa = (code: string): boolean =>
    monedas.length > 0
    && code !== 'PYG'
    && activas.has(code)
    && !tasasUtiles.some(t => t.moneda === code)
  const opcionesOrigen = [
    ...tasasUtiles.map(t => ({ moneda: t.moneda, nombre: t.nombre, flag: t.flag, sinTasa: false })),
    ...monedas.filter(m => sinTasa(m.code)).map(m => ({ moneda: m.code, nombre: m.name, flag: m.flag, sinTasa: true })),
  ]
  const opcionesDestino = [
    ...((monedas.length === 0 || activas.has('PYG'))
      ? [{ moneda: 'PYG', nombre: monedas.find(m => m.code === 'PYG')?.name ?? 'Guaraní', flag: '🇵🇾', sinTasa: false }]
      : []),
    ...tasasUtiles.filter(t => t.moneda !== simFrom).map(t => ({ moneda: t.moneda, nombre: t.nombre, flag: t.flag, sinTasa: false })),
    ...monedas.filter(m => m.code !== simFrom && sinTasa(m.code)).map(m => ({ moneda: m.code, nombre: m.name, flag: m.flag, sinTasa: true })),
  ]
  const decimalesDe = (codigo: string): number => {
    const encontrada = monedas.find(m => m.code === codigo)
    if (encontrada) return encontrada.decimals
    return codigo === 'PYG' ? 0 : 2
  }
  const simboloDe = (codigo: string): string =>
    monedas.find(m => m.code === codigo)?.symbol ?? (codigo === 'PYG' ? '₲' : '')

  /** Primera alternativa válida como destino distinto del origen. */
  const alternativaDestino = (origen: string): string => {
    const ops = [
      ...((monedas.length === 0 || activas.has('PYG')) ? ['PYG'] : []),
      ...tasasUtiles.map(t => t.moneda),
    ].filter((x, i, a) => x !== origen && a.indexOf(x) === i)
    return ops[0] ?? simTo
  }

  const parIgual = simFrom === simTo

  const simulate = async () => {
    setSimError('')
    setSimResult(null)
    if (parIgual) {
      setSimError('La moneda origen y destino deben ser distintas.')
      return
    }
    setSimulando(true)
    try {
      const r = await simular({
        moneda: simFrom,
        monto: parseFloat(simAmount) || 0,
        operacion,
        clienteId: currentClient?.id ?? 0,
        monedaContraparte: simTo,
      })
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
          Calculá el tipo de cambio y el precio final antes de realizar tu operación.
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
                    Moneda (origen)
                  </label>
                  <select
                    id="sim-from"
                    value={simFrom}
                    onChange={e => {
                      const nuevo = e.target.value
                      setSimFrom(nuevo)
                      if (nuevo === simTo) setSimTo(alternativaDestino(nuevo))
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    {opcionesOrigen.map(r => (
                      <option key={r.moneda} value={r.moneda} disabled={r.sinTasa}>
                        {r.flag} {r.moneda}{r.sinTasa ? ' (sin cotización)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="sim-to" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Moneda (destino)
                  </label>
                  <select
                    id="sim-to"
                    value={simTo}
                    onChange={e => setSimTo(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    {opcionesDestino.map(r => (
                      <option key={r.moneda} value={r.moneda} disabled={r.sinTasa}>
                        {r.flag} {r.moneda}{r.sinTasa ? ' (sin cotización)' : ''}
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
                  <span className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Categoría del cliente
                  </span>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                    {currentClient
                      ? 'Se aplica automáticamente según tu cliente.'
                      : 'Seleccioná un cliente para simular.'}
                  </div>
                </div>
              </div>

              <p className="text-[12px] text-slate-400 mb-4">
                {operacion === 'compra'
                  ? 'Comprás divisa: se aplica la tasa de venta.'
                  : 'Vendés divisa: se aplica la tasa de compra.'}{' '}
                El resultado se expresa en la moneda destino.
              </p>

              <button
                onClick={simulate}
                disabled={simulando || !currentClient || parIgual}
                title={parIgual ? 'La moneda origen y destino deben ser distintas.' : undefined}
                className="w-full py-3 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
              >
                {simulando ? 'Simulando…' : currentClient ? 'Simular conversión' : 'Seleccioná un cliente'}
              </button>

              {parIgual && (
                <p role="alert" className="mt-4 text-amber-600 text-[13px]">
                  La moneda origen y destino deben ser distintas.
                </p>
              )}
              {simError && <p role="alert" className="mt-4 text-red-500 text-[13px]">{simError}</p>}

              {simResult && (() => {
                const destino = simResult.moneda_contraparte
                const dec = decimalesDe(destino)
                const sim = simboloDe(destino)
                const total = simResult.monto_total.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec })
                const tasa = simResult.tasa_aplicada.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec })
                return (
                  <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-100 p-5 animate-fadein">
                    <div className="grid grid-cols-2 gap-4 text-center mb-4">
                      <div>
                        <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Tasa final</div>
                        <div className="font-mono font-bold text-slate-800">{sim ? `${sim} ` : ''}{tasa} <span className="text-slate-400">por 1 {simResult.moneda}</span></div>
                      </div>
                      <div>
                        <div className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">
                          Total a {simResult.total_tipo === 'pagar' ? 'pagar' : 'recibir'}
                        </div>
                        <div className="font-mono font-bold text-emerald-700 text-lg">
                          {sim ? `${sim} ` : ''}{total} {destino}
                        </div>
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
                )
              })()}
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
