/**
 * Pruebas de las utilidades de tasa (PI-82): aceptar decimales en el
 * campo de tasa de cambio.
 *
 * @module tasas.test
 */
import { describe, it, expect } from 'vitest'
import {
  DECIMALES_TASA,
  aTextoTasa,
  esNumeroTasa,
  formatearTasa,
  normalizarTasa,
  redondearTasa,
} from '@/utils/tasas'

describe('normalizarTasa', () => {
  it('acepta el punto como separador decimal', () => {
    expect(normalizarTasa('3.9')).toBe(3.9)
    expect(normalizarTasa('3.95')).toBe(3.95)
    expect(normalizarTasa('7580.25')).toBe(7580.25)
  })

  it('acepta la coma como separador decimal', () => {
    // En Paraguay la convención es la coma: no debe perderse el valor.
    expect(normalizarTasa('3,9')).toBe(3.9)
    expect(normalizarTasa('5,20')).toBe(5.2)
    expect(normalizarTasa('7580,25')).toBe(7580.25)
  })

  it('ignora espacios alrededor y dentro del número', () => {
    expect(normalizarTasa(' 3.95 ')).toBe(3.95)
    expect(normalizarTasa('1 000,50')).toBe(1000.5)
  })

  it('acepta enteros y cero', () => {
    expect(normalizarTasa('7400')).toBe(7400)
    expect(normalizarTasa('0')).toBe(0)
    expect(normalizarTasa('0,00')).toBe(0)
    expect(normalizarTasa('0.005')).toBe(0.005)
  })

  it('devuelve null en lugar de NaN para campo vacío o inválido', () => {
    // La diferencia con la versión anterior: '' ya no se convierte en 0.
    expect(normalizarTasa('')).toBeNull()
    expect(normalizarTasa('   ')).toBeNull()
    expect(normalizarTasa('abc')).toBeNull()
    expect(normalizarTasa('3.9.9')).toBeNull()
    expect(normalizarTasa('1e5')).toBeNull()
    expect(normalizarTasa('12,5,5')).toBeNull()
    expect(normalizarTasa(null)).toBeNull()
    expect(normalizarTasa(undefined)).toBeNull()
  })

  it('acepta números ya convertidos', () => {
    expect(normalizarTasa(3.95)).toBe(3.95)
    expect(normalizarTasa(0)).toBe(0)
    expect(normalizarTasa(Number.NaN)).toBeNull()
  })
})

describe('PI-82: esNumeroTasa', () => {
  it('distingue el cero escrito de un campo vacío', () => {
    expect(esNumeroTasa('0')).toBe(true)
    expect(esNumeroTasa('0,00')).toBe(true)
    expect(esNumeroTasa('')).toBe(false)
    expect(esNumeroTasa('   ')).toBe(false)
    expect(esNumeroTasa('abc')).toBe(false)
  })
})

describe('PI-82: formatearTasa', () => {
  it('muestra los decimales cuando los hay', () => {
    expect(formatearTasa(5.2)).toBe('5.2')
    expect(formatearTasa(7580.25)).toBe('7580.25')
    expect(formatearTasa(0.5)).toBe('0.5')
  })

  it('no agrega separador de miles a las tasas', () => {
    // Antes toLocaleString() en locale es devolvía '7.580,25' en la tabla.
    expect(formatearTasa(7580)).toBe('7580')
    expect(formatearTasa(0)).toBe('0')
  })

  it('respeta la precisión del backend y no alarga de más', () => {
    expect(formatearTasa(5.123)).toBe('5.12')
    expect(formatearTasa(5.999)).toBe('6')
    expect(formatearTasa(0.005)).toBe('0.01')
  })

  it('devuelve un guion para valores no finitos', () => {
    expect(formatearTasa(Number.NaN)).toBe('—')
    expect(formatearTasa(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('PI-82: redondearTasa', () => {
  it('evita el ruido de coma flotante antes de enviar al backend', () => {
    expect(redondearTasa(7580.005)).toBe(7580.01)
    expect(redondearTasa(0.1 + 0.2)).toBe(0.3)
  })

  it('deja intactas las tasas con la precisión que ya admite el backend', () => {
    expect(redondearTasa(7580.25)).toBe(7580.25)
    expect(redondearTasa(7400)).toBe(7400)
  })

  it('usa la misma precisión que el formato', () => {
    expect(DECIMALES_TASA).toBe(2)
    expect(redondearTasa(5.999)).toBe(6)
  })
})

describe('PI-82: aTextoTasa', () => {
  it('muestra el número tal cual para el input controlado', () => {
    expect(aTextoTasa(7580.25)).toBe('7580.25')
    expect(aTextoTasa(5.2)).toBe('5.2')
    expect(aTextoTasa(7400)).toBe('7400')
  })

  it('devuelve cadena vacía para null o valores no finitos', () => {
    // Evita que el input aparezca con un 0 engañoso al borrar el campo.
    expect(aTextoTasa(null)).toBe('')
    expect(aTextoTasa(undefined)).toBe('')
    expect(aTextoTasa(Number.NaN)).toBe('')
  })
})