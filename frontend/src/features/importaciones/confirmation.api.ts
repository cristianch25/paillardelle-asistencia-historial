import { httpClient } from '../../shared/api/httpClient';
import type { ImportConfirmationInput, ImportOperationStatus, ImportReceipt } from './import.types';

function receipt(value: ImportReceipt): ImportReceipt {
  if (value?.estado !== 'CONFIRMADA' || typeof value.confirmacion_id !== 'string' || !/^[1-9]\d*$/.test(value.confirmacion_id)
    || typeof value.repetida !== 'boolean' || !value.cantidades || !Array.isArray(value.filas) || !value.filas.length
    || new Set(value.filas.map(row => row.fila)).size !== value.filas.length
    || value.filas.some(row => !/^\d+:\d+$/.test(row.fila) || !/^[1-9]\d*$/.test(row.estudiante_id)
      || (row.matricula_id !== null && !/^[1-9]\d*$/.test(row.matricula_id)) || typeof row.contacto_pendiente !== 'boolean')
    || ['estudiantes', 'matriculas', 'contactos', 'vinculos', 'telefonos', 'telefonos_conservados', 'contactos_pendientes']
      .some(key => !Number.isSafeInteger(value.cantidades[key]) || value.cantidades[key]! < 0)) throw new Error('Recibo no confirmado.');
  return value;
}
export async function confirmImport(id: string, body: ImportConfirmationInput) {
  const { data } = await httpClient.post<ImportReceipt>(`/importaciones/vistas-previas/${id}/confirmacion`, body);
  if (data?.filas?.length !== body.filas.length || data.filas.some(row => !body.filas.includes(row.fila))) throw new Error('Recibo de otra selección.');
  return receipt(data);
}
export async function readImportOperation(key: string): Promise<ImportOperationStatus> {
  const { data } = await httpClient.get<ImportOperationStatus>(`/importaciones/confirmaciones/${key}`);
  if (data?.estado === 'SIN_CONFIRMACION_VERIFICADA') return data;
  return receipt(data as ImportReceipt);
}
