/**
 * Evita que la rueda del mouse cambie los campos numéricos.
 *
 * En un `<input type="number">` con el foco puesto, girar la rueda con el
 * cursor encima suma o resta el `step` en vez de desplazar la página: al
 * bajar por la pantalla, un monto de `100` termina en `93` o `80` sin que
 * el usuario lo note. Pasaba en el monto del cajero, en compra/venta y en
 * cualquier campo numérico.
 *
 * Solución global: si llega un evento de rueda mientras el foco está en un
 * campo numérico, se le quita el foco. El valor no cambia y la rueda vuelve
 * a desplazar la página, como espera el usuario.
 *
 * @module utils/inputNumero
 */

/** Quita el foco al campo numérico activo (si lo hay). */
export function soltarCampoNumerico(): void {
  const activo = document.activeElement
  if (activo instanceof HTMLInputElement && activo.type === 'number') {
    activo.blur()
  }
}

/**
 * Registra el arreglo en todo el documento.
 *
 * @returns Función para quitar el listener (útil en pruebas).
 */
export function evitarCambiosConRueda(): () => void {
  document.addEventListener('wheel', soltarCampoNumerico, { passive: true })
  return () => document.removeEventListener('wheel', soltarCampoNumerico)
}
