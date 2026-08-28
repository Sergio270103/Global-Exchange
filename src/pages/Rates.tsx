import { useState } from 'react'
import { exchangeRates, historicalRates } from '@/data/mockData'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const periods = ['Hoy', 'Semana', 'Mes', 'Año', 'Personalizado']
const chartTypes = ['Líneas', 'Barras']

export default function Rates() {
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const [period, setPeriod] = useState('Mes')
  const [chartType, setChartType] = useState('Líneas')
  const [filterCurrency, setFilterCurrency] = useState('Todos')

  const rateData = historicalRates[selectedCurrency] || historicalRates['USD']
  const displayData = rateData.slice(
    period === 'Hoy' ? 29 : period === 'Semana' ? 23 : period === 'Mes' ? 0 : 0
  )

  const filteredRates = filterCurrency === 'Todos' ? exchangeRates : exchangeRates.filter(r => r.currency === filterCurrency)

  return (
    <div className="space-y-6 animate-fadein">
      {/* Rate cards */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas en tiempo real</h3>
            <p className="text-[12px] text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow inline-block"/>
              Actualizadas el Lun, 15 Enero 2024 · 14:32
            </p>
          </div>
          <select value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none">
            <option value="Todos">Todas las monedas</option>
            {exchangeRates.map(r => <option key={r.currency} value={r.currency}>{r.currency}</option>)}
          </select>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRates.map(r => (
            <div
              key={r.currency}
              onClick={() => setSelectedCurrency(r.currency)}
              className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedCurrency === r.currency ? 'border-emerald-300 bg-emerald-50/30 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{r.flag}</span>
                  <div>
                    <div className="font-bold text-slate-900 text-[14px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{r.currency}</div>
                    <div className="text-slate-400 text-[11px]">{r.name}</div>
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                  {r.change >= 0 ? '▲' : '▼'} {Math.abs(r.change)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">COMPRA</div>
                  <div className="font-mono font-bold text-slate-800 text-[13px]">₲ {r.buy.toLocaleString()}</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">VENTA</div>
                  <div className="font-mono font-bold text-emerald-700 text-[13px]">₲ {r.sell.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[10px] text-slate-300">Act. {r.updatedAt}</span>
                {selectedCurrency === r.currency && (
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Seleccionada ✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Historical chart */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Evolución histórica — {selectedCurrency}
            </h3>
            <p className="text-[12px] text-slate-400 mt-0.5">Compra y venta en guaraníes</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {/* Period filter */}
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
            {/* Chart type */}
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

        <ResponsiveContainer width="100%" height={280}>
          {chartType === 'Líneas' ? (
            <LineChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={Math.floor(displayData.length / 8)}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₲${v.toLocaleString()}`} width={80}/>
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                formatter={(v: unknown, name: unknown) => [`₲ ${(v as number).toLocaleString()}`, name === 'buy' ? 'Compra' : 'Venta']}
              />
              <Legend iconType="circle" iconSize={8} formatter={(v) => v === 'buy' ? 'Compra' : 'Venta'}/>
              <Line type="monotone" dataKey="buy" stroke="#0f3460" strokeWidth={2} dot={false} name="buy"/>
              <Line type="monotone" dataKey="sell" stroke="#10b981" strokeWidth={2} dot={false} name="sell"/>
            </LineChart>
          ) : (
            <BarChart data={displayData.slice(-14)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₲${v.toLocaleString()}`} width={80}/>
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                formatter={(v: unknown, name: unknown) => [`₲ ${(v as number).toLocaleString()}`, name === 'buy' ? 'Compra' : 'Venta']}
              />
              <Legend iconType="circle" iconSize={8} formatter={(v) => v === 'buy' ? 'Compra' : 'Venta'}/>
              <Bar dataKey="buy" fill="#0f3460" radius={[4, 4, 0, 0]} name="buy"/>
              <Bar dataKey="sell" fill="#10b981" radius={[4, 4, 0, 0]} name="sell"/>
            </BarChart>
          )}
        </ResponsiveContainer>

        {/* Stats below chart */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-100">
          {[
            { label: 'Compra actual', value: `₲ ${(exchangeRates.find(r => r.currency === selectedCurrency)?.buy || 0).toLocaleString()}` },
            { label: 'Venta actual', value: `₲ ${(exchangeRates.find(r => r.currency === selectedCurrency)?.sell || 0).toLocaleString()}` },
            { label: 'Mín. del período', value: `₲ ${Math.min(...displayData.map(d => d.buy)).toLocaleString()}` },
            { label: 'Máx. del período', value: `₲ ${Math.max(...displayData.map(d => d.sell)).toLocaleString()}` },
          ].map(stat => (
            <div key={stat.label}>
              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{stat.label}</div>
              <div className="font-mono font-bold text-slate-800 text-[14px]">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
