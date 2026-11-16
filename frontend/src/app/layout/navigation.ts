import { House, School, ClipboardList, ClipboardPen, type LucideIcon } from 'lucide-react';
import type { UserRole } from '../../features/auth/auth.types';

type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
  registradorLabel?: string;
};

export { roleLabels } from '../../features/auth/userPresentation';

const navigation: readonly NavigationItem[] = [
  { label: 'Inicio', path: '/inicio', icon: House, roles: ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'] },
  { label: 'Secciones', registradorLabel: 'Mis secciones', path: '/secciones', icon: School, roles: ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'] },
  { label: 'Supervisión de asistencias', path: '/asistencias/supervision', icon: ClipboardList, roles: ['ADMIN', 'SUBDIRECCION'] },
  { label: 'Gestión de asistencias', path: '/asistencias/gestion', icon: ClipboardPen, roles: ['ADMIN', 'SUBDIRECCION'] },
];

export function navigationFor(role: UserRole) {
  return navigation.filter(item => item.roles.includes(role))
    .map(item => ({ ...item, label: role === 'REGISTRADOR' ? item.registradorLabel ?? item.label : item.label }));
}
