import { httpClient } from '../../shared/api/httpClient';
import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';
import type { ImportPreview, ImportSelection } from './import.types';

export async function importLevels() {
  const { data } = await httpClient.get<{ niveles: EducationLevel[] }>('/importaciones/niveles');
  return data.niveles;
}
export async function loadPreview(file: File, selection: ImportSelection) {
  const body = new FormData(); body.append('archivo', file);
  const { data } = await httpClient.post<ImportPreview>('/importaciones/vistas-previas', body,
    { params: selection, timeout: 65000 });
  return data;
}
export async function readPreview(id: string, page: number) {
  const { data } = await httpClient.get<ImportPreview>(`/importaciones/vistas-previas/${id}`, { params: { page, limit: 20 } });
  return data;
}
export async function selectPreviewRows(id: string, filas: string[]) {
  const { data } = await httpClient.post<{ filas_seleccionadas: string[]; confirmacion_habilitada: false }>(
    `/importaciones/vistas-previas/${id}/seleccion`, { filas });
  return data.filas_seleccionadas;
}
export async function correctPreviewPhone(id: string, rowId: string, telefono: string | null, version: number) {
  const { data } = await httpClient.patch<ImportPreview>(
    `/importaciones/vistas-previas/${id}/filas/${encodeURIComponent(rowId)}/contacto`, { telefono, version });
  const row = data.registros?.find(row => row.id === rowId);
  if (data.id !== id || typeof data.confirmacion_habilitada !== 'boolean' || row?.contacto.version !== version + 1
    || row.contacto.telefono_propuesto !== telefono || !row.contacto.corregido) throw new Error('Corrección temporal no confirmada.');
  return data;
}
