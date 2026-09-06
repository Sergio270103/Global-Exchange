/**
 * Simulador de conversión de divisas.
 *
 * Permite simular operaciones de compra/venta seleccionando monedas y
 * monto, mostrando la tasa aplicada y el resultado estimado sin llegar a
 * concretar la operación.
 *
 * @module Simulator
 */
import { useState } from 'react'
import { exchangeRates } from '@/data/mockData'
import { type Page } from '@/types'

export interface SimulatorProps {
  navigate?: (p: Page) => void
}

export default function Simulator({ navigate }: SimulatorProps) {
  const [simFrom, setSimFrom] = useState('USD')
  const [simTo, setSimTo] = useState('PYG')
  const [simAmount, setSimAmount] = useState('1000')
  const [simResult, setSimResult] = useState<{ rate: number; converted: number; commission: number } | null>(null)

  const simulate = () => {
    const amount = parseFloat(simAmount) || 0
    const rate = exchangeRates.find(r => r.currency === simFrom)?.sell || 7650
    const converted = amount * rate
    const commission = converted * 0.001
    setSimResult({ rate, converted, commission })
  }

  // Triplicamos el array para asegurar que la animación infinita cubra toda la pantalla ancha
  const tickerRates = [...exchangeRates, ...exchangeRates, ...exchangeRates]

  return (
    <div className="space-y-6 animate-fadein">
      {/* 1. Encabezado de la página */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Simulador de conversión
        </h2>
        <p className="text-slate-500 text-[14px]">
          Calculá el tipo de cambio y las comisiones estimadas antes de realizar tu operación.
        </p>
      </div>

      {/* 2. Ticker (Sección corrediza) - Adaptado a tema claro y con mayor tamaño */}
      <div className="relative border border-slate-100 bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="flex animate-ticker py-5">
          {tickerRates.map((r, i) => (
            <div key={i} className="flex items-center gap-4 mx-8 shrink-0">
              <span className="text-2xl">{r.flag}</span>
              <span className="text-slate-500 text-[15px] font-semibold">{r.currency}</span>
              <span className="text-slate-800 font-mono font-bold text-[16px]">₲ {r.sell.toLocaleString()}</span>
              <span className={`text-[13px] font-bold ${r.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {r.change >= 0 ? '+' : ''}{r.change}%
              </span>
              <span className="text-slate-200 mx-3 text-lg">|</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Contenedor Grid para distribuir el espacio en Desktop */}
      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda: El Simulador (Ocupa 2/3 del espacio) */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-8 h-fit">
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Tengo (origen)
              </label>
              <select
                value={simFrom}
                onChange={e => setSimFrom(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                {exchangeRates.map(r => (
                  <option key={r.currency} value={r.currency}>
                    {r.flag} {r.currency}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Monto
              </label>
              <input
                type="number"
                value={simAmount}
                onChange={e => setSimAmount(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Recibo (destino)
              </label>
              <select
                value={simTo}
                onChange={e => setSimTo(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                <option value="PYG">🇵🇾 PYG</option>
                {exchangeRates
                  .filter(r => r.currency !== simFrom)
                  .map(r => (
                    <option key={r.currency} value={r.currency}>
                      {r.flag} {r.currency}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <button
            onClick={simulate}
            className="w-full py-3 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
          >
            Simular conversión
          </button>

          {/* Resultado de la simulación */}
          {simResult && (
            <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-100 p-5 animate-fadein">
              <div className="grid grid-cols-3 gap-4 text-center mb-4">
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
                    Tasa
                  </div>
                  <div className="font-mono font-bold text-slate-800">
                    ₲ {simResult.rate.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
                    Comisión
                  </div>
                  <div className="font-mono font-bold text-slate-800">
                    ₲ {simResult.commission.toLocaleString('es', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">
                    Total a recibir
                  </div>
                  <div className="font-mono font-bold text-emerald-700 text-lg">
                    ₲ {simResult.converted.toLocaleString('es', { maximumFractionDigits: 0 })}
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
          )}
        </div>

        {/* Columna Derecha: Tasas del Día (Ocupa 1/3 del espacio) - Adaptado a tema claro */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-100 bg-white shadow-sm p-6 h-fit">
          <div className="flex items-center justify-between mb-5">
            <span className="text-slate-900 font-bold text-[16px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas del día</span>
            <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-slow inline-block"/>
              EN VIVO
            </span>
          </div>
          
          <div className="space-y-1">
            {exchangeRates.slice(0, 5).map(r => (
              <div key={r.currency} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{r.flag}</span>
                  <div>
                    <div className="text-slate-900 text-[14px] font-bold">{r.currency}</div>
                    <div className="text-slate-500 text-[12px]">{r.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-800 font-mono font-bold text-[14px]">₲ {r.sell.toLocaleString()}</div>
                  <div className={`text-[11px] font-bold ${r.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {r.change >= 0 ? '▲' : '▼'} {Math.abs(r.change)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}