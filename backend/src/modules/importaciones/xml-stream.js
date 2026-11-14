import { SaxesParser } from 'saxes';
import { HttpError } from '../../shared/http-error.js';
import { MAX_XML_DEPTH } from './limits.js';

export const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
export const invalidXml = () => new HttpError(400, 'Estructura XML/OOXML inválida o no admitida.');
export const xmlLimit = () => new HttpError(413, 'El XLSX supera los límites estructurales permitidos.');
export const attribute = (tag, local, uri = '') => Object.values(tag.attributes)
  .find(value => value.local === local && value.uri === uri)?.value;

/** SAX sin DOM ni conservación de textos. UTF-8 y UTF-16 con detección inicial;
 * el presupuesto ZIP de bytes reales acota también tokens individuales de SAX.
 * Los callbacks reciben una pila de hasta 64 elementos, válida solo en la llamada.
 */
export function createXmlStream({ open, close, text, end, encoding: onEncoding } = {}) {
  const parser = new SaxesParser({ xmlns: true });
  const stack = [];
  let decoder, prefix = Buffer.alloc(0), encoding;
  parser.on('error', () => { throw invalidXml(); });
  parser.on('doctype', () => { throw invalidXml(); });
  parser.on('processinginstruction', () => { throw invalidXml(); });
  parser.on('xmldecl', declaration => {
    if (declaration.version !== '1.0') throw invalidXml();
    const declared = declaration.encoding?.toLowerCase();
    if (declared && !(declared === encoding || (declared === 'utf-16' && encoding.startsWith('utf-16')))) throw invalidXml();
  });
  parser.on('opentag', tag => {
    if (stack.length >= MAX_XML_DEPTH) throw xmlLimit();
    open?.(tag, stack);
    stack.push(tag);
  });
  parser.on('closetag', tag => { close?.(tag, stack); stack.pop(); });
  parser.on('text', value => text?.(value, stack));
  parser.on('cdata', value => text?.(value, stack));
  function decode(bytes, final = false) {
    if (!decoder) {
      prefix = Buffer.concat([prefix, bytes]);
      if (prefix.length < 4 && !final) return;
      encoding = prefix[0] === 0xff && prefix[1] === 0xfe ? 'utf-16le'
        : prefix[0] === 0xfe && prefix[1] === 0xff ? 'utf-16be'
          : prefix[0] === 0 && prefix[1] === 60 ? 'utf-16be'
            : prefix[0] === 60 && prefix[1] === 0 ? 'utf-16le' : 'utf-8';
      decoder = new TextDecoder(encoding, { fatal: true });
      onEncoding?.(encoding);
      bytes = prefix;
      prefix = null;
    }
    parser.write(decoder.decode(bytes, { stream: !final }));
  }
  return {
    write(bytes) { decode(bytes); },
    end() { decode(Buffer.alloc(0), true); parser.close(); end?.(); },
  };
}
