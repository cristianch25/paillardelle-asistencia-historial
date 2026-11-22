import { httpClient } from '../../shared/api/httpClient';
import type { AuditQuery, AuditResponse } from './auditoria.types';

export async function getAuditLog(query: AuditQuery = {}): Promise<AuditResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.categoria) params.set('categoria', query.categoria);
  const qs = params.toString();
  const url = qs ? `/auditoria?${qs}` : '/auditoria';
  const response = await httpClient.get<AuditResponse>(url);
  return response.data;
}
