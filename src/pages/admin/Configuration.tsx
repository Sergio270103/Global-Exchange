import { useState } from 'react'

export default function Configuration() {
  const [tab, setTab] = useState('currencies')
  const [currencies, setCurrencies] = useState([
    { code: 'USD', name: 'Dólar Americano', flag: '🇺🇸', active: true, decimal: 2 },
    { code: 'EUR', name: 'Euro', flag: '🇪🇺', active: true, decimal: 2 },
    { code: 'BRL', name: 'Real Brasileño', flag: '🇧🇷', active: true, decimal: 2 },
    { code: 'ARS', name: 'Peso Argentino', flag: '🇦🇷', active: true, decimal: 2 },
    { code: 'PYG', name: 'Guaraní Paraguayo', flag: '🇵🇾', active: true, decimal: 0 },
    { code: 'GBP', name: 'Libra Esterlina', flag: '🇬🇧', active: true, decimal: 2 },
    { code: 'CLP', name: 'Peso Chileno', flag: '🇨🇱', active: false, decimal: 0 },
    { code: 'COP', name: 'Peso Colombiano', flag: '🇨🇴', active: false, decimal: 0 },
  ])
  const [paymentMethods, setPaymentMethods] = useState([
    { id: 'transfer', name: 'Transferencia bancaria', icon: '🏦', active: true },
    { id: 'wallet', name: 'Billetera digital', icon: '◈', active: true },
    { id: 'card', name: 'Tarjeta de crédito/débito', icon: '💳', active: true },
    { id: 'qr', name: 'Pago por QR', icon: '⊞', active: true },
    { id: 'cash', name: 'Efectivo', icon: '💵', active: false },
  ])
  const [saved, setSaved] = useState(false)

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 3000) }

  const tabs = [
    { id: 'currencies', label: 'Monedas' },
    { id: 'payments', label: 'Métodos de pago' },
    { id: 'security', label: 'Seguridad' },
    { id: 'notifications', label: 'Notificaciones' },
  ]

  return (
    <div className="space-y-5 animate-fadein">
      {/* Tab nav */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-1.5 flex gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${tab === t.id ? 'bg-[#0f3460] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'currencies' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Monedas admitidas</h3>
              <p className="text-[12px] text-slate-400 mt-0.5">Activá o desactivá las monedas disponibles en la plataforma</p>
            </div>
            <button onClick={save} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold" style={{ background: '#10b981' }}>
              {saved ? '✓ Guardado' : 'Guardar cambios'}
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                {['Moneda', 'Nombre', 'Decimales', 'Estado'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {currencies.map(c => (
                <tr key={c.code} className="hover:bg-slate-50/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{c.flag}</span>
                      <span className="font-bold text-slate-900 text-[14px]">{c.code}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-slate-600">{c.name}</td>
                  <td className="px-5 py-3.5 text-[13px] font-mono text-slate-600">{c.decimal}</td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setCurrencies(prev => prev.map(x => x.code === c.code ? { ...x, active: !x.active } : x))}
                      className={`w-9 h-5 rounded-full transition-all duration-200 relative ${c.active ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${c.active ? 'left-[calc(100%-18px)]' : 'left-0.5'}`}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payments' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 text-[15px] mb-5" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Métodos de pago habilitados</h3>
          <div className="space-y-3">
            {paymentMethods.map(pm => (
              <div key={pm.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                <span className="text-2xl">{pm.icon}</span>
                <div className="flex-1">
                  <div className="font-semibold text-slate-800 text-[14px]">{pm.name}</div>
                </div>
                <button
                  onClick={() => setPaymentMethods(prev => prev.map(x => x.id === pm.id ? { ...x, active: !x.active } : x))}
                  className={`w-9 h-5 rounded-full transition-all duration-200 relative ${pm.active ? 'bg-emerald-500' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${pm.active ? 'left-[calc(100%-18px)]' : 'left-0.5'}`}/>
                </button>
              </div>
            ))}
          </div>
          <button onClick={save} className="mt-5 px-6 py-2.5 rounded-xl text-white text-[13px] font-semibold" style={{ background: '#10b981' }}>
            {saved ? '✓ Guardado' : 'Guardar cambios'}
          </button>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-4">
          {[
            { title: 'Autenticación de dos factores (2FA)', desc: 'Requiere verificación adicional al iniciar sesión', active: true },
            { title: 'Bloqueo automático de sesión', desc: 'Cierra sesión automáticamente tras 30 minutos de inactividad', active: true },
            { title: 'Alertas de inicio de sesión sospechoso', desc: 'Notifica cuando se detecta acceso desde dispositivo desconocido', active: true },
            { title: 'Límite de intentos de acceso', desc: 'Bloquea la cuenta tras 5 intentos fallidos', active: false },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-slate-800 text-[14px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{s.title}</div>
                <div className="text-[13px] text-slate-400 mt-0.5">{s.desc}</div>
              </div>
              <button className={`w-9 h-5 rounded-full transition-all duration-200 relative shrink-0 ${s.active ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${s.active ? 'left-[calc(100%-18px)]' : 'left-0.5'}`}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'notifications' && (
        <div className="space-y-4">
          {[
            { group: 'Operaciones', items: ['Compra de divisas confirmada', 'Venta de divisas confirmada', 'Transferencia realizada', 'Operación pendiente de confirmación'] },
            { group: 'Tasas', items: ['Variación mayor al 1% en cualquier divisa', 'Actualización manual de tasas por analista', 'Tasas fuera del horario habitual'] },
            { group: 'Sistema', items: ['Nuevas facturas electrónicas', 'Alertas de seguridad', 'Mantenimiento programado del sistema'] },
          ].map(section => (
            <div key={section.group} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h4 className="font-semibold text-slate-700 text-[13px] uppercase tracking-wider mb-4">{section.group}</h4>
              <div className="space-y-3">
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <span className="text-[14px] text-slate-700">{item}</span>
                    <div className="flex items-center gap-4">
                      {['App', 'Email'].map(channel => (
                        <label key={channel} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" defaultChecked={i < 2} className="w-3.5 h-3.5 accent-emerald-500"/>
                          <span className="text-[11px] text-slate-400 font-medium">{channel}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={save} className="px-6 py-2.5 rounded-xl text-white text-[13px] font-semibold" style={{ background: '#10b981' }}>
            {saved ? '✓ Guardado' : 'Guardar preferencias'}
          </button>
        </div>
      )}
    </div>
  )
}
