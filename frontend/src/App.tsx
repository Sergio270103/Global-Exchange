/**
 * Componente raíz de la aplicación Global Exchange.
 *
 * Administra el ciclo de vida de la sesión de Keycloak, el estado del
 * usuario autenticado y la página activa. Según el rol del usuario se
 * renderiza el dashboard correspondiente (usuario, cajero, analista
 * cambiario o administrador) dentro de un layout común.
 *
 * @module App
 */
import { useState, useEffect } from 'react'
import keycloak, { initKeycloak } from './keycloak'
import { type AuthUser, type Page, type Role } from './types'

import Layout from './components/Layout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Wallets from './pages/Wallets'
import BuySell from './pages/BuySell'
import Transactions from './pages/Transactions'
import Rates from './pages/Rates'
import Notifications from './pages/Notifications'
import Simulator from './pages/Simulator'
import Invoices from './pages/Invoices'
import Payments from './pages/Payments'
import Banks from './pages/Banks'
import CashierDashboard from './pages/cashier/CashierDashboard'
import CashCountView from './pages/cashier/CashCountView'
import RatesManagement from './pages/analyst/RatesManagement'
import Earnings from './pages/analyst/Earnings'

import Clients from './pages/admin/Clients'
import Users from './pages/admin/Users'
import RolesPermissions from './pages/admin/RolesPermissions'
import Configuration from './pages/admin/Configuration'
import Currencies from './pages/admin/Currencies'

/**
 * Convierte los datos del token de Keycloak en un usuario autenticado.
 *
 * Determina el rol de la aplicación a partir de los roles del realm
 * (`admin`, `analyst`, `cashier`) presentes en el token. Si no coincide
 * con ninguno, se asigna el rol `user`.
 *
 * @param tokenParsed - Datos decodificados del token de acceso de Keycloak.
 * @returns Usuario autenticado mapeado desde el token.
 */
function mapKeycloakUser(tokenParsed: any): AuthUser {
  const roles: string[] = tokenParsed?.realm_access?.roles ?? []

  const role: Role = roles.includes('admin')
    ? 'admin'
    : roles.includes('analyst')
    ? 'analyst'
    : roles.includes('cashier')
    ? 'cashier'
    : 'user'

  const name = tokenParsed?.name ?? tokenParsed?.preferred_username ?? 'Usuario'

  return {
    name,
    email: tokenParsed?.email ?? '',
    role,
    avatar: tokenParsed?.picture ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0f3460&color=fff`,
    tipoPersona: tokenParsed?.tipo_persona ?? '',
  }
}

/**
 * Componente principal de la aplicación.
 *
 * - Inicializa la sesión de Keycloak al montar el componente.
 * - Muestra la landing pública mientras no haya usuario autenticado.
 * - Renderiza el dashboard y navegación correspondientes al rol del
 *   usuario autenticado dentro de un {@link Layout} compartido.
 *
 * @returns la interfaz de la aplicación según el estado de autenticación.
 */
export default function App() {
  const [keycloakReady, setKeycloakReady] = useState(false)
  const [auth, setAuth] = useState<AuthUser | null>(null)
  const [page, setPage] = useState<Page>('landing')
  const [currentClient, setCurrentClient] = useState('Carlos Martínez')

  const navigate = (p: Page) => setPage(p)

  const onLogout = () => {
    keycloak.logout({
      redirectUri: window.location.origin,
    })
  }

  useEffect(() => {
    initKeycloak()
      .then((authenticated) => {
        if (authenticated) {
          setAuth(mapKeycloakUser(keycloak.tokenParsed))
          setPage('dashboard')
        }
      })
      .catch(err => console.error('Error inicializando Keycloak', err))
      .finally(() => setKeycloakReady(true))
  }, [])

  if (!keycloakReady) {
    return <div>Cargando...</div>
  }

  // Public pages
  if (!auth) {
    return <Landing navigate={navigate} />
  }
  
  // Authenticated layout
  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return auth.role === 'cashier' ? (
          <CashierDashboard auth={auth} currentClient={currentClient} navigate={navigate} />
        ) : (
          <Dashboard auth={auth} currentClient={currentClient} navigate={navigate} />
        )
      case 'cash-count':
        return <CashCountView /> // 👈 Pestaña de Arqueo y Dinero Recibido
      case 'wallets':
        return <Wallets navigate={navigate} />
      case 'buy':
      case 'sell':
        return <BuySell auth={auth} currentClient={currentClient} />
      case 'transactions':
        return <Transactions auth={auth} currentClient={currentClient} />
      case 'rates':
      case 'admin-rates':
        return <Rates authUser={auth} />
      case 'notifications':
        return <Notifications />
      case 'simulator':
        return <Simulator />
      case 'invoices':
        return <Invoices />
      case 'payments':
      case 'admin-payments':
        return <Payments />
      case 'banks':
        return <Banks />
      // Analyst
      case 'analyst-rates':
        return <RatesManagement />
      case 'analyst-earnings':
      case 'admin-earnings':
        return <Earnings />
      // Admin
      case 'admin-clients':
        return <Clients />
      case 'admin-users':
        return <Users />
      case 'admin-currencies':
        return <Currencies auth={auth} />
      case 'admin-reports':
        return <ReportsPlaceholder />
      case 'admin-config':
        return <Configuration />
      default:
        return <Dashboard auth={auth} currentClient={currentClient} navigate={navigate} />
    }
  }

  return (
    <Layout
      auth={auth}
      currentPage={page}
      navigate={navigate}
      onLogout={onLogout}
      currentClient={currentClient}
      setCurrentClient={setCurrentClient}
    >
      {renderPage()}
    </Layout>
  )
}


function ReportsPlaceholder() {
  return (
    <div className="space-y-4 animate-fadein">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-semibold text-slate-800 text-[15px] mb-5" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Reportes del sistema</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: '📊', title: 'Reporte de transacciones', desc: 'Histórico completo de operaciones del período' },
            { icon: '💰', title: 'Reporte de ganancias', desc: 'Análisis de ingresos por divisa y período' },
            { icon: '👥', title: 'Reporte de clientes', desc: 'Actividad y operaciones por cliente' },
            { icon: '📈', title: 'Evolución de tasas', desc: 'Histórico completo de tasas de cambio' },
            { icon: '📄', title: 'Reporte de facturas', desc: 'Estado y detalle de facturación electrónica' },
            { icon: '🔐', title: 'Reporte de accesos', desc: 'Log de actividad y auditoría del sistema' },
          ].map(r => (
            <div key={r.title} className="rounded-xl border border-slate-100 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer">
              <div className="text-3xl mb-3">{r.icon}</div>
              <div className="font-semibold text-slate-900 text-[14px] mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{r.title}</div>
              <div className="text-[12px] text-slate-400 mb-4">{r.desc}</div>
              <div className="flex gap-2">
                <button className="flex-1 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">📥 PDF</button>
                <button className="flex-1 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">📊 Excel</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}