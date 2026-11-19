import { describe, it, expect, vi, afterEach } from 'vitest'
import { crearExcel, crearPDF, obtenerReporte, type DatosReporte } from './reportes'
import { apiFetch } from './api'
import { evolucionCotizaciones } from './cotizaciones'

vi.mock('./api', () => ({ apiFetch: vi.fn() }))
vi.mock('./cotizaciones', () => ({ evolucionCotizaciones: vi.fn() }))
afterEach(() => vi.clearAllMocks())
const columnas = ['ID', 'Fecha', 'Cliente', 'Realizada por', 'Tipo', 'Estado', 'Moneda origen', 'Monto enviado', 'Moneda destino', 'Monto recibido', 'Tasa', 'Método de pago', 'Fecha de pago', 'Fecha de cancelación', 'Cancelada por', 'Motivo de cancelación']
const datos: DatosReporte = { columnas, notas: ['Fechas y horas de Paraguay.', 'Desde: 01/10/2026 | Hasta: 19/11/2026 | Estado: Todos'], filas: Array.from({ length: 100 }, (_, i) => [i + 1, '19/11/2026 12:35:45', 'José González y Asociados', 'operador@example.com', 'Compra', 'Cancelada', 'PYG', 1000000.25, 'USD', 130.55, 7659.900421, 'Transferencia bancaria', '19/11/2026 12:36:00', '19/11/2026 13:00:00', 'administrador', 'Comprobante anulado en ventanilla']) }

describe('Exportaciones de reportes', () => {
  it('envía los filtros y rechaza rangos inválidos y clientes sin seleccionar', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ columnas: [], filas: [], notas: [] })
    await obtenerReporte('transacciones', { desde: '2026-11-01', hasta: '2026-11-19', estado: 'PAGADA' })
    expect(apiFetch).toHaveBeenCalledWith('/reportes/transacciones/?desde=2026-11-01&hasta=2026-11-19&estado=PAGADA')
    await expect(obtenerReporte('clientes', {})).rejects.toThrow('Seleccioná un cliente')
    await expect(obtenerReporte('ganancias', { desde: '2026-12-01', hasta: '2026-11-01' })).rejects.toThrow('fecha inicial')
  })
  it('usa el historial real de tasas y conserva la tasa anterior con su fecha original', async () => {
    const anterior = { id: 1, moneda: 'USD', nombre: 'Dólar', flag: '', compra: 7400, venta: 7500, vigente_desde: '2026-11-18T12:00:00Z', creado_por: '' }
    vi.mocked(evolucionCotizaciones).mockResolvedValue({ inicio: '2026-11-19T03:00:00Z', fin: '2026-11-19T18:00:00Z', anterior, cambios: [] })
    const reporte = await obtenerReporte('tasas', { moneda: 'USD', periodo: 'Hoy' })
    expect(evolucionCotizaciones).toHaveBeenCalledWith('USD', 'Hoy', undefined, undefined)
    expect(reporte.filas).toHaveLength(1)
    expect(reporte.filas[0][5]).toContain('inicio del período')
  })
  it('genera Excel con números, encabezados, filtros y todos los registros', async () => {
    const libro = await crearExcel('Reporte de transacciones', datos)
    const buffer = await libro.xlsx.writeBuffer()
    const { default: ExcelJS } = await import('exceljs')
    const reabierto = new ExcelJS.Workbook()
    await reabierto.xlsx.load(buffer)
    const hoja = reabierto.worksheets[0]
    expect(hoja.rowCount).toBe(104)
    expect(hoja.getCell('K4').value).toBe('Tasa')
    expect(hoja.getCell('H5').value).toBe(1000000.25)
    expect(hoja.getCell('K5').value).toBe(7659.900421)
    expect(hoja.autoFilter).toBeTruthy()
    const facturas = await crearExcel('Facturas', { columnas: ['Documento/RUC', 'CDC', 'Total PYG'], notas: [], filas: [['001234-5', '12345678901234567890123456789012345678901234', '10000']] })
    expect(facturas.worksheets[0].getCell('A3').value).toBe('001234-5')
    expect(facturas.worksheets[0].getCell('B3').type).toBe(ExcelJS.ValueType.String)
    expect(facturas.worksheets[0].getCell('C3').value).toBe(10000)
    if (process.env.REPORT_QA_DIR) {
      const { writeFile, mkdir } = await import('node:fs/promises')
      await mkdir(process.env.REPORT_QA_DIR, { recursive: true })
      await writeFile(`${process.env.REPORT_QA_DIR}/transacciones.xlsx`, new Uint8Array(buffer))
    }
  }, 20000)
  it('genera PDF multipágina y también informes vacíos', async () => {
    const pdf = await crearPDF('Reporte de transacciones', datos)
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1)
    expect(pdf.output()).toContain('Reporte de transacciones')
    const vacio = await crearPDF('Reporte de accesos', { columnas: ['Nombre', 'Usuario', 'Correo', 'Roles'], filas: [], notas: [] })
    expect(vacio.output()).toContain('Sin registros')
    if (process.env.REPORT_QA_DIR) {
      const { writeFile, mkdir } = await import('node:fs/promises')
      await mkdir(process.env.REPORT_QA_DIR, { recursive: true })
      await writeFile(`${process.env.REPORT_QA_DIR}/transacciones.pdf`, new Uint8Array(pdf.output('arraybuffer')))
    }
  })
})
