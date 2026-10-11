/**
 * Pruebas del panel de cajero.
 *
 * - PI-45: identificar o registrar cliente presencial
 *   (`GET /clientes/buscar-documento/` y `POST /clientes/presencial/`).
 * - PI-75: operación presencial unificada en el servidor
 *   (`POST /cajas/{id}/cotizar/` y `POST /cajas/{id}/operacion/`).
 * - Historial: últimos 10 con "Ver todo" a Transacciones y anulación
 *   por endpoint con reversa atómica.
 *
 * @module CashierDashboard.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CashierDashboard from '@/pages/cashier/CashierDashboard'

const auth = { name: 'Laura', email: 'laura@x.com', role: 'cashier' as const, avatar: '' }

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const ana = {
  id: 7,
  nombre: 'Ana',
  apellido: 'Barrios',
  nombre_completo: 'Ana Barrios',
  documento: '4589201',
  email: 'ana@x.com',
  telefono: '0981000000',
  tipo: 'FISICA',
  tipo_display: 'Persona física',
  categoria: 'MINORISTA',
  categoria_display: 'Minorista',
  activo: true,
  creado_en: '2026-10-01T00:00:00Z',
}

const cajaAbierta = [{
  id: 1, nombre: 'Caja 1', sucursal: 'Casa Central', activa: true,
  abierta: true, turno_actual: null,
}]

const desgloseOk = {
  tipo_operacion: 'COMPRA',
  moneda_origen_codigo: 'PYG', moneda_origen_decimales: 0,
  moneda_destino_codigo: 'USD', moneda_destino_decimales: 2,
  monto_enviado: '757500', monto_recibido: '100',
  tasa_aplicada: '7575.000000',
  cliente_paga: '757500 PYG', cliente_recibe: '100 USD',
  caja_abierta: true, saldo_disponible: '5000', saldo_suficiente: true,
}

const comprobante = {
  id: 1, numero: 'CPB-000001', operacion: 9,
  cliente_nombre: 'Ana Barrios', cliente_documento: '4589201',
  tipo_operacion: 'COMPRA', moneda_origen_codigo: 'PYG',
  moneda_destino_codigo: 'USD', monto_enviado: '757500.00',
  monto_recibido: '100.00', tasa_origen: '1.000000',
  tasa_destino: '7500.000000', monto_comision: '7500.00',
  metodo_pago: 'efectivo', fecha_operacion: '2026-10-11T10:00:01Z',
  cajero_sub: 'sub-caja', cajero_nombre: 'Cajero',
  estado: 'emitido', motivo_anulacion: '', anulado_por_nombre: '',
  fecha_anulacion: null, creado: '2026-10-11T10:00:02Z',
}

const resultadoOp = {
  operacion: { id: 9, estado: 'PAGADA', metodo_pago: 'efectivo' },
  movimientos: [
    {
      id: 1, tipo: 'RETIRO', tipo_display: 'Retiro',
      moneda_codigo: 'USD', total: '100', saldo_resultante: '4900',
    },
    {
      id: 2, tipo: 'INGRESO', tipo_display: 'Ingreso',
      moneda_codigo: 'PYG', total: '757500', saldo_resultante: '10757500',
    },
  ],
  comprobante: { id: 1, numero: 'CPB-000001' },
  saldo: [],
}

/** Backend simulado del flujo unificado (caja abierta y con saldo). */
function mockUnificado(opciones: {
  desglose?: unknown
  ejecutar?: unknown
  ejecutarEstado?: number
  comprobantes?: unknown[]
} = {}) {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url)
    const metodo = (init.method ?? 'GET').toUpperCase()
    if (u.includes('/buscar-documento/')) {
      const doc = new URL(u, 'http://x').searchParams.get('documento') ?? ''
      if (doc === '4589201') return respuesta({ encontrado: true, cliente: ana })
      return respuesta({ encontrado: false, cliente: null })
    }
    if (u.includes('/clientes/presencial/') && metodo === 'POST') {
      const d = JSON.parse(String(init.body))
      return respuesta({ ...ana, ...d, nombre_completo: `${d.nombre} ${d.apellido}`.trim() }, 201)
    }
    if (u.endsWith('/cajas/')) return respuesta(cajaAbierta)
    if (u.includes('/cotizar/') && metodo === 'POST') {
      return respuesta(opciones.desglose ?? desgloseOk)
    }
    if (u.includes('/operacion/') && metodo === 'POST') {
      return respuesta(opciones.ejecutar ?? resultadoOp, opciones.ejecutarEstado ?? 201)
    }
    if (/\/comprobantes\/\d+\/anular\//.test(u) && metodo === 'POST') {
      return respuesta({ ...comprobante, estado: 'anulado' })
    }
    if (/\/comprobantes\/\d+\//.test(u)) return respuesta(comprobante)
    if (u.endsWith('/comprobantes/')) {
      return respuesta(opciones.comprobantes ?? [])
    }
    return respuesta([])
  })
}

