/**
 * Pruebas de la pantalla recordada al recargar.
 *
 * @module paginaGuardada.test
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { borrarPagina, guardarPagina, leerPagina } from '@/utils/paginaGuardada'

describe('paginaGuardada', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('recupera la pantalla del mismo rol', () => {
    guardarPagina('invoices', 'admin')
    expect(leerPagina('admin')).toBe('invoices')
  })

  it('no restaura la pantalla de otro rol', () => {
    guardarPagina('admin-clients', 'admin')
    expect(leerPagina('user')).toBeNull()
  })

  it('no guarda pantallas públicas y se borra al cerrar sesión', () => {
    guardarPagina('landing', 'user')
    expect(leerPagina('user')).toBeNull()
    guardarPagina('transactions', 'user')
    borrarPagina()
    expect(leerPagina('user')).toBeNull()
  })
})
