import { House, type LucideIcon } from 'lucide-react';
import type { UserRole } from '../../features/auth/auth.types';

type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
};

export const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administración',
  SUBDIRECCION: 'Subdirección',
  REGISTRADOR: 'Registrador',
};

const navigation: readonly NavigationItem[] = [
  { label: 'Inicio', path: '/inicio', icon: House, roles: ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'] },
];

export function navigationFor(role: UserRole) {
  return navigation.filter(item => item.roles.includes(role));
}
