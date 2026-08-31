import { describe, it, expect } from 'vitest'
import {
  exchangeRates,
  wallets,
  clients,
  users,
  demoClients,
  historicalRates,
  editableRates,
} from '@/data/mockData'

describe('exchangeRates', () => {
  it('contiene monedas con todos los campos requeridos', () => {
    expect(exchangeRates.length).toBeGreaterThan(0)
    for (const r of exchangeRates) {
      expect(r).toHaveProperty('currency')
      expect(r).toHaveProperty('flag')
      expect(r).toHaveProperty('name')
      expect(r).toHaveProperty('buy')
      expect(r).toHaveProperty('sell')
      expect(r).toHaveProperty('change')
      expect(r).toHaveProperty('updatedAt')
      expect(typeof r.buy).toBe('number')
      expect(typeof r.sell).toBe('number')
    }
  })

  it('el precio de venta es mayor o igual al de compra', () => {
    for (const r of exchangeRates) {
      expect(r.sell).toBeGreaterThanOrEqual(r.buy)
      expect(r.buy).toBeGreaterThan(0)
      expect(r.sell).toBeGreaterThan(0)
    }
  })

  it('incluye USD, EUR, BRL y ARS (monedas admitidas)', () => {
    const codes = exchangeRates.map(r => r.currency)
    for (const code of ['USD', 'EUR', 'BRL', 'ARS']) {
      expect(codes).toContain(code)
    }
  })

  it('no repite códigos de moneda', () => {
    const codes = exchangeRates.map(r => r.currency)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('wallets', () => {
  it('todos los saldos de billetera son numéricos no negativos', () => {
    for (const w of wallets) {
      expect(typeof w.balance).toBe('number')
      expect(w.balance).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('clients (segmentación RF12)', () => {
  const validCategories = ['Minorista', 'Corporativo', 'VIP']
  const validStatuses = ['Activo', 'Suspendido']

  it('todos los clientes tienen categoría, documento y estado válidos', () => {
    for (const c of clients) {
      expect(validCategories).toContain(c.category)
      expect(validStatuses).toContain(c.status)
      expect(c.document).toBeTruthy()
      expect(typeof c.operations).toBe('number')
      expect(typeof c.users).toBe('number')
    }
  })

  it('existe al menos un cliente de cada categoría de segmentación', () => {
    const categories = clients.map(c => c.category)
    for (const cat of validCategories) {
      expect(categories).toContain(cat)
    }
  })

  it('los ids de cliente son únicos', () => {
    const ids = clients.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('users', () => {
  const validRoles = ['Administrador', 'Analista Cambiario', 'Usuario']

  it('todos los usuarios tienen rol, email, cliente y estado válidos', () => {
    for (const u of users) {
      expect(validRoles).toContain(u.role)
      expect(u.email).toContain('@')
      expect(u.client).toBeTruthy()
      expect(['Activo', 'Suspendido']).toContain(u.status)
    }
  })

  it('los ids de usuario son únicos', () => {
    const ids = users.map(u => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('existe al menos un administrador y un analista (roles del sistema)', () => {
    const roles = users.map(u => u.role)
    expect(roles).toContain('Administrador')
    expect(roles).toContain('Analista Cambiario')
  })
})

describe('demoClients', () => {
  it('lista clientes de prueba para el selector de cliente (RF10/RF11)', () => {
    expect(demoClients.length).toBeGreaterThan(0)
  })
})

describe('historicalRates', () => {
  it('tiene series de 30 lecturas para cada moneda con buy/sell', () => {
    for (const code of Object.keys(historicalRates)) {
      const series = historicalRates[code]
      expect(series.length).toBe(30)
      for (const point of series) {
        expect(typeof point.date).toBe('string')
        expect(typeof point.buy).toBe('number')
        expect(typeof point.sell).toBe('number')
      }
    }
  })
})

describe('editableRates', () => {
  it('registra quién y cuándo actualizó cada tasa (trazabilidad)', () => {
    for (const r of editableRates) {
      expect(r.updatedBy).toBeTruthy()
      expect(r.updatedAt).toBeTruthy()
    }
  })
})