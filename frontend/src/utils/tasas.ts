/**
 * Utilidades para editar tasas de cambio con decimales (PI-82).
 *
 * El backend guarda las tasas como `DecimalField`, así que la pantalla
 * tiene que poder escribir valores fraccionarios (`3.9`, `3.95`) sin
 * que el navegador los rechace y sin perderlos al convertir a número.
 *
 * Hay dos problemas concretos que esto resuelve:
 *
 * 1. **Separador decimal.** En un input `type="number"` el navegador solo
 *    acepta el separador del locale del navegador. Si el usuario escribe
 *    `5,20` con coma, el input queda vacío y `parseFloat('5,20')` devuelve
 *    `NaN`. :func:`normalizarTasa` acepta ambos separadores.
 * 2. **Cero accidental.** `parseFloat('') || 0` convertía un campo que el
 *    usuario recién borró en `0`, y al guardar mandaba una tasa de cero.
 *    :func:`aTextoTasa` y :func:`esNumeroTasa` permiten distinguir
 *    "vacío" de "0entered".
 *
 * @module utils/tasas
 */

/** Decimales con los que se muestra una tasa cuando tiene parte decimal. */
export const DECIMALES_TASA = 2

/**
 * Convierte lo que escribe el usuario en un número.
 *
 * Acepta punto y coma como separador decimal y descarta los espacios.
 * Devuelve `null` si no hay un número válido, para que el formulario pueda
 * distinguir el campo vacío de un cero.
 *
 * @example
 * normalizarTasa('5,20')   // 5.2
 * normalizarTasa(' 3.95 ') // 3.95
 * normalizarTasa('')       // null
 * normalizarTasa('abc')    // null
 */
export function normalizarTasa(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  const limpio = valor.trim().replace(/\s/g, '').replace(',', '.')
  if (limpio === '') return null
  // Solo números con un separador decimal opcional: evita '1.2.3' o '1e5'.
  if (!/^-?\d*\.?\d+$/.test(limpio)) return null
  const numero = Number.parseFloat(limpio)
  return Number.isFinite(numero) ? numero : null
}

/** ¿El texto es una tasa válida (incluye `0`)? */
export function esNumeroTasa(valor: string | number | null | undefined): boolean {
  return normalizarTasa(valor) !== null
}

/**
 * Formatea una tasa para mostrar en la tabla o en el log.
 *
 * Muestra hasta :data:`DECIMALES_TASA` decimales, pero no agrega `.00`
 * a las tasas enteras: `7580` queda `7580` y `7580.25` queda `7580.25`.
 * Usa punto como separador decimal, que es como se escribe la tasa.
 */
export function formatearTasa(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  const redondeado = Number(valor.toFixed(DECIMALES_TASA))
  return String(redondeado)
}

/**
 * Redondea una tasa a los decimales que guarda el backend.
 *
 * Evita mandar `7580.999999999` por error de coma flotante, que el
 * `DecimalField` del backend truncaría de forma distinta a la esperada.
 */
export function redondearTasa(valor: number): number {
  return Number(valor.toFixed(DECIMALES_TASA))
}

/**
 * Texto a mostrar en un input controlado por número.
 *
 * Devuelve cadena vacía cuando no hay valor, para que el campo aparezca
 * vacío en lugar de con un `0` engañoso.
 */
export function aTextoTasa(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return ''
  return String(valor)
}