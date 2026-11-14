import { HttpError } from '../../shared/http-error.js';

export const invalidZip = () => new HttpError(400, 'Contenedor XLSX inválido o no admitido.');
const essential = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels'];

// Perfil de nombres ASCII canónicos. No extrae al disco ni resuelve relaciones XML.
export function packageEntry(entry, seen) {
  const name = entry.fileNameRaw.toString('ascii');
  if (entry.fileNameRaw.some(byte => byte < 33 || byte > 126)
    || /[\\:%?#]/.test(name) || name.startsWith('/') || !/^[\w.\[\]/-]+$/.test(name)) throw invalidZip();
  const directory = name.endsWith('/'), key = directory ? name.slice(0, -1) : name;
  const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
  if ((!directory && (kind === 0x4000 || (entry.externalFileAttributes & 0x10)))
    || (directory && kind === 0x8000)) throw invalidZip();
  if (key.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.'))) throw invalidZip();
  const folded = key.toLowerCase();
  if (seen.has(folded)) throw invalidZip();
  for (const [other, isDirectory] of seen) {
    if ((!isDirectory && folded.startsWith(`${other}/`)) || (!directory && other.startsWith(`${folded}/`))) throw invalidZip();
  }
  seen.set(folded, directory);
  // Indicadores por nombres solamente: los tipos de contenido se revisarán en XML.
  if (/(^|\/)(?:vba[^/]*|macrosheets|dialogsheets|activex|embeddings|customui)(?:\/|\.|$)/i.test(name)
    || /^xl\/workbook\.bin$/i.test(name) || /^(?:word|ppt|META-INF)\//i.test(name) || name === 'mimetype') throw invalidZip();
  return { name, directory };
}

export function validatePackage(parts) {
  if (essential.some(name => !parts.has(name))
    || ![...parts].some(name => /^xl\/worksheets\/[^/]+\.xml$/.test(name))) throw invalidZip();
}
