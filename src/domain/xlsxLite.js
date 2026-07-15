// Minimal streaming .xlsx/.csv reader for large ERP exports.
// Uses the browser/Node native DecompressionStream, so no spreadsheet dependency
// and no giant in-memory XML string for 300k+ row files.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

function findZipEntries(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let offset = buffer.byteLength - 22; offset >= Math.max(0, buffer.byteLength - 22 - 65535); offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的xlsx文件（找不到zip目录）。");
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, cursor + 46, nameLength));
    entries.set(name, { method, compressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryDataSlice(buffer, entry) {
  const view = new DataView(buffer);
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  return new Uint8Array(buffer, start, entry.compressedSize);
}

async function streamEntryText(buffer, entry, onChunk) {
  const data = entryDataSlice(buffer, entry);
  const decoder = new TextDecoder();
  if (entry.method === 0) {
    onChunk(decoder.decode(data));
    return;
  }
  if (entry.method !== 8) throw new Error("xlsx里使用了不支持的压缩方式。");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  const tail = decoder.decode();
  if (tail) onChunk(tail);
}

function decodeXmlText(text) {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

const freshEncoder = new TextEncoder();
const freshDecoder = new TextDecoder();

// V8 keeps regex-extracted substrings as slices that retain their megabyte-sized
// parent chunk. Round-tripping through UTF-8 forces a compact standalone copy,
// which keeps 300k-row imports inside normal browser memory.
function freshString(text) {
  return text.length ? freshDecoder.decode(freshEncoder.encode(text)) : "";
}

async function readSharedStrings(buffer, entries) {
  const entry = entries.get("xl/sharedStrings.xml");
  const strings = [];
  if (!entry) return strings;
  let pending = "";
  const itemPattern = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si(?:\s[^>]*)?\/>/g;
  const textPattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  await streamEntryText(buffer, entry, chunk => {
    pending += chunk;
    const lastEnd = pending.lastIndexOf("</si>");
    if (lastEnd < 0) return;
    const usable = pending.slice(0, lastEnd + 5);
    pending = pending.slice(lastEnd + 5);
    let item;
    itemPattern.lastIndex = 0;
    while ((item = itemPattern.exec(usable))) {
      const body = item[1] || "";
      let text = "";
      let piece;
      textPattern.lastIndex = 0;
      while ((piece = textPattern.exec(body))) text += piece[1];
      strings.push(freshString(decodeXmlText(text)));
    }
  });
  return strings;
}

function columnLetterToIndex(letters) {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function firstWorksheetName(entries) {
  if (entries.has("xl/worksheets/sheet1.xml")) return "xl/worksheets/sheet1.xml";
  const sheets = [...entries.keys()].filter(name => /^xl\/worksheets\/[^/]+\.xml$/.test(name)).sort();
  if (!sheets.length) throw new Error("xlsx里没有工作表。");
  return sheets[0];
}

const CELL_PATTERN = /<c\s+([^>]*?)\/>|<c\s+([^>]*?)>([\s\S]*?)<\/c>/g;
const VALUE_PATTERN = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/;
const INLINE_PATTERN = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/;

function parseRowXml(body, sharedStrings) {
  const cells = [];
  let match;
  CELL_PATTERN.lastIndex = 0;
  while ((match = CELL_PATTERN.exec(body))) {
    const attributes = match[1] || match[2] || "";
    const inner = match[3] || "";
    const reference = /r="([A-Z]+)\d+"/.exec(attributes);
    const type = /t="([^"]+)"/.exec(attributes)?.[1] || "";
    const columnIndex = reference ? columnLetterToIndex(reference[1]) : cells.length;
    let value = "";
    if (type === "inlineStr") {
      value = decodeXmlText(INLINE_PATTERN.exec(inner)?.[1] || "");
    } else {
      const raw = VALUE_PATTERN.exec(inner)?.[1] ?? "";
      if (type === "s") value = sharedStrings[Number(raw)] ?? "";
      else if (type === "str") value = decodeXmlText(raw);
      else if (raw === "") value = "";
      else value = Number(raw);
    }
    cells[columnIndex] = value;
  }
  return cells;
}

export async function streamXlsxRows(arrayBuffer, onRow) {
  const entries = findZipEntries(arrayBuffer);
  const sharedStrings = await readSharedStrings(arrayBuffer, entries);
  const sheetEntry = entries.get(firstWorksheetName(entries));
  let pending = "";
  let stop = false;
  const rowPattern = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row(?:\s[^>]*)?\/>/g;
  await streamEntryText(arrayBuffer, sheetEntry, chunk => {
    if (stop) return;
    pending += chunk;
    const lastEnd = pending.lastIndexOf("</row>");
    if (lastEnd < 0) return;
    const usable = pending.slice(0, lastEnd + 6);
    pending = pending.slice(lastEnd + 6);
    let row;
    rowPattern.lastIndex = 0;
    while (!stop && (row = rowPattern.exec(usable))) {
      if (onRow(parseRowXml(row[1] || "", sharedStrings)) === false) stop = true;
    }
  });
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        current += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

export function streamCsvRows(text, onRow) {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (const line of clean.split(/\r\n|\n|\r/)) {
    if (!line) continue;
    if (onRow(parseCsvLine(line)) === false) return;
  }
}

export async function streamSpreadsheetRows(file, onRow) {
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".csv")) {
    const buffer = await file.arrayBuffer();
    streamCsvRows(new TextDecoder("utf-8").decode(buffer), onRow);
    return;
  }
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) {
    throw new Error("暂不支持旧版 .xls 文件，请另存为 .xlsx 或 .csv 再导入。");
  }
  await streamXlsxRows(await file.arrayBuffer(), onRow);
}
