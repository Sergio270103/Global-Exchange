export type Role = 'public' | 'user' | 'analyst' | 'admin'

export type Page =
  | 'landing' | 'login' | 'register' | 'verify'
  | 'dashboard' | 'wallets' | 'buy' | 'sell' | 'transactions' | 'payments' | 'invoices' | 'rates' | 'notifications' | 'banks'
  | 'analyst-rates' | 'analyst-earnings'
  | 'admin-clients' | 'admin-users' | 'admin-roles' | 'admin-currencies' | 'admin-rates' | 'admin-payments' | 'admin-earnings' | 'admin-reports' | 'admin-config'

export interface AuthUser {
  name: string
  email: string
  role: Role
  avatar: string
}

export interface NavProps {
  navigate: (page: Page) => void
  auth: AuthUser | null
  onLogin: (user: AuthUser) => void
  onLogout: () => void
  currentClient: string
  setCurrentClient: (c: string) => void
}
