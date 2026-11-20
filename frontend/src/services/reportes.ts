import { apiFetch } from './api'
import { evolucionCotizaciones } from './cotizaciones'

export type TipoReporte = 'transacciones' | 'ganancias' | 'clientes' | 'tasas' | 'facturas' | 'accesos'
export type Celda = string | number | null
export interface DatosReporte { columnas: string[]; filas: Celda[][]; notas: string[] }
export interface FiltrosReporte { desde?: string; hasta?: string; estado?: string; cliente?: string; moneda?: string; periodo?: string }
export const TITULOS: Record<TipoReporte, string> = {
  transacciones: 'Reporte de transacciones', ganancias: 'Reporte de ganancias', clientes: 'Reporte de clientes',
  tasas: 'Evolución de tasas', facturas: 'Reporte de facturas', accesos: 'Reporte de accesos',
}
const fecha = (iso: string) => new Date(iso).toLocaleString('es-PY', { timeZone: 'America/Asuncion' })

export async function obtenerReporte(tipo: TipoReporte, filtros: FiltrosReporte): Promise<DatosReporte> {
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) throw new Error('La fecha inicial debe ser anterior o igual a la final.')
  if (tipo === 'clientes' && !filtros.cliente) throw new Error('Seleccioná un cliente.')
  if (tipo === 'tasas') {
    if (!filtros.moneda) throw new Error('Seleccioná una moneda.')
    const datos = await evolucionCotizaciones(filtros.moneda, filtros.periodo || 'Mes', filtros.desde, filtros.hasta)
    const puntos = [...(datos.anterior ? [datos.anterior] : []), ...datos.cambios]
    return {
      columnas: ['ID', 'Moneda', 'Vigente desde', 'Compra PYG', 'Venta PYG', 'Observación'],
      filas: puntos.map(p => [p.id, p.moneda, fecha(p.vigente_desde), p.compra, p.venta,
        p === datos.anterior ? 'Tasa vigente al inicio del período' : 'Cambio registrado']),
      notas: [`Desde: ${fecha(datos.inicio)} | Hasta: ${fecha(datos.fin)} | Horario de Paraguay`,
        'La tasa anterior se mantiene hasta el siguiente cambio; no se crean cotizaciones artificiales.'],
    }
  }
  const qs = new URLSearchParams()
  Object.entries(filtros).forEach(([clave, valor]) => { if (valor) qs.set(clave, valor) })
  return apiFetch<DatosReporte>(`/reportes/${tipo}/?${qs}`)
}

const numericas = new Set(['Monto enviado', 'Monto recibido', 'Tasa', 'Comisiones cobradas', 'Comisiones revertidas', 'Ganancia neta', 'Total PYG', 'Compra PYG', 'Venta PYG'])
export function normalizarCeldas(datos: DatosReporte): Celda[][] {
  return datos.filas.map(fila => fila.map((valor, i) => numericas.has(datos.columnas[i]) && valor !== null && valor !== '' ? Number(valor) : valor))
}

export async function crearExcel(titulo: string, datos: DatosReporte) {
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Reporte')
  const tituloFila = hoja.addRow([titulo])
  tituloFila.font = { bold: true, size: 16 }; tituloFila.height = 26
  hoja.mergeCells(tituloFila.number, 1, tituloFila.number, datos.columnas.length)
  datos.notas.filter(Boolean).forEach(nota => {
    const fila = hoja.addRow([nota]); fila.height = 32
    hoja.mergeCells(fila.number, 1, fila.number, datos.columnas.length)
  })
  const cabecera = hoja.addRow(datos.columnas)
  cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3460' } }
  hoja.addRows(normalizarCeldas(datos))
  if (!datos.filas.length) hoja.addRow(['Sin registros para los filtros seleccionados.'])
  hoja.views = [{ state: 'frozen', ySplit: cabecera.number }]
  hoja.autoFilter = { from: { row: cabecera.number, column: 1 }, to: { row: cabecera.number + datos.filas.length, column: datos.columnas.length } }
  hoja.columns.forEach((columna, i) => {
    columna.width = Math.min(42, Math.max(18, datos.columnas[i].length + 3))
    columna.alignment = { vertical: 'top', wrapText: true }
    if (numericas.has(datos.columnas[i])) columna.numFmt = datos.columnas[i] === 'Tasa' ? '#,##0.000000' : '#,##0.00'
  })
  return libro
}

