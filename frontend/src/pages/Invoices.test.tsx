/**
 * Pruebas PI-72 de facturas electrónicas (mock local, solo lectura).
 *
 * @module Invoices.test
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Invoices from '@/pages/Invoices'

describe('Invoices (mock local)', () => {
  it('muestra tarjetas, tabla y estados', () => {
    render(<Invoices />)
    expect(screen.getByText('Total facturas')).toBeInTheDocument()
    expect(screen.getByText('Aprobadas')).toBeInTheDocument()
    expect(screen.getByText('Facturas electrónicas')).toBeInTheDocument()
    expect(screen.getByText('F001-0891')).toBeInTheDocument()
    expect(screen.getAllByText('Aprobada').length).toBeGreaterThan(0)
    expect(screen.getByText('Rechazada')).toBeInTheDocument()
  })
})
