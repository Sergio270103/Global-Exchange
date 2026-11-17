import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { exportarGanancias } from './exportarGanancias'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('genera un XLSX válido con el equivalente en PYG y los totales', async () => {
  const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const crearUrl = vi.fn((_archivo: NodeBlob) => 'blob:ganancias')
  const revocarUrl = vi.fn()
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('URL', { createObjectURL: crearUrl, revokeObjectURL: revocarUrl })
  const fila = { periodo: '2026-11', moneda: 'USD', operaciones: 1, volumen: 100, comision: 2, equivalente_pyg: 15000, volumen_pyg: 750000 }

  await exportarGanancias('xlsx', {
    total_pyg: 15000, operaciones: 1, operaciones_sin_tasa: 0,
    por_moneda: [fila], por_mes: [], filas: [fila],
  }, { desde: '', hasta: '', moneda: 'USD', agrupar: 'mes' })

  const blob = crearUrl.mock.calls[0][0]
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await blob.arrayBuffer())
  const hoja = libro.getWorksheet('Ganancias')
  expect(hoja?.getCell('B4').value).toBe('USD')
  expect(hoja?.getCell('F4').value).toBe(15000)
  expect(hoja?.getCell('F5').value).toBe(15000)
  expect(clic.mock.contexts[0]).toHaveAttribute('download', 'reporte-ganancias.xlsx')
  await vi.waitFor(() => expect(revocarUrl).toHaveBeenCalledWith('blob:ganancias'), { timeout: 2500 })
})
