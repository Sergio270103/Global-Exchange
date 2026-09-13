/**
 * Servicio de monedas contra la API Django (`GET/POST/PATCH /api/monedas/`).
 *
 * Mantiene la misma firma que la versión con mocks para no tocar las
 * vistas: la bandera se deriva del código y `pais_iso` se envía como
 * las dos primeras letras.
 *
 * @module services/monedas
 */
import { apiFetch } from '@/services/api'
import type { Currency } from '@/types'

/** Moneda tal como la devuelve el backend. */
interface MonedaApi {
  id: number
  codigo: string
  nombre: string
  simbolo: string
  decimales: number
  pais_iso: string
  activo: boolean
}

/** Datos editables de una moneda (sin el id ni el estado). */
export type DatosMoneda = Omit<Currency, 'id' | 'active'>

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
  const pais = code.trim().toUpperCase().slice(0, 2)
  if (!/^[A-Z]{2}$/.test(pais)) return '🏳️'
  return String.fromCodePoint(...[...pais].map(letra => 0x1f1e6 + letra.charCodeAt(0) - 65))
}

function mapear(m: MonedaApi): Currency {
  return {
    id: m.id,
    code: m.codigo,
    name: m.nombre,
    symbol: m.simbolo,
    flag: banderaDesdeCodigo(m.codigo),
    decimals: m.decimales,
    active: m.activo,
  }
}

/**
 * Lista las monedas registradas.
 *
 * @param soloActivas - Si es `true`, pide solo las habilitadas.
 * @returns Las monedas ordenadas por código.
 */
export async function listarMonedas(soloActivas = false): Promise<Currency[]> {
  const datos = await apiFetch<MonedaApi[]>(`/monedas/${soloActivas ? '?activo=true' : ''}`)
  return datos
    .map(mapear)
    .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Registra una nueva moneda (solo admin).
 *
 * @param datos - Código, nombre, símbolo, bandera y decimales.
 * @returns La moneda creada, ya habilitada.
 */
export async function crearMoneda(datos: DatosMoneda): Promise<Currency> {
  const creada = await apiFetch<MonedaApi>('/monedas/', {
    method: 'POST',
    body: JSON.stringify({
      codigo: datos.code.trim().toUpperCase(),
      nombre: datos.name.trim(),
      simbolo: datos.symbol.trim(),
      decimales: datos.decimals,
      pais_iso: datos.code.trim().toUpperCase().slice(0, 2),
    }),
  })
  return mapear(creada)
}

/**
 * Modifica los datos de una moneda existente (solo admin).
 *
 * @param id - Identificador de la moneda a modificar.
 * @param datos - Nuevos valores de la moneda.
 * @returns La moneda actualizada.
 */
export async function actualizarMoneda(id: number, datos: DatosMoneda): Promise<Currency> {
  const actualizada = await apiFetch<MonedaApi>(`/monedas/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      codigo: datos.code.trim().toUpperCase(),
      nombre: datos.name.trim(),
      simbolo: datos.symbol.trim(),
      decimales: datos.decimals,
      pais_iso: datos.code.trim().toUpperCase().slice(0, 2),
    }),
  })
  return mapear(actualizada)
}

/**
 * Habilita o deshabilita una moneda (solo admin).
 *
 * La baja es siempre lógica: una moneda deshabilitada deja de ofrecerse
 * a los clientes pero conserva su histórico de tasas y transacciones.
 *
 * @param id - Identificador de la moneda.
 * @param active - Nuevo estado de la moneda.
 * @returns La moneda con su estado actualizado.
 */
export async function cambiarEstado(id: number, active: boolean): Promise<Currency> {
  const actualizada = await apiFetch<MonedaApi>(`/monedas/${id}/estado/`, {
    method: 'PATCH',
    body: JSON.stringify({ activo: active }),
  })
  return mapear(actualizada)
}

/**
 * Sin efecto contra la API (los datos viven en Postgres). Se conserva
 * para compatibilidad con las pruebas que aíslan estado.
 */
export function reiniciarMonedas(): void {
  /* sin-op */
}
