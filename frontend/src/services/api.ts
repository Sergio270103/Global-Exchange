/**
 * Cliente HTTP base para la API Django.
 *
 * Todas las peticiones llevan el access token de Keycloak en la
 * cabecera `Authorization: Bearer <token>`, que el backend valida
 * contra el JWKS del realm (ver `backend/monedas/autenticacion.py`).
 *
 * La URL base se configura con `VITE_API_URL` (por defecto
 * `http://127.0.0.1:8000/api`, el backend local).
 *
 * @module services/api
 */
import keycloak from '@/keycloak'

/** URL base de la API, sin barra final. */
export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://127.0.0.1:8000/api'

/** Intenta refrescar el token si vence en menos de 30 segundos. */
async function tokenVigente(): Promise<string | null> {
  try {
    if (keycloak.authenticated) {
      await keycloak.updateToken(30)
    }
    return keycloak.token ?? null
  } catch {
    return keycloak.token ?? null
  }
}

/**
 * Lanza un error con el mensaje que devolvió el backend (`detail` o el
 * primer error de validación) en lugar del genérico de HTTP.
 */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function mensajeDeError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    const primerCampo = Object.values(data ?? {})[0]
    if (typeof primerCampo === 'string') return primerCampo
    if (Array.isArray(primerCampo) && typeof primerCampo[0] === 'string') return primerCampo[0]
  } catch {
    /* cuerpo no JSON */
  }
  return `La API respondió ${res.status}.`
}

/**
 * GET/POST/PATCH/DELETE contra la API con autenticación Keycloak.
 *
 * @param ruta - Ruta relativa a la API, ej. `/monedas/`.
 * @param init - Opciones de `fetch` (`method`, `body`, ...).
 * @returns El cuerpo JSON ya parseado (o `null` en 204 o si viene vacío).
 * @throws {ApiError} Si la respuesta no es 2xx.
 */
export async function apiFetch<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenVigente()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${ruta}`, { ...init, headers })
  if (res.status === 204) return null as T
  if (!res.ok) throw new ApiError(res.status, await mensajeDeError(res))
  // Un cuerpo vacío (ej. `Response(None)` en DRF) no es JSON válido.
  const texto = await res.text()
  return (texto ? JSON.parse(texto) : null) as T
}

/**
 * Descarga un archivo (PDF, XML, ...) de la API con autenticación Keycloak.
 *
 * @param ruta - Ruta relativa a la API, ej. `/facturas/3/kude/`.
 * @returns El contenido como `Blob`.
 * @throws {ApiError} Si la respuesta no es 2xx (con el `detail` del backend).
 */
export async function apiDescargar(ruta: string): Promise<Blob> {
  const token = await tokenVigente()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${ruta}`, { headers })
  if (!res.ok) throw new ApiError(res.status, await mensajeDeError(res))
  return res.blob()
}

