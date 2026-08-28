import { useState } from 'react'
import { editableRates } from '@/data/mockData'

type Rate = typeof editableRates[0] & { isDirty?: boolean }

export default function RatesManagement() {
  const [rates, setRates] = useState<Rate[]>(editableRates.map(r => ({ ...r })))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const setRate = (currency: string, field: 'buy' | 'sell', value: string) => {
    setRates(prev => prev.map(r => r.currency === currency ? { ...r, [field]: parseFloat(value) || 0, isDirty: true } : r))
    setSaved(false)
  }

  const saveRates = () => {
    setSaving(true)
    setTimeout(() => {
      setRates(prev => prev.map(r => ({
        ...r,
        isDirty: false,
        updatedAt: `${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} - 15 Ene 2024`,
        updatedBy: 'Juan Analista',
      })))
      setSaving(false)
      setSaved(true)
    }, 1000)
  }

  const dirtyCount = rates.filter(r => r.isDirty).length

  return (
    <div className="space-y-5 animate-fadein">
      {/* Info banner */}
      <div className="flex items-start gap-3 px-5 py-4 rounded-xl border border-amber-100 bg-amber-50">
        <span className="text-amber-500 text-xl shrink-0 mt-0.5">⚠️</span>
        <div>
          <p className="text-amber-800 font-semibold text-[14px]">Zona restringida — Analista Cambiario</p>
          <p className="text-amber-700 text-[13px] mt-0.5">Los cambios en las tasas afectan inmediatamente a todos los usuarios de la plataforma. Verificá los valores antes de guardar.</p>
        </div>
      </div>

      {/* Header with save */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div>
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Edición de tasas de cambio</h3>
          <p className="text-[12px] text-slate-400 mt-0.5">
            {dirtyCount > 0 ? <span className="text-amber-600 font-semibold">{dirtyCount} tasa(s) con cambios sin guardar</span> : 'Todas las tasas están actualizadas'}
          </p>
        </div>
        <div className="flex gap-3">
          {saved && (
            <div className="flex items-center gap-1.5 text-emerald-600 text-[13px] font-semibold animate-fadein">
              ✓ Guardado correctamente
            </div>
          )}
          <button
            onClick={saveRates}
            disabled={saving || dirtyCount === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
          >
            {saving ? '⏳ Guardando...' : '💾 Guardar cambios'}
            {dirtyCount > 0 && !saving && <span className="w-5 h-5 rounded-full bg-white text-[#0f3460] text-[10px] font-bold flex items-center justify-center">{dirtyCount}</span>}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {['Moneda', 'Precio de Compra (₲)', 'Precio de Venta (₲)', 'Spread', 'Última actualización', 'Actualizado por'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rates.map(rate => {
              const spread = rate.sell - rate.buy
              const spreadPct = ((spread / rate.buy) * 100).toFixed(2)
              return (
                <tr key={rate.currency} className={`transition-colors ${rate.isDirty ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{rate.flag}</span>
                      <div>
                        <div className="font-bold text-slate-900 text-[14px]">{rate.currency}</div>
                        <div className="text-slate-400 text-[11px]">{rate.name}</div>
                      </div>
                      {rate.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-1"/>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="relative max-w-[150px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[12px] font-semibold">₲</span>
                      <input
                        type="number"
                        value={rate.buy}
                        onChange={e => setRate(rate.currency, 'buy', e.target.value)}
                        className={`w-full pl-7 pr-3 py-2.5 rounded-lg border font-mono text-[14px] font-semibold text-slate-800 focus:outline-none focus:ring-2 transition-all ${rate.isDirty ? 'border-amber-300 bg-amber-50 focus:ring-amber-200' : 'border-slate-200 bg-white focus:ring-emerald-300'}`}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="relative max-w-[150px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[12px] font-semibold">₲</span>
                      <input
                        type="number"
                        value={rate.sell}
                        onChange={e => setRate(rate.currency, 'sell', e.target.value)}
                        className={`w-full pl-7 pr-3 py-2.5 rounded-lg border font-mono text-[14px] font-semibold text-slate-800 focus:outline-none focus:ring-2 transition-all ${rate.isDirty ? 'border-amber-300 bg-amber-50 focus:ring-amber-200' : 'border-slate-200 bg-white focus:ring-emerald-300'}`}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-[13px] font-mono font-semibold text-slate-700">₲ {spread.toLocaleString()}</div>
                    <div className="text-[11px] text-slate-400">{spreadPct}%</div>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-slate-500">{rate.updatedAt}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[9px] font-bold">
                        {rate.updatedBy.charAt(0)}
                      </div>
                      <span className="text-[12px] text-slate-600">{rate.updatedBy}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Audit log */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <h4 className="font-semibold text-slate-800 text-[14px] mb-4" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Registro de cambios recientes</h4>
        <div className="space-y-3">
          {[
            { time: '14:32', user: 'Juan Analista', action: 'Actualizó USD: Compra ₲7,580 → Venta ₲7,650' },
            { time: '14:30', user: 'Laura Operadora', action: 'Actualizó ARS: Compra ₲5.20 → Venta ₲5.80' },
            { time: '09:00', user: 'Juan Analista', action: 'Actualizó EUR: Compra ₲8,250 → Venta ₲8,340' },
            { time: 'Ayer 18:45', user: 'Juan Analista', action: 'Actualizó BRL: Compra ₲1,380 → Venta ₲1,420' },
          ].map((entry, i) => (
            <div key={i} className="flex items-center gap-3 text-[13px]">
              <span className="text-slate-300 font-mono text-[11px] w-20 shrink-0">{entry.time}</span>
              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-[9px] font-bold shrink-0">{entry.user.charAt(0)}</div>
              <span className="text-slate-500"><span className="text-slate-700 font-medium">{entry.user}</span> — {entry.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
