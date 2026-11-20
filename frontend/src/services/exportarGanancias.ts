import { jsPDF } from 'jspdf'
import { formatoImporte, type FiltrosGanancias, type Ganancias } from './ganancias'

const columnas = ['Período', 'Moneda', 'Operaciones', 'Volumen', 'Comisión', 'Equivalente PYG']

export async function exportarGanancias(formato: 'pdf' | 'xlsx', datos: Ganancias, filtros: FiltrosGanancias) {
  const filas = datos.filas.map(f => [f.periodo, f.moneda, f.operaciones, f.volumen, f.comision, f.equivalente_pyg])
  const periodo = `Desde ${filtros.desde || 'el inicio'} hasta ${filtros.hasta || 'la última operación'} · ${filtros.moneda || 'Todas las monedas'}`
  const total = ['Total PYG', 'PYG', datos.operaciones, datos.filas.reduce((s, f) => s + f.volumen_pyg, 0), '', datos.total_pyg]
  if (formato === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs')
    const libro = new ExcelJS.Workbook()
    const hoja = libro.addWorksheet('Ganancias')
    hoja.addRow(['Reporte de ganancias'])
    hoja.addRow([periodo])
    hoja.addRow(columnas).font = { bold: true }
    hoja.addRows(filas)
    hoja.addRow(total).font = { bold: true }
    hoja.columns.forEach(columna => { columna.width = 22 })
    const buffer = await libro.xlsx.writeBuffer()
    const blob = new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = 'reporte-ganancias.xlsx'
    enlace.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }

  const pdf = new jsPDF({ orientation: 'landscape' })
  const posiciones = [14, 63, 104, 145, 192, 239]
  let y = 0
  const encabezado = () => {
    pdf.setFontSize(17)
    pdf.text('Reporte de ganancias', 14, 16)
    pdf.setFontSize(10)
    pdf.text(periodo, 14, 24)
    columnas.forEach((titulo, i) => pdf.text(titulo, posiciones[i], 37))
    pdf.line(14, 40, 283, 40)
    y = 47
  }

  encabezado()
  for (const fila of [...filas, total]) {
    if (y > 194) {
      pdf.addPage()
      encabezado()
    }
    fila.forEach((valor, i) => pdf.text(typeof valor === 'number' ? formatoImporte(valor) : valor, posiciones[i], y))
    y += 7
  }
  pdf.save('reporte-ganancias.pdf')
}
