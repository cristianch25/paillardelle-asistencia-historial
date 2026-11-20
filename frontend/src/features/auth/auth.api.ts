import { httpClient } from '../../shared/api/httpClient';
import type { AuthUser, LoginCredentials, LoginResponse } from './auth.types';

export async function login(credentials: LoginCredentials, signal: AbortSignal) {
  const response = await httpClient.post<LoginResponse>('/auth/login', credentials, { signal });
  return response.data;
}

export async function getCurrentUser(signal: AbortSignal) {
  const response = await httpClient.get<{ user: AuthUser }>('/auth/me', { signal });
  const user = response.data.user;
  if (!user || typeof user.id !== 'string' || !['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO'].includes(user.rol)) {
    throw new Error('Perfil de autenticación inválido.');
  }
  return user;
}

export type ChangePasswordInput = {
  password_actual: string;
  password_nueva: string;
  password_confirmacion: string;
};

export async function changePassword(input: ChangePasswordInput) {
  const response = await httpClient.post<{ message: string }>('/auth/cambiar-contrasena', input);
  if (typeof response.data?.message !== 'string' || !response.data.message.trim()) {
    throw new Error('Confirmación de cambio de contraseña no válida.');
  }
  return response.data;
}
