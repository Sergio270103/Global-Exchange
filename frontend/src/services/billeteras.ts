/**
 * Servicio de billeteras y medios de acreditación (PI-66).
 *
 * - `listarBilleteras(clienteId)`: saldos multidivisa del cliente
 *   (RF17). Las billeteras nacen en cero de forma perezosa.
 * - CRUD de `MedioAcreditacion`: dónde recibe los fondos el cliente
 *   por defecto (guía Hito 5). Solo vinculación.
 *
 * @module services/billeteras
 */
import { apiFetch } from '@/services/api'
import { banderaDesdeCodigo } from '@/services/monedas'

/** Billetera tal como la devuelve el backend. */
export interface Billetera {
  id: number
  cliente: number
  moneda: number
  moneda_codigo: string
  moneda_nombre: string
  flag: string
  saldo: number
}

interface BilleteraApi {
  id: number
  cliente: number
  moneda: number
  moneda_codigo: string
  moneda_nombre: string
  saldo: string
}

/** Medio de acreditación tal como lo devuelve el backend. */
export interface MedioAcreditacion {
  id: number
  cliente: number
  cliente_nombre: string
  tipo: 'BILLETERA' | 'CUENTA'
  tipo_display: string
  billetera: number | null
  cuenta: number | null
  destino_detalle: string
  es_default: boolean
}

/**
 * Lista los saldos multidivisa de un cliente.
 */
export async function listarBilleteras(clienteId: number): Promise<Billetera[]> {
  const datos = await apiFetch<BilleteraApi[]>(`/billeteras/?cliente=${clienteId}`)
  return datos.map(b => ({
    id: b.id,
    cliente: b.cliente,
    moneda: b.moneda,
    moneda_codigo: b.moneda_codigo,
    moneda_nombre: b.moneda_nombre,
    flag: banderaDesdeCodigo(b.moneda_codigo),
    saldo: Number(b.saldo),
  }))
}

/**
 * Lista los medios de acreditación de un cliente.
 */
export async function listarMedios(clienteId?: number): Promise<MedioAcreditacion[]> {
  const qs = clienteId ? `?cliente=${clienteId}` : ''
  return apiFetch<MedioAcreditacion[]>(`/medios-acreditacion/${qs}`)
}

/**
 * Registra un medio de acreditación.
 */
export async function crearMedio(datos: {
  cliente: number
  tipo: 'BILLETERA' | 'CUENTA'
  billetera?: number | null
  cuenta?: number | null
  es_default?: boolean
}): Promise<MedioAcreditacion> {
  return apiFetch<MedioAcreditacion>('/medios-acreditacion/', {
    method: 'POST',
    body: JSON.stringify(datos),
  })
}

/**
 * Marca un medio como defecto (desmarca los demás del cliente).
 */
export async function marcarDefault(id: number): Promise<MedioAcreditacion> {
  return apiFetch<MedioAcreditacion>(`/medios-acreditacion/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ es_default: true }),
  })
}

/**
 * Elimina un medio de acreditación.
 */
export async function eliminarMedio(id: number): Promise<void> {
  await apiFetch(`/medios-acreditacion/${id}/`, { method: 'DELETE' })
}
