/**
 * Tipos y contratos globales del sistema Global Exchange.
 *
 * Este módulo define los tipos compartidos utilizados en toda la
 * aplicación: los roles de usuario, las páginas del sistema y las
 * interfaces de autenticación y navegación.
 *
 * @module types
 */

/** Rol asignado a un usuario dentro de la plataforma. */
export type Role = 'public' | 'user' | 'analyst' | 'admin' | 'cashier'

/**
 * Página o pantalla actual de la aplicación.
 *
 * Agrupa las páginas públicas, las del usuario, las del cajero, las del
 * analista cambiario y las de administración.
 */
export type Page =
  | 'landing' | 'login' | 'register' | 'verify' | 'simulator'
  | 'dashboard' | 'cashier' | 'wallets' | 'buy' | 'sell' | 'transactions' | 'payments' | 'invoices' | 'cash-count' | 'rates' | 'notifications' | 'banks'
  | 'analyst-rates' | 'analyst-earnings'
  | 'admin-clients' | 'admin-users' | 'admin-roles' | 'admin-currencies' | 'admin-rates' | 'admin-payments' | 'admin-earnings' | 'admin-reports' | 'admin-config'

/**
 * Información del usuario autenticado en la aplicación.
 *
 * Refleja los datos extraídos del token de Keycloak y el rol con el que
 * el usuario accede a las distintas funcionalidades del sistema.
 */
export interface AuthUser {
  /** Nombre completo del usuario. */
  name: string
  /** Correo electrónico del usuario. */
  email: string
  /** Rol asignado al usuario dentro de la plataforma. */
  role: Role
  /** URL de la imagen de avatar del usuario. */
  avatar: string
  /** Tipo de persona del usuario: física o jurídica (del token de Keycloak). */
  tipoPersona?: string
}

/**
 * Propiedades de navegación compartidas entre los componentes.
 */
export interface NavProps {
  /** Función para cambiar de página dentro de la aplicación. */
  navigate: (page: Page) => void
  /** Usuario autenticado o `null` si la sesión no está iniciada. */
  auth: AuthUser | null
  /** Callback ejecutado al iniciar sesión. */
  onLogin: (user: AuthUser) => void
  /** Callback ejecutado al cerrar sesión. */
  onLogout: () => void
  /** Cliente seleccionado actualmente por el usuario. */
  currentClient: string
  /** Actualiza el cliente seleccionado dentro de la sesión. */
  setCurrentClient: (c: string) => void
}
