import { useState } from 'react'
import { type Page, type AuthUser } from '@/types'
import { notifications as mockNotifications, demoClients } from '@/data/mockData'

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  'cash-count': 'Arqueo de Caja', // 👈 Título para la página de arqueo
  wallets: 'Billeteras Digitales',
  buy: 'Comprar / Vender Divisas',
  sell: 'Vender Divisas',
  transactions: 'Historial de Transacciones',
  payments: 'Pagos Digitales',
  invoices: 'Facturas Electrónicas',
  banks: 'Cuentas Bancarias',
  rates: 'Tasas de Cambio',
  notifications: 'Notificaciones',
  'analyst-rates': 'Gestión de Tasas',
  'analyst-earnings': 'Ganancias y Análisis',
  'admin-clients': 'Gestión de Clientes',
  'admin-users': 'Gestión de Usuarios',
  'admin-roles': 'Roles y Permisos',
  'admin-currencies': 'Monedas Admitidas',
  'admin-rates': 'Tasas de Cambio',
  'admin-payments': 'Métodos de Pago',
  'admin-earnings': 'Ganancias',
  'admin-reports': 'Reportes',
  'admin-config': 'Configuración del Sistema',
}

interface NavbarProps {
  auth: AuthUser
  currentPage: Page
  navigate: (p: Page) => void
  onLogout: () => void
  currentClient: string
  setCurrentClient: (c: string) => void
}

export default function Navbar({ auth, currentPage, navigate, onLogout, currentClient, setCurrentClient }: NavbarProps) {
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [notifList, setNotifList] = useState(mockNotifications)

  const unread = notifList.filter(n => !n.read).length

  // Si está en el dashboard y el rol es cajero, muestra "Cajero" o "Panel Cajero"
  const title = (currentPage === 'dashboard' && auth.role === 'cashier')
    ? 'Cajero'
    : pageTitles[currentPage] || 'Panel'

  const markAllRead = () => setNotifList(n => n.map(x => ({ ...x, read: true })))

  const notifIcon: Record<string, string> = {
    rate: '📈',
    transaction: '💸',
    invoice: '📄',
    system: '⚙️',
  }

  // 👈 Se agrega la validación para mostrar 'Cajero' cuando auth.role es 'cashier'
  const roleLabel =
    auth.role === 'admin'
      ? 'Administrador'
      : auth.role === 'analyst'
      ? 'Analista'
      : auth.role === 'cashier'
      ? 'Cajero'
      : 'Usuario'

  const showClientSelector = auth.role === 'user'

  return (
    <header className="h-16 bg-white border-b border-slate-200/70 flex items-center px-6 gap-4 shrink-0 sticky top-0 z-10">
      {/* Page title */}
      <div className="flex-1">
        <h1 className="text-[17px] font-semibold text-slate-800" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {title}
        </h1>
        <div className="text-[11px] text-slate-400 font-medium mt-0.5">
          Lun, 15 Enero 2024 &nbsp;·&nbsp; 14:32
        </div>
      </div>

      {/* Client selector */}
      {showClientSelector && (
        <div className="relative">
<button
          aria-label="Cambiar cliente"
          onClick={() => { setShowClientDropdown(v => !v); setShowNotifications(false); setShowProfile(false) }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
          >
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Cliente</span>
            <span className="text-slate-800 font-semibold text-[13px] max-w-[140px] truncate">{currentClient}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-400">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {showClientDropdown && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 animate-fadein z-50">
              <div className="px-3 py-1.5 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Cambiar cliente</div>
              {demoClients.map(c => (
                <button
                  key={c}
                  onClick={() => { setCurrentClient(c); setShowClientDropdown(false) }}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    {c.charAt(0)}
                  </div>
                  <span className={`font-medium ${c === currentClient ? 'text-emerald-600' : 'text-slate-700'}`}>{c}</span>
                  {c === currentClient && (
                    <svg className="ml-auto text-emerald-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
      <div className="relative">
        <button
          aria-label="Notificaciones"
          onClick={() => { setShowNotifications(v => !v); setShowProfile(false); setShowClientDropdown(false) }}
          className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none animate-pulse-slow">
              {unread}
            </span>
          )}
        </button>
        {showNotifications && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-100 animate-fadein z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="font-semibold text-slate-800 text-sm" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Notificaciones</span>
              <button onClick={markAllRead} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Marcar todas como leídas</button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifList.slice(0, 5).map(n => (
                <div
                  key={n.id}
                  className={`flex gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-emerald-50/40' : ''}`}
                >
                  <div className="text-base shrink-0 mt-0.5">{notifIcon[n.type] || '🔔'}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-semibold leading-tight ${!n.read ? 'text-slate-800' : 'text-slate-600'}`}>{n.title}</div>
                    <div className="text-[12px] text-slate-400 mt-0.5 leading-snug">{n.message}</div>
                    <div className="text-[11px] text-slate-300 mt-1">{n.time}</div>
                  </div>
                  {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"/>}
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-slate-100">
              <button onClick={() => { navigate('notifications'); setShowNotifications(false) }} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium w-full text-center">
                Ver todas las notificaciones
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="relative">
        <button
          aria-label="Perfil de usuario"
          onClick={() => { setShowProfile(v => !v); setShowNotifications(false); setShowClientDropdown(false) }}
          className="flex items-center gap-2 hover:bg-slate-100 rounded-lg px-2 py-1.5 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy-600 to-emerald-500 flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #132952, #10b981)' }}>
            {auth.name.charAt(0)}
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-[13px] font-semibold text-slate-800 leading-tight">{auth.name.split(' ')[0]}</div>
            <div className="text-[11px] text-slate-400">{roleLabel}</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-400 hidden sm:block">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {showProfile && (
          <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 animate-fadein z-50">
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="text-[13px] font-semibold text-slate-800">{auth.name}</div>
              <div className="text-[12px] text-slate-400">{auth.email}</div>
            </div>
            <button className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors">
              <span>👤</span> Mi Perfil
            </button>
            <button className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors">
              <span>⚙️</span> Configuración
            </button>
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button onClick={onLogout} className="w-full text-left px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors">
                <span>↪</span> Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}