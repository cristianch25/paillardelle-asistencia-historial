export type UserRole = 'ADMIN' | 'SUBDIRECCION' | 'REGISTRADOR' | 'SUPERUSUARIO';
export type AuthUser = {
  id: string;
  nombres: string;
  apellidos: string;
  usuario: string;
  rol: UserRole;
  cargo: string | null;
  nivel_asignado: 'INICIAL' | 'PRIMARIA' | 'SECUNDARIA' | null;
  puede_escanear_qr: boolean;
  puede_usar_bitacora: boolean;
  debe_cambiar_password: boolean;
};
export type LoginCredentials = { usuario: string; password: string };
export type LoginResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: AuthUser;
};
export type AuthSession = { user: AuthUser; expiresAt: number };
