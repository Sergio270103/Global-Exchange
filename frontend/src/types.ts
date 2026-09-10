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

/**
 * Cuenta bancaria externa vinculada a un cliente como medio de pago.
 *
 * Contiene los datos mínimos exigidos por el RF16 de la ERS (Nombre,
 * Apellido, Nº Cédula, Entidad bancaria, Nº de cuenta bancaria y
 * Código Bancario), más la moneda y el estado de la vinculación.
 */
export interface BankAccount {
  /** Identificador único de la cuenta dentro del sistema. */
  id: number
  /** Entidad bancaria a la que pertenece la cuenta. */
  bank: string
  /** Número de cuenta bancaria (puede viajar enmascarado). */
  account: string
  /** Código bancario de la entidad. */
  code: string
  /** Nombre completo del titular (Nombre + Apellido). */
  holder: string
  /** Nombre del titular de la cuenta. */
  firstName: string
  /** Apellido del titular de la cuenta. */
  lastName: string
  /** Número de cédula de identidad del titular. */
  document: string
  /** Moneda en la que opera la cuenta (código ISO 4217). */
  currency: string
  /** Estado de la vinculación: activa o inactiva. */
  status: 'Activa' | 'Inactiva'
}
/**
 * Moneda admitida por la plataforma.
 *
 * El catálogo de monedas lo administra el rol administrador. La baja es
 * lógica (`active: false`): la moneda deja de ofrecerse a los clientes
 * pero conserva su histórico de tasas y transacciones.
 */
export interface Currency {
  /** Identificador único de la moneda dentro del sistema. */
  id: number
  /** Código ISO 4217 de 3 letras. Ej.: `USD`. */
  code: string
  /** Nombre descriptivo. Ej.: `Dólar Americano`. */
  name: string
  /** Símbolo usado al mostrar montos. Ej.: `$`. */
  symbol: string
  /** Emoji de la bandera, derivado del código. */
  flag: string
  /** Decimales con los que se muestran los montos (0 para el guaraní). */
  decimals: number
  /** Indica si la moneda está habilitada para operar. */
  active: boolean
}