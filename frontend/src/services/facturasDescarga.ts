/**
 * Servicio de descargas de facturas (PI-86).
 *
 * Consume el listado de facturas electrónicas que emite PI-30
 * (`GET /api/facturas/`, backend `facturacion/` con Factura Segura) y le
 * agrega lo que pide esta historia:
 *
 * - `listarFacturasElectronicas()`: facturas emitidas visibles para el
 *   usuario (el backend ya restringe por rol).
 * - `elegirFactura()`: la factura electrónica "vigente" de una operación
 *   (prioridad APROBADA > EMITIDA/VERIFICAR > RECHAZADA > ERROR).
 * - `descargarFacturaPdf()`: PDF por fila, solo si SIFEN la aprobó; el
 *   archivo se llama `001-003-0000100.pdf`, con el número real que
 *   devolvió el servicio de facturación.
 * - `descargarDocumentoOficial()`: el KuDE (PDF) o el XML firmado de una
 *   factura **real** aprobada, tal como lo genera Factura Segura
 *   (`GET /api/facturas/{id}/kude|xml/`). Las simuladas usan el PDF propio.
 * - `descargarFacturasCsv()`: exporta el listado filtrado a CSV
 *   compatible con Excel en español (`;`, coma decimal y BOM UTF-8).
 *
 * No modifica `services/facturas.ts` (la emisión, PI-30): de ahí solo se
 * reusan los tipos y las etiquetas de estado.
 *
 * @module services/facturasDescarga
 */
import { jsPDF } from 'jspdf'
import { apiDescargar, apiFetch } from '@/services/api'
import {
  ETIQUETA_ESTADO_FACTURA,
  type EstadoFactura,
  type FacturaElectronica,
} from '@/services/facturas'
import type { Operacion } from '@/services/operaciones'

/** Factura electrónica con el emisor (el serializer de PI-30 lo incluye). */
export interface FacturaElectronicaCompleta extends FacturaElectronica {
  emitida_por_nombre: string
}

function normalizar(f: Record<string, unknown>): FacturaElectronicaCompleta {
  return {
    id: Number(f.id),
    operacion: Number(f.operacion),
    cliente_nombre: String(f.cliente_nombre ?? ''),
    simulada: Boolean(f.simulada),
    numero: f.numero == null ? null : String(f.numero),
    numero_completo: String(f.numero_completo ?? ''),
    cdc: String(f.cdc ?? ''),
    estado: String(f.estado ?? 'ERROR') as EstadoFactura,
    total: Number(f.total ?? 0),
    email_destino: String(f.email_destino ?? ''),
    detalle: String(f.detalle ?? ''),
    envio_fecha: f.envio_fecha == null ? null : String(f.envio_fecha),
    envio_destinatario: String(f.envio_destinatario ?? ''),
    envio_resultado: String(f.envio_resultado ?? ''),
    creada: String(f.creada ?? ''),
    estado_consultado: f.estado_consultado == null ? null : String(f.estado_consultado),
    emitida_por_nombre: String(f.emitida_por_nombre ?? ''),
  }
}

/** Facturas electrónicas del usuario contra `GET /api/facturas/` (PI-30). */
export async function listarFacturasElectronicas(): Promise<FacturaElectronicaCompleta[]> {
  const datos = await apiFetch<Record<string, unknown>[]>('/facturas/')
  return (datos ?? []).map(normalizar)
}

/** Prioridad de la factura que manda para una operación. */
const PRIORIDAD: Record<EstadoFactura, number> = {
  APROBADA: 4,
  EMITIDA: 3,
  VERIFICAR: 3,
  RECHAZADA: 2,
  ERROR: 1,
}

/**
 * La factura electrónica "vigente" de una operación.
 *
 * Una operación puede tener varios intentos (una rechazada y luego una
 * aprobada): manda la de mayor prioridad; a igual prioridad, la más
 * reciente (el backend ordena por `-creada`).
 */
export function elegirFactura(
  facturas: FacturaElectronicaCompleta[],
  operacionId: number,
): FacturaElectronicaCompleta | null {
  const candidatas = facturas.filter(f => f.operacion === operacionId)
  if (candidatas.length === 0) return null
  return candidatas.reduce((mejor, f) =>
    (PRIORIDAD[f.estado] ?? 0) > (PRIORIDAD[mejor.estado] ?? 0) ? f : mejor)
}

