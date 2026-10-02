// Helpers de Excel sobre ExcelJS (reemplazan a la librería `xlsx`, que estaba
// deprecada/vulnerable). Import dinámico para no engordar el bundle inicial,
// igual que el resto del código del panel admin.

type Cell = string | number | null | undefined

async function descargarWorkbook(wb: { xlsx: { writeBuffer: () => Promise<ArrayBuffer> } }, filename: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Exporta filas como array de arrays (la primera fila suele ser el encabezado). */
export async function descargarAOA(
  filename: string,
  sheetName: string,
  rows: Cell[][],
  colWidths?: number[],
) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  rows.forEach(r => ws.addRow(r))
  if (colWidths) colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  await descargarWorkbook(wb, filename)
}

/** Exporta un array de objetos; los encabezados salen de las claves del primero. */
export async function descargarJSON(
  filename: string,
  sheetName: string,
  objetos: Record<string, Cell>[],
  colWidths?: number[],
) {
  const headers = objetos.length ? Object.keys(objetos[0]) : []
  const rows: Cell[][] = [headers, ...objetos.map(o => headers.map(h => o[h] ?? ''))]
  await descargarAOA(filename, sheetName, rows, colWidths)
}

/**
 * Lee la primera hoja de un .xlsx a un array de objetos keyed por la fila de
 * encabezado, con valores como texto (equivalente a sheet_to_json({raw:false})).
 * Usa cell.text → toma el texto mostrado (fechas/números ya formateados).
 */
export async function leerExcelAFilas(file: File): Promise<Record<string, string>[]> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []

  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = String(cell.text ?? '').trim()
  })

  const filas: Record<string, string>[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const obj: Record<string, string> = {}
    let tieneAlgo = false
    headers.forEach((h, col) => {
      if (!h) return
      const v = String(row.getCell(col).text ?? '').trim()
      obj[h] = v
      if (v) tieneAlgo = true
    })
    if (tieneAlgo) filas.push(obj)
  }
  return filas
}
