import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Payments from './Payments'
import { listarOperaciones, type Operacion } from '@/services/operaciones'
import { listarClientes } from '@/services/clientes'
import { listarMetodos } from '@/services/metodos'
vi.mock('@/services/operaciones', () => ({ listarOperaciones: vi.fn() }))
vi.mock('@/services/clientes', () => ({ listarClientes: vi.fn() }))
vi.mock('@/services/metodos', () => ({ listarMetodos: vi.fn() }))
const auth = { name: 'Sergio', email: 's@example.test', role: 'user' as const, avatar: '' }
const a = { id: 4, nombre: 'Cliente A' }
const b = { id: 5, nombre: 'Cliente B' }
const ops = [
  { id: 101, cliente: 4, cliente_nombre: 'Cliente A', metodo_pago: 'transfer', estado: 'PAGADA', fecha_creacion: '2026-11-17T12:00:00Z', monto_enviado: 100, moneda_origen_codigo: 'USD' },
  { id: 102, cliente: 4, cliente_nombre: 'Cliente A', metodo_pago: 'card', estado: 'PENDIENTE', fecha_creacion: '2026-11-17T12:00:00Z', monto_enviado: 200, moneda_origen_codigo: 'PYG' },
  { id: 103, cliente: 5, cliente_nombre: 'Cliente B', metodo_pago: 'transfer', estado: 'CANCELADA', fecha_creacion: '2026-11-17T12:00:00Z', monto_enviado: 300, moneda_origen_codigo: 'PYG' },
] as Operacion[]
beforeEach(() => {
  vi.mocked(listarOperaciones).mockReset().mockImplementation(async p => p?.clienteId ? ops.filter(o => o.cliente === p.clienteId) : ops)
  vi.mocked(listarMetodos).mockResolvedValue([{ id: 1, codigo: 'transfer', nombre: 'Transferencia', activo: true }, { id: 2, codigo: 'card', nombre: 'Tarjeta', activo: false }])
  vi.mocked(listarClientes).mockReset().mockResolvedValue([{ ...a }, { ...b }] as Awaited<ReturnType<typeof listarClientes>>)
})
describe('PI-27 pagos reales', () => {
  it('usuario consulta el cliente activo sin selector propio ni ejemplos', async () => {
    render(<Payments auth={auth} currentClient={a} />)
    expect(await screen.findByText('OP-101')).toBeInTheDocument()
    expect(listarOperaciones).toHaveBeenCalledWith({ clienteId: 4, mine: true })
    expect(screen.queryByText('OP-103')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cliente')).not.toBeInTheDocument()
    expect(screen.getByText('100 USD')).toBeInTheDocument()
    expect(screen.queryByText('PAG-001')).not.toBeInTheDocument()
    expect(listarClientes).not.toHaveBeenCalled()
  })
  it('admin ve todos y combina filtros con resumen consistente', async () => {
    const user = userEvent.setup()
    render(<Payments auth={{ ...auth, role: 'admin' }} currentClient={null} />)
    await screen.findByText('OP-103')
    await user.selectOptions(screen.getByLabelText('Cliente'), '4')
    await user.selectOptions(screen.getByLabelText('Estado'), 'PENDIENTE')
    await user.selectOptions(screen.getByLabelText('Método de pago'), 'card')
    expect(screen.getByText('OP-102')).toBeInTheDocument()
    expect(screen.queryByText('OP-101')).not.toBeInTheDocument()
    expect(screen.queryByText('OP-103')).not.toBeInTheDocument()
    const resumen = within(screen.getByLabelText('Resumen de pagos'))
    expect(resumen.getByLabelText('Cantidad Tarjeta')).toHaveTextContent('1')
    expect(resumen.getByLabelText('Cantidad Transferencia')).toHaveTextContent('0')
    await user.selectOptions(screen.getByLabelText('Estado'), 'ANULADA')
    expect(screen.getByText('No hay pagos para los filtros seleccionados.')).toBeInTheDocument()
    expect(resumen.getByLabelText('Cantidad Tarjeta')).toHaveTextContent('0')
  })
  it('cambio de cliente descarta respuestas tardías', async () => {
    let resolver!: (ops: Operacion[]) => void
    vi.mocked(listarOperaciones).mockImplementationOnce(() => new Promise(r => { resolver = r }))
    const { rerender } = render(<Payments auth={auth} currentClient={a} />)
    rerender(<Payments auth={auth} currentClient={b} />)
    await screen.findByText('OP-103')
    await act(async () => resolver(ops.slice(0, 2)))
    expect(screen.queryByText('OP-101')).not.toBeInTheDocument()
    expect(screen.getByText('OP-103')).toBeInTheDocument()
  })
  it('sin cliente no consulta operaciones', () => {
    render(<Payments auth={auth} currentClient={null} />)
    expect(screen.getByText(/Seleccioná un cliente asociado/)).toBeInTheDocument()
    expect(listarOperaciones).not.toHaveBeenCalled()
  })
  it('error de API muestra mensaje y permite reintentar', async () => {
    vi.mocked(listarOperaciones).mockRejectedValueOnce(new Error('Error de conexión'))
    const user = userEvent.setup()
    render(<Payments auth={auth} currentClient={a} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Error de conexión')
    await user.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(await screen.findByText('OP-101')).toBeInTheDocument()
  })
})