/** Texto del botón PDF según el estado de la factura electrónica. */
export function motivoPdf(factura: FacturaElectronicaCompleta | null): string {
  if (factura === null) {
    return 'Todavía no se emitió la factura electrónica de esta operación.'
  }
  if (factura.estado === 'APROBADA') {
    return `Descargar factura ${factura.numero_completo}`
  }
  if (factura.estado === 'RECHAZADA') {
    return factura.detalle
      ? `SIFEN rechazó la factura: ${factura.detalle}`
      : 'SIFEN rechazó la factura.'
  }
  if (factura.estado === 'EMITIDA' || factura.estado === 'VERIFICAR') {
    return 'La factura todavía no está aprobada por SIFEN.'
  }
  return factura.detalle
    ? `No se generó la factura: ${factura.detalle}`
    : 'No se generó la factura.'
}

// ----------------------------------------------------------------------
// PDF
// ----------------------------------------------------------------------

/** Nombre del PDF: el número real de la factura electrónica. */
export function nombreArchivoFactura(factura: FacturaElectronicaCompleta): string {
  const base = (factura.numero_completo || factura.cdc || `factura-${factura.id}`)
    .replace(/[^\w.-]+/g, '-')
  return `${base || 'factura'}.pdf`
}

function fechaHora(iso: string | null): string {
  if (!iso) return ''
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()} ` +
    `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
}

