import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import OperacionesFactura from './OperacionesFactura'
import { apiFetch } from '@/services/api'
import type { FacturaElectronicaCompleta } from '@/services/facturasDescarga'

vi.mock('@/services/api', () => ({ apiFetch: vi.fn(), ApiError: class extends Error {} }))
const api = vi.mocked(apiFetch)
const factura: FacturaElectronicaCompleta = { id: 10, estado: 'APROBADA', puede_gestionar: true,
  puede_cancelar: true, puede_nota_credito: true, email_destino: 'cliente@test.com',
  notas_credito: [], estado_cancelacion: '', emitida_por_nombre: 'Cajero', operacion: 1,
  cliente_nombre: 'Cliente', simulada: true, numero: '0000100', numero_completo: '001-003-0000100',
  cdc: '01'.padEnd(44, '0'), total: 1000, detalle: '', envio_fecha: null,
  envio_destinatario: '', envio_resultado: '', creada: '2026-11-17', estado_consultado: null }

describe('despacho de gestión desde la tabla', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it.each(['cajero', 'administrador'] as const)('anula exclusivamente con cancelar en contexto %s', async rol => {
    api.mockResolvedValue({ factura, evento: {} })
    const onActualizada = vi.fn()
    render(<OperacionesFactura factura={factura} contextoRol={rol} onActualizada={onActualizada} />)
    fireEvent.change(screen.getByLabelText('Operación de factura'), { target: { value: 'cancelar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(onActualizada).toHaveBeenCalledOnce())
    expect(api).toHaveBeenCalledExactlyOnceWith('/facturas/10/cancelar/', {
      method: 'POST', body: JSON.stringify({ motivo: '', contexto_rol: rol }),
    })
  })
  it.each(['cajero', 'administrador'] as const)('emite NC exclusivamente con nota-credito en contexto %s', async rol => {
    api.mockResolvedValue({ id: 20 })
    const onActualizada = vi.fn()
    render(<OperacionesFactura factura={factura} contextoRol={rol} onActualizada={onActualizada} />)
    fireEvent.change(screen.getByLabelText('Operación de factura'), { target: { value: 'nc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(onActualizada).toHaveBeenCalledOnce())
    expect(api).toHaveBeenCalledExactlyOnceWith('/facturas/10/nota-credito/', {
      method: 'POST', body: JSON.stringify({ motivo: '5', email: 'cliente@test.com', contexto_rol: rol }),
    })
  })
  it('no permite confirmar una acción vacía', () => {
    render(<OperacionesFactura factura={factura} contextoRol="cajero" onActualizada={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
  })
  it('muestra la reversión pendiente aunque el PDF también esté pendiente y reintenta sin reenviar a SIFEN', async () => {
    const pendiente = { ...factura, estado: 'ANULADA', reversion_pendiente: true,
      reversion_error: 'Saldo insuficiente', pdf_pendiente: true } as FacturaElectronicaCompleta
    api.mockResolvedValue({ ...pendiente, reversion_error: 'El turno está cerrado' })
    const onActualizada = vi.fn()
    render(<OperacionesFactura factura={pendiente} contextoRol="administrador" onActualizada={onActualizada} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Saldo insuficiente')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar reversión' }))
    await waitFor(() => expect(onActualizada).toHaveBeenCalledOnce())
    expect(screen.getByRole('alert')).toHaveTextContent('El turno está cerrado')
    expect(api).toHaveBeenCalledExactlyOnceWith('/facturas/10/reversion/reintentar/', { method: 'POST' })
  })
})
