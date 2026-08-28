import { earningsData } from '@/data/mockData'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const RADIAN = Math.PI / 180
const renderCustomLabel = (props: Record<string, unknown>) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props as { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number }
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return percent > 0.05 ? (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  ) : null
}

export default function Earnings() {
  const latestMonth = earningsData.monthly[earningsData.monthly.length - 1]
  const prevMonth = earningsData.monthly[earningsData.monthly.length - 2]
  const growth = (((latestMonth.total - prevMonth.total) / prevMonth.total) * 100).toFixed(1)

  return (
    <div className="space-y-6 animate-fadein">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Ganancia total', value: `₲ ${(latestMonth.total * 1000).toLocaleString('es')}`, growth: `+${growth}%`, color: '#0f3460' },
          { label: 'USD', value: `₲ ${(latestMonth.usd * 1000).toLocaleString('es')}`, growth: '+4.2%', color: '#10b981', flag: '🇺🇸' },
          { label: 'EUR', value: `₲ ${(latestMonth.eur * 1000).toLocaleString('es')}`, growth: '-1.1%', color: '#3b82f6', flag: '🇪🇺' },
          { label: 'BRL', value: `₲ ${(latestMonth.brl * 1000).toLocaleString('es')}`, growth: '+7.8%', color: '#f59e0b', flag: '🇧🇷' },
          { label: 'PYG', value: `₲ ${(latestMonth.pyg * 1000).toLocaleString('es')}`, growth: '+2.1%', color: '#8b5cf6', flag: '🇵🇾' },
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-base">{card.flag || '💰'}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${card.growth.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                {card.growth}
              </span>
            </div>
            <div className="font-mono font-bold text-slate-900 text-[15px] leading-tight">{card.value}</div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">{card.label} — Ene 2024</div>
          </div>
        ))}
      </div>

      {/* Bar + Line charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Monthly bar chart */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 text-[15px] mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Ganancias mensuales por divisa</h3>
          <p className="text-[12px] text-slate-400 mb-5">Julio 2023 — Enero 2024 (en miles de ₲)</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={earningsData.monthly} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}k`}/>
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(v: unknown) => [`₲ ${((v as number) * 1000).toLocaleString('es')}`, '']}
              />
              <Legend iconType="circle" iconSize={8}/>
              <Bar dataKey="usd" stackId="a" fill="#10b981" name="USD" radius={[0, 0, 0, 0]}/>
              <Bar dataKey="eur" stackId="a" fill="#3b82f6" name="EUR"/>
              <Bar dataKey="brl" stackId="a" fill="#f59e0b" name="BRL"/>
              <Bar dataKey="pyg" stackId="a" fill="#8b5cf6" name="PYG" radius={[4, 4, 0, 0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line chart - total */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 text-[15px] mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Evolución de ganancias totales</h3>
          <p className="text-[12px] text-slate-400 mb-5">Tendencia acumulada (en miles de ₲)</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={earningsData.monthly}>
              <defs>
                <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.2}/>
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}k`}/>
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(v: unknown) => [`₲ ${((v as number) * 1000).toLocaleString('es')}`, 'Ganancia']}
              />
              <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} name="Total"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie chart + stats */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 text-[15px] mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Distribución por divisa</h3>
          <p className="text-[12px] text-slate-400 mb-4">Enero 2024</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={earningsData.byCurrency} cx="50%" cy="50%" outerRadius={80} dataKey="value" labelLine={false} label={renderCustomLabel as never}>
                {earningsData.byCurrency.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
              </Pie>
              <Tooltip formatter={(v: unknown) => [`${v}%`, '']}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {earningsData.byCurrency.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}/>
                  <span className="text-[13px] font-medium text-slate-700">{item.name}</span>
                </div>
                <span className="font-mono font-bold text-[13px] text-slate-800">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 text-[15px] mb-5" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Métricas clave del período</h3>
          <div className="grid grid-cols-2 gap-5">
            {[
              { label: 'Ganancia promedio mensual', value: `₲ ${((earningsData.monthly.reduce((a, m) => a + m.total, 0) / earningsData.monthly.length) * 1000).toLocaleString('es', { maximumFractionDigits: 0 })}`, icon: '📊' },
              { label: 'Mes más rentable', value: 'Diciembre 2023', sub: '₲ 8,900,000', icon: '🏆' },
              { label: 'Crecimiento vs. mes anterior', value: `+${growth}%`, icon: '📈', positive: true },
              { label: 'Operaciones procesadas', value: '1,247', sub: 'este mes', icon: '💸' },
              { label: 'Ticket promedio', value: '₲ 5,136,000', sub: 'por operación', icon: '🎯' },
              { label: 'Margen de spread promedio', value: '0.92%', sub: 'sobre todas las divisas', icon: '⚖️' },
            ].map((kpi, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-slate-50">
                <span className="text-xl shrink-0">{kpi.icon}</span>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{kpi.label}</div>
                  <div className={`font-mono font-bold text-[15px] ${(kpi as { positive?: boolean }).positive ? 'text-emerald-600' : 'text-slate-900'}`}>{kpi.value}</div>
                  {(kpi as { sub?: string }).sub && <div className="text-[11px] text-slate-400 mt-0.5">{(kpi as { sub?: string }).sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
