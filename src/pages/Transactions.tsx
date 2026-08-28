import { useState } from 'react'
import { transactions } from '@/data/mockData'
import { type AuthUser } from '@/types'

const statusStyle: Record<string, string> = {
  Completada: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Pendiente: 'bg-amber-50 text-amber-700 border-amber-100',
  Cancelada: 'bg-red-50 text-red-600 border-red-100',
  Anulada: 'bg-slate-100 text-slate-500 border-slate-200',
}

interface TransactionsProps { auth: AuthUser; currentClient: string }

export default function Transactions({ auth, currentClient }: TransactionsProps) {
  const [filterStatus, setFilterStatus] = useState('Todos')
  const [filterCurrency, setFilterCurrency] = useState('Todos')
  const [filterType, setFilterType] = useState('Todos')
  const [search, setSearch] = useState('')

  const filtered = transactions.filter(t => {
    if (filterStatus !== 'Todos' && t.status !== filterStatus) return false
    if (filterCurrency !== 'Todos' && t.currency !== filterCurrency) return false
    if (filterType !== 'Todos' && t.type !== filterType) return false
    if (search && !t.id.toLowerCase().includes(search.toLowerCase()) && !t.client.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const currencies = ['Todos', ...Array.from(new Set(transactions.map(t => t.currency)))]

  return (
    <div className="space-y-5 animate-fadein">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por ID o cliente..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-300 bg-slate-50"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Estado', value: filterStatus, set: setFilterStatus, options: ['Todos', 'Completada', 'Pendiente', 'Cancelada'] },
              { label: 'Tipo', value: filterType, set: setFilterType, options: ['Todos', 'Compra', 'Venta'] },
              { label: 'Moneda', value: filterCurrency, set: setFilterCurrency, options: currencies },
            ].map(f => (
              <select
                key={f.label}
                value={f.value}
                onChange={e => f.set(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                {f.options.map(o => <option key={o}>{o}</option>)}
              </select>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <span>📥</span> PDF
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <span>📊</span> Excel
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total operaciones', value: String(filtered.length), sub: 'filtradas' },
          { label: 'Completadas', value: String(filtered.filter(t => t.status === 'Completada').length), sub: `de ${filtered.length}` },
          { label: 'Monto total', value: `₲ ${filtered.reduce((acc, t) => acc + t.total, 0).toLocaleString('es')}`, sub: 'equivalente PYG' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{card.label}</div>
            <div className="font-mono font-bold text-slate-900 text-[18px]">{card.value}</div>
            <div className="text-[11px] text-slate-300 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['ID', 'Fecha', 'Cliente', 'Tipo', 'Moneda', 'Monto', 'Total (PYG)', 'Pago', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="text-3xl mb-3">🔍</div>
                    <p className="text-slate-500 font-medium">Sin resultados</p>
                    <p className="text-slate-400 text-[13px] mt-1">Probá con otros filtros</p>
                  </td>
                </tr>
              ) : filtered.map(trx => (
                <tr key={trx.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-[12px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{trx.id}</span>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-500 whitespace-nowrap">{trx.date}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        {trx.client.charAt(0)}
                      </div>
                      <span className="text-[13px] font-medium text-slate-800 whitespace-nowrap">{trx.client}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${trx.type === 'Compra' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                      {trx.type === 'Compra' ? '↑' : '↓'} {trx.type}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-slate-700 text-[13px]">{trx.currency}</span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[13px] text-slate-800 font-semibold">
                    {trx.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[13px] text-slate-600">
                    {trx.total.toLocaleString('es')}
                  </td>
                  <td className="px-4 py-3.5 text-[12px] text-slate-500">{trx.payment}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${statusStyle[trx.status]}`}>
                      {trx.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <button className="text-slate-300 hover:text-emerald-500 transition-colors text-[18px]">⋯</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/40">
          <span className="text-[12px] text-slate-400">{filtered.length} resultado(s)</span>
          <div className="flex gap-1">
            {[1, 2, 3].map(p => (
              <button key={p} className={`w-7 h-7 rounded text-[12px] font-semibold transition-colors ${p === 1 ? 'bg-[#0f3460] text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
