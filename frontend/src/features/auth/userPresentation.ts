import type { AuthUser, UserRole } from './auth.types';

export const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administración', SUBDIRECCION: 'Subdirección', REGISTRADOR: 'Registrador',
  SUPERUSUARIO: 'SUPERUSUARIO',
};
const levelLabels = { INICIAL: 'Inicial', PRIMARIA: 'Primaria', SECUNDARIA: 'Secundaria' };

export function userIdentityLabel(user: Pick<AuthUser, 'rol' | 'cargo'>): string {
  if (user.rol === 'REGISTRADOR') {
    const cargo = user.cargo?.trim().toUpperCase();
    if (cargo === 'DOCENTE') return 'Docente';
    if (cargo === 'AUXILIAR') return 'Auxiliar';
  }
  return roleLabels[user.rol];
}

export function primaryLevelLabel(user: Pick<AuthUser, 'rol' | 'nivel_asignado'>): string | undefined {
  if (user.rol === 'SUBDIRECCION' && user.nivel_asignado) {
    return `Nivel principal: ${levelLabels[user.nivel_asignado]}`;
  }
}
