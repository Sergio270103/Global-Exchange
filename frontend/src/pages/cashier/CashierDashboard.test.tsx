/**
 * Pruebas PI-45 del panel de cajero: identificar o registrar cliente presencial.
 *
 * La búsqueda y el registro van contra la API real
 * (`GET /clientes/buscar-documento/` y `POST /clientes/presencial/`).
 * La emisión de comprobantes sigue siendo local y no se cubre acá.
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
    return respuesta({}, 404)
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
 * PI-42: emisión real del comprobante interno (operación en efectivo
 * + número único + vista imprimible).
 */
describe('CashierDashboard PI-42 (comprobante interno)', () => {
  const tasaUsd = {
    id: 10, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar',
    compra: '7400', venta: '7500',
    vigente_desde: '2026-10-11T10:00:00Z', creado_por: 'analista1',
  }
  const operacionPagada = {
    id: 9, cliente: 7, cliente_nombre: 'Ana Barrios',
    usuario_keycloak_id: 'sub-caja', usuario_nombre: 'Cajero',
    tipo_operacion: 'COMPRA', moneda_origen: 1, moneda_origen_codigo: 'PYG',
    moneda_destino: 2, moneda_destino_codigo: 'USD',
    monto_enviado: '757500.00', monto_recibido: '100.00',
    cotizacion_aplicada: 10, tasa_origen: '1.000000',
    tasa_destino: '7500.000000', metodo_pago: 'efectivo',
    billetera_destino: null, billetera_destino_detalle: '',
    cuenta_origen: null, cuenta_origen_detalle: '',
    billetera_origen: null, billetera_origen_detalle: '',
    fecha_creacion: '2026-10-11T10:00:00Z', estado: 'PAGADA',
    fecha_cotizacion: '2026-10-11T10:00:00Z',
    fecha_confirmacion: '2026-10-11T10:00:01Z',
    fecha_cancelacion: null, cancelada_por: '',
    cancelada_por_nombre: '', motivo_cancelacion: '',
    tolerancia_segundos: 300, segundos_restantes: 300,
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
    estado: 'emitido', creado: '2026-10-11T10:00:02Z',
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const metodo = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/buscar-documento/')) {
        return respuesta({ encontrado: true, cliente: ana })
      }
      if (u.includes('/cotizaciones/vigentes/')) {
        return respuesta([tasaUsd])
      }
      if (u.includes('/cajas/') && u.includes('/movimientos/') && metodo === 'POST') {
        const d = JSON.parse(String(init.body ?? '{}'))
        return respuesta({
          movimiento: {
            id: 1, tipo: d.tipo, tipo_display: d.tipo,
            moneda_codigo: 'USD', total: d.monto, saldo_resultante: null,
            usuario_nombre: 'Cajero', observacion: '', creado_en: '2026-10-11T10:00:01Z',
          },
          monedas: [],
        }, 201)
      }
      if (u.endsWith('/cajas/')) {
        return respuesta([{
          id: 1, nombre: 'Central', sucursal: 'Asunción', activa: true,
          abierta: true, turno_actual: null,
        }])
      }
      if (u.includes('/saldo/')) {
        return respuesta({ monedas: [
          { moneda: 1, moneda_codigo: 'PYG', moneda_nombre: 'Guaraní', simbolo: '₲', decimales: 0, total: '10000000' },
          { moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', simbolo: '$', decimales: 2, total: '5000' },
        ] })
      }
      if (u.includes('/turno/')) {
        return respuesta({ turno: {
          id: 1, abierto: true, cajero_nombre: 'Cajero',
          abierto_en: '2026-10-11T08:00:00Z', entrega_apertura: null,
          cerrado_en: null, cerrado_por_nombre: '', arqueo_cierre: null,
        } })
      }
      if (u.includes('/confirmar/') && metodo === 'POST') {
        return respuesta({ resultado: 'CONFIRMADA', operacion: operacionPagada })
      }
      if (u.endsWith('/operaciones/') && metodo === 'POST') {
        return respuesta({ ...operacionPagada, estado: 'PENDIENTE' }, 201)
      }
      if (u.endsWith('/comprobantes/') && metodo === 'POST') {
        return respuesta(comprobante, 201)
      }
      if (u.endsWith('/comprobantes/')) {
        return respuesta([comprobante])
      }
      if (/\/comprobantes\/\d+\//.test(u)) {
        return respuesta(comprobante)
      }
      return respuesta({}, 404)
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderCajero42() {
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
  }

  async function seleccionarAna(user: ReturnType<typeof userEvent.setup>) {
    renderCajero42()
    await user.type(screen.getByPlaceholderText('Ej. 4589201'), '4589201')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await screen.findByText('✓ Cliente Seleccionado')
  }

  it('emite el comprobante con operación real y muestra la vista imprimible', async () => {
    const user = userEvent.setup()
    await seleccionarAna(user)
    await user.type(screen.getByLabelText(/Monto/), '750000')
    await user.click(screen.getByRole('button', { name: /Procesar, Emitir e Imprimir/ }))
    // El número aparece en el historial y en la vista imprimible.
    expect((await screen.findAllByText('CPB-000001')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Ana Barrios').length).toBeGreaterThanOrEqual(2)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const creoOp = fetchMock.mock.calls.find(([llamada, datos]) =>
      String(llamada).endsWith('/operaciones/') && (datos as RequestInit).method === 'POST')
    const cuerpo = JSON.parse(String((creoOp as [string, RequestInit])[1].body))
    expect(cuerpo).toMatchObject({
      cliente: 7, tipo_operacion: 'COMPRA', moneda: 'USD', metodo_pago: 'efectivo',
    })
    // PI-75: imputa INGRESO (PYG que entrega el cliente) + RETIRO (USD).
    const movs = fetchMock.mock.calls
      .filter(([llamada, datos]) =>
        String(llamada).includes('/movimientos/') && (datos as RequestInit).method === 'POST')
      .map(([, datos]) => JSON.parse(String((datos as RequestInit).body)))
    expect(movs).toHaveLength(2)
    expect(movs[0]).toMatchObject({ tipo: 'INGRESO', moneda: 1 })
    expect(movs[1]).toMatchObject({ tipo: 'RETIRO', moneda: 2 })
  })

  it('exige cliente seleccionado antes de emitir', async () => {
    const user = userEvent.setup()
    renderCajero42()
    await user.click(screen.getByRole('button', { name: /Procesar, Emitir e Imprimir/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Seleccione un cliente/i)
  })

  it('reimprime un comprobante del historial', async () => {
    const user = userEvent.setup()
    await seleccionarAna(user)
    await user.click(await screen.findByRole('button', { name: /Reimprimir/ }))
    expect((await screen.findAllByText('CPB-000001')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: '🖨️ Imprimir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '📥 Descargar PDF' })).toBeInTheDocument()
  })
})

/**
 * Historial del panel: solo los últimos 10, con "Ver todo" hacia
 * Transacciones.
 */
describe('CashierDashboard historial (top 10 + Ver todo)', () => {
  function comprobanteN(n: number) {
    return {
      id: n, numero: `CPB-${String(n).padStart(6, '0')}`, operacion: n,
      cliente_nombre: 'Ana Barrios', cliente_documento: '4589201',
      tipo_operacion: 'COMPRA', moneda_origen_codigo: 'PYG',
      moneda_destino_codigo: 'USD', monto_enviado: '757500.00',
      monto_recibido: '100.00', tasa_origen: null,
      tasa_destino: null, monto_comision: null,
      metodo_pago: 'efectivo', fecha_operacion: '2026-10-11T10:00:01Z',
      cajero_sub: 'sub-caja', cajero_nombre: 'Cajero',
      estado: 'emitido', creado: '2026-10-11T10:00:02Z',
    }
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/comprobantes/')) {
        return respuesta(Array.from({ length: 12 }, (_, i) => comprobanteN(i + 1)))
      }
      return respuesta({}, 404)
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
})

/**
 * PI-75: la emisión imputa el efectivo en caja y la anulación lo revierte
 * con el par inverso (sin NC en el backend).
 */
describe('CashierDashboard PI-75 (caja: imputación y reversa)', () => {
  const comprobante = {
    id: 1, numero: 'CPB-000001', operacion: 9,
    cliente_nombre: 'Ana Barrios', cliente_documento: '4589201',
    tipo_operacion: 'COMPRA', moneda_origen_codigo: 'PYG',
    moneda_destino_codigo: 'USD', monto_enviado: '757500.00',
    monto_recibido: '100.00', tasa_origen: null,
    tasa_destino: null, monto_comision: null,
    metodo_pago: 'efectivo', fecha_operacion: '2026-10-11T10:00:01Z',
    cajero_sub: 'sub-caja', cajero_nombre: 'Cajero',
    estado: 'emitido', creado: '2026-10-11T10:00:02Z',
  }
  const caja = [{
    id: 1, nombre: 'Central', sucursal: 'Asunción', activa: true,
    abierta: true, turno_actual: null,
  }]
  const turnoAbierto = { turno: {
    id: 1, abierto: true, cajero_nombre: 'Cajero',
    abierto_en: '2026-10-11T08:00:00Z', entrega_apertura: null,
    cerrado_en: null, cerrado_por_nombre: '', arqueo_cierre: null,
  } }

  function mockCaja(opciones: { turno?: unknown; saldos?: Record<string, string> } = {}) {
    const saldoBase = [
      { moneda: 1, moneda_codigo: 'PYG', moneda_nombre: 'Guaraní', simbolo: '₲', decimales: 0, total: '10000000' },
      { moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', simbolo: '$', decimales: 2, total: '5000' },
    ]
    return vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const metodo = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/buscar-documento/')) {
        return respuesta({ encontrado: true, cliente: ana })
      }
      if (u.includes('/cotizaciones/vigentes/')) {
        return respuesta([{
          id: 10, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar',
          compra: '7400', venta: '7500',
          vigente_desde: '2026-10-11T10:00:00Z', creado_por: 'analista1',
        }])
      }
      if (u.includes('/movimientos/') && metodo === 'POST') {
        const d = JSON.parse(String(init.body ?? '{}'))
        return respuesta({
          movimiento: {
            id: 1, tipo: d.tipo, tipo_display: d.tipo,
            moneda_codigo: 'USD', total: d.monto, saldo_resultante: null,
            usuario_nombre: 'Cajero', observacion: '', creado_en: '2026-10-11T10:00:01Z',
          },
          monedas: [],
        }, 201)
      }
      if (/\/comprobantes\/\d+\/anular\//.test(u) && metodo === 'POST') {
        if ('turno' in opciones && opciones.turno === null) {
          return respuesta({ detail: 'La caja está cerrada.' }, 400)
        }
        return respuesta({
          ...comprobante, estado: 'anulado', motivo_anulacion: '',
          anulado_por_nombre: 'Cajero',
          fecha_anulacion: '2026-10-11T10:05:00Z',
        })
      }
      if (u.endsWith('/cajas/')) return respuesta(caja)
      if (u.includes('/saldo/')) {
        const monedas = saldoBase.map(m => (
          opciones.saldos?.[m.moneda_codigo] !== undefined
            ? { ...m, total: opciones.saldos[m.moneda_codigo] }
            : m))
        return respuesta({ monedas })
      }
      if (u.includes('/turno/')) {
        return respuesta('turno' in opciones ? { turno: opciones.turno } : turnoAbierto)
      }
      if (u.endsWith('/comprobantes/')) return respuesta([comprobante])
      return respuesta({}, 404)
    })
  }

  const cuerposMov = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls
    .filter(([llamada, datos]) =>
      String(llamada).includes('/movimientos/') && (datos as RequestInit).method === 'POST')
    .map(([, datos]) => JSON.parse(String((datos as RequestInit).body)))

  beforeEach(() => {
    vi.stubGlobal('fetch', mockCaja())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('la anulación usa el endpoint y marca Anulada desde el servidor', async () => {
    const user = userEvent.setup()
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
    await user.click(await screen.findByRole('button', { name: /Anulación/ }))
    expect(await screen.findByText(/anulado y revertido en caja/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anulada' })).toBeDisabled()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    // Un solo POST al endpoint: la reversa la hace el servidor.
    const anular = fetchMock.mock.calls.filter(([llamada, datos]) =>
      String(llamada).includes('/anular/') && (datos as RequestInit).method === 'POST')
    expect(anular).toHaveLength(1)
    expect(cuerposMov(fetchMock)).toHaveLength(0)
  })

  it('bloquea la anulación si la caja está cerrada', async () => {
    vi.stubGlobal('fetch', mockCaja({ turno: null }))
    const user = userEvent.setup()
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
    await user.click(await screen.findByRole('button', { name: /Anulación/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cerrada/i)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(cuerposMov(fetchMock)).toHaveLength(0)
  })

  it('bloquea la emisión si la caja está cerrada (sin crear la operación)', async () => {
    vi.stubGlobal('fetch', mockCaja({ turno: null }))
    const user = userEvent.setup()
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
    await user.type(screen.getByPlaceholderText('Ej. 4589201'), '4589201')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await screen.findByText('✓ Cliente Seleccionado')
    // Monto directo en USD (origen) para no depender de tasas.
    await user.selectOptions(screen.getByLabelText('Tipo Operación'), 'sell')
    await user.type(screen.getByLabelText(/Monto/), '10')
    await user.click(screen.getByRole('button', { name: /Procesar, Emitir e Imprimir/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cerrada/i)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const creoOp = fetchMock.mock.calls.some(([llamada, datos]) =>
      String(llamada).endsWith('/operaciones/') && (datos as RequestInit).method === 'POST')
    expect(creoOp).toBe(false)
  })

  it('bloquea la emisión si la caja no tiene saldo en la divisa', async () => {
    // Venta de USD 10: la caja debe entregar ~₲74.000; con ₲1.000 no alcanza.
    vi.stubGlobal('fetch', mockCaja({ saldos: { PYG: '1000' } }))
    const user = userEvent.setup()
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
    await user.type(screen.getByPlaceholderText('Ej. 4589201'), '4589201')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await screen.findByText('✓ Cliente Seleccionado')
    await user.selectOptions(screen.getByLabelText('Tipo Operación'), 'sell')
    await user.type(screen.getByLabelText(/Monto/), '10')
    await user.click(screen.getByRole('button', { name: /Procesar, Emitir e Imprimir/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/saldo insuficiente/i)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const creoOp = fetchMock.mock.calls.some(([llamada, datos]) =>
      String(llamada).endsWith('/operaciones/') && (datos as RequestInit).method === 'POST')
    expect(creoOp).toBe(false)
  })
})