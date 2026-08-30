import { type AuthUser, type Page } from '@/types'
import { wallets, transactions, exchangeRates, earningsData } from '@/data/mockData'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import CashierDashboard from './cashier/CashierDashboard'

interface DashboardProps {
  auth: AuthUser
  currentClient: string
  navigate: (p: Page) => void
}

const portfolioData = earningsData.monthly.map(m => ({ month: m.month, value: m.total * 280 }))

const statusColor: Record<string, string> = {
  Completada: 'bg-emerald-50 text-emerald-700',
  Pendiente: 'bg-amber-50 text-amber-700',
  Cancelada: 'bg-red-50 text-red-600',
}

export default function Dashboard({ auth, currentClient, navigate }: DashboardProps) {
  if (auth.role === 'cashier') {
    return <CashierDashboard auth={auth} currentClient={currentClient} navigate={navigate} />
  }
  
  const totalPYG = wallets.reduce((acc, w) => {
    const rate = w.currency === 'PYG' ? 1 : exchangeRates.find(r => r.currency === w.currency)?.sell || 1
    return acc + w.balance * rate
  }, 0)

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  })()

  return (
    <div className="space-y-6 animate-fadein">
      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] text-slate-500 font-medium">{greeting},</h2>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{auth.name.split(' ')[0]} 👋</h1>
          {auth.role === 'user' && <p className="text-sm text-slate-400 mt-0.5">Cliente: <span className="text-slate-600 font-medium">{currentClient}</span></p>}
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('buy')} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
            + Nueva operación
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Saldo total', value: `₲ ${Math.round(totalPYG).toLocaleString('es')}`, sub: 'Equivalente en PYG', icon: '◈', color: '#0f3460', trend: '+2.4%' },
          { label: 'Operaciones', value: '127', sub: 'Último mes', icon: '↑↓', color: '#10b981', trend: '+12%' },
          { label: 'USD en cartera', value: `$ ${wallets.find(w => w.currency === 'USD')?.balance.toLocaleString('en')}`, sub: 'Billetera digital', icon: '🇺🇸', color: '#3b82f6', trend: '+0.42%' },
          { label: 'EUR en cartera', value: `€ ${wallets.find(w => w.currency === 'EUR')?.balance.toLocaleString('en')}`, sub: 'Billetera digital', icon: '🇪🇺', color: '#8b5cf6', trend: '-0.18%' },
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[22px]">{card.icon}</span>
              <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${card.trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                {card.trend}
              </span>
            </div>
            <div className="font-mono font-bold text-slate-900 text-lg leading-tight">{card.value}</div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">{card.label}</div>
            <div className="text-[11px] text-slate-300 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart + Quick actions */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Portfolio chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Evolución del portafolio</h3>
              <p className="text-slate-400 text-[12px] mt-0.5">Últimos 7 meses</p>
            </div>
            <select className="text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none">
              <option>7 meses</option>
              <option>3 meses</option>
              <option>1 mes</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={portfolioData}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.15}/>
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₲${(v/1000000).toFixed(1)}M`}/>
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                formatter={(v: unknown) => [`₲ ${(v as number).toLocaleString('es')}`, 'Portafolio']}
              />
              <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#portfolioGrad)"/>
            </AreaChart>
          </ResponsiveContainer>
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
          <div className="space-y-3">
            {wallets.map(w => (
              <div key={w.currency} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{w.flag}</span>
                  <div>
                    <div className="text-[13px] font-semibold text-slate-800">{w.currency}</div>
                    <div className={`text-[11px] font-medium ${w.change >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                      {w.change >= 0 ? '▲' : '▼'} {Math.abs(w.change)}%
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-slate-800 text-[13px]">{w.symbol} {w.balance.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Operaciones recientes</h3>
            <button onClick={() => navigate('transactions')} className="text-[12px] text-emerald-600 font-semibold hover:text-emerald-700">Ver todo →</button>
          </div>
          <div className="space-y-3">
            {transactions.slice(0, 5).map(trx => (
              <div key={trx.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${trx.type === 'Compra' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  {trx.type === 'Compra' ? '↑' : '↓'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-slate-800">{trx.type} {trx.currency}</div>
                  <div className="text-[11px] text-slate-400">{trx.id} · {trx.date}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-semibold text-slate-800 text-[13px]">{trx.amount.toLocaleString()} {trx.currency}</div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor[trx.status] || 'bg-slate-100 text-slate-500'}`}>
                    {trx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Featured rates */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas destacadas</h3>
          <button onClick={() => navigate('rates')} className="text-[12px] text-emerald-600 font-semibold hover:text-emerald-700">Ver histórico →</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {exchangeRates.map(r => (
            <div key={r.currency} className="rounded-lg border border-slate-100 p-3 text-center hover:border-emerald-200 hover:bg-emerald-50/30 transition-all cursor-pointer">
              <span className="text-xl">{r.flag}</span>
              <div className="font-bold text-slate-800 text-[13px] mt-1.5">{r.currency}</div>
              <div className="font-mono text-[12px] text-slate-600 mt-0.5">₲ {r.sell.toLocaleString()}</div>
              <div className={`text-[10px] font-semibold mt-1 ${r.change >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                {r.change >= 0 ? '▲' : '▼'} {Math.abs(r.change)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
