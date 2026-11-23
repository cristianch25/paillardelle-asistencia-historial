// Límites de carga e inspección XLSX; los tamaños se expresan en bytes decimales.
export const UPLOAD_FIELD = 'archivo';
export const MAX_UPLOAD_FILE_BYTES = 5_000_000;
// Incluye cabeceras de partes, delimitadores, preámbulo y epílogo del cuerpo.
export const MAX_MULTIPART_BYTES = MAX_UPLOAD_FILE_BYTES + 64 * 1024;
export const MAX_MULTIPART_CONTENT_TYPE_BYTES = 1024;
export const UPLOAD_HIGH_WATER_MARK = 16 * 1024;
// Acota las entradas ZIP y el contenido descomprimido antes de procesar el XML.
export const MAX_ZIP_ENTRIES = 500;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 50_000_000;
export const MAX_ZIP_INSPECTION_MS = 20_000;
// Límites estructurales de hojas, XML y celdas: T01 V8, conservados desde importación v1.
export const MAX_XLSX_SHEETS = 20;
export const MAX_XML_DEPTH = 64;
export const MAX_WORKSHEET_ROW = 4096;
export const MAX_WORKSHEET_COLUMN = 128;
export const MAX_XML_CELLS = 200_000;
export const MAX_MATERIALIZED_POSITIONS = 200_000;
