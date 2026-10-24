/**
 * Pruebas del arreglo de la rueda del mouse en campos numéricos.
 *
 * @module inputNumero.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { evitarCambiosConRueda } from '@/utils/inputNumero'

describe('evitarCambiosConRueda', () => {
  let quitar: (() => void) | null = null
  afterEach(() => {
    quitar?.()
    document.body.innerHTML = ''
  })

  it('la rueda quita el foco del campo numérico y no cambia el valor', () => {
    quitar = evitarCambiosConRueda()
    document.body.innerHTML = '<input id="monto" type="number" value="100" />'
    const campo = document.getElementById('monto') as HTMLInputElement
    campo.focus()
    expect(document.activeElement).toBe(campo)
    campo.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }))
    expect(document.activeElement).not.toBe(campo)
    expect(campo.value).toBe('100')
  })

  it('no toca otros campos', () => {
    quitar = evitarCambiosConRueda()
    document.body.innerHTML = '<input id="nombre" type="text" value="Ana" />'
    const campo = document.getElementById('nombre') as HTMLInputElement
    campo.focus()
    campo.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }))
    expect(document.activeElement).toBe(campo)
  })
})
