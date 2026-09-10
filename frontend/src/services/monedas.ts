/**
 * Servicio de monedas.
 *
 * Concentra el acceso a los datos de monedas para que las vistas no
 * dependan de dónde viven. Hoy operan sobre una copia en memoria de
 * `mockData.currencies`; cuando el backend esté disponible solo hay que
 * reemplazar el cuerpo de estas funciones por llamadas `fetch` a
 * `/api/monedas/`, sin tocar los componentes.
 *
 * Las funciones son asíncronas justamente para que ese cambio no
 * modifique la firma de nada.
 *
 * @module services/monedas
 */
import { currencies } from '@/data/mockData'
import type { Currency } from '@/types'

/** Copia local sobre la que operan las altas, bajas y modificaciones. */
let almacen: Currency[] = currencies.map(m => ({ ...m }))

/** Datos editables de una moneda (sin el id ni el estado). */
export type DatosMoneda = Omit<Currency, 'id' | 'active'>

/** Simula la latencia de red para que la UI muestre sus estados de carga. */
const demora = (ms = 120) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** Normaliza un código ISO 4217 a mayúsculas y sin espacios. */
const normalizar = (code: string) => code.trim().toUpperCase()

/**
 * Deriva la bandera a partir de las dos primeras letras del código.
 *
 * Los códigos ISO 4217 empiezan con el código de país ISO 3166-1
 * (USD → US, BRL → BR), así que se convierten a los caracteres
 * indicadores regionales que forman el emoji de bandera.
 *
 * @param code - Código de la moneda, por ejemplo `USD`.
 * @returns El emoji de la bandera, o una bandera neutra si no se puede derivar.
 */
export function banderaDesdeCodigo(code: string): string {
  const pais = normalizar(code).slice(0, 2)
  if (!/^[A-Z]{2}$/.test(pais)) return '🏳️'
  return String.fromCodePoint(...[...pais].map(letra => 0x1f1e6 + letra.charCodeAt(0) - 65))
}

/**
 * Lista las monedas registradas.
 *
 * @param soloActivas - Si es `true`, devuelve únicamente las monedas habilitadas.
 * @returns Las monedas ordenadas por código.
 */
export async function listarMonedas(soloActivas = false): Promise<Currency[]> {
  await demora()
  const resultado = soloActivas ? almacen.filter(m => m.active) : almacen
  return resultado.map(m => ({ ...m })).sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Registra una nueva moneda.
 *
 * @param datos - Código, nombre, símbolo, bandera y decimales de la moneda.
 * @returns La moneda creada, ya habilitada.
 * @throws Si el código ya está en uso.
 */
export async function crearMoneda(datos: DatosMoneda): Promise<Currency> {
  await demora()
  const code = normalizar(datos.code)
  if (almacen.some(m => m.code === code)) {
    throw new Error('Ya existe una moneda con este código.')
  }
  const moneda: Currency = {
    ...datos,
    code,
    id: Math.max(0, ...almacen.map(m => m.id)) + 1,
    active: true,
  }
  almacen = [...almacen, moneda]
  return { ...moneda }
}

/**
 * Modifica los datos de una moneda existente.
 *
 * @param id - Identificador de la moneda a modificar.
 * @param datos - Nuevos valores de la moneda.
 * @returns La moneda actualizada.
 * @throws Si la moneda no existe o el código pertenece a otra moneda.
 */
export async function actualizarMoneda(id: number, datos: DatosMoneda): Promise<Currency> {
  await demora()
  const code = normalizar(datos.code)
  if (!almacen.some(m => m.id === id)) {
    throw new Error('La moneda que intentás editar ya no existe.')
  }
  if (almacen.some(m => m.code === code && m.id !== id)) {
    throw new Error('Ya existe otra moneda con este código.')
  }
  almacen = almacen.map(m => (m.id === id ? { ...m, ...datos, code } : m))
  return { ...almacen.find(m => m.id === id)! }
}

/**
 * Habilita o deshabilita una moneda.
 *
 * La baja es siempre lógica: una moneda deshabilitada deja de ofrecerse
 * a los clientes pero conserva su histórico de tasas y transacciones.
 *
 * @param id - Identificador de la moneda.
 * @param active - Nuevo estado de la moneda.
 * @returns La moneda con su estado actualizado.
 * @throws Si la moneda no existe.
 */
export async function cambiarEstado(id: number, active: boolean): Promise<Currency> {
  await demora()
  if (!almacen.some(m => m.id === id)) {
    throw new Error('La moneda que intentás modificar ya no existe.')
  }
  almacen = almacen.map(m => (m.id === id ? { ...m, active } : m))
  return { ...almacen.find(m => m.id === id)! }
}

/** Restaura los datos iniciales. Pensado para aislar las pruebas unitarias. */
export function reiniciarMonedas(): void {
  almacen = currencies.map(m => ({ ...m }))
}