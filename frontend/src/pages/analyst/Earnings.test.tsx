/**
 * Pruebas PI-72 de ganancias del analista (mock local, solo lectura).
 *
 * @module Earnings.test
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Earnings from '@/pages/analyst/Earnings'

describe('Earnings (mock local)', () => {
  it('muestra tarjetas, gráficos y métricas', () => {
    render(<Earnings />)
    expect(screen.getByText(/Ganancia total/)).toBeInTheDocument()
    expect(screen.getByText('Ganancias mensuales por divisa')).toBeInTheDocument()
    expect(screen.getByText('Distribución por divisa')).toBeInTheDocument()
    expect(screen.getByText('Ganancia promedio mensual')).toBeInTheDocument()
    expect(screen.getByText('Margen de spread promedio')).toBeInTheDocument()
  })
})
