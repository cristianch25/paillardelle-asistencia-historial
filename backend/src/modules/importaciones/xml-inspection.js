import { HttpError } from '../../shared/http-error.js';
import { inspectZipParts } from './zip-inspection.js';
import { createXmlStream, MAIN_NS, attribute as attr, invalidXml, xmlLimit } from './xml-stream.js';
import { createOoxmlPackage } from './ooxml-package.js';
import { createWorksheetInspection } from './worksheet-inspection.js';
import { cellRange, unsignedInteger } from './worksheet-coordinates.js';
import { MAX_ZIP_INSPECTION_MS, MAX_XLSX_SHEETS } from './limits.js';

function styleInspection(counts) {
  const sizes = new Map(), references = new Map(), formats = new Set(), usedFormats = new Set();
  const groups = new Set(['fonts', 'fills', 'borders', 'cellXfs', 'cellStyleXfs', 'numFmts', 'dxfs', 'cellStyles']);
  const children = { fonts: 'font', fills: 'fill', borders: 'border', cellXfs: 'xf', cellStyleXfs: 'xf',
    numFmts: 'numFmt', dxfs: 'dxf', cellStyles: 'cellStyle' };
  const declared = new Map();
  return {
    open(tag, stack) {
      if (tag.uri !== MAIN_NS) throw invalidXml();
      const parent = stack.at(-1)?.local;
      if (stack.length === 1 && groups.has(tag.local)) {
        if (sizes.has(tag.local)) throw invalidXml();
        sizes.set(tag.local, 0);
        if (attr(tag, 'count') !== undefined) declared.set(tag.local, unsignedInteger(attr(tag, 'count')));
      }
      if (stack.length === 2 && groups.has(parent)) {
        if (tag.local !== children[parent]) throw invalidXml();
        sizes.set(parent, sizes.get(parent) + 1);
      }
      if (tag.local === 'numFmt' && parent === 'numFmts') {
        const id = unsignedInteger(attr(tag, 'numFmtId'));
        // Perfil acotado del lector: evita arrays dispersos gigantes de formatos.
        if (id > 65535 || formats.has(id) || attr(tag, 'formatCode') === undefined) throw invalidXml();
        formats.add(id);
      }
      if (tag.local === 'xf' || tag.local === 'cellStyle') {
        if (tag.local === 'xf' && !['cellStyleXfs', 'cellXfs'].includes(parent)) throw invalidXml();
        for (const [key, group] of [['fontId', 'fonts'], ['fillId', 'fills'], ['borderId', 'borders'], ['xfId', 'cellStyleXfs']]) {
          if (attr(tag, key) !== undefined) references.set(group, Math.max(references.get(group) ?? -1, unsignedInteger(attr(tag, key))));
        }
        if (attr(tag, 'numFmtId') !== undefined) {
          const id = unsignedInteger(attr(tag, 'numFmtId'));
          if (id > 65535) throw invalidXml();
          if (id >= 164) usedFormats.add(id);
        }
      }
    },
    finish() {
      for (const [group, value] of declared) if (sizes.get(group) !== value) throw invalidXml();
      for (const [group, index] of references) if (index >= (sizes.get(group) ?? 0)) throw invalidXml();
      for (const id of usedFormats) if (!formats.has(id)) throw invalidXml();
      counts.styles = sizes.get('cellXfs') ?? 0;
      counts.dxfs = sizes.get('dxfs') ?? 0;
    },
  };
}

/** Inspección técnica Transitional; no invoca read-excel-file ni el supervisor.
 * El Buffer pertenece al llamador: no mutarlo durante el análisis.
 * ZIP y XML comparten plazo, cancelación y un solo recorrido. Nunca se acepta
 * un resultado antes de terminar la validación ZIP existente.
 */
export async function inspectXlsxXml(input, { signal } = {}, observePart) {
  const packageInfo = createOoxmlPackage(), total = { cells: 0, positions: 0 };
  const worksheets = new Map(), styles = [], deadline = performance.now() + MAX_ZIP_INSPECTION_MS;
  function checkDeadline() {
    if (signal?.aborted) throw new HttpError(400, 'Inspección cancelada.');
    if (performance.now() >= deadline) throw new HttpError(408, 'La inspección superó el plazo permitido.');
  }
  try {
    const zip = await inspectZipParts(input, { signal }, (name, directory) => {
      if (directory) return;
      const metadata = packageInfo.handlers(name);
      if (!/\.(?:xml|rels)$/.test(name)) return;
      // Observador técnico interno. No sustituye validaciones ni habilita lectura
      // antes de comprobar el paquete completo; conserva el resultado público.
      const observer = observePart?.(name);
      let worksheet, style, root, stringCount = 0, stringsDeclared;
      return createXmlStream({
        open(tag, stack) {
          checkDeadline();
          metadata.open(tag, stack);
          if (!stack.length) {
            root = tag.local;
            if (tag.uri === MAIN_NS && root === 'worksheet') {
              if (worksheets.size >= MAX_XLSX_SHEETS) throw xmlLimit();
              worksheet = createWorksheetInspection(total); worksheets.set(name, worksheet);
            } else if (tag.uri === MAIN_NS && root === 'styleSheet') {
              style = styleInspection(packageInfo.counts); styles.push(style);
            } else if (tag.uri === MAIN_NS && root === 'sst' && attr(tag, 'uniqueCount') !== undefined) {
              stringsDeclared = unsignedInteger(attr(tag, 'uniqueCount'));
            }
          }
          worksheet?.open(tag, stack);
          style?.open(tag, stack);
          if (root === 'sst') {
            if (tag.uri !== MAIN_NS) throw invalidXml();
            if (tag.local === 'si') {
              if (stack.length !== 1) throw invalidXml();
              stringCount++;
            }
          }
          if (root === 'table' && stack.length === 0) cellRange(attr(tag, 'ref'));
          observer?.open?.(tag, stack);
        },
        close(tag, stack) { worksheet?.close(tag, stack); observer?.close?.(tag, stack); },
        text(value, stack) { worksheet?.text(value, stack); observer?.text?.(value, stack); },
        encoding(value) { observer?.encoding?.(value); },
        end() {
          if (root === 'sst') {
            if (stringsDeclared !== undefined && stringsDeclared !== stringCount) throw invalidXml();
            packageInfo.counts.strings = stringCount;
          }
          observer?.end?.();
        },
      });
    });
    // Verifica primero el inventario: impide sobrescribir contadores con partes
    // duplicadas o huérfanas, independientemente de su orden en el ZIP.
    const inventory = packageInfo.finish();
    for (const style of styles) style.finish();
    packageInfo.validateSheetReferences(worksheets);
    for (const worksheet of worksheets.values()) worksheet.finish(packageInfo.counts.strings, packageInfo.counts.styles);
    if (worksheets.size !== inventory.sheets) throw invalidXml();
    checkDeadline();
    return { ...zip, sheets: inventory.sheets, xmlCells: total.cells, materializablePositions: total.positions };
  } catch (error) {
    throw error instanceof HttpError ? error : invalidXml();
  }
}
