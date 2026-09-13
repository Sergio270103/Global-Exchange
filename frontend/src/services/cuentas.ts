/**
 * Servicio de medios de pago contra la API Django.
 *
 * - `listarCuentas(clienteId)`: cuentas vinculadas de un cliente,
 *   con el número enmascarado (RF16).
 * - Alta/edición/baja lógica de cuentas (RF26). La baja es lógica:
 *   la cuenta se desactiva pero se conserva.
 *
 * @module services/cuentas
 */
import { apiFetch } from '@/services/api'
import type { BankAccount } from '@/types'

interface CuentaApi {
  id: number
  cliente: number
  cliente_nombre: string
  nombre: string
  apellido: string
  cedula: string
  banco: string
  numero_enmascarado: string
  codigo_bancario: string
  moneda: number
  moneda_codigo: string
  activa: boolean
}

/** Datos del formulario de cuenta bancaria. */
export interface DatosCuenta {
  cliente: number
  firstName: string
  lastName: string
  document: string
  bank: string
  account: string
  code: string
  moneda: number
}

function mapear(c: CuentaApi): BankAccount {
  return {
    id: c.id,
    bank: c.banco,
    account: c.numero_enmascarado,
    code: c.codigo_bancario,
    holder: `${c.nombre} ${c.apellido}`.trim(),
    firstName: c.nombre,
    lastName: c.apellido,
    document: c.cedula,
    currency: c.moneda_codigo,
    status: c.activa ? 'Activa' : 'Inactiva',
  }
}

/**
 * Lista las cuentas vinculadas de un cliente.
 */
export async function listarCuentas(clienteId: number): Promise<BankAccount[]> {
  const datos = await apiFetch<CuentaApi[]>(`/cuentas-bancarias/?cliente=${clienteId}`)
  return datos.map(mapear)
}

/**
 * Vincula una cuenta bancaria nueva.
 */
export async function crearCuenta(datos: DatosCuenta): Promise<BankAccount> {
  const creada = await apiFetch<CuentaApi>('/cuentas-bancarias/', {
    method: 'POST',
    body: JSON.stringify({
      cliente: datos.cliente,
      nombre: datos.firstName,
      apellido: datos.lastName,
      cedula: datos.document,
      banco: datos.bank,
      numero_cuenta: datos.account,
      codigo_bancario: datos.code,
      moneda: datos.moneda,
    }),
  })
  return mapear(creada)
}

/**
 * Edita una cuenta. Si `account` viene vacío se conserva el número
 * original (el backend nunca expone el número en claro).
 */
export async function actualizarCuenta(
  id: number,
  datos: Omit<DatosCuenta, 'cliente'>,
): Promise<BankAccount> {
  const cuerpo: Record<string, unknown> = {
    nombre: datos.firstName,
    apellido: datos.lastName,
    cedula: datos.document,
    banco: datos.bank,
    codigo_bancario: datos.code,
    moneda: datos.moneda,
  }
  if (datos.account.trim()) cuerpo.numero_cuenta = datos.account
  const actualizada = await apiFetch<CuentaApi>(`/cuentas-bancarias/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(cuerpo),
  })
  return mapear(actualizada)
}

/**
 * Desvincula una cuenta (baja lógica).
 */
export async function eliminarCuenta(id: number): Promise<void> {
  await apiFetch(`/cuentas-bancarias/${id}/`, { method: 'DELETE' })
}

/**
 * Activa o desactiva una cuenta vinculada.
 */
export async function cambiarEstadoCuenta(id: number, activa: boolean): Promise<BankAccount> {
  const actualizada = await apiFetch<CuentaApi>(`/cuentas-bancarias/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ activa }),
  })
  return mapear(actualizada)
}