export async function crearPDF(titulo: string, datos: DatosReporte) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', format: datos.columnas.length > 8 ? 'a3' : 'a4' })
  const ancho = pdf.internal.pageSize.getWidth(), alto = pdf.internal.pageSize.getHeight()
  const margen = 12, columna = (ancho - margen * 2) / datos.columnas.length
  const paso = 4, fuente = datos.columnas.length > 8 ? 7 : 9
  let y = 0
  const partir = (texto: string, width: number): string[] => pdf.splitTextToSize(texto, width)
  const cabecera = () => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16)
    pdf.text(titulo, margen, 15)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
    y = 23
    datos.notas.filter(Boolean).forEach(nota => {
      const lineas = partir(nota, ancho - margen * 2)
      pdf.text(lineas, margen, y); y += lineas.length * paso + 2
    })
    pdf.setFontSize(fuente); pdf.setFont('helvetica', 'bold')
    const titulos = datos.columnas.map(c => partir(c, columna - 3))
    const altura = Math.max(...titulos.map(t => t.length)) * paso + 4
    pdf.setFillColor(15, 52, 96); pdf.rect(margen, y - 3, ancho - margen * 2, altura, 'F')
    pdf.setTextColor(255)
    titulos.forEach((t, i) => pdf.text(t, margen + i * columna + 1, y + 1))
    pdf.setTextColor(30); pdf.setFont('helvetica', 'normal')
    y += altura + 2
  }
  cabecera()
  const filas = normalizarCeldas(datos)
  if (!filas.length) pdf.text('Sin registros para los filtros seleccionados.', margen, y + 4)
  for (const fila of filas) {
    const textos = fila.map((v, i) => partir(typeof v === 'number' && numericas.has(datos.columnas[i])
      ? v.toLocaleString('es-PY', { maximumFractionDigits: datos.columnas[i] === 'Tasa' ? 6 : 2 }) : String(v ?? ''), columna - 3))
    let offset = 0
    const total = Math.max(1, ...textos.map(t => t.length))
    // Keep normal rows together; split only a row taller than a whole page.
    if (y + total * paso + 3 > alto - margen) { pdf.addPage(); cabecera() }
    while (offset < total) {
      if (y + paso + 3 > alto - margen) { pdf.addPage(); cabecera() }
      const cantidad = Math.min(total - offset, Math.max(1, Math.floor((alto - margen - y - 3) / paso)))
      textos.forEach((t, i) => pdf.text(t.slice(offset, offset + cantidad), margen + i * columna + 1, y))
      y += cantidad * paso + 3
      pdf.setDrawColor(220); pdf.line(margen, y - 2, ancho - margen, y - 2)
      offset += cantidad
      if (offset < total) { pdf.addPage(); cabecera() }
    }
  }
  for (let pagina = 1; pagina <= pdf.getNumberOfPages(); pagina++) {
    pdf.setPage(pagina); pdf.setFontSize(8)
    pdf.text(`${pagina} / ${pdf.getNumberOfPages()}`, ancho - margen, alto - 5, { align: 'right' })
  }
  return pdf
}

export async function descargarReporte(tipo: TipoReporte, formato: 'pdf' | 'xlsx', filtros: FiltrosReporte) {
  const datos = await obtenerReporte(tipo, filtros)
  const nombre = `reporte-${tipo}`
  if (formato === 'pdf') {
    const pdf = await crearPDF(TITULOS[tipo], datos)
    pdf.save(`${nombre}.pdf`)
  } else {
    const libro = await crearExcel(TITULOS[tipo], datos)
    const buffer = await libro.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a'); a.href = url; a.download = `${nombre}.xlsx`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
