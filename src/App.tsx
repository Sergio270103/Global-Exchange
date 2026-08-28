import { useState } from 'react'
import { type AuthUser, type Page } from './types'

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
import Invoices from './pages/Invoices'
import Payments from './pages/Payments'

import RatesManagement from './pages/analyst/RatesManagement'
import Earnings from './pages/analyst/Earnings'

import Clients from './pages/admin/Clients'
import Users from './pages/admin/Users'
import RolesPermissions from './pages/admin/RolesPermissions'
import Configuration from './pages/admin/Configuration'

export default function App() {
  const [auth, setAuth] = useState<AuthUser | null>(null)
  const [page, setPage] = useState<Page>('landing')
  const [currentClient, setCurrentClient] = useState('Carlos Martínez')

  const navigate = (p: Page) => setPage(p)

  const onLogin = (user: AuthUser) => {
    setAuth(user)
    setPage('dashboard')
  }

  const onLogout = () => {
    setAuth(null)
    setPage('landing')
  }

  // Public pages
  if (!auth) {
    if (page === 'login') return <Login navigate={navigate} onLogin={onLogin}/>
    if (page === 'register') return <Register navigate={navigate}/>
    return <Landing navigate={navigate}/>
  }

  // Authenticated layout
  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard auth={auth} currentClient={currentClient} navigate={navigate}/>
      case 'wallets': return <Wallets/>
      case 'buy': case 'sell': return <BuySell auth={auth} currentClient={currentClient}/>
      case 'transactions': return <Transactions auth={auth} currentClient={currentClient}/>
      case 'rates': case 'admin-rates': return <Rates/>
      case 'notifications': return <Notifications/>
      case 'invoices': return <Invoices/>
      case 'payments': case 'admin-payments': return <Payments/>
      case 'banks': return <BankAccountsPlaceholder/>
      // Analyst
      case 'analyst-rates': return <RatesManagement/>
      case 'analyst-earnings': case 'admin-earnings': return <Earnings/>
      // Admin
      case 'admin-clients': return <Clients/>
      case 'admin-users': return <Users/>
      case 'admin-roles': return <RolesPermissions/>
      case 'admin-currencies': return <CurrenciesPlaceholder/>
      case 'admin-reports': return <ReportsPlaceholder/>
      case 'admin-config': return <Configuration/>
      default: return <Dashboard auth={auth} currentClient={currentClient} navigate={navigate}/>
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

function BankAccountsPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center animate-fadein">
      <div className="text-5xl mb-4">🏦</div>
      <h3 className="font-bold text-slate-900 text-xl mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Cuentas bancarias</h3>
      <p className="text-slate-400 text-[14px]">Esta sección está disponible en tu billetera digital</p>
    </div>
  )
}

function CurrenciesPlaceholder() {
  const currencies = [
    { code: 'USD', name: 'Dólar Americano', flag: '🇺🇸', active: true },
    { code: 'EUR', name: 'Euro', flag: '🇪🇺', active: true },
    { code: 'BRL', name: 'Real Brasileño', flag: '🇧🇷', active: true },
    { code: 'PYG', name: 'Guaraní Paraguayo', flag: '🇵🇾', active: true },
    { code: 'ARS', name: 'Peso Argentino', flag: '🇦🇷', active: true },
    { code: 'GBP', name: 'Libra Esterlina', flag: '🇬🇧', active: true },
  ]
  return (
    <div className="space-y-4 animate-fadein">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Monedas admitidas</h3>
        <button className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold" style={{ background: '#0f3460' }}>+ Nueva moneda</button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {currencies.map(c => (
          <div key={c.code} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
            <span className="text-3xl">{c.flag}</span>
            <div className="flex-1">
              <div className="font-bold text-slate-900 text-[15px]">{c.code}</div>
              <div className="text-[12px] text-slate-400">{c.name}</div>
            </div>
            <div className="w-8 h-4 rounded-full bg-emerald-500 relative">
              <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-white shadow-sm"/>
            </div>
          </div>
        ))}
      </div>
    </div>
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
