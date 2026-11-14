import { posix } from 'node:path';
import { MAX_XLSX_SHEETS } from './limits.js';
import { attribute as attr, MAIN_NS, REL_NS, PACKAGE_REL_NS, TYPES_NS, invalidXml, xmlLimit } from './xml-stream.js';
import { unsignedInteger, cellCoordinate, cellRange } from './worksheet-coordinates.js';

const office = 'application/vnd.openxmlformats-officedocument.';
const drawing = 'http://schemas.openxmlformats.org/drawingml/2006/';
// Perfil Transitional pasivo. Las variantes desconocidas se rechazan completas.
const contentRoots = new Map([
  [office + 'spreadsheetml.sheet.main+xml', [MAIN_NS, 'workbook']],
  ...['worksheet', 'styles', 'sharedStrings', 'table', 'comments', 'calcChain'].map(type =>
    [office + `spreadsheetml.${type}+xml`, [MAIN_NS, { styles: 'styleSheet', sharedStrings: 'sst' }[type] ?? type]]),
  [office + 'theme+xml', [drawing + 'main', 'theme']],
  [office + 'drawing+xml', [drawing + 'spreadsheetDrawing', 'wsDr']],
  [office + 'drawingml.chart+xml', [drawing + 'chart', 'chartSpace']],
  [office + 'extended-properties+xml', ['http://schemas.openxmlformats.org/officeDocument/2006/extended-properties', 'Properties']],
  [office + 'custom-properties+xml', ['http://schemas.openxmlformats.org/officeDocument/2006/custom-properties', 'Properties']],
  ['application/vnd.openxmlformats-package.core-properties+xml', ['http://schemas.openxmlformats.org/package/2006/metadata/core-properties', 'coreProperties']],
  ['application/vnd.openxmlformats-package.relationships+xml', [PACKAGE_REL_NS, 'Relationships']],
]);
const relationTypes = new Map([
  ...['worksheet', 'styles', 'sharedStrings', 'table', 'comments', 'calcChain'].map(type => [REL_NS + '/' + type, office + `spreadsheetml.${type}+xml`]),
  [REL_NS + '/officeDocument', office + 'spreadsheetml.sheet.main+xml'],
  [REL_NS + '/theme', office + 'theme+xml'], [REL_NS + '/drawing', office + 'drawing+xml'],
  [REL_NS + '/chart', office + 'drawingml.chart+xml'], [REL_NS + '/image', 'image'],
  [REL_NS + '/extended-properties', office + 'extended-properties+xml'],
  [REL_NS + '/custom-properties', office + 'custom-properties+xml'],
  [PACKAGE_REL_NS + '/metadata/core-properties', 'application/vnd.openxmlformats-package.core-properties+xml'],
]);
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/tiff']);
const idPattern = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const safeId = value => idPattern.test(value ?? '') && !['__proto__', 'constructor', 'prototype'].includes(value);
const dangerous = /^(?:externalLink|externalReferences|oleObject|oleObjects|controls|control|legacyDrawing|legacyDrawingHF|AlternateContent|extLst|webPublishItems)$/;
const legacyCoreRelationship = PACKAGE_REL_NS + '/meatadata/core-properties';

export function internalTarget(source, target) {
  if (!target || /[^\x21-\x7e]|[\\:%?#]/.test(target) || target.startsWith('//')) throw invalidXml();
  const resolved = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(source), target));
  if (resolved === '.' || resolved.startsWith('../') || resolved.startsWith('/')) throw invalidXml();
  return resolved;
}

export function relationshipSource(name) {
  if (name === '_rels/.rels') return '';
  const match = /^(.*\/)?_rels\/([^/]+)\.rels$/.exec(name);
  if (!match) throw invalidXml();
  return (match[1] ?? '') + match[2];
}

/** Inventario acotado por las 500 partes y los 50 MB ZIP reales. No guarda
 * textos de celdas, cadenas compartidas ni documentos XML completos.
 */
