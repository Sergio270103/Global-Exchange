export const exchangeRates = [
  { currency: 'USD', flag: '🇺🇸', name: 'Dólar Americano', buy: 7580, sell: 7650, change: +0.42, updatedAt: '14:32' },
  { currency: 'EUR', flag: '🇪🇺', name: 'Euro', buy: 8250, sell: 8340, change: -0.18, updatedAt: '14:32' },
  { currency: 'BRL', flag: '🇧🇷', name: 'Real Brasileño', buy: 1380, sell: 1420, change: +1.05, updatedAt: '14:32' },
  { currency: 'ARS', flag: '🇦🇷', name: 'Peso Argentino', buy: 5.20, sell: 5.80, change: -2.31, updatedAt: '14:30' },
  { currency: 'GBP', flag: '🇬🇧', name: 'Libra Esterlina', buy: 9520, sell: 9640, change: +0.67, updatedAt: '14:31' },
  { currency: 'CLP', flag: '🇨🇱', name: 'Peso Chileno', buy: 7.80, sell: 8.20, change: +0.12, updatedAt: '14:31' },
]

export const wallets = [
  { currency: 'PYG', balance: 15750000, symbol: '₲', flag: '🇵🇾', change: +2.1 },
  { currency: 'USD', balance: 2450.00, symbol: '$', flag: '🇺🇸', change: +0.42 },
  { currency: 'EUR', balance: 1820.50, symbol: '€', flag: '🇪🇺', change: -0.18 },
  { currency: 'BRL', balance: 8900.00, symbol: 'R$', flag: '🇧🇷', change: +1.05 },
]

export const bankAccounts = [
  { id: 1, bank: 'Banco Continental', account: '•••• •••• 4521', code: 'BCON-PY', holder: 'Carlos Martínez', document: '12.345.678', currency: 'PYG', status: 'Activa' },
  { id: 2, bank: 'Itaú Paraguay', account: '•••• •••• 8832', code: 'ITAU-PY', holder: 'Carlos Martínez', document: '12.345.678', currency: 'USD', status: 'Activa' },
]

export const transactions = [
  { id: 'TRX-2024-0891', date: '15 Ene 2024', client: 'Carlos Martínez', type: 'Compra', currency: 'USD', amount: 1500, rate: 7580, total: 11370000, status: 'Completada', payment: 'Transferencia' },
  { id: 'TRX-2024-0890', date: '15 Ene 2024', client: 'Ana López', type: 'Venta', currency: 'EUR', amount: 800, rate: 8340, total: 6672000, status: 'Completada', payment: 'Billetera' },
  { id: 'TRX-2024-0889', date: '14 Ene 2024', client: 'Pedro Silva', type: 'Compra', currency: 'BRL', amount: 5000, rate: 1380, total: 6900000, status: 'Pendiente', payment: 'Transferencia' },
  { id: 'TRX-2024-0888', date: '14 Ene 2024', client: 'María García', type: 'Venta', currency: 'USD', amount: 2000, rate: 7650, total: 15300000, status: 'Completada', payment: 'Tarjeta' },
  { id: 'TRX-2024-0887', date: '13 Ene 2024', client: 'Roberto Torres', type: 'Compra', currency: 'EUR', amount: 1200, rate: 8250, total: 9900000, status: 'Cancelada', payment: 'Transferencia' },
  { id: 'TRX-2024-0886', date: '13 Ene 2024', client: 'Laura Díaz', type: 'Compra', currency: 'USD', amount: 500, rate: 7580, total: 3790000, status: 'Completada', payment: 'QR' },
  { id: 'TRX-2024-0885', date: '12 Ene 2024', client: 'Juan Pérez', type: 'Venta', currency: 'BRL', amount: 3000, rate: 1420, total: 4260000, status: 'Completada', payment: 'Billetera' },
  { id: 'TRX-2024-0884', date: '12 Ene 2024', client: 'Sofía Ramírez', type: 'Compra', currency: 'USD', amount: 800, rate: 7580, total: 6064000, status: 'Completada', payment: 'Transferencia' },
]

