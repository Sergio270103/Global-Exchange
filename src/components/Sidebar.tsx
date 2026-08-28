import { type Page, type AuthUser } from '@/types'

interface SidebarItem {
  icon: string
  label: string
  page: Page
}

const userMenu: SidebarItem[] = [
  { icon: '⊞', label: 'Dashboard', page: 'dashboard' },
  { icon: '◈', label: 'Billeteras', page: 'wallets' },
  { icon: '↑↓', label: 'Comprar / Vender', page: 'buy' },
  { icon: '⋯', label: 'Pagos Digitales', page: 'payments' },
  { icon: '≡', label: 'Transacciones', page: 'transactions' },
  { icon: '⬜', label: 'Facturas', page: 'invoices' },
  { icon: '⬟', label: 'Cuentas Bancarias', page: 'banks' },
  { icon: '%', label: 'Tasas de Cambio', page: 'rates' },
  { icon: '🔔', label: 'Notificaciones', page: 'notifications' },
]

const analystMenu: SidebarItem[] = [
  { icon: '⊞', label: 'Dashboard', page: 'dashboard' },
  { icon: '%', label: 'Gestión de Tasas', page: 'analyst-rates' },
  { icon: '↗', label: 'Ganancias', page: 'analyst-earnings' },
  { icon: '≡', label: 'Transacciones', page: 'transactions' },
  { icon: '🔔', label: 'Notificaciones', page: 'notifications' },
]

const adminMenu: SidebarItem[] = [
  { icon: '⊞', label: 'Dashboard', page: 'dashboard' },
  { icon: '◎', label: 'Clientes', page: 'admin-clients' },
  { icon: '👤', label: 'Usuarios', page: 'admin-users' },
  { icon: '⛨', label: 'Roles y Permisos', page: 'admin-roles' },
  { icon: '◈', label: 'Monedas', page: 'admin-currencies' },
  { icon: '%', label: 'Tasas', page: 'admin-rates' },
  { icon: '⊟', label: 'Métodos de Pago', page: 'admin-payments' },
  { icon: '↗', label: 'Ganancias', page: 'admin-earnings' },
  { icon: '≡', label: 'Reportes', page: 'admin-reports' },
  { icon: '⚙', label: 'Configuración', page: 'admin-config' },
  { icon: '🔔', label: 'Notificaciones', page: 'notifications' },
]

interface SidebarProps {
  auth: AuthUser
  currentPage: Page
  navigate: (p: Page) => void
  onLogout: () => void
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ auth, currentPage, navigate, onLogout, collapsed, onToggle }: SidebarProps) {
  const menu = auth.role === 'admin' ? adminMenu : auth.role === 'analyst' ? analystMenu : userMenu

  const roleLabel = auth.role === 'admin' ? 'Administrador' : auth.role === 'analyst' ? 'Analista Cambiario' : 'Usuario'
  const roleBadgeColor = auth.role === 'admin' ? '#f59e0b' : auth.role === 'analyst' ? '#3b82f6' : '#10b981'

  return (
    <aside
      style={{ width: collapsed ? 64 : 256, backgroundColor: '#0a1628', transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)' }}
      className="flex flex-col h-screen shrink-0 relative z-20"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 gap-3 border-b border-white/5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-lg"
          style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          G
        </div>
        {!collapsed && (
          <div className="animate-fadein overflow-hidden">
            <div className="text-white font-semibold text-[15px] leading-tight whitespace-nowrap" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Global Exchange
            </div>
            <div className="text-white/40 text-[10px] uppercase tracking-widest whitespace-nowrap">Financial Platform</div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-white/30 hover:text-white/70 transition-colors p-1 rounded"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            {collapsed
              ? <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              : <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>}
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {menu.map((item) => {
          const active = currentPage === item.page
          return (
            <button
              key={item.page}
              onClick={() => navigate(item.page)}
              title={collapsed ? item.label : undefined}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150 group relative"
              style={{
                color: active ? '#10b981' : 'rgba(255,255,255,0.55)',
                backgroundColor: active ? 'rgba(16,185,129,0.1)' : 'transparent',
                borderRight: active ? '2px solid #10b981' : '2px solid transparent',
              }}
            >
              <span
                className="text-base shrink-0 w-5 text-center"
                style={{ color: active ? '#10b981' : 'rgba(255,255,255,0.4)' }}
              >
                {item.icon}
              </span>
              {!collapsed && (
                <span className="whitespace-nowrap overflow-hidden text-ellipsis font-medium animate-fadein" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {item.label}
                </span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 rounded bg-[#132952] text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {item.label}
                </div>
              )}
            </button>
          )
        })}
      </nav>

      {/* User profile */}
      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-3 px-1">
          <div
            className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold"
            style={{ background: `linear-gradient(135deg, ${roleBadgeColor}88, ${roleBadgeColor})` }}
          >
            {auth.name.charAt(0)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 animate-fadein">
              <div className="text-white text-[13px] font-semibold truncate">{auth.name}</div>
              <div className="text-[11px] font-medium" style={{ color: roleBadgeColor }}>{roleLabel}</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={onLogout}
              title="Cerrar sesión"
              className="text-white/30 hover:text-red-400 transition-colors p-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
