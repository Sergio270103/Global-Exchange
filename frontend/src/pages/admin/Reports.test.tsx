import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Reports from './Reports'
import { descargarReporte } from '@/services/reportes'
import { listarClientes } from '@/services/clientes'

vi.mock('@/services/reportes', async original => ({ ...await original<typeof import('@/services/reportes')>(), descargarReporte: vi.fn() }))
vi.mock('@/services/clientes', () => ({ listarClientes: vi.fn() }))
vi.mock('@/services/monedas', () => ({ listarMonedas: vi.fn().mockResolvedValue([{ id: 1, code: 'USD', name: 'Dólar' }]) }))
beforeEach(() => { vi.clearAllMocks(); vi.mocked(descargarReporte).mockResolvedValue(undefined); vi.mocked(listarClientes).mockResolvedValue([]) })

describe('Reportes administrativos', () => {
  it('ofrece seis reportes en PDF y Excel y filtra transacciones', async () => {
    const user = userEvent.setup()
    render(<Reports />)
    expect(screen.getAllByRole('button')).toHaveLength(12)
    await user.click(screen.getByRole('button', { name: 'Reporte de transacciones Excel' }))
    expect(screen.getByLabelText('Estado')).toHaveValue('')
    await user.selectOptions(screen.getByLabelText('Estado'), 'PAGADA')
    await user.click(screen.getByRole('button', { name: 'Descargar' }))
    await waitFor(() => expect(descargarReporte).toHaveBeenCalledWith('transacciones', 'xlsx', expect.objectContaining({ estado: 'PAGADA' })))
    expect(await screen.findByRole('status')).toHaveTextContent('descarga está lista')
  })
  it('requiere buscar y elegir cliente, avisa si no existe y descarga al aceptar', async () => {
    const user = userEvent.setup()
    render(<Reports />)
    await user.click(screen.getByRole('button', { name: 'Reporte de clientes PDF' }))
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeDisabled()
    await user.type(screen.getByLabelText('Buscar cliente'), 'inexistente')
    expect(await screen.findByText(/No se encontraron clientes/)).toBeInTheDocument()
    vi.mocked(listarClientes).mockResolvedValue([{ id: 7, nombre: 'Ana', nombre_completo: 'Ana Pérez', documento: '00123', email: 'ana@example.com' } as never])
    await user.clear(screen.getByLabelText('Buscar cliente'))
    await user.type(screen.getByLabelText('Buscar cliente'), '00123')
    await user.click(await screen.findByRole('radio'))
    expect(descargarReporte).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Descargar' }))
    await waitFor(() => expect(descargarReporte).toHaveBeenCalledWith('clientes', 'pdf', expect.objectContaining({ cliente: '7' })))
  })
  it('permite seleccionar moneda y período para tasas', async () => {
    const user = userEvent.setup()
    render(<Reports />)
    await user.click(screen.getByRole('button', { name: 'Evolución de tasas PDF' }))
    await screen.findByRole('option', { name: 'Dólar (USD)' })
    await user.selectOptions(screen.getByLabelText('Período'), 'Hoy')
    await user.click(screen.getByRole('button', { name: 'Descargar' }))
    await waitFor(() => expect(descargarReporte).toHaveBeenCalledWith('tasas', 'pdf', expect.objectContaining({ moneda: 'USD', periodo: 'Hoy' })))
  })
  it('facturas excluye pendientes y conserva el diálogo cuando falla la descarga', async () => {
    const user = userEvent.setup()
    vi.mocked(descargarReporte).mockRejectedValue(new Error('No se pudo consultar el reporte'))
    render(<Reports />)
    await user.click(screen.getByRole('button', { name: 'Reporte de facturas Excel' }))
    expect(screen.queryByRole('option', { name: 'Pendiente' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Descargar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