export const invoices = [
  { id: 'F001-0891', date: '15 Ene 2024', client: 'Carlos Martínez', amount: 11370000, status: 'Aprobada', trx: 'TRX-2024-0891' },
  { id: 'F001-0890', date: '15 Ene 2024', client: 'Ana López', amount: 6672000, status: 'Aprobada', trx: 'TRX-2024-0890' },
  { id: 'F001-0889', date: '14 Ene 2024', client: 'Pedro Silva', amount: 6900000, status: 'Emitida', trx: 'TRX-2024-0889' },
  { id: 'F001-0888', date: '14 Ene 2024', client: 'María García', amount: 15300000, status: 'Aprobada', trx: 'TRX-2024-0888' },
  { id: 'F001-0887', date: '13 Ene 2024', client: 'Roberto Torres', amount: 9900000, status: 'Rechazada', trx: 'TRX-2024-0887' },
]

export const clients = [
  { id: 1, name: 'Carlos Martínez', category: 'Minorista', operations: 45, users: 2, status: 'Activo', email: 'carlos@email.com', document: '12.345.678-9', joined: 'Mar 2023' },
  { id: 2, name: 'Corporación Atlas S.A.', category: 'Corporativo', operations: 320, users: 8, status: 'Activo', email: 'contacto@atlas.com', document: '80-012345-6', joined: 'Jan 2022' },
  { id: 3, name: 'Ana López', category: 'VIP', operations: 189, users: 1, status: 'Activo', email: 'ana@email.com', document: '23.456.789-0', joined: 'Jun 2022' },
  { id: 4, name: 'Pedro Silva', category: 'Minorista', operations: 12, users: 1, status: 'Suspendido', email: 'pedro@email.com', document: '34.567.890-1', joined: 'Nov 2023' },
  { id: 5, name: 'Inversiones del Sur Ltda.', category: 'Corporativo', operations: 540, users: 12, status: 'Activo', email: 'info@inversur.com', document: '80-023456-7', joined: 'Aug 2021' },
  { id: 6, name: 'Laura Díaz', category: 'VIP', operations: 96, users: 1, status: 'Activo', email: 'laura@email.com', document: '45.678.901-2', joined: 'Sep 2022' },
]

export const users = [
  { id: 1, name: 'María García', email: 'maria@globalexchange.com', role: 'Administrador', client: 'Global Exchange', status: 'Activo', lastLogin: 'Hoy 14:20' },
  { id: 2, name: 'Juan Analista', email: 'juan@globalexchange.com', role: 'Analista Cambiario', client: 'Global Exchange', status: 'Activo', lastLogin: 'Hoy 13:45' },
  { id: 3, name: 'Carlos Martínez', email: 'carlos@email.com', role: 'Usuario', client: 'Carlos Martínez', status: 'Activo', lastLogin: 'Hoy 12:10' },
  { id: 4, name: 'Ana López', email: 'ana@email.com', role: 'Usuario', client: 'Ana López', status: 'Activo', lastLogin: 'Ayer 18:30' },
  { id: 5, name: 'Pedro Silva', email: 'pedro@email.com', role: 'Usuario', client: 'Pedro Silva', status: 'Suspendido', lastLogin: 'Hace 15 días' },
  { id: 6, name: 'Laura Operadora', email: 'laura@globalexchange.com', role: 'Analista Cambiario', client: 'Global Exchange', status: 'Activo', lastLogin: 'Hoy 11:55' },
]

