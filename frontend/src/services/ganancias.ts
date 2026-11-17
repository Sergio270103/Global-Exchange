import { apiFetch } from './api'

export type Agrupacion = 'dia' | 'mes' | 'moneda'

export interface FiltrosGanancias {
  desde: string
  hasta: string
  moneda: string
  agrupar: Agrupacion
}

interface Importes {
  moneda: string
  operaciones: number
  volumen: number
  comision: number
  equivalente_pyg: number
  volumen_pyg: number
}

export interface Ganancias {
  total_pyg: number
  operaciones: number
  operaciones_sin_tasa: number
  por_moneda: Importes[]
  por_mes: { mes: string; total_pyg: number }[]
}

export function obtenerGanancias(filtros: FiltrosGanancias, signal: AbortSignal) {
  const params = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor) params.set(nombre, valor)
  }
  return apiFetch<Ganancias>(`/operaciones/ganancias/?${params}`, { signal })
}

export const formatoImporte = (cantidad: number) => new Intl.NumberFormat('es-PY', {
  maximumFractionDigits: 2,
}).format(cantidad)
