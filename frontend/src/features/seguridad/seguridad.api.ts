import { httpClient } from '../../shared/api/httpClient';
import type { Pagination } from '../../shared/types/pagination';

export type SecurityResponse = {
  registros: { id: string; fecha_hora: string; evento: string;
    responsable: { id: string | null; nombre: string | null }; cuenta: { id: string | null; nombre: string | null } }[];
  pagination: Pagination;
};
export async function getSecurityEvents(page: number): Promise<SecurityResponse> {
  return (await httpClient.get<SecurityResponse>('/seguridad', { params: { page, limit: 20 } })).data;
}
