import readExcel from 'read-excel-file/node';
import { HttpError } from '../../shared/http-error.js';
import { inspectXlsxXml } from './xml-inspection.js';
import { prepareXlsxReaderPackage } from './xlsx-reader-package.js';
import { attribute as attr, MAIN_NS, REL_NS, invalidXml } from './xml-stream.js';
import { internalTarget } from './ooxml-package.js';
import { cellCoordinate } from './worksheet-coordinates.js';
import { MAX_ZIP_INSPECTION_MS } from './limits.js';

const xmlns = 'http://www.w3.org/2000/xmlns/';
const consumed = new Set('id name r s t ref si v count uniqueCount sheetId date1904 numFmtId xfId formatCode Type Target Id'.split(' '));
// ST_Xstring, sustitución única sin volver a interpretar el resultado.
const decodeString = value => value.replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
let active = 0;

function rejectNamespaceAmbiguity(tag) {
  const names = new Set();
  for (const value of Object.values(tag.attributes)) {
    if (value.uri === xmlns) continue;
    if (names.has(value.local) || (value.uri && value.uri !== REL_NS && consumed.has(value.local))) throw invalidXml();
    names.add(value.local);
  }
}

function createManifest(check) {
  const result = { sheets: [], worksheets: new Map(), formats: new Map(), styles: [], baseStyles: [], strings: [], changes: new Set() };
  result.observe = name => {
    let root, worksheet, row, previousRow = 0, cell, stringItem;
    return {
      encoding(value) { if (value !== 'utf-8') result.changes.add(name); },
      open(tag, stack) {
        check(); rejectNamespaceAmbiguity(tag);
        const parent = stack.at(-1)?.local;
        if (!stack.length) {
          root = tag.local;
          if (tag.uri === MAIN_NS && root === 'worksheet') {
            worksheet = { path: name, rows: [], merges: [] }; result.worksheets.set(name, worksheet);
          }
        }
        if (name === 'xl/workbook.xml' && tag.local === 'sheet') {
          result.sheets.push({ sheetId: attr(tag, 'sheetId'), sourceName: attr(tag, 'name'),
            relationshipId: attr(tag, 'id', REL_NS), state: attr(tag, 'state') ?? 'visible' });
        }
        if (name === 'xl/_rels/workbook.xml.rels' && tag.local === 'Relationship') {
          const target = attr(tag, 'Target'), path = internalTarget('xl/workbook.xml', target);
          const expected = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
          if (path !== expected) result.changes.add(name);
          // Las relaciones pueden aparecer antes del workbook.
          result.relations ??= new Map(); result.relations.set(attr(tag, 'Id'), path);
        }
        if (root === 'styleSheet') {
          if (tag.local === 'numFmt' && parent === 'numFmts') result.formats.set(String(Number(attr(tag, 'numFmtId'))), attr(tag, 'formatCode'));
          if (tag.local === 'xf' && ['cellXfs', 'cellStyleXfs'].includes(parent)) {
            const format = attr(tag, 'numFmtId');
            (parent === 'cellXfs' ? result.styles : result.baseStyles).push({ numFmtId: format === undefined ? undefined : String(Number(format)), xfId: attr(tag, 'xfId') });
          }
        }
        if (root === 'sst' && tag.local === 'si') stringItem = '';
        if (!worksheet) return;
        if (tag.local === 'row') row = { number: attr(tag, 'r') ? Number(attr(tag, 'r')) : null, implicit: attr(tag, 'r') === undefined, cells: [] };
        if (tag.local === 'c') {
          const reference = attr(tag, 'r'), point = cellCoordinate(reference);
          row.number ??= point.row;
          cell = { reference, ...point, type: attr(tag, 't') ?? 'n', styleId: attr(tag, 's'), formula: false };
          row.cells.push(cell);
        }
        if (tag.local === 'v' && cell) cell.rawValue = '';
        if (tag.local === 'is' && cell) cell.inlineText = '';
        if (tag.local === 'f' && cell) cell.formula = true;
        if (tag.local === 'mergeCell') worksheet.merges.push(attr(tag, 'ref'));
      },
      text(value, stack) {
        if (cell && stack.at(-1)?.local === 'v') cell.rawValue += value;
        if (stack.at(-1)?.local === 't' && !stack.some(tag => tag.local === 'rPh')) {
          if (stringItem !== undefined) stringItem += value;
          if (cell?.inlineText !== undefined) cell.inlineText += value;
        }
      },
      close(tag) {
        if (root === 'sst' && tag.local === 'si') { result.strings.push(decodeString(stringItem)); stringItem = undefined; }
        if (tag.local === 'c') cell = undefined;
        if (worksheet && tag.local === 'row') {
          row.number ??= previousRow + 1; previousRow = row.number;
          // El lector no actualiza bien sus contadores para row implícita vacía.
          if (row.implicit && !row.cells.length) result.changes.add(name);
          worksheet.rows.push(row); row = undefined;
        }
      },
    };
  };
  return result;
}

