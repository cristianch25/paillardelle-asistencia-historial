import axios from 'axios';
import { httpClient } from '../../shared/api/httpClient';
import { apiErrorMessage } from '../../shared/api/apiError';
import type { Pagination } from '../../shared/types/pagination';
import { getSections } from '../organizacion-escolar/secciones/secciones.api';
import { getAllSchoolYears } from '../organizacion-escolar/anios-escolares/aniosEscolares.api';
import type { SectionAssignment } from '../organizacion-escolar/secciones/sectionStaff.api';
import { userRequest, type AssignmentInput, type ManagedUser, type UserDraft, type UsersCatalog } from './usuarios.types';

async function collect<T extends { id: string }>(read: (page: number) => Promise<{ rows: T[]; pagination: Pagination }>, current: () => boolean) {
  const rows = new Map<string, T>();
  for (let page = 1; page <= 100; page++) {
    if (!current()) return null;
    const data = await read(page);
    if (!current()) return null;
    if (data.pagination.page !== page || data.pagination.limit !== 100 || typeof data.pagination.has_more !== 'boolean'
      || !Array.isArray(data.rows) || data.rows.length > 100 || (data.pagination.has_more && !data.rows.length)) throw new Error('Catálogo incompleto.');
    for (const row of data.rows) {
      if (typeof row.id !== 'string' || rows.has(row.id)) throw new Error('Catálogo inconsistente.');
      rows.set(row.id, row);
    }
    if (!data.pagination.has_more) return [...rows.values()];
  }
  throw new Error('El catálogo supera el límite de carga.');
}

export async function getUsersCatalog(current: () => boolean): Promise<UsersCatalog | null> {
  const [users, assignments, sections, years] = await Promise.all([
    collect(async page => {
      const { data } = await httpClient.get<{ users: ManagedUser[]; pagination: Pagination }>('/usuarios', { params: { page, limit: 100 } });
      return { rows: data.users, pagination: data.pagination };
    }, current),
    collect(async page => {
      const { data } = await httpClient.get<{ asignaciones: SectionAssignment[]; pagination: Pagination }>('/asignaciones', { params: { page, limit: 100 } });
      return { rows: data.asignaciones, pagination: data.pagination };
    }, current),
    collect(async page => { const data = await getSections({ page, limit: 100 }); return { rows: data.secciones, pagination: data.pagination }; }, current),
    getAllSchoolYears(),
  ]);
  return current() && users && assignments && sections ? { users, assignments, sections, years } : null;
}

export async function saveUser(draft: UserDraft, original?: ManagedUser) {
  const input = userRequest(draft, original);
  const response = original ? await httpClient.patch(`/usuarios/${original.id}`, input) : await httpClient.post('/usuarios', input);
  if (response.status !== (original ? 200 : 201) || typeof response.data?.user?.id !== 'string'
    || (original && response.data.user.id !== original.id)
    || Object.entries(input).some(([key, value]) => key !== 'password' && response.data.user[key] !== value)) throw new Error('Confirmación no válida.');
}

export async function setUserState(id: string, activo: boolean) {
  const response = await httpClient.patch(`/usuarios/${id}/estado`, { activo });
  if (response.status !== 200 || response.data?.user?.id !== id || response.data.user.activo !== activo) throw new Error('Confirmación no válida.');
}

export async function createUserAssignment(input: AssignmentInput) {
  const response = await httpClient.post('/asignaciones', input);
  if (response.status !== 201 || typeof response.data?.asignacion?.id !== 'string'
    || Object.entries(input).some(([key, value]) => response.data.asignacion[key] !== value)) throw new Error('Confirmación no válida.');
}

export function userFailure(error: unknown) {
  if (axios.isAxiosError(error) && [400, 409].includes(error.response?.status ?? 0)
    && typeof error.response?.data?.error === 'string') return error.response.data.error as string;
  return apiErrorMessage(error);
}

export function uncertainUserFailure(error: unknown) {
  return !axios.isAxiosError(error) || ![400, 401, 403, 404, 409, 413].includes(error.response?.status ?? 0);
}