/** Backend simulado: busca por documento y valida el alta presencial. */
function mockApi() {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url)
    const metodo = (init.method ?? 'GET').toUpperCase()

    if (u.includes('/buscar-documento/')) {
      const doc = new URL(u, 'http://x').searchParams.get('documento') ?? ''
      if (doc === '4589201') {
        return respuesta({ encontrado: true, cliente: ana })
      }
      return respuesta({ encontrado: false, cliente: null })
    }
    if (u.includes('/clientes/presencial/') && metodo === 'POST') {
      const d = JSON.parse(String(init.body))
      if (d.documento === '4589201') {
        return respuesta({ documento: ['Ya existe un cliente registrado con este documento.'] }, 400)
      }
      if (!d.apellido || !d.telefono) {
        return respuesta({ apellido: ['Para persona física son obligatorios el nombre, el apellido, el documento y el correo.'] }, 400)
      }
      return respuesta({ ...ana, ...d, nombre_completo: `${d.nombre} ${d.apellido}`.trim() }, 201)
    }
    return respuesta([])
  })
}

describe('CashierDashboard PI-45 (cliente presencial)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockApi())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderCajero() {
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
  }

  const campoDoc = () => screen.getByPlaceholderText('Ej. 4589201')

  it('arranca sin cliente preseleccionado', () => {
    renderCajero()
    expect(screen.getByText('Sin cliente seleccionado.')).toBeInTheDocument()
    expect(screen.queryByText('✓ Cliente Seleccionado')).not.toBeInTheDocument()
  })

  it('busca por documento y muestra los datos para confirmar identidad', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.type(campoDoc(), '4589201')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('✓ Cliente Seleccionado')).toBeInTheDocument()
    expect(screen.getByText('Ana Barrios')).toBeInTheDocument()
    expect(screen.getByText('Doc: 4589201')).toBeInTheDocument()
    expect(screen.getByText('Tipo: Persona física')).toBeInTheDocument()
  })

  it('avisa que el documento no existe y ofrece registrarlo', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.type(campoDoc(), '0000000')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está registrado/i)
    expect(screen.getByRole('button', { name: /Registrar cliente/ })).toBeInTheDocument()
    expect(screen.queryByText('✓ Cliente Seleccionado')).not.toBeInTheDocument()
  })

  it('pide el documento antes de buscar', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Ingrese el número de documento/i)
  })

  it('registra un cliente y lo deja seleccionado para la operación', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.type(campoDoc(), '0000000')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await user.click(await screen.findByRole('button', { name: /Registrar cliente/ }))

    // El documento viaja precargado desde la búsqueda.
    expect(screen.getByLabelText('N° Documento')).toHaveValue('0000000')

    await user.type(screen.getByLabelText('Nombre'), 'Pedro')
    await user.type(screen.getByLabelText('Apellido'), 'Test')
    await user.type(screen.getByLabelText('Correo Electrónico'), 'pedro@x.com')
    await user.type(screen.getByLabelText(/Teléfono/), '0981111111')
    await user.click(screen.getByRole('button', { name: 'Guardar y Seleccionar' }))

    expect(await screen.findByText('✓ Cliente Seleccionado')).toBeInTheDocument()
    expect(screen.getByText('Pedro Test')).toBeInTheDocument()
    // El modal se cerró y la búsqueda queda con el documento del cliente nuevo.
    expect(screen.queryByText('Registro de Cliente Presencial')).not.toBeInTheDocument()
    expect(campoDoc()).toHaveValue('0000000')
  })

  it('muestra el error del backend si el documento ya está registrado', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.click(screen.getByRole('button', { name: '+ Nuevo Cliente' }))
    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Apellido'), 'Barrios')
    await user.type(screen.getByLabelText('N° Documento'), '4589201')
    await user.type(screen.getByLabelText('Correo Electrónico'), 'ana@x.com')
    await user.type(screen.getByLabelText(/Teléfono/), '0981000000')
    await user.click(screen.getByRole('button', { name: 'Guardar y Seleccionar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya existe un cliente/i)
    expect(screen.queryByText('✓ Cliente Seleccionado')).not.toBeInTheDocument()
  })

  it('para persona jurídica no exige apellido ni teléfono', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.click(screen.getByRole('button', { name: '+ Nuevo Cliente' }))
    await user.selectOptions(screen.getByLabelText('Tipo de Cliente'), 'JURIDICA')

    expect(screen.getByLabelText('RUC')).toBeInTheDocument()
    expect(screen.getByLabelText('Apellido')).not.toBeRequired()
    expect(screen.getByLabelText(/Teléfono/)).not.toBeRequired()
  })
})

/**
 * PI-75: operación presencial unificada — el servidor crea la operación,
 * mueve la caja y emite el comprobante en una transacción.
 */
