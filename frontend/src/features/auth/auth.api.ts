import { httpClient } from '../../shared/api/httpClient';
import type { AuthUser, LoginCredentials, LoginResponse } from './auth.types';

export async function login(credentials: LoginCredentials, signal: AbortSignal) {
  const response = await httpClient.post<LoginResponse>('/auth/login', credentials, { signal });
  return response.data;
}

export async function getCurrentUser(signal: AbortSignal) {
  const response = await httpClient.get<{ user: AuthUser }>('/auth/me', { signal });
  const user = response.data.user;
  if (!user || typeof user.id !== 'string' || !['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'].includes(user.rol)) {
    throw new Error('Perfil de autenticación inválido.');
  }
  return user;
}
