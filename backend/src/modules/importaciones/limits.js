// Recepción 1B.1: bytes decimales.
export const UPLOAD_FIELD = 'archivo';
export const MAX_UPLOAD_FILE_BYTES = 5_000_000;
// Incluye cabeceras de partes, delimitadores, preámbulo y epílogo del cuerpo.
export const MAX_MULTIPART_BYTES = MAX_UPLOAD_FILE_BYTES + 64 * 1024;
export const MAX_MULTIPART_CONTENT_TYPE_BYTES = 1024;
export const UPLOAD_HIGH_WATER_MARK = 16 * 1024;
// Inspección 1B.3A: límites ZIP; todavía sin análisis XML ni materialización.
export const MAX_ZIP_ENTRIES = 500;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 50_000_000;
export const MAX_ZIP_INSPECTION_MS = 20_000;
