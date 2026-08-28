import { useState } from 'react'
import { notifications as initial } from '@/data/mockData'

const typeConfig: Record<string, { icon: string; color: string; bg: string }> = {
  rate: { icon: '📈', color: '#3b82f6', bg: '#eff6ff' },
  transaction: { icon: '💸', color: '#10b981', bg: '#f0fdf4' },
  invoice: { icon: '📄', color: '#f59e0b', bg: '#fffbeb' },
  system: { icon: '⚙️', color: '#8b5cf6', bg: '#faf5ff' },
}

export default function Notifications() {
  const [notifications, setNotifications] = useState(initial)
  const [filter, setFilter] = useState('Todas')

  const unread = notifications.filter(n => !n.read).length
  const filtered = filter === 'Todas' ? notifications : filter === 'No leídas' ? notifications.filter(n => !n.read) : notifications.filter(n => n.type === filter.toLowerCase())

  const markRead = (id: number) => setNotifications(n => n.map(x => x.id === id ? { ...x, read: true } : x))
  const markAllRead = () => setNotifications(n => n.map(x => ({ ...x, read: true })))
  const deleteNotif = (id: number) => setNotifications(n => n.filter(x => x.id !== id))

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fadein">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: notifications.length, color: '#0f3460' },
          { label: 'No leídas', value: unread, color: '#ef4444' },
          { label: 'Leídas', value: notifications.length - unread, color: '#10b981' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center">
            <div className="font-bold text-2xl" style={{ color: s.color, fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
            <div className="text-[12px] text-slate-400 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter + actions */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {['Todas', 'No leídas', 'Rate', 'Transaction', 'Invoice'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${filter === f ? 'bg-[#0f3460] text-white' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}
              >
                {f === 'Rate' ? '📈 Tasas' : f === 'Transaction' ? '💸 Operaciones' : f === 'Invoice' ? '📄 Facturas' : f}
              </button>
            ))}
          </div>
          <button onClick={markAllRead} className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
            ✓ Marcar todas como leídas
          </button>
        </div>
      </div>

      {/* Notifications list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center">
            <div className="text-5xl mb-4">🔔</div>
            <p className="text-slate-500 font-semibold">Sin notificaciones</p>
            <p className="text-slate-400 text-[13px] mt-1">No hay notificaciones en esta categoría</p>
          </div>
        ) : filtered.map(notif => {
          const cfg = typeConfig[notif.type] || typeConfig.system
          return (
            <div
              key={notif.id}
              className={`bg-white rounded-xl border shadow-sm p-5 flex items-start gap-4 transition-all hover:shadow-md ${!notif.read ? 'border-emerald-100' : 'border-slate-100'}`}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: cfg.bg }}>
                {cfg.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className={`text-[14px] font-semibold leading-tight ${!notif.read ? 'text-slate-900' : 'text-slate-600'}`} style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                    {notif.title}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!notif.read && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"/>}
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">{notif.time}</span>
                  </div>
                </div>
                <p className="text-slate-400 text-[13px] leading-relaxed">{notif.message}</p>
                <div className="flex items-center gap-3 mt-3">
                  {!notif.read && (
                    <button onClick={() => markRead(notif.id)} className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-700">
                      Marcar como leída
                    </button>
                  )}
                  <button onClick={() => deleteNotif(notif.id)} className="text-[12px] font-semibold text-slate-400 hover:text-red-400 ml-auto">
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
