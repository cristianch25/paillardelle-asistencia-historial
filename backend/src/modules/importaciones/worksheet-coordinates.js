import { MAX_WORKSHEET_ROW, MAX_WORKSHEET_COLUMN, MAX_MATERIALIZED_POSITIONS } from './limits.js';
import { invalidXml, xmlLimit } from './xml-stream.js';

export function unsignedInteger(value) {
  if (typeof value !== 'string' || !/^\d{1,15}$/.test(value)) throw invalidXml();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw invalidXml();
  return number;
}

export function rowNumber(value) {
  const number = unsignedInteger(value);
  if (!number) throw invalidXml();
  if (number > MAX_WORKSHEET_ROW) throw xmlLimit();
  return number;
}

export function cellCoordinate(value) {
  const match = typeof value === 'string' && /^([A-Z]{1,3})([1-9]\d{0,14})$/.exec(value);
  if (!match) throw invalidXml();
  const row = rowNumber(match[2]);
  let column = 0;
  for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  if (column > MAX_WORKSHEET_COLUMN) throw xmlLimit();
  return { row, column };
}

export function cellRange(value) {
  const parts = typeof value === 'string' ? value.split(':') : [];
  if (parts.length < 1 || parts.length > 2) throw invalidXml();
  const start = cellCoordinate(parts[0]), end = cellCoordinate(parts.at(-1));
  if (start.row > end.row || start.column > end.column) throw invalidXml();
  return { start, end };
}

// Una sola envolvente desde A1 por hoja. Nunca resta mínimos ni suma áreas
// superpuestas: los huecos y las declaraciones también consumen presupuesto.
export function createAreaBudget(total) {
  let rows = 0, columns = 0, area = 0;
  return {
    include(row, column) {
      rows = Math.max(rows, row); columns = Math.max(columns, column);
      const next = rows * columns;
      total.positions += next - area; area = next;
      if (total.positions > MAX_MATERIALIZED_POSITIONS) throw xmlLimit();
    },
    range(value) {
      const range = cellRange(value);
      this.include(range.end.row, range.end.column);
      return range;
    },
  };
}