describe('CashierDashboard PI-75 (operación unificada)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockUnificado())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function seleccionarAna(user: ReturnType<typeof userEvent.setup>) {
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
    await user.type(screen.getByPlaceholderText('Ej. 4589201'), '4589201')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await screen.findByText('✓ Cliente Seleccionado')
  }

  it('muestra el desglose y ejecuta con una sola llamada', async () => {
    vi.stubGlobal('fetch', mockUnificado({ comprobantes: [comprobante] }))
    const user = userEvent.setup()
    await seleccionarAna(user)
    await user.type(screen.getByLabelText(/Monto/), '757500')
    // Desglose del backend (con debounce).
    expect(await screen.findByText('Desglose de la operación')).toBeInTheDocument()
    expect(screen.getByText('757500 PYG')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Procesar, Emitir e Imprimir/ }))
    // Comprobante + resumen de caja en el mismo panel.
    expect((await screen.findAllByText('CPB-000001')).length).toBeGreaterThanOrEqual(2)
    expect(await screen.findByText(/Operación #9 registrada\. Caja:/)).toBeInTheDocument()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const ejecuciones = fetchMock.mock.calls.filter(([llamada, datos]) =>
      String(llamada).includes('/operacion/') && (datos as RequestInit).method === 'POST')
    expect(ejecuciones).toHaveLength(1)
    expect(JSON.parse(String((ejecuciones[0] as [string, RequestInit])[1].body))).toMatchObject({
      cliente: 7, tipo_operacion: 'COMPRA', moneda: 'USD', medio_pago: 'efectivo',
    })
  })

  it('exige cliente seleccionado antes de emitir', async () => {
    const user = userEvent.setup()
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Procesar, Emitir e Imprimir/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Seleccione un cliente/i)
  })

  it('muestra el error del servidor si la caja está cerrada', async () => {
    vi.stubGlobal('fetch', mockUnificado({
      ejecutar: { detail: 'La caja Caja 1 está cerrada.' },
      ejecutarEstado: 409,
    }))
    const user = userEvent.setup()
    await seleccionarAna(user)
    await user.type(screen.getByLabelText(/Monto/), '757500')
    await user.click(screen.getByRole('button', { name: /Procesar, Emitir e Imprimir/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cerrada/i)
    expect(screen.queryByText('CPB-000001')).not.toBeInTheDocument()
  })

  it('deshabilita el botón si la caja no tiene saldo', async () => {
    vi.stubGlobal('fetch', mockUnificado({
      desglose: { ...desgloseOk, saldo_suficiente: false, saldo_disponible: '5' },
    }))
    const user = userEvent.setup()
    await seleccionarAna(user)
    await user.type(screen.getByLabelText(/Monto/), '757500')
    expect(await screen.findByText(/no tiene saldo suficiente/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procesar, Emitir e Imprimir/ })).toBeDisabled()
  })

  it('reimprime un comprobante del historial', async () => {
    vi.stubGlobal('fetch', mockUnificado({ comprobantes: [comprobante] }))
    const user = userEvent.setup()
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
    await user.click(await screen.findByRole('button', { name: /Reimprimir/ }))
    expect((await screen.findAllByText('CPB-000001')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: '🖨️ Imprimir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '📥 Descargar PDF' })).toBeInTheDocument()
  })
})

/**
 * Historial del panel: solo los últimos 10, con "Ver todo" hacia
 * Transacciones, y anulación por endpoint con reversa atómica.
 */
describe('CashierDashboard historial (top 10, Ver todo y anulación)', () => {
  function comprobanteN(n: number) {
    return {
      ...comprobante, id: n, numero: `CPB-${String(n).padStart(6, '0')}`, operacion: n,
    }
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const metodo = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/buscar-documento/')) {
        return respuesta({ encontrado: true, cliente: ana })
      }
      if (/\/comprobantes\/\d+\/anular\//.test(u) && metodo === 'POST') {
        return respuesta({ ...comprobante, estado: 'anulado' })
      }
      if (u.includes('/comprobantes/')) {
        return respuesta(Array.from({ length: 12 }, (_, i) => comprobanteN(i + 1)))
      }
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra 10 y redirige a Transacciones con Ver todo', async () => {
    const user = userEvent.setup()
    const navigate = vi.fn()
    render(<CashierDashboard auth={auth} currentClient={null} navigate={navigate} />)
    // 12 comprobantes en la API, solo 10 filas en el panel.
    expect(await screen.findByText('CPB-000001')).toBeInTheDocument()
    expect(screen.queryByText('CPB-000011')).not.toBeInTheDocument()
    expect(screen.queryByText('CPB-000012')).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /Ver todo/ })[0])
    expect(navigate).toHaveBeenCalledWith('transactions')
  })

  it('la anulación usa el endpoint y marca Anulada desde el servidor', async () => {
    const user = userEvent.setup()
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
    await user.click((await screen.findAllByRole('button', { name: /Anulación/ }))[0])
    expect(await screen.findByText(/anulado y revertido en caja/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anulada' })).toBeDisabled()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const anular = fetchMock.mock.calls.filter(([llamada, datos]) =>
      String(llamada).includes('/anular/') && (datos as RequestInit).method === 'POST')
    expect(anular).toHaveLength(1)
  })
})