function technicalSheets(read, manifest, check) {
  if (!Array.isArray(read) || read.length !== manifest.sheets.length) throw invalidXml();
  const names = new Set();
  return manifest.sheets.map((identity, index) => {
    check();
    const parsed = read[index], path = manifest.relations.get(identity.relationshipId), source = manifest.worksheets.get(path);
    if (!source || !parsed || parsed.sheet !== decodeString(identity.sourceName) || names.has(parsed.sheet) || !Array.isArray(parsed.data)) throw invalidXml();
    names.add(parsed.sheet);
    return { ...identity, name: parsed.sheet, index: index + 1, path, merges: source.merges,
      rows: source.rows.map(row => ({ number: row.number, implicit: row.implicit, cells: row.cells.map(cell => {
        check();
        const value = parsed.data[cell.row - 1]?.[cell.column - 1] ?? null;
        const style = manifest.styles[Number(cell.styleId)] ?? {};
        const numFmtId = style.numFmtId ?? manifest.baseStyles[Number(style.xfId)]?.numFmtId;
        const issues = [];
        if (cell.type === 'e') issues.push('CELL_ERROR');
        if (cell.formula && cell.rawValue === undefined) issues.push('FORMULA_WITHOUT_CACHED_VALUE');
        if (cell.type === 'b' && cell.rawValue === undefined) issues.push('MISSING_TYPED_VALUE');
        let text;
        if (cell.type === 's') text = manifest.strings[Number(cell.rawValue)];
        if (cell.type === 'inlineStr' && cell.inlineText !== undefined) text = decodeString(cell.inlineText);
        if (cell.type === 'str' && cell.rawValue !== undefined) text = decodeString(cell.rawValue);
        // saxen puede cortar un texto o índice al procesar chunks de la hoja.
        // Contrastar con SAX evita devolver un código/documento truncado.
        if (text !== undefined && (text || null) !== value) issues.push('READER_VALUE_RECOVERED');
        // Valores numéricos/fechas se entregan literalmente, aunque el lector
        // los convierta a Date. El formato se conserva, no se inventan ceros.
        const { inlineText, ...metadata } = cell;
        return { ...metadata, value: text !== undefined ? text || null : ['n', 'd', 'e'].includes(cell.type) ? cell.rawValue ?? null : value,
          numberFormat: numFmtId === undefined ? null : { id: numFmtId, code: manifest.formats.get(numFmtId) ?? null }, issues };
      }) })) };
  });
}

/** Adaptador técnico único, sin mapeos institucionales ni reglas académicas.
 * No mutar el Buffer durante su uso. No escribe archivos ni integra el supervisor.
 * El lector no ofrece AbortSignal: se espera su finalización y se descarta el
 * resultado cancelado/expirado; el límite duro requerirá el proceso aislado.
 */
export async function readXlsx(input, { signal } = {}, read = readExcel) {
  if (signal != null && !(signal instanceof AbortSignal)) throw invalidXml();
  if (active >= 2) throw new HttpError(503, 'Hay dos análisis en curso. Intenta nuevamente.');
  active++;
  const controller = new AbortController(), deadline = performance.now() + MAX_ZIP_INSPECTION_MS;
  const abort = () => controller.abort(new HttpError(400, 'Lectura cancelada.'));
  const timer = setTimeout(() => controller.abort(new HttpError(408, 'La lectura superó el plazo permitido.')), MAX_ZIP_INSPECTION_MS);
  function check() {
    controller.signal.throwIfAborted();
    if (performance.now() >= deadline) throw new HttpError(408, 'La lectura superó el plazo permitido.');
  }
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) abort();
    check();
    const manifest = createManifest(check);
    const inspection = await inspectXlsxXml(input, { signal: controller.signal }, manifest.observe);
    const prepared = await prepareXlsxReaderPackage(input, manifest, { signal: controller.signal, check });
    check();
    const parsed = await read(prepared.buffer, { trim: false, parseNumber: value => value });
    check();
    const sheets = technicalSheets(parsed, manifest, check);
    check();
    return { normalized: prepared.normalized, inspection, sheets };
  } catch (error) {
    check();
    throw error instanceof HttpError ? error : invalidXml();
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort); active--;
  }
}
