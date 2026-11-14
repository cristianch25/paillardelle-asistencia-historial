import { MAX_XML_CELLS, MAX_WORKSHEET_ROW, MAX_WORKSHEET_COLUMN } from './limits.js';
import { attribute as attr, MAIN_NS, invalidXml, xmlLimit } from './xml-stream.js';
import { cellCoordinate, cellRange, createAreaBudget, rowNumber, unsignedInteger } from './worksheet-coordinates.js';

/** Conserva contadores e índices, nunca valores de celdas. Las referencias a
 * estilos/cadenas se resuelven al terminar todas las partes, sin depender del ZIP.
 */
export function createWorksheetInspection(total) {
  const area = createAreaBudget(total), formulas = new Map(), formulaUses = [];
  const occupied = new Uint8Array(MAX_WORKSHEET_ROW * MAX_WORKSHEET_COLUMN / 8);
  const rootChildren = new Set(('sheetPr dimension sheetViews sheetFormatPr cols sheetData sheetCalcPr sheetProtection protectedRanges '
    + 'scenarios autoFilter sortState dataConsolidate customSheetViews mergeCells phoneticPr conditionalFormatting '
    + 'dataValidations hyperlinks printOptions pageMargins pageSetup headerFooter rowBreaks colBreaks customProperties '
    + 'cellWatches ignoredErrors smartTags drawing picture tableParts').split(' '));
  let previousRow = 0, row, column = 0, cell, value, merges;
  let sheetData = false, dimension = false, highestString = -1, highestStyle = -1;
  const singleton = new Set();
  function range(value) { return area.range(value); }
  function index(value) { return unsignedInteger(value); }
  return {
    open(tag, stack) {
      const name = tag.local, parent = stack.at(-1)?.local;
      if (tag.uri !== MAIN_NS) throw invalidXml();
      if (stack.length === 1 && !rootChildren.has(name)) throw invalidXml();
      if (stack.length === 1 && ['sheetData', 'dimension', 'mergeCells', 'cols'].includes(name)) {
        if (singleton.has(name)) throw invalidXml();
        singleton.add(name);
      }
      if (name === 'sheetData') {
        if (stack.length !== 1) throw invalidXml();
        sheetData = true;
      } else if (name === 'dimension') {
        if (stack.length !== 1 || dimension) throw invalidXml();
        dimension = true; range(attr(tag, 'ref'));
      } else if (name === 'row') {
        if (parent !== 'sheetData' || row !== undefined) throw invalidXml();
        row = attr(tag, 'r') === undefined ? null : rowNumber(attr(tag, 'r'));
        if (row !== null && row <= previousRow) throw invalidXml();
        column = 0;
        if (attr(tag, 'spans')) {
          for (const span of attr(tag, 'spans').split(/\s+/)) {
            const limits = span.split(':').map(unsignedInteger);
            if (limits.length !== 2 || !limits[0] || limits[0] > limits[1]) throw invalidXml();
            if (limits[1] > MAX_WORKSHEET_COLUMN) throw xmlLimit();
          }
        }
        if (attr(tag, 's') !== undefined) highestStyle = Math.max(highestStyle, index(attr(tag, 's')));
      } else if (name === 'c') {
        if (parent !== 'row' || cell) throw invalidXml();
        if (++total.cells > MAX_XML_CELLS) throw xmlLimit();
        // El lector instalado exige r en c; no inventar coordenadas que él no lee.
        cell = cellCoordinate(attr(tag, 'r'));
        row ??= cell.row;
        if (cell.row !== row || row <= previousRow || cell.column <= column) throw invalidXml();
        column = cell.column;
        const bit = (row - 1) * MAX_WORKSHEET_COLUMN + column - 1;
        occupied[bit >> 3] |= 1 << (bit & 7);
        area.include(row, column);
        cell.type = attr(tag, 't'); cell.children = new Set();
        if (cell.type && !['b', 'd', 'e', 'inlineStr', 'n', 's', 'str'].includes(cell.type)) throw invalidXml();
        if (attr(tag, 's') !== undefined) highestStyle = Math.max(highestStyle, index(attr(tag, 's')));
      } else if (['v', 'is', 'f'].includes(name)) {
        if (parent !== 'c' || !cell || cell.children.has(name)) throw invalidXml();
        cell.children.add(name);
        if (name === 'v') value = '';
        if (name === 'f') {
          if (attr(tag, 'ref')) range(attr(tag, 'ref'));
          const type = attr(tag, 't');
          if (type && !['normal', 'shared', 'array'].includes(type)) throw invalidXml();
          if (type === 'shared') {
            const id = index(attr(tag, 'si'));
            if (attr(tag, 'ref')) {
              if (formulas.has(id)) throw invalidXml();
              formulas.set(id, cellRange(attr(tag, 'ref')));
            }
            formulaUses.push({ id, row, column });
          }
        }
      } else if (name === 'mergeCell') {
        if (parent !== 'mergeCells') throw invalidXml();
        const { start, end } = range(attr(tag, 'ref'));
        merges ??= new Uint8Array(MAX_WORKSHEET_ROW * MAX_WORKSHEET_COLUMN / 8);
        for (let r = start.row; r <= end.row; r++) for (let c = start.column; c <= end.column; c++) {
          const bit = (r - 1) * MAX_WORKSHEET_COLUMN + c - 1;
          if (merges[bit >> 3] & (1 << (bit & 7))) throw invalidXml();
          merges[bit >> 3] |= 1 << (bit & 7);
        }
      } else if (name === 'col') {
        if (parent !== 'cols') throw invalidXml();
        const min = index(attr(tag, 'min')), max = index(attr(tag, 'max'));
        if (!min || min > max) throw invalidXml();
        if (max > MAX_WORKSHEET_COLUMN) throw xmlLimit();
        if (attr(tag, 'style') !== undefined) highestStyle = Math.max(highestStyle, index(attr(tag, 'style')));
      }
      // Rangos geométricos pasivos. No evalúa fórmulas, nombres ni datos académicos.
      if (!['dimension', 'mergeCell', 'f'].includes(name) && attr(tag, 'ref')) range(attr(tag, 'ref'));
      if (attr(tag, 'sqref')) {
        for (const ref of attr(tag, 'sqref').trim().split(/\s+/)) range(ref);
      }
      if (attr(tag, 'activeCell')) {
        const point = cellCoordinate(attr(tag, 'activeCell')); area.include(point.row, point.column);
      }
      if (attr(tag, 'topLeftCell')) {
        const point = cellCoordinate(attr(tag, 'topLeftCell')); area.include(point.row, point.column);
      }
    },
    text(text, stack) {
      if (stack.at(-1)?.local === 'v' && cell?.type === 's') {
        if (value.length + text.length > 15) throw invalidXml();
        value += text;
      }
    },
    close(tag) {
      if (tag.local === 'v' && cell?.type === 's') highestString = Math.max(highestString, index(value));
      if (tag.local === 'c') {
        if (cell.type === 's' && !cell.children.has('v')) throw invalidXml();
        cell = undefined;
      }
      if (tag.local === 'row') {
        row ??= previousRow + 1;
        row = rowNumber(String(row)); area.include(row, column);
        previousRow = row; row = undefined;
      }
    },
    finish(strings, styles) {
      if (!sheetData || highestString >= strings || highestStyle >= styles) throw invalidXml();
      for (const use of formulaUses) {
        const ref = formulas.get(use.id);
        if (!ref || use.row < ref.start.row || use.row > ref.end.row
          || use.column < ref.start.column || use.column > ref.end.column) throw invalidXml();
      }
      merges = undefined;
    },
    range,
    hasCell(point) {
      const bit = (point.row - 1) * MAX_WORKSHEET_COLUMN + point.column - 1;
      return Boolean(occupied[bit >> 3] & (1 << (bit & 7)));
    },
  };
}
