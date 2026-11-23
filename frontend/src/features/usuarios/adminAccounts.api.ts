import { httpClient } from '../../shared/api/httpClient';
import type { Pagination } from '../../shared/types/pagination';

export type AdminAccount = { id: string; nombres: string; apellidos: string; usuario: string; rol: 'ADMIN'; activo: boolean };
export type AdminDraft = { nombres: string; apellidos: string; usuario: string; password: string };
export type AdminPage = { users: AdminAccount[]; pagination: Pagination };

function account(value: unknown): AdminAccount {
  const row = value as Partial<AdminAccount> | null;
  if (!row || typeof row.id !== 'string' || !/^[1-9]\d*$/.test(row.id) || row.rol !== 'ADMIN'
    || typeof row.activo !== 'boolean' || ['nombres', 'apellidos', 'usuario'].some(key => typeof row[key as keyof AdminAccount] !== 'string')) {
    throw new Error('Respuesta de cuentas ADMIN no válida.');
  }
  // Lista explícita: nunca conservar hashes, tokens ni otros campos del servidor.
  return { id: row.id, nombres: row.nombres!, apellidos: row.apellidos!, usuario: row.usuario!, rol: 'ADMIN', activo: row.activo };
}

export function adminRequest(draft: AdminDraft) {
  const basic = { nombres: draft.nombres.trim(), apellidos: draft.apellidos.trim(), usuario: draft.usuario.trim() };
  for (const [key, max] of [['nombres', 100], ['apellidos', 120], ['usuario', 60]] as const) {
    if (!basic[key] || /[\uD800-\uDFFF]/u.test(basic[key]) || [...basic[key]].length > max) throw new Error(`Revisa ${key}: máximo ${max} caracteres.`);
  }
  const bytes = new TextEncoder().encode(draft.password).length;
  if ([...draft.password].length < 8 || bytes > 72 || /[\uD800-\uDFFF]/u.test(draft.password)) throw new Error('La contraseña inicial requiere al menos 8 caracteres y hasta 72 bytes UTF-8.');
  return { ...basic, password: draft.password, rol: 'ADMIN' as const };
}

export async function getAdminAccounts(page: number): Promise<AdminPage> {
  const { data } = await httpClient.get<AdminPage>('/usuarios', { params: { page, limit: 20 } });
  if (!Array.isArray(data?.users) || data.users.length > 20 || data.pagination?.page !== page || data.pagination.limit !== 20
    || typeof data.pagination.has_more !== 'boolean' || (data.pagination.has_more && !data.users.length)) throw new Error('Consulta ADMIN incompleta.');
  const users = data.users.map(account);
  if (new Set(users.map(user => user.id)).size !== users.length) throw new Error('Consulta ADMIN inconsistente.');
  return { users, pagination: data.pagination };
}

export async function createAdminAccount(draft: AdminDraft) {
  const input = adminRequest(draft), response = await httpClient.post('/usuarios', input);
  const user = account(response.data?.user);
  if (response.status !== 201 || ['nombres', 'apellidos', 'usuario'].some(key =>
    user[key as keyof AdminAccount] !== input[key as keyof typeof input])) throw new Error('Alta ADMIN sin confirmación válida.');
}
