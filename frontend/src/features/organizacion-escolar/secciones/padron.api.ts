import { httpClient } from '../../../shared/api/httpClient';
import type { PadronResponse } from './padron.types';

export async function getPadron(sectionId: string, fecha: string): Promise<PadronResponse> {
  const { data } = await httpClient.get<PadronResponse>(`/secciones/${sectionId}/padron`, { params: { fecha } });
  return data;
}
