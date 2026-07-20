import { streamSpreadsheetRows } from "../../domain/xlsxLite.js";

export async function rowsFromInventorySpreadsheet(file) {
  let headers = null;
  const rows = [];
  await streamSpreadsheetRows(file, row => {
    if (!headers) {
      headers = row.map(value => String(value || "").trim());
      return;
    }
    if (!row.some(value => String(value ?? "").trim())) return;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  });
  return rows;
}
