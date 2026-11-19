import axios from 'axios';
import { httpClient } from '../../shared/api/httpClient';
import { apiErrorMessage } from '../../shared/api/apiError';

export type MonthlyReportQuery = { anio_escolar_id: string; seccion_id: string; mes: string };

export async function monthlyPdf(query: MonthlyReportQuery): Promise<Blob> {
  const response = await httpClient.get<Blob>('/reportes/asistencia-mensual.pdf', { params: query, responseType: 'blob' });
  const contentType = response.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.startsWith('application/pdf') || !response.data.size
    || await response.data.slice(0, 5).text() !== '%PDF-') throw new Error('Respuesta PDF inválida.');
  return response.data;
}

export async function reportError(error: unknown): Promise<string> {
  if (axios.isAxiosError(error) && [400, 404, 422].includes(error.response?.status ?? 0)) {
    try {
      const data = error.response?.data;
      const detail = data instanceof Blob ? JSON.parse(await data.text()) : data;
      if (typeof detail?.error === 'string') return detail.error;
    } catch { /* Respuesta inesperada: mensaje seguro común. */ }
  }
  return apiErrorMessage(error);
}

export function downloadPdf(blob: Blob, query: MonthlyReportQuery) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `asistencia-${query.mes}-seccion-${query.seccion_id}.pdf`;
  document.body.append(link); link.click(); link.remove();
  // La URL vive solo para entregar la descarga, también en navegadores móviles.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
