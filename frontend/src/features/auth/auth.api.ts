import { httpClient } from '../../shared/api/httpClient';
import type { AuthUser, LoginCredentials, LoginResponse } from './auth.types';

export async function login(credentials: LoginCredentials, signal: AbortSignal) {
  const response = await httpClient.post<LoginResponse>('/auth/login', credentials, { signal });
  return response.data;
}

export async function renewSession(signal: AbortSignal) {
  const response = await httpClient.post<LoginResponse>('/auth/renovar', undefined, { signal });
  return response.data;
}

export async function getCurrentUser(signal: AbortSignal) {
  const response = await httpClient.get<{ user: AuthUser }>('/auth/me', { signal });
  return validatedUser(response.data.user);
}

export function validatedUser(user: AuthUser) {
  if (!user || typeof user.id !== 'string' || !['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO'].includes(user.rol)) {
    throw new Error('Perfil de autenticación inválido.');
  }
  if (user.rol === 'ADMIN' && typeof user.debe_cambiar_password !== 'boolean') throw new Error('Estado de contraseña inválido.');
  user.debe_cambiar_password = user.rol === 'ADMIN' && user.debe_cambiar_password === true;
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
