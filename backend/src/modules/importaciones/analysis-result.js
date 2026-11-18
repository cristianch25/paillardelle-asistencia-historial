import { HttpError } from '../../shared/http-error.js';

export const MAX_EXTRACTION_RESPONSE_BYTES = 32 * 1024 * 1024;
export function decodeExtraction(output) {
  const result = JSON.parse(output.toString('utf8'));
  if (result?.ok === false && [400, 408, 413].includes(result.status)) {
    // El texto proviene de un catálogo del proceso interno, sin valores del XLSX.
    throw new HttpError(result.status, result.status === 413 ? 'El archivo supera los límites del padrón.'
      : result.status === 408 ? 'El análisis superó el plazo permitido.' : 'El archivo no tiene un formato de padrón compatible o está dañado.');
  }
  if (result?.ok !== true || !Array.isArray(result.extracted?.registros)
    || result.extracted.registros.length > 2000 || !Array.isArray(result.extracted.observaciones)) throw new Error('Protocolo inválido.');
  return result.extracted;
}
