/**
 * Servicio del historial de transacciones (PI-65, RF34/RF35). Solo consulta.
 *
 * - `listarHistorial()`: pide al backend las operaciones del cliente activo
 *   con los cuatro filtros de RF35 (fecha, tipo, moneda y estado). La
 *   restricción a "solo lo suyo" la hace Django, no este módulo.
 * - `validarRangoFechas()`: evita pedir un rango con `desde` > `hasta`.
 * - `historialACsv()` / `descargarHistorial()`: descarga del historial (RF34)
 *   en CSV compatible con Excel en español (separador `;`, coma decimal, BOM).
 *
 * @module services/historial
 */
import {
  listarOperaciones,
  type EstadoOperacion,
  type MotivoCancelacion,
  type Operacion,
  type TipoOperacion,
} from '@/services/operaciones'

/** Filtros de RF35. Todos opcionales; vacío = sin filtrar. */
export interface FiltrosHistorial {
  /**
   * Pedir todas las operaciones (vista del administrador). El backend lo
   * valida: si el usuario no es admin, igual recibe solo lo suyo.
   */
  todos?: boolean
  /**
   * Cliente activo de la sesión. Si se indica, solo sus operaciones; si no,
   * las de todos los clientes asociados al usuario.
   */
  clienteId?: number
  /** Fecha inicial inclusive, `AAAA-MM-DD`. */
  desde?: string
  /** Fecha final inclusive, `AAAA-MM-DD`. */
  hasta?: string
  tipo?: TipoOperacion
  /** Código ISO, ej. `USD`. Coincide con moneda origen o destino. */
  moneda?: string
  estado?: EstadoOperacion
}

export const ETIQUETA_ESTADO: Record<EstadoOperacion, string> = {
  PENDIENTE: 'Pendiente',
  PAGADA: 'Pagada',
  CANCELADA: 'Cancelada',
  ANULADA: 'Anulada',
}

export const ETIQUETA_TIPO: Record<TipoOperacion, string> = {
  COMPRA: 'Compra',
  VENTA: 'Venta',
}

const ETIQUETA_MOTIVO: Record<MotivoCancelacion, string> = {
  COTIZACION_CAMBIADA: 'No aceptó la nueva cotización',
  DESISTIO: 'Desistió',
}

/** Clases Tailwind del badge de cada estado (historial y dashboard admin). */
export function estiloEstado(estado: EstadoOperacion): string {
  switch (estado) {
    case 'PENDIENTE':
      return 'bg-amber-50 text-amber-700 border-amber-100'
    case 'CANCELADA':
      return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'ANULADA':
      return 'bg-red-50 text-red-700 border-red-100'
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  }
}

/** Estados que ofrece el filtro, en el orden del diagrama. */
export const ESTADOS: EstadoOperacion[] = ['PENDIENTE', 'PAGADA', 'CANCELADA', 'ANULADA']

/**
 * Valida el rango de fechas.
 *
 * @returns Mensaje de error, o `null` si el rango es válido.
 */
export function validarRangoFechas(desde?: string, hasta?: string): string | null {
  if (desde && hasta && desde > hasta) {
    return 'La fecha "desde" no puede ser posterior a la fecha "hasta".'
  }
  return null
}

/**
 * Historial del usuario autenticado con los filtros de RF35.
 *
 * @throws Error si el rango de fechas es inválido.
 */
export async function listarHistorial(filtros: FiltrosHistorial = {}): Promise<Operacion[]> {
  const error = validarRangoFechas(filtros.desde, filtros.hasta)
  if (error) throw new Error(error)
  return listarOperaciones({
    mine: !filtros.todos,
    clienteId: filtros.clienteId || undefined,
    desde: filtros.desde || undefined,
    hasta: filtros.hasta || undefined,
    tipo: filtros.tipo || undefined,
    moneda: filtros.moneda || undefined,
    estado: filtros.estado || undefined,
  })
}

// ----------------------------------------------------------------------
// Descarga (RF34)
// ----------------------------------------------------------------------

const SEPARADOR = ';'

/** Número con coma decimal y sin separador de miles (lo lee bien Excel en español). */
function numeroCsv(valor: number, decimales: number): string {
  return valor.toFixed(decimales).replace('.', ',')
}

function decimalesDe(codigo: string): number {
  return codigo === 'PYG' ? 0 : 2
}

/** `2026-09-25T20:01:00Z` -> `25/09/2026 17:01` en hora local. */
export function fechaHoraCsv(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`
}

/** Escapa un campo según RFC 4180 (comillas, separador y saltos de línea). */
export function campoCsv(valor: string): string {
  if (/[";\r\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

export const COLUMNAS_CSV = [
  'ID', 'Fecha', 'Cliente', 'Realizada por', 'Tipo', 'Estado',
  'Moneda origen', 'Monto enviado', 'Moneda destino', 'Monto recibido',
  'Tipo efectivo', 'Método de pago',
  'Fecha de pago', 'Fecha de cancelación', 'Cancelada por', 'Motivo de cancelación',
]

/**
 * Convierte operaciones a CSV. Incluye BOM para que Excel respete los acentos.
 * El CSV conserva los momentos exactos (pago y cancelación) para auditoría.
 */
export function historialACsv(ops: Operacion[]): string {
  const filas = ops.map(o => [
    String(o.id),
    fechaHoraCsv(o.fecha_creacion),
    o.cliente_nombre,
    o.usuario_nombre,
    ETIQUETA_TIPO[o.tipo_operacion],
    ETIQUETA_ESTADO[o.estado] ?? o.estado,
    o.moneda_origen_codigo,
    numeroCsv(o.monto_enviado, decimalesDe(o.moneda_origen_codigo)),
    o.moneda_destino_codigo,
    numeroCsv(o.monto_recibido, decimalesDe(o.moneda_destino_codigo)),
    numeroCsv(o.cotizacion_aplicada, 6),
    o.metodo_pago,
    fechaHoraCsv(o.fecha_confirmacion),
    fechaHoraCsv(o.fecha_cancelacion),
    o.cancelada_por_nombre,
    o.motivo_cancelacion ? ETIQUETA_MOTIVO[o.motivo_cancelacion] : '',
  ])
  const lineas = [COLUMNAS_CSV, ...filas].map(f => f.map(campoCsv).join(SEPARADOR))
  return '\uFEFF' + lineas.join('\r\n') + '\r\n'
}

/**
 * Nombre del archivo, con el rango filtrado si lo hay.
 *
 * @example nombreArchivoHistorial({ desde: '2026-09-01' }, new Date(2026, 8, 25))
 *   // 'historial-transacciones_desde-2026-09-01_2026-09-25.csv'
 */
export function nombreArchivoHistorial(filtros: FiltrosHistorial, hoy: Date = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  const fecha = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`
  const partes = ['historial-transacciones']
  if (filtros.desde) partes.push(`desde-${filtros.desde}`)
  if (filtros.hasta) partes.push(`hasta-${filtros.hasta}`)
  partes.push(fecha)
  return `${partes.join('_')}.csv`
}

/** Dispara la descarga del CSV en el navegador. */
export function descargarHistorial(ops: Operacion[], filtros: FiltrosHistorial = {}): void {
  const blob = new Blob([historialACsv(ops)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivoHistorial(filtros)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}