// Recepción 1B.1: bytes decimales, sin presupuestos de análisis ZIP/XML todavía.
export const UPLOAD_FIELD = 'archivo';
export const MAX_UPLOAD_FILE_BYTES = 5_000_000;
// Incluye cabeceras de partes, delimitadores, preámbulo y epílogo del cuerpo.
export const MAX_MULTIPART_BYTES = MAX_UPLOAD_FILE_BYTES + 64 * 1024;
export const MAX_MULTIPART_CONTENT_TYPE_BYTES = 1024;
export const UPLOAD_HIGH_WATER_MARK = 16 * 1024;
