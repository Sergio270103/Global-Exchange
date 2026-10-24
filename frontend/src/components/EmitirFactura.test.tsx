/**
 * Pruebas PI-30 del bloque "Emitir factura" del comprobante.
 *
 * El servicio se simula: estas pruebas nunca llaman a la API.
 *
 * @module EmitirFactura.test
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmitirFactura from '@/components/EmitirFactura'
import {
  consultarEstadoFactura,
  emitirFactura,
  usoFacturas,
  type FacturaElectronica,
  type UsoFacturas,
} from '@/services/facturas'

vi.mock('@/services/facturas', async (original) => ({
  ...(await original<typeof import('@/services/facturas')>()),
  usoFacturas: vi.fn(),
  emitirFactura: vi.fn(),
  consultarEstadoFactura: vi.fn(),
}))

const uso = (extra: Partial<UsoFacturas> = {}): UsoFacturas => ({
  modo: 'simulado', usadas: 3, limite: 12, disponibles: 9,
  siguiente_numero: '0000103', operacion: 9, operacion_estado: 'PAGADA',
  email_cliente: 'ana@test.com', factura: null, ...extra,
})

const factura = (extra: Partial<FacturaElectronica> = {}): FacturaElectronica => ({
  id: 1, operacion: 9, cliente_nombre: 'Ana', simulada: true,
  numero: '0000103', numero_completo: '001-003-0000103', cdc: '1'.repeat(44),
  estado: 'EMITIDA', total: 7500, email_destino: 'ana@test.com',
  detalle: 'Generada. Esperando la aprobación de SIFEN.',
  envio_fecha: null, envio_destinatario: '', envio_resultado: '',
  creada: '2026-10-23T10:00:00Z', estado_consultado: null, ...extra,
})

describe('EmitirFactura (PI-30)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('precarga el correo del cliente y muestra el contador', async () => {
    vi.mocked(usoFacturas).mockResolvedValue(uso())
    render(<EmitirFactura operacionId={9} />)
    expect(await screen.findByDisplayValue('ana@test.com')).toBeInTheDocument()
    expect(screen.getByText(/Emisiones usadas 3 de 12/)).toBeInTheDocument()
  })

  it('emite con la acción explícita y muestra el número', async () => {
    vi.mocked(usoFacturas).mockResolvedValue(uso())
    vi.mocked(emitirFactura).mockResolvedValue(factura())
    render(<EmitirFactura operacionId={9} />)
    await userEvent.click(await screen.findByRole('button', { name: /Emitir factura/ }))
    expect(emitirFactura).toHaveBeenCalledWith(9, 'ana@test.com')
    expect(await screen.findByText('001-003-0000103')).toBeInTheDocument()
  })

  it('no permite emitir si la operación no está pagada', async () => {
    vi.mocked(usoFacturas).mockResolvedValue(uso({ operacion_estado: 'PENDIENTE' }))
    render(<EmitirFactura operacionId={9} />)
    expect(await screen.findByRole('button', { name: /Emitir factura/ })).toBeDisabled()
    expect(screen.getByText(/Solo se factura una operación PAGADA/)).toBeInTheDocument()
  })

  it('bloquea la emisión al llegar al límite', async () => {
    vi.mocked(usoFacturas).mockResolvedValue(uso({ usadas: 12, disponibles: 0, siguiente_numero: null }))
    render(<EmitirFactura operacionId={9} />)
    expect(await screen.findByRole('button', { name: /Emitir factura/ })).toBeDisabled()
    expect(screen.getByText(/límite de emisiones/)).toBeInTheDocument()
  })

  it('consulta el estado y muestra el envío al aprobarse', async () => {
    vi.mocked(usoFacturas).mockResolvedValue(uso({ factura: factura() }))
    vi.mocked(consultarEstadoFactura).mockResolvedValue(factura({
      estado: 'APROBADA', envio_fecha: '2026-10-23T10:05:00Z',
      envio_destinatario: 'ana@test.com', envio_resultado: 'Simulado: no se envió ningún correo.',
    }))
    render(<EmitirFactura operacionId={9} />)
    await userEvent.click(await screen.findByRole('button', { name: /Consultar estado en SIFEN/ }))
    await waitFor(() => expect(screen.getByText('Aprobada')).toBeInTheDocument())
    expect(screen.getByText(/Enviada a ana@test.com/)).toBeInTheDocument()
  })
})
