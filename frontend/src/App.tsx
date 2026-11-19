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
import { type AuthUser, type Page, type Role, type ClienteActivo } from './types'
import { borrarPagina, guardarPagina, leerPagina } from './utils/paginaGuardada'

import Layout from './components/Layout'
import RetornoPago from './components/RetornoPago'
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
import CashDeliveries from './pages/admin/CashDeliveries'
import RatesManagement from './pages/analyst/RatesManagement'
import Earnings from './pages/analyst/Earnings'
import Reports from './pages/admin/Reports'

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
  const [currentClient, setCurrentClient] = useState<ClienteActivo | null>(null)
  // Retorno desde Stripe Checkout (`?pago=exito|cancelado&op={id}`).
  const [retorno, setRetorno] = useState<{ resultado: 'exito' | 'cancelado'; opId: number } | null>(null)

  // Al recargar se vuelve a la pantalla donde estaba (ver utils/paginaGuardada).
  const navigate = (p: Page) => {
    setPage(p)
    if (auth) guardarPagina(p, auth.role)
  }

  const onLogout = () => {
    borrarPagina()
    keycloak.logout({
      redirectUri: window.location.origin,
    })
  }

  useEffect(() => {
    initKeycloak()
      .then((authenticated) => {
        if (authenticated) {
          const usuario = mapKeycloakUser(keycloak.tokenParsed)
          setAuth(usuario)
          setPage(leerPagina(usuario.role) ?? 'dashboard')
        }
      })
      .catch(err => console.error('Error inicializando Keycloak', err))
      .finally(() => setKeycloakReady(true))

    // Retorno del pago: se limpia la URL para no reprocesarlo.
    const qs = new URLSearchParams(window.location.search)
    const pago = qs.get('pago')
    const op = Number(qs.get('op'))
    if ((pago === 'exito' || pago === 'cancelado') && Number.isFinite(op) && op > 0) {
      setRetorno({ resultado: pago, opId: op })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  if (!keycloakReady) {
    return <div>Cargando...</div>
  }

  // Public pages
  if (!auth) {
    return <Landing navigate={navigate} />
  }
  
  // Authenticated layout
  if (retorno) {
    const irHistorial = () => { setRetorno(null); setPage('transactions') }
    const reintentar = () => { setRetorno(null); setPage('buy') }
    return (
      <Layout
        auth={auth}
        currentPage="transactions"
        navigate={navigate}
        onLogout={onLogout}
        currentClient={currentClient}
        setCurrentClient={setCurrentClient}
      >
        <RetornoPago opId={retorno.opId} resultado={retorno.resultado} onVerHistorial={irHistorial} onReintentar={reintentar} />
      </Layout>
    )
  }
  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return auth.role === 'cashier' ? (
          <CashierDashboard auth={auth} currentClient={currentClient} navigate={navigate} />
        ) : (
          <Dashboard auth={auth} currentClient={currentClient} navigate={navigate} />
        )
      case 'cash-count':
        return <CashCountView auth={auth} /> // PI-44: saldo de billetes por caja
      case 'wallets':
        return <Wallets navigate={navigate} currentClient={currentClient} />
      case 'buy':
      case 'sell':
        return <BuySell auth={auth} currentClient={currentClient} />
      case 'transactions':
        return <Transactions auth={auth} currentClient={currentClient} />
      case 'rates':
      case 'admin-rates':
        return <Rates authUser={auth} />
      case 'notifications':
        return <Notifications usuario={auth.email} />
      case 'simulator':
        return <Simulator navigate={navigate} currentClient={currentClient} />
      case 'invoices':
        return <Invoices auth={auth} />
      case 'payments':
      case 'admin-payments':
        return <Payments auth={auth} currentClient={currentClient} />
      case 'banks':
        return <Banks currentClient={currentClient} />
      // Analyst
      case 'analyst-rates':
        return <RatesManagement />
      case 'analyst-earnings':
      case 'admin-earnings':
        return auth.role === 'admin' || auth.role === 'analyst'
          ? <Earnings />
          : <p role="alert">No tenés permiso para ver ganancias.</p>
      // Admin
      case 'admin-clients':
        return <Clients />
      case 'admin-users':
        return <Users />
      case 'admin-currencies':
        return <Currencies auth={auth} />
      case 'admin-reports':
        return auth.role === 'admin'
          ? <Reports />
          : <p role="alert">No tenés permiso para ver reportes.</p>
      case 'admin-config':
        return <Configuration />
      case 'admin-cash-deliveries':
        return <CashDeliveries /> // PI-43: entregas de billetes a cajas
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
