import { httpClient } from '../../../shared/api/httpClient';
export type PhonePreview = { telefono_actual: string | null; telefono_propuesto: string | null; afecta_otros_vinculos: boolean;
  sin_cambios: boolean; token_confirmacion: string | null; vence_en: string | null };
export function normalizedPhone(value: string) {
  if (!value.trim()) return null;
  const match = /^(?:\+?51)?(9\d{8})$/.exec(value.replace(/[\s()-]/g, ''));
  if (!match || value.length > 64) throw new Error('Ingresa un celular de nueve dígitos que empiece en 9.');
  return match[1]!;
}
export async function previewGuardianPhone(id: string, phone: string | null): Promise<PhonePreview> {
  const response = await httpClient.post<PhonePreview>(`/estudiantes/${id}/apoderado/telefono/vista-previa`, { telefono: phone });
  const data = response.data;
  if (response.status !== 200 || !data || typeof data.sin_cambios !== 'boolean' || typeof data.afecta_otros_vinculos !== 'boolean'
    || (data.telefono_actual !== null && typeof data.telefono_actual !== 'string') || data.telefono_propuesto !== phone
    || (!data.sin_cambios && (!/^[a-f0-9]{64}$/.test(data.token_confirmacion ?? '') || !Number.isFinite(Date.parse(data.vence_en ?? ''))))) {
    throw new Error('Vista previa no válida.');
  }
  return data;
}
export async function confirmGuardianPhone(id: string, token: string) {
  const response = await httpClient.patch<{ telefono: string | null; actualizado: boolean }>(`/estudiantes/${id}/apoderado/telefono`, {
    token_confirmacion: token, confirmado: true,
  });
  const data = response.data;
  if (response.status !== 200 || !data || typeof data.actualizado !== 'boolean'
    || (data.telefono !== null && (typeof data.telefono !== 'string' || !/^9\d{8}$/.test(data.telefono)))) {
    throw new Error('No se recibió confirmación del cambio.');
  }
  return data;
}
