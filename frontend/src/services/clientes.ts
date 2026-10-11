/**
 * Servicio de clientes y asociaciones contra la API Django.
 *
 * - `listarClientes()`: catálogo con filtros (RF7/RF12).
 * - `misClientes()`: clientes que el usuario en sesión puede
 *   representar, para el selector de cliente activo (RF10/RF11).
 *
 * @module services/clientes
 */
import { apiFetch } from '@/services/api'

/** Cliente tal como lo devuelve el backend. */
export interface Cliente {
  id: number
  nombre: string
  apellido: string
  nombre_completo: string
  documento: string
  email: string
  telefono: string
  tipo: 'FISICA' | 'JURIDICA'
  tipo_display: string
  categoria: 'MINORISTA' | 'CORPORATIVO' | 'VIP'
  categoria_display: string
  activo: boolean
  creado_en: string
}

interface AsociacionApi {
  id: number
  cliente: number
  cliente_nombre: string
}

/**
 * Lista los clientes con filtros opcionales.
 */
export async function listarClientes(params: {
  buscar?: string
  categoria?: string
  activo?: boolean
} = {}): Promise<Cliente[]> {
  const qs = new URLSearchParams()
  if (params.buscar) qs.set('buscar', params.buscar)
  if (params.categoria) qs.set('categoria', params.categoria)
  if (params.activo !== undefined) qs.set('activo', String(params.activo))
  const sufijo = qs.toString() ? `?${qs}` : ''
  return apiFetch<Cliente[]>(`/clientes/${sufijo}`)
}

/** Datos del formulario de cliente del catálogo administrativo. */
export interface DatosCliente {
  nombre: string
  apellido?: string
  documento: string
  email: string
  telefono?: string
  tipo: 'FISICA' | 'JURIDICA'
  categoria: 'MINORISTA' | 'CORPORATIVO' | 'VIP'
}

/**
 * Registra un cliente (solo admin).
 */
export async function crearCliente(datos: DatosCliente): Promise<Cliente> {
  return apiFetch<Cliente>('/clientes/', {
    method: 'POST',
    body: JSON.stringify(datos),
  })
}

/**
 * Modifica un cliente (solo admin).
 */
export async function actualizarCliente(
  id: number,
  datos: Partial<DatosCliente>,
): Promise<Cliente> {
  return apiFetch<Cliente>(`/clientes/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  })
}

/**
 * Activa o desactiva un cliente (baja lógica, solo admin).
 */
export async function cambiarEstadoCliente(id: number, activo: boolean): Promise<Cliente> {
  return apiFetch<Cliente>(`/clientes/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ activo }),
  })
}

/**
 * Desactiva un cliente (baja lógica, solo admin).
 */
export async function eliminarCliente(id: number): Promise<void> {
  await cambiarEstadoCliente(id, false)
}

/** Asociación usuario Keycloak <-> cliente. */
export interface Asociacion {
  id: number
  cliente: number
  cliente_nombre: string
  keycloak_id: string
  username: string
  email: string
}

/**
 * Lista las asociaciones usuario-cliente (RF43).
 */
export async function listarAsociaciones(clienteId?: number): Promise<Asociacion[]> {
  const qs = clienteId ? `?cliente=${clienteId}` : ''
  return apiFetch<Asociacion[]>(`/asociaciones/${qs}`)
}

/**
 * Asocia un usuario Keycloak a un cliente (solo admin).
 */
export async function crearAsociacion(datos: {
  cliente: number
  keycloak_id: string
  username: string
  email: string
}): Promise<Asociacion> {
  return apiFetch<Asociacion>('/asociaciones/', {
    method: 'POST',
    body: JSON.stringify(datos),
  })
}

/**
 * Desvincula un usuario de un cliente (solo admin).
 */
export async function eliminarAsociacion(id: number): Promise<void> {
  await apiFetch(`/asociaciones/${id}/`, { method: 'DELETE' })
}

/** Muestra la categoría en español para la UI. */
export function categoriaUI(c: Cliente['categoria']): string {
  return c === 'MINORISTA' ? 'Minorista' : c === 'CORPORATIVO' ? 'Corporativo' : 'VIP'
}

/** Convierte la etiqueta de la UI al código del backend. */
export function categoriaAPI(label: string): Cliente['categoria'] {
  const l = label.trim().toLowerCase()
  return l.startsWith('corp') ? 'CORPORATIVO' : l.startsWith('vip') ? 'VIP' : 'MINORISTA'
}

/**
 * PI-45: busca un cliente presencial por documento de identidad.
 *
 * Distingue de forma explícita entre "no existe" y "existe": el cajero
 * necesita ofrecer el registro solo en el primer caso.
 */
export interface BusquedaPorDocumento {
  encontrado: boolean
  cliente: Cliente | null
}

export async function buscarClientePorDocumento(
  documento: string,
): Promise<BusquedaPorDocumento> {
  const qs = new URLSearchParams({ documento: documento.trim() })
  return apiFetch<BusquedaPorDocumento>(`/clientes/buscar-documento/?${qs}`)
}

/** Datos del alta de cliente presencial en ventanilla (PI-45). */
export interface DatosClientePresencial {
  nombre: string
  apellido: string
  documento: string
  email: string
  telefono: string
  tipo: 'FISICA' | 'JURIDICA'
  categoria?: Cliente['categoria']
}

/**
 * Registra un cliente presencial desde el panel del cajero (PI-45).
 *
 * @throws {ApiError} 400 si faltan datos o el documento ya existe.
 */
export async function registrarClientePresencial(
  datos: DatosClientePresencial,
): Promise<Cliente> {
  return apiFetch<Cliente>('/clientes/presencial/', {
    method: 'POST',
    body: JSON.stringify(datos),
  })
}

/**
 * Clientes en cuyo nombre puede operar el usuario en sesión.
 *
 * @returns Pares `{id, nombre}` para el selector de cliente activo.
 */
export async function misClientes(): Promise<{ id: number; nombre: string }[]> {
  const datos = await apiFetch<AsociacionApi[]>('/asociaciones/?mine=1')
  return datos.map(a => ({ id: a.cliente, nombre: a.cliente_nombre }))
}
