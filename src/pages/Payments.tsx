import { useState } from 'react'

const payments = [
  { id: 'PAG-001', date: '15 Ene 2024', client: 'Carlos Martínez', amount: 11370000, method: 'Transferencia bancaria', status: 'Pagada' },
  { id: 'PAG-002', date: '15 Ene 2024', client: 'Ana López', amount: 6672000, method: 'Billetera digital', status: 'Pagada' },
  { id: 'PAG-003', date: '14 Ene 2024', client: 'Pedro Silva', amount: 6900000, method: 'Transferencia bancaria', status: 'Pendiente' },
  { id: 'PAG-004', date: '14 Ene 2024', client: 'María García', amount: 15300000, method: 'Tarjeta', status: 'Pagada' },
  { id: 'PAG-005', date: '13 Ene 2024', client: 'Roberto Torres', amount: 9900000, method: 'Transferencia bancaria', status: 'Cancelada' },
  { id: 'PAG-006', date: '13 Ene 2024', client: 'Laura Díaz', amount: 3790000, method: 'QR', status: 'Pagada' },
]

const statusStyle: Record<string, string> = {
  Pagada: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Pendiente: 'bg-amber-50 text-amber-700 border-amber-100',
  Cancelada: 'bg-red-50 text-red-600 border-red-100',
  Anulada: 'bg-slate-100 text-slate-500 border-slate-200',
}

const methodIcon: Record<string, string> = {
  'Transferencia bancaria': '🏦',
  'Billetera digital': '◈',
  'Tarjeta': '💳',
  'QR': '⊞',
}

export default function Payments() {
  const [filter, setFilter] = useState('Todos')

  const filtered = filter === 'Todos' ? payments : payments.filter(p => p.status === filter)

  return (
    <div className="space-y-5 animate-fadein">
      {/* Method cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { id: 'transfer', name: 'Transferencia', icon: '🏦', count: payments.filter(p => p.method === 'Transferencia bancaria').length },
          { id: 'wallet', name: 'Billetera', icon: '◈', count: payments.filter(p => p.method === 'Billetera digital').length },
          { id: 'card', name: 'Tarjeta', icon: '💳', count: payments.filter(p => p.method === 'Tarjeta').length },
          { id: 'qr', name: 'QR', icon: '⊞', count: payments.filter(p => p.method === 'QR').length },
        ].map(m => (
          <div key={m.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
            <div className="text-2xl">{m.icon}</div>
            <div>
              <div className="font-mono font-bold text-slate-900 text-lg">{m.count}</div>
              <div className="text-[11px] text-slate-400">{m.name}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
        <span className="text-[12px] text-slate-400 font-semibold uppercase tracking-wider">Estado:</span>
        <div className="flex gap-2">
          {['Todos', 'Pagada', 'Pendiente', 'Cancelada', 'Anulada'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${filter === s ? 'bg-[#0f3460] text-white' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {['ID', 'Fecha', 'Cliente', 'Método de pago', 'Monto (PYG)', 'Estado', ''].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-4"><span className="font-mono text-[12px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{p.id}</span></td>
                <td className="px-5 py-4 text-[13px] text-slate-500">{p.date}</td>
                <td className="px-5 py-4 text-[13px] font-medium text-slate-800">{p.client}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span>{methodIcon[p.method]}</span>
                    <span className="text-[13px] text-slate-600">{p.method}</span>
                  </div>
                </td>
                <td className="px-5 py-4 font-mono font-semibold text-[13px] text-slate-800">₲ {p.amount.toLocaleString('es')}</td>
                <td className="px-5 py-4"><span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusStyle[p.status]}`}>{p.status}</span></td>
                <td className="px-5 py-4"><button className="text-slate-300 hover:text-emerald-500 transition-colors text-[18px]">⋯</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