export function createOoxmlPackage() {
  const parts = new Map(), defaults = new Map(), overrides = new Map(), relations = new Map();
  const sheets = [], sheetIds = new Set(), sheetNames = new Set(), sheetRelations = new Set();
  const counts = { strings: 0, styles: 0, dxfs: 0 };
  const chain = [];
  let chainSheet;
  let workbookSheets = false;
  function contentType(name) { return overrides.get(name) ?? defaults.get(name.endsWith('.rels') ? 'rels' : posix.extname(name).slice(1)); }
  function handlers(name) {
    const part = { references: new Set(), highestDxf: -1 }; parts.set(name, part);
    let rels;
    if (name.endsWith('.rels')) {
      part.source = relationshipSource(name);
      rels = new Map(); relations.set(part.source, rels);
    }
    return {
      open(tag, stack) {
        const parent = stack.at(-1)?.local;
        if (!stack.length) part.root = [tag.uri, tag.local];
        if (dangerous.test(tag.local)) throw invalidXml();
        for (const value of Object.values(tag.attributes)) {
          if (!value.uri && /^(?:dxfId|\w+DxfId)$/.test(value.local)) {
            part.highestDxf = Math.max(part.highestDxf, unsignedInteger(value.value));
          }
          if (value.uri === REL_NS) {
            if (!['id', 'embed', 'link'].includes(value.local) || !safeId(value.value)) throw invalidXml();
            part.references.add(value.value);
          }
        }
        if (name === '[Content_Types].xml') {
          if (!stack.length) {
            if (tag.uri !== TYPES_NS || tag.local !== 'Types') throw invalidXml();
          } else {
            if (stack.length !== 1 || tag.uri !== TYPES_NS || !['Default', 'Override'].includes(tag.local)) throw invalidXml();
            const type = attr(tag, 'ContentType');
            if (!contentRoots.has(type) && !imageTypes.has(type) && type !== 'application/xml') throw invalidXml();
            const override = tag.local === 'Override', raw = attr(tag, override ? 'PartName' : 'Extension');
            if (!raw || (override ? !raw.startsWith('/') : !/^[A-Za-z0-9]+$/.test(raw))) throw invalidXml();
            const key = override ? internalTarget('', raw) : raw;
            const target = override ? overrides : defaults;
            if (target.has(key)) throw invalidXml();
            target.set(key, type);
          }
        } else if (rels) {
          if (!stack.length) {
            if (tag.uri !== PACKAGE_REL_NS || tag.local !== 'Relationships') throw invalidXml();
          } else {
            if (stack.length !== 1 || tag.uri !== PACKAGE_REL_NS || tag.local !== 'Relationship') throw invalidXml();
            const id = attr(tag, 'Id'), mode = attr(tag, 'TargetMode');
            let type = attr(tag, 'Type');
            const target = internalTarget(part.source, attr(tag, 'Target'));
            // Errata observada en el exportador: solo metadatos raíz docProps.
            // Se mantienen tipo de contenido, raíz XML, namespace y destino
            // existentes. No se ignora la parte ni se admiten otros tipos nuevos.
            if (type === legacyCoreRelationship) {
              if (part.source !== '' || !/^docProps\/[^/]+\.xml$/.test(target)) throw invalidXml();
              type = PACKAGE_REL_NS + '/metadata/core-properties';
            }
            if (!safeId(id) || rels.has(id) || !relationTypes.has(type)
              || (mode !== undefined && mode !== 'Internal')) throw invalidXml();
            rels.set(id, { type, target });
          }
        } else if (name === 'xl/workbook.xml') {
          if (tag.uri !== MAIN_NS) throw invalidXml();
          if (tag.local === 'sheets') {
            if (stack.length !== 1 || workbookSheets) throw invalidXml();
            workbookSheets = true;
          }
          if (tag.local === 'sheet') {
            if (parent !== 'sheets' || stack.length !== 2) throw invalidXml();
            if (sheets.length >= MAX_XLSX_SHEETS) throw xmlLimit();
            const id = unsignedInteger(attr(tag, 'sheetId')), label = attr(tag, 'name'), relation = attr(tag, 'id', REL_NS);
            const state = attr(tag, 'state');
            if (!id || !label || label.length > 31 || /[\[\]:*?\/\\]/.test(label) || !relation
              || sheetIds.has(id) || sheetNames.has(label.toLowerCase()) || sheetRelations.has(relation)
              || (state !== undefined && !['visible', 'hidden', 'veryHidden'].includes(state))) throw invalidXml();
            sheetIds.add(id); sheetNames.add(label.toLowerCase()); sheetRelations.add(relation);
            sheets.push(relation);
            part.sheetTargets ??= new Map(); part.sheetTargets.set(id, relation);
          }
        }
        if (part.root[0] === MAIN_NS && part.root[1] === 'calcChain' && stack.length) {
          if (tag.uri !== MAIN_NS || tag.local !== 'c' || stack.length !== 1) throw invalidXml();
          if (attr(tag, 'i') !== undefined) chainSheet = unsignedInteger(attr(tag, 'i'));
          if (!chainSheet) throw invalidXml();
          chain.push({ sheet: chainSheet, point: cellCoordinate(attr(tag, 'r')) });
        }
        if (part.root[0] === MAIN_NS && part.root[1] === 'comments' && tag.local === 'comment') {
          part.cells ??= []; part.cells.push(cellCoordinate(attr(tag, 'ref')));
        }
        if (part.root[0] === MAIN_NS && part.root[1] === 'table' && attr(tag, 'ref')) {
          cellRange(attr(tag, 'ref')); part.ranges ??= []; part.ranges.push(attr(tag, 'ref'));
        }
      },
    };
  }
  function finish() {
    if (!sheets.length) throw invalidXml();
    for (const name of overrides.keys()) if (!parts.has(name)) throw invalidXml();
    for (const [name, part] of parts) {
      if (name === '[Content_Types].xml') continue;
      const type = contentType(name), expected = contentRoots.get(type);
      if (!expected && !imageTypes.has(type)) throw invalidXml();
      if (expected && (!part.root || part.root[0] !== expected[0] || part.root[1] !== expected[1])) throw invalidXml();
      if (!expected && part.root) throw invalidXml();
      if (part.source !== undefined && part.source && !parts.has(part.source)) throw invalidXml();
      for (const id of part.references) if (!relations.get(name)?.has(id)) throw invalidXml();
    }
    for (const [source, rels] of relations) for (const rel of rels.values()) {
      const type = contentType(rel.target), expected = relationTypes.get(rel.type);
      if (!parts.has(rel.target) || (expected === 'image' ? !imageTypes.has(type) : type !== expected)) throw invalidXml();
      if (rel.type === REL_NS + '/officeDocument' && (source || rel.target !== 'xl/workbook.xml')) throw invalidXml();
      if (['worksheet', 'styles', 'sharedStrings', 'theme', 'calcChain'].some(kind => rel.type === REL_NS + '/' + kind)
        && source !== 'xl/workbook.xml') throw invalidXml();
      if (['table', 'comments', 'drawing'].some(kind => rel.type === REL_NS + '/' + kind)
        && contentType(source) !== office + 'spreadsheetml.worksheet+xml') throw invalidXml();
    }
    const rootBooks = [...(relations.get('')?.values() ?? [])].filter(rel => rel.type === REL_NS + '/officeDocument');
    if (rootBooks.length !== 1) throw invalidXml();
    const bookRels = relations.get('xl/workbook.xml'), targets = new Set();
    for (const id of sheets) {
      const rel = bookRels?.get(id);
      if (!rel || rel.type !== REL_NS + '/worksheet' || targets.has(rel.target)
        || !/^xl\/worksheets\/[^/]+\.xml$/.test(rel.target)) throw invalidXml();
      targets.add(rel.target);
    }
    for (const [name] of parts) {
      const type = contentType(name);
      if (type === office + 'spreadsheetml.worksheet+xml' && !targets.has(name)) throw invalidXml();
      if (type === office + 'spreadsheetml.sheet.main+xml' && name !== 'xl/workbook.xml') throw invalidXml();
    }
    for (const kind of ['styles', 'sharedStrings', 'calcChain']) {
      const type = REL_NS + '/' + kind;
      const matching = [...bookRels.values()].filter(rel => rel.type === type);
      const typed = [...parts.keys()].filter(name => contentType(name) === relationTypes.get(type));
      if (matching.length > 1 || typed.length !== matching.length) throw invalidXml();
    }
    // Todas las partes admitidas deben pertenecer al grafo del paquete, no a
    // componentes ocultos ni a ciclos desconectados de las relaciones raíz.
    const reachable = new Set(['']), pending = [''];
    while (pending.length) {
      for (const rel of relations.get(pending.pop())?.values() ?? []) {
        if (!reachable.has(rel.target)) { reachable.add(rel.target); pending.push(rel.target); }
      }
    }
    for (const [name, part] of parts) {
      if (name !== '[Content_Types].xml' && !reachable.has(part.source ?? name)) throw invalidXml();
    }
    return { sheets: sheets.length, ...counts };
  }
  function validateSheetReferences(worksheets) {
    for (const part of parts.values()) if (part.highestDxf >= counts.dxfs) throw invalidXml();
    for (const [source, rels] of relations) for (const rel of rels.values()) {
      const part = parts.get(rel.target), worksheet = worksheets.get(source);
      if (worksheet) {
        for (const value of part.ranges ?? []) worksheet.range(value);
        for (const point of part.cells ?? []) worksheet.range(`A1:${coordinateText(point)}`);
      }
    }
    const book = parts.get('xl/workbook.xml');
    for (const ref of chain) {
      const id = book.sheetTargets.get(ref.sheet), target = relations.get('xl/workbook.xml').get(id)?.target;
      if (!target || !worksheets.get(target)?.hasCell(ref.point)) throw invalidXml();
    }
  }
  return { handlers, finish, counts, validateSheetReferences };
}

function coordinateText({ row, column }) {
  let letters = '';
  while (column) { column--; letters = String.fromCharCode(65 + column % 26) + letters; column = Math.floor(column / 26); }
  return letters + row;
}
