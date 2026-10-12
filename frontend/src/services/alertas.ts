/**
 * Servicio de alertas de tasas contra la API Django (PI-38, RF45/RNF27).
 *
 * - `listarAlertas()`: alertas del usuario autenticado.
 * - `crearAlerta()`: configura par de divisas + umbral + dirección.
 * - `actualizarAlerta()`: edita umbral/dirección o pausa/reanuda.
 * - `eliminarAlerta()`: borra la alerta.
 * - `historialDisparos()`: alertas enviadas (estado ejecutada).
 *
 * @module services/alertas
 */
import { apiFetch } from '@/services/api'

/** Dirección del disparo: supera evalúa la venta, baja evalúa la compra. */
export type DireccionAlerta = 'supera' | 'baja'
export type EstadoAlerta = 'activa' | 'pausada' | 'ejecutada'

/** Alerta de tasa tal como la devuelve el backend. */
export interface AlertaTasa {
  id: number
  moneda: number
  moneda_codigo: string
  moneda_nombre: string
  umbral: number
  direccion: DireccionAlerta
  estado: EstadoAlerta
  creado: string
  actualizado: string
}

interface AlertaTasaApi {
  id: number
  moneda: number
  moneda_codigo: string
  moneda_nombre: string
  umbral: string
  direccion: DireccionAlerta
  estado: EstadoAlerta
  creado: string
  actualizado: string
}

/** Disparo registrado en el historial (alerta enviada). */
export interface DisparoAlerta {
  id: number
  alerta: number
  moneda_codigo: string
  tasa_alcanzada: number
  umbral: number
  direccion: DireccionAlerta
  creado: string
}

interface DisparoAlertaApi {
  id: number
  alerta: number
  moneda_codigo: string
  tasa_alcanzada: string
  umbral: string
  direccion: DireccionAlerta
  creado: string
}

function mapear(a: AlertaTasaApi): AlertaTasa {
  return { ...a, umbral: Number(a.umbral) }
}

function mapearDisparo(d: DisparoAlertaApi): DisparoAlerta {
  return { ...d, tasa_alcanzada: Number(d.tasa_alcanzada), umbral: Number(d.umbral) }
}

/** Alertas configuradas por el usuario autenticado. */
export async function listarAlertas(): Promise<AlertaTasa[]> {
  const datos = await apiFetch<AlertaTasaApi[]>('/alertas/')
  return datos.map(mapear)
}

/**
 * Configura una alerta: par de divisas + umbral objetivo.
 *
 * @param monedaId - Id de la moneda en el catálogo.
 * @param umbral - Valor objetivo de la tasa.
 * @param direccion - `supera` (venta >= umbral) o `baja` (compra <= umbral).
 */
export async function crearAlerta(
  monedaId: number,
  umbral: number,
  direccion: DireccionAlerta = 'supera',
): Promise<AlertaTasa> {
  const creada = await apiFetch<AlertaTasaApi>('/alertas/', {
    method: 'POST',
    body: JSON.stringify({ moneda: monedaId, umbral, direccion }),
  })
  return mapear(creada)
}

/**
 * Edita una alerta pendiente: cambia umbral/dirección o la pausa/reanuda
 * con `{ estado: 'pausada' }` / `{ estado: 'activa' }`.
 */
export async function actualizarAlerta(
  id: number,
  datos: { umbral?: number; direccion?: DireccionAlerta; estado?: 'activa' | 'pausada' },
): Promise<AlertaTasa> {
  const actualizada = await apiFetch<AlertaTasaApi>(`/alertas/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  })
  return mapear(actualizada)
}

/** Elimina una alerta configurada. */
export async function eliminarAlerta(id: number): Promise<void> {
  await apiFetch(`/alertas/${id}/`, { method: 'DELETE' })
}

/** Historial de alertas enviadas del usuario (disparos ejecutados). */
export async function historialDisparos(alertaId?: number): Promise<DisparoAlerta[]> {
  const qs = alertaId ? `?alerta=${alertaId}` : ''
  const datos = await apiFetch<DisparoAlertaApi[]>(`/alertas/historial/${qs}`)
  return datos.map(mapearDisparo)
}

const CLAVE_LEIDAS = 'alertasLeidas'
const CLAVE_ELIMINADAS = 'alertasEliminadas'

function leerIds(clave: string): number[] {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? '[]')
  } catch {
    return []
  }
}

function guardarIds(clave: string, ids: number[]): void {
  try {
    localStorage.setItem(clave, JSON.stringify(ids))
  } catch {
    // Sin almacenamiento, el estado queda solo en memoria.
  }
}

/** Ids de disparos marcados como leídos (persiste recargas). */
export function leidasIds(): number[] {
  return leerIds(CLAVE_LEIDAS)
}

/** Marca disparos como leídos (persiste recargas). */
export function marcarLeidas(ids: number[]): void {
  guardarIds(CLAVE_LEIDAS, [...new Set([...leerIds(CLAVE_LEIDAS), ...ids])])
}

/** Ids de disparos eliminados del feed (persiste recargas). */
export function eliminadasIds(): number[] {
  return leerIds(CLAVE_ELIMINADAS)
}

/** Elimina un disparo del feed (persiste recargas). */
export function marcarEliminada(id: number): void {
  guardarIds(CLAVE_ELIMINADAS, [...new Set([...leerIds(CLAVE_ELIMINADAS), id])])
}