export const earningsData = {
  monthly: [
    { month: 'Jul', total: 4200, usd: 1800, eur: 1200, brl: 800, pyg: 400 },
    { month: 'Ago', total: 5100, usd: 2200, eur: 1500, brl: 900, pyg: 500 },
    { month: 'Sep', total: 4800, usd: 2000, eur: 1400, brl: 850, pyg: 550 },
    { month: 'Oct', total: 6200, usd: 2700, eur: 1800, brl: 1100, pyg: 600 },
    { month: 'Nov', total: 7100, usd: 3100, eur: 2100, brl: 1200, pyg: 700 },
    { month: 'Dic', total: 8900, usd: 3900, eur: 2600, brl: 1500, pyg: 900 },
    { month: 'Ene', total: 6400, usd: 2800, eur: 1900, brl: 1050, pyg: 650 },
  ],
  byCurrency: [
    { name: 'USD', value: 43.8, color: '#10b981' },
    { name: 'EUR', value: 29.7, color: '#3b82f6' },
    { name: 'BRL', value: 16.4, color: '#f59e0b' },
    { name: 'PYG', value: 10.1, color: '#8b5cf6' },
  ],
}

export const notifications = [
  { id: 1, type: 'rate', title: 'Variación significativa en USD', message: 'El dólar subió +0.42% en las últimas 2 horas', time: '14:30', read: false },
  { id: 2, type: 'transaction', title: 'Operación completada', message: 'Compra de USD 1,500.00 acreditada exitosamente', time: '13:45', read: false },
  { id: 3, type: 'invoice', title: 'Factura emitida', message: 'Factura N° F001-0891 generada para TRX-2024-0891', time: '13:45', read: true },
  { id: 4, type: 'rate', title: 'Actualización de tasas', message: 'Las tasas han sido actualizadas por el analista cambiario', time: '09:00', read: true },
  { id: 5, type: 'transaction', title: 'Operación pendiente', message: 'Compra de BRL 5,000 requiere confirmación de pago', time: 'Ayer', read: true },
  { id: 6, type: 'system', title: 'Nuevo método de pago disponible', message: 'Ahora puedes pagar con QR desde tu billetera digital', time: 'Hace 3 días', read: true },
]

const seed = (n: number) => ((Math.sin(n) * 10000) % 1 + 1) / 2

export const historicalRates: Record<string, { date: string; buy: number; sell: number }[]> = {
  USD: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(2024, 0, i + 1).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
    buy: Math.round(7200 + seed(i * 3.7) * 600),
    sell: Math.round(7280 + seed(i * 3.7) * 600),
  })),
  EUR: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(2024, 0, i + 1).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
    buy: Math.round(7900 + seed(i * 2.3) * 700),
    sell: Math.round(7980 + seed(i * 2.3) * 700),
  })),
  BRL: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(2024, 0, i + 1).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
    buy: Math.round(1300 + seed(i * 4.1) * 150),
    sell: Math.round(1380 + seed(i * 4.1) * 150),
  })),
}

export const editableRates = [
  { currency: 'USD', flag: '🇺🇸', name: 'Dólar Americano', buy: 7580, sell: 7650, updatedAt: '14:32 - 15 Ene 2024', updatedBy: 'Juan Analista' },
  { currency: 'EUR', flag: '🇪🇺', name: 'Euro', buy: 8250, sell: 8340, updatedAt: '14:32 - 15 Ene 2024', updatedBy: 'Juan Analista' },
  { currency: 'BRL', flag: '🇧🇷', name: 'Real Brasileño', buy: 1380, sell: 1420, updatedAt: '14:30 - 15 Ene 2024', updatedBy: 'Laura Operadora' },
  { currency: 'ARS', flag: '🇦🇷', name: 'Peso Argentino', buy: 5.20, sell: 5.80, updatedAt: '09:00 - 15 Ene 2024', updatedBy: 'Juan Analista' },
  { currency: 'GBP', flag: '🇬🇧', name: 'Libra Esterlina', buy: 9520, sell: 9640, updatedAt: '14:31 - 15 Ene 2024', updatedBy: 'Laura Operadora' },
]

export const demoClients = ['Carlos Martínez', 'Corporación Atlas S.A.', 'Ana López']