/** Monto con los decimales de la moneda (PYG sin decimales). */
function monto(valor: number, moneda: string): string {
  const decimales = moneda === 'PYG' ? 0 : 2
  return valor.toLocaleString('es-PY', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

/** Líneas que se imprimen en el PDF (datos de PI-30 + los de la operación). */
export function lineasFacturaPdf(
  factura: FacturaElectronicaCompleta,
  operacion: Operacion,
): string[] {
  const lineas: string[] = [
    'GLOBAL EXCHANGE - FACTURA ELECTRONICA',
    `Numero: ${factura.numero_completo || 'sin numero'}    Estado: ${factura.estado}`,
    `CDC: ${factura.cdc || '—'}`,
    `Fecha de emision: ${fechaHora(factura.creada)}`,
    `Emitida por: ${factura.emitida_por_nombre || '—'}`,
    `Emision: ${factura.simulada ? 'simulada' : 'real'}`,
  ]
  if (factura.detalle) lineas.push(`Detalle: ${factura.detalle}`)
  lineas.push(
    '------------------------------------------------------------',
    'DATOS DE LA OPERACION',
    `Operacion: OP-${operacion.id}`,
    `Cliente: ${operacion.cliente_nombre}`,
    `Tipo: ${operacion.tipo_operacion === 'COMPRA' ? 'Compra' : 'Venta'}`,
    `Entrega: ${monto(operacion.monto_enviado, operacion.moneda_origen_codigo)} ${operacion.moneda_origen_codigo}`,
    `Recibe: ${monto(operacion.monto_recibido, operacion.moneda_destino_codigo)} ${operacion.moneda_destino_codigo}`,
    `Tipo efectivo: ${operacion.cotizacion_aplicada.toLocaleString('es-PY', { maximumFractionDigits: 6 })}`,
    `Metodo de pago: ${operacion.metodo_pago || '—'}`,
    '------------------------------------------------------------',
    'DATOS DEL ENVIO AL CLIENTE',
    `Destinatario: ${factura.email_destino || '—'}`,
    `Resultado del envio: ${factura.envio_resultado || 'pendiente'}`,
  )
  if (factura.envio_fecha) lineas.push(`Fecha de envio: ${fechaHora(factura.envio_fecha)}`)
  lineas.push(
    '------------------------------------------------------------',
    `TOTAL FACTURADO: ${monto(factura.total, 'PYG')} PYG`,
    '',
    'Documento generado con los datos devueltos por el servicio de facturacion (PI-30).',
  )
  return lineas
}

/**
 * Genera y descarga el PDF de una factura aprobada por SIFEN.
 *
 * @throws Error si la factura no está aprobada. La pantalla deshabilita
 *   el botón en esos casos; este guard impide descargar una rechazada
 *   como si fuera válida.
 */
export function descargarFacturaPdf(
  factura: FacturaElectronicaCompleta,
  operacion: Operacion,
): void {
  if (factura.estado !== 'APROBADA') {
    throw new Error('Solo se descargan facturas aprobadas por SIFEN.')
  }

  const doc = new jsPDF()
  const [titulo, ...resto] = lineasFacturaPdf(factura, operacion)

  doc.setFont('courier', 'bold')
  doc.setFontSize(13)
  doc.text(titulo, 20, 20)

  doc.setFont('courier', 'normal')
  doc.setFontSize(10)
  let y = 30
  for (const linea of resto) {
    if (!linea) {
      y += 4
      continue
    }
    const renglones = doc.splitTextToSize(linea, 170) as string[]
    if (y + renglones.length * 5 > 280) {
      doc.addPage()
      y = 20
    }
    doc.text(renglones, 20, y)
    y += renglones.length * 5
  }

  doc.save(nombreArchivoFactura(factura))
}

/** Documentos oficiales que guarda Factura Segura para cada DE aprobado. */
export type DocumentoOficial = 'kude' | 'xml'

/** Guarda un `Blob` como archivo en la carpeta de descargas del navegador. */
export function guardarArchivo(contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
}

/**
 * Descarga el KuDE (PDF oficial) o el XML firmado de una factura real
 * aprobada. El backend lo pide a Factura Segura con el token del ESI.
 *
 * @throws Error si la factura no está aprobada o es simulada, o el error
 *   del backend (`ApiError`) si Factura Segura no devolvió el archivo.
 */
export async function descargarDocumentoOficial(
  factura: FacturaElectronicaCompleta,
  documento: DocumentoOficial = 'kude',
): Promise<void> {
  if (factura.estado !== 'APROBADA') {
    throw new Error('Solo se descargan facturas aprobadas por SIFEN.')
  }
  if (factura.simulada) {
    throw new Error('Es una factura simulada: no tiene documento oficial.')
  }
  const contenido = await apiDescargar(`/facturas/${factura.id}/${documento}/`)
  const base = nombreArchivoFactura(factura).replace(/\.pdf$/, '')
  guardarArchivo(contenido, `${base}.${documento === 'kude' ? 'pdf' : 'xml'}`)
}

// ----------------------------------------------------------------------
// Exportación CSV (Excel)
// ----------------------------------------------------------------------

/** Fila de la pantalla de facturas: la operación (PI-28) + su factura electrónica. */
export interface FilaFactura {
  operacion: Operacion
  /** Estado visual PI-28: Emitida / Aprobada / Rechazada. */
  estado: string
  /** Motivo PI-28 (solo cuando la operación se canceló/anuló). */
  motivo: string
  /** Factura electrónica de PI-30 si la operación tiene una. */
  factura: FacturaElectronicaCompleta | null
}

const SEPARADOR = ';'

function numeroCsv(valor: number, decimales: number): string {
  return valor.toFixed(decimales).replace('.', ',')
}

/** Escapa un campo según RFC 4180 (comillas, separador y saltos de línea). */
function campoCsv(valor: string): string {
  if (/[";\r\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

export const COLUMNAS_CSV = [
  'Nº factura', 'CDC', 'Estado FE', 'Fecha emisión', 'Cliente',
  'Total facturado (PYG)', 'Nº operación', 'Estado operación',
  'Motivo operación', 'Email destino', 'Resultado del envío',
]

/** Convierte las filas (ya filtradas) a CSV con BOM UTF-8. */
export function facturasACsv(filas: FilaFactura[]): string {
  const datos = filas.map(fila => {
    const fe = fila.factura
    return [
      fe?.numero_completo ?? '',
      fe?.cdc ?? '',
      fe ? (ETIQUETA_ESTADO_FACTURA[fe.estado] ?? fe.estado) : 'Sin factura electrónica',
      fe ? fechaHora(fe.creada) : '',
      fila.operacion.cliente_nombre,
      fe ? numeroCsv(fe.total, 0) : '',
      `OP-${fila.operacion.id}`,
      fila.estado,
      fila.motivo,
      fe?.email_destino ?? '',
      fe?.envio_resultado ?? '',
    ]
  })
  const lineas = [COLUMNAS_CSV, ...datos]
    .map(fila => fila.map(campoCsv).join(SEPARADOR))
  return '\uFEFF' + lineas.join('\r\n') + '\r\n'
}

/** Filtros que se reflejan en el nombre del CSV. */
export interface FiltrosCsvFacturas {
  estado: string
  desde: string
  hasta: string
}

/**
 * Nombre del archivo, con los filtros aplicados.
 *
 * @example nombreArchivoFacturas({ estado: 'Aprobada', desde: '', hasta: '' },
 *   new Date(2024, 0, 15)) // 'facturas_estado-Aprobada_2024-01-15.csv'
 */
export function nombreArchivoFacturas(
  filtros: FiltrosCsvFacturas,
  hoy: Date = new Date(),
): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  const fecha = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`
  const partes = ['facturas']
  if (filtros.estado && filtros.estado !== 'TODAS') partes.push(`estado-${filtros.estado}`)
  if (filtros.desde) partes.push(`desde-${filtros.desde}`)
  if (filtros.hasta) partes.push(`hasta-${filtros.hasta}`)
  partes.push(fecha)
  return `${partes.join('_')}.csv`
}

/** Dispara la descarga del CSV en el navegador. */
export function descargarFacturasCsv(filas: FilaFactura[], filtros: FiltrosCsvFacturas): void {
  const blob = new Blob([facturasACsv(filas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivoFacturas(filtros)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
