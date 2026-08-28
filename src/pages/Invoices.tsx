import { invoices } from '@/data/mockData'

const statusStyle: Record<string, string> = {
  Aprobada: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Emitida: 'bg-blue-50 text-blue-700 border-blue-100',
  Rechazada: 'bg-red-50 text-red-600 border-red-100',
}

export default function Invoices() {
  return (
    <div className="space-y-5 animate-fadein">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total facturas', value: invoices.length, color: '#0f3460' },
          { label: 'Aprobadas', value: invoices.filter(i => i.status === 'Aprobada').length, color: '#10b981' },
          { label: 'Emitidas/Pendientes', value: invoices.filter(i => i.status === 'Emitida').length, color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="font-mono font-bold text-2xl" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Facturas electrónicas</h3>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">📥 PDF</button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">📊 Excel</button>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {['Número', 'Fecha', 'Cliente', 'Monto (PYG)', 'Transacción', 'Estado', 'Acciones'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {invoices.map(inv => (
              <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-4">
                  <span className="font-mono text-[13px] font-bold text-slate-800">{inv.id}</span>
                </td>
                <td className="px-5 py-4 text-[13px] text-slate-500">{inv.date}</td>
                <td className="px-5 py-4 text-[13px] font-medium text-slate-800">{inv.client}</td>
                <td className="px-5 py-4 font-mono font-semibold text-[13px] text-slate-800">₲ {inv.amount.toLocaleString('es')}</td>
                <td className="px-5 py-4">
                  <span className="font-mono text-[12px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{inv.trx}</span>
                </td>
                <td className="px-5 py-4">
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusStyle[inv.status]}`}>{inv.status}</span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <button className="text-[12px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors">📄 PDF</button>
                    <button className="text-[12px] font-semibold text-slate-500 hover:text-emerald-600 px-2 py-1 rounded hover:bg-emerald-50 transition-colors">✉️ Enviar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
